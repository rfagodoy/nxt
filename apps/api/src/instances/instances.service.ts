import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { WorkflowRolesService } from '../workflow-roles/workflow-roles.service'
import { canActOnTask } from './task-access'
import { resolveContractId, resolvePartnerId, aditivoFromVars, applyInputMap } from './connector-helpers'
import {
  startProcess,
  completeToken,
  cancelProcess,
  WfError,
  type WfGraph,
  type WfState,
  type WfEffect,
  type WfNode,
  type WfRunResult,
  type WfRuntime,
} from '@nxt/workflow-core'
import { StartInstanceDto } from './dto/start-instance.dto'
import { CompleteTaskDto } from './dto/complete-task.dto'
import type { CurrentUserData } from '../auth/current-user.decorator'
import { ContractsService } from '../contracts/contracts.service'
import { PartnersService } from '../partners/partners.service'
import { RoleAssignmentsService } from '../role-assignments/role-assignments.service'

/** Ids de token únicos para o motor (viram WorkflowTask.tokenId). */
const runtime: WfRuntime = { genId: () => randomUUID() }

/** Contexto passado aos conectores de domínio (quem e qual org). */
interface ConnectorCtx {
  organizationId: string
  actor?: CurrentUserData
}

const str = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v))
const numOr = (v: unknown): number | undefined => {
  // Campo vazio/nulo NÃO é zero — deixa o valor por definir (senão um "Valor"
  // em branco criaria contrato com valorTotal 0). Number('') === 0 é a armadilha.
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

@Injectable()
export class InstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: WorkflowRolesService,
    private readonly contracts: ContractsService,
    private readonly partners: PartnersService,
    private readonly roleAssignments: RoleAssignmentsService,
  ) {}

  private isAdmin(actor?: CurrentUserData): boolean {
    return !!actor?.roles?.includes('admin')
  }

  // ── Início da instância ──────────────────────────────────────────────────────
  async start(dto: StartInstanceDto, organizationId: string, actor?: CurrentUserData) {
    const process = await this.prisma.processDefinition.findFirst({
      where: { id: dto.processDefinitionId, organizationId, status: 'ACTIVE' },
    })
    if (!process) throw new NotFoundException('Processo não encontrado ou inativo')

    const graph = process.compiledGraph as unknown as WfGraph | null
    if (!graph || !graph.nodes) {
      throw new BadRequestException('Processo sem grafo compilado — reative o processo')
    }

    // Roda o motor a partir do start e resolve os efeitos (cria tarefas, executa
    // service-tasks: conectores de domínio) até parar nos pontos de espera humanos.
    // Um erro do MOTOR (gateway sem saída casada, laço, nó inexistente) não vira 500:
    // o `settle` o captura e a instância nasce em ERRO (fallbackState = estado inicial).
    const baseState: WfState = {
      status: 'running',
      tokens: [],
      variables: { ...(dto.variables ?? {}) },
      joinCounts: {},
    }
    const settled = await this.settle(graph, () => startProcess(graph, dto.variables ?? {}, runtime), {
      organizationId,
      actor,
    }, baseState)
    const status = settled.errored ? 'ERROR' : settled.completed ? 'COMPLETED' : 'RUNNING'

    // Instância + tarefas criadas ATOMICAMENTE (se a criação de tarefas falhar, a
    // instância não fica órfã sem tarefa pendente). Numa instância em ERRO não se
    // criam tarefas — o fluxo está parado no serviceTask que falhou.
    const instance = await this.prisma.$transaction(async (tx) => {
      const created = await tx.processInstance.create({
        data: {
          processDefinitionId: process.id,
          definitionVersion: process.version,
          // Congela o grafo com que esta instância roda: reativar/editar o processo
          // depois NÃO afeta instâncias já em andamento (elas seguem no snapshot).
          graphSnapshot: graph as never,
          status,
          state: settled.state as never,
          startedBy: actor?.name ?? null,
          startedById: actor?.sub ?? null,
          completedAt: settled.completed && !settled.errored ? new Date() : null,
        },
      })
      if (!settled.errored) await this.persistTasks(tx, created.id, settled.tasksToCreate, organizationId, settled.state.variables)
      return created
    })

    return {
      instance,
      tasks: await this.pendingTasks(instance.id),
      completed: settled.completed,
      errored: settled.errored ?? null,
    }
  }

  // ── Conclusão de uma tarefa (userTask) ───────────────────────────────────────
  async completeTask(taskId: string, dto: CompleteTaskDto, organizationId: string, actor?: CurrentUserData) {
    const task = await this.prisma.workflowTask.findFirst({
      where: { id: taskId, instance: { processDefinition: { organizationId } } },
      include: { instance: { include: { processDefinition: true } } },
    })
    if (!task) throw new NotFoundException('Tarefa não encontrada')
    if (task.status !== 'PENDING') throw new BadRequestException('Tarefa já concluída ou cancelada')
    if (task.instance.status !== 'RUNNING') throw new BadRequestException('Instância não está em execução')

    // RBAC: só o executor (responsável direto ou participante do papel), ou admin,
    // conclui a tarefa. Tarefa aberta (sem papel/responsável) qualquer um conclui.
    const roleKeys = await this.roles.roleKeysForUser(organizationId, actor?.sub ?? '')
    if (!canActOnTask(task, actor?.sub ?? '', roleKeys, this.isAdmin(actor))) {
      throw new ForbiddenException('Você não é o executor desta tarefa')
    }

    // Grafo CONGELADO da instância (imune a reativação/edição do processo depois do
    // start). Fallback para o grafo vivo cobre instâncias criadas antes do snapshot.
    const graph =
      (task.instance.graphSnapshot as unknown as WfGraph | null) ??
      (task.instance.processDefinition.compiledGraph as unknown as WfGraph | null)
    if (!graph || !graph.nodes) throw new BadRequestException('Processo sem grafo compilado')

    const prevState = task.instance.state as unknown as WfState
    const prevRevision = task.instance.revision
    const data = dto.data ?? {}

    // ── Anti-corrida (1/2): REIVINDICA a tarefa por CAS ANTES de rodar o motor. ──
    // Só um request troca PENDING→DONE; um duplo-submit (2 abas, duplo-clique) perde
    // a corrida aqui e não chega a executar o conector — sem contrato/parceiro duplicado.
    const claim = await this.prisma.workflowTask.updateMany({
      where: { id: task.id, status: 'PENDING' },
      data: {
        status: 'DONE',
        data: data as never,
        completedBy: actor?.name ?? 'Usuário do sistema',
        completedById: actor?.sub ?? null,
        completedAt: new Date(),
      },
    })
    if (claim.count === 0) throw new BadRequestException('Tarefa já concluída ou cancelada')

    // Avança o motor a partir do token desta tarefa (executando conectores). Erro do
    // MOTOR não vira 500: `settle` captura e a instância vai para ERRO.
    const settled = await this.settle(
      graph,
      () => completeToken(graph, prevState, task.tokenId, data, runtime),
      { organizationId, actor },
      { ...prevState, variables: { ...prevState.variables, ...data } },
    )
    const status = settled.errored ? 'ERROR' : settled.completed ? 'COMPLETED' : 'RUNNING'

    // ── Anti-corrida (2/2): avança o estado da instância com LOCK OTIMÍSTICO. ──
    // Em ramos paralelos, duas conclusões simultâneas partiriam do mesmo estado e uma
    // sobrescreveria a outra (token perdido / join travado). A guarda por `revision`
    // rejeita a perdedora (409) e devolve SUA tarefa a PENDING para refazer com estado
    // fresco. (Resíduo raro conhecido: se o ramo perdedor já disparou um conector, o
    // reprocesso pode reexecutá-lo — coincidência tripla, aceitável nesta escala.)
    try {
      await this.prisma.$transaction(async (tx) => {
        const upd = await tx.processInstance.updateMany({
          where: { id: task.instanceId, revision: prevRevision },
          data: {
            state: settled.state as never,
            status,
            revision: { increment: 1 },
            completedAt: settled.completed && !settled.errored ? new Date() : null,
          },
        })
        if (upd.count === 0) {
          throw new ConflictException('A instância foi alterada por outra ação simultânea. Recarregue e tente novamente.')
        }
        // Em ERRO não se criam novas tarefas: o fluxo parou no serviceTask que falhou.
        if (!settled.errored) await this.persistTasks(tx, task.instanceId, settled.tasksToCreate, organizationId, settled.state.variables)
      })
    } catch (e) {
      if (e instanceof ConflictException) {
        // desfaz a reivindicação: a tarefa volta a PENDING para ser refeita.
        await this.prisma.workflowTask.updateMany({
          where: { id: task.id, status: 'DONE' },
          data: { status: 'PENDING', completedBy: null, completedById: null, completedAt: null },
        })
      }
      throw e
    }

    return {
      instanceId: task.instanceId,
      completed: settled.completed,
      errored: settled.errored ?? null,
      tasks: await this.pendingTasks(task.instanceId),
    }
  }

  // ── Consultas ────────────────────────────────────────────────────────────────
  /** Lista instâncias da org para MONITORAMENTO (visão gerencial — admin). Filtra por
   *  status quando informado (ex.: ERROR, para o painel de instâncias com erro). Deriva
   *  a causa do erro (`__connectorError`/`__engineError`) e a etapa automática parada. */
  async listInstances(organizationId: string, opts: { status?: string } = {}) {
    const where: Record<string, unknown> = { processDefinition: { organizationId } }
    if (opts.status) where.status = opts.status

    const instances = await this.prisma.processInstance.findMany({
      where,
      include: { processDefinition: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    })

    return instances.map((inst) => {
      const state = inst.state as unknown as WfState | null
      const graph = inst.graphSnapshot as unknown as WfGraph | null
      const vars = state?.variables ?? {}
      const error = (vars.__connectorError ?? vars.__engineError) as string | undefined
      // Etapa parada = token de serviceTask (o conector automático que falhou).
      const stuck = state?.tokens?.map((t) => graph?.nodes?.[t.nodeId]).find((n) => n?.type === 'serviceTask')
      return {
        id: inst.id,
        processName: inst.processDefinition?.name ?? 'Processo',
        version: inst.definitionVersion,
        status: inst.status,
        error: error ?? null,
        stepName: stuck?.name ?? stuck?.id ?? null,
        startedBy: inst.startedBy ?? null,
        startedAt: inst.startedAt,
        updatedAt: inst.updatedAt,
      }
    })
  }

  async getInstanceWithContext(instanceId: string, organizationId: string) {
    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, processDefinition: { organizationId } },
      include: { processDefinition: true, tasks: { orderBy: { createdAt: 'asc' } } },
    })
    if (!instance) throw new NotFoundException('Instância não encontrada')

    const graph = instance.processDefinition.compiledGraph as unknown as WfGraph | null
    const state = instance.state as unknown as WfState

    return {
      instance,
      state,
      graph,
      pendingTasks: instance.tasks.filter((t) => t.status === 'PENDING'),
    }
  }

  /** Caixa de tarefas (inbox). `mine` (padrão) filtra para o worklist do usuário:
   *  tarefas atribuídas a ele, dos papéis de que participa, ou abertas. `mine=false`
   *  devolve todas as pendentes da org (visão gerencial). */
  async listTasks(
    organizationId: string,
    opts: { status?: string; mine?: boolean; actor?: CurrentUserData } = {},
  ) {
    const status = opts.status ?? 'PENDING'

    // Visão gerencial (todas as tarefas da org) é restrita a admin — um membro comum
    // só enxerga a SUA caixa. (Antes, mine=false vazava as tarefas de todos.)
    if (opts.mine === false && !this.isAdmin(opts.actor)) {
      throw new ForbiddenException('Visão de todas as tarefas restrita a administradores')
    }

    const tasks = await this.prisma.workflowTask.findMany({
      where: { status, instance: { processDefinition: { organizationId } } },
      include: { instance: { include: { processDefinition: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    })

    if (opts.mine === false) return tasks

    // "minhas tarefas": lista pessoal (isAdmin=false de propósito — o admin também
    // tem a SUA caixa; a visão de tudo é o mine=false).
    const userId = opts.actor?.sub ?? ''
    const roleKeys = await this.roles.roleKeysForUser(organizationId, userId)
    return tasks.filter((t) => canActOnTask(t, userId, roleKeys, false))
  }

  /** Varre tarefas PENDING vencidas (dueAt < agora) ainda não escalonadas e as
   *  marca (escalatedAt). Chamada pelo WorkflowScheduler no boot e em intervalo.
   *  `organizationId` opcional escopa (disparo manual); sem ele, varre tudo. */
  async sweepOverdue(organizationId?: string): Promise<number> {
    const where: Record<string, unknown> = {
      status: 'PENDING',
      dueAt: { lt: new Date() },
      escalatedAt: null,
    }
    if (organizationId) where.instance = { processDefinition: { organizationId } }

    const overdue = await this.prisma.workflowTask.findMany({ where, select: { id: true } })
    if (overdue.length === 0) return 0
    await this.prisma.workflowTask.updateMany({
      where: { id: { in: overdue.map((t) => t.id) } },
      data: { escalatedAt: new Date() },
    })
    return overdue.length
  }

  async cancel(instanceId: string, organizationId: string) {
    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, processDefinition: { organizationId } },
    })
    if (!instance) throw new NotFoundException('Instância não encontrada')
    // Também cancela instâncias em ERRO (antes ficavam presas para sempre).
    if (instance.status !== 'RUNNING' && instance.status !== 'ERROR') {
      throw new BadRequestException('Só é possível cancelar instâncias em execução ou com erro')
    }

    const state = cancelProcess(instance.state as unknown as WfState)

    const [updated] = await this.prisma.$transaction([
      this.prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'CANCELLED', state: state as never, revision: { increment: 1 } },
      }),
      this.prisma.workflowTask.updateMany({
        where: { instanceId, status: 'PENDING' },
        data: { status: 'CANCELED' },
      }),
    ])

    return updated
  }

  /** Reprocessa a(s) etapa(s) automática(s) de uma instância em ERRO: reexecuta os
   *  conectores dos serviceTasks parados. Se agora passarem, a instância avança; se
   *  falharem de novo, permanece em ERRO (pode-se tentar outra vez após corrigir a causa). */
  async retry(instanceId: string, organizationId: string, actor?: CurrentUserData) {
    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, processDefinition: { organizationId } },
      include: { processDefinition: true },
    })
    if (!instance) throw new NotFoundException('Instância não encontrada')
    if (instance.status !== 'ERROR') {
      throw new BadRequestException('Só é possível reprocessar instâncias com erro')
    }

    const graph =
      (instance.graphSnapshot as unknown as WfGraph | null) ??
      (instance.processDefinition.compiledGraph as unknown as WfGraph | null)
    if (!graph || !graph.nodes) throw new BadRequestException('Processo sem grafo compilado')

    const state = instance.state as unknown as WfState
    const prevRevision = instance.revision

    // Tokens de serviceTask parados = os conectores que falharam. Reemite o efeito
    // `runService` de cada um e deixa o `settle` executá-los novamente.
    const resting = state.tokens.filter((t) => graph.nodes[t.nodeId]?.type === 'serviceTask')
    if (resting.length === 0) {
      throw new BadRequestException('Não há etapa automática pendente para reprocessar')
    }

    const settled = await this.settle(
      graph,
      () => ({
        state,
        effects: resting.map((t) => ({ kind: 'runService' as const, token: t, node: graph.nodes[t.nodeId] })),
      }),
      { organizationId, actor },
      state,
    )
    const status = settled.errored ? 'ERROR' : settled.completed ? 'COMPLETED' : 'RUNNING'

    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.processInstance.updateMany({
        where: { id: instanceId, revision: prevRevision },
        data: {
          state: settled.state as never,
          status,
          revision: { increment: 1 },
          completedAt: settled.completed && !settled.errored ? new Date() : null,
        },
      })
      if (upd.count === 0) {
        throw new ConflictException('A instância foi alterada por outra ação simultânea. Recarregue e tente novamente.')
      }
      if (!settled.errored) await this.persistTasks(tx, instanceId, settled.tasksToCreate, organizationId, settled.state.variables)
    })

    return {
      instanceId,
      completed: settled.completed,
      errored: settled.errored ?? null,
      tasks: await this.pendingTasks(instanceId),
    }
  }

  // ── Motor: resolução de efeitos ──────────────────────────────────────────────
  /** Consome os efeitos de uma execução: acumula as userTasks a criar e executa
   *  os service-tasks automáticos (conectores na F5) até o motor descansar. */
  private async settle(
    graph: WfGraph,
    run: () => WfRunResult,
    ctx: ConnectorCtx,
    fallbackState: WfState,
  ): Promise<{
    state: WfState
    tasksToCreate: Array<{ token: { id: string; nodeId: string }; node: WfNode }>
    completed: boolean
    errored?: string
  }> {
    let state: WfState = fallbackState
    const tasksToCreate: Array<{ token: { id: string; nodeId: string }; node: WfNode }> = []
    const serviceQueue: Array<{ token: { id: string; nodeId: string }; node: WfNode }> = []
    let completed = false

    const absorb = (effects: WfEffect[]) => {
      for (const e of effects) {
        if (e.kind === 'createTask') tasksToCreate.push({ token: e.token, node: e.node })
        else if (e.kind === 'runService') serviceQueue.push({ token: e.token, node: e.node })
        else if (e.kind === 'completed') completed = true
      }
    }
    const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
    // Erro do MOTOR (gateway sem saída casada, laço infinito, nó inexistente) leva a
    // instância a ERRO (com a causa nas variáveis) em vez de escapar como HTTP 500.
    const engineErrored = (s: WfState, msg: string) => ({
      state: { ...s, variables: { ...s.variables, __engineError: msg } },
      tasksToCreate,
      completed: false,
      errored: msg,
    })

    // Execução inicial (start ou conclusão de tarefa): captura erros do motor.
    try {
      const result = run()
      state = result.state
      absorb(result.effects)
    } catch (e) {
      if (e instanceof WfError) return engineErrored(fallbackState, msgOf(e))
      throw e
    }

    while (serviceQueue.length > 0) {
      const svc = serviceQueue.shift() as { token: { id: string; nodeId: string }; node: WfNode }
      let out: Record<string, unknown>
      try {
        out = await this.runConnector(svc.node, state.variables, ctx)
      } catch (e) {
        // Conector de domínio falhou: instância para em ERRO (o token do serviceTask
        // permanece parado). Guardamos a causa nas variáveis para diagnóstico.
        const msg = msgOf(e)
        state = { ...state, variables: { ...state.variables, __connectorError: msg } }
        return { state, tasksToCreate, completed: false, errored: msg }
      }
      // Retomada do token após o conector: erro do motor aqui também vira ERRO.
      try {
        const next = completeToken(graph, state, svc.token.id, out, runtime)
        state = next.state
        absorb(next.effects)
      } catch (e) {
        if (e instanceof WfError) return engineErrored(state, msgOf(e))
        throw e
      }
    }

    return { state, tasksToCreate, completed }
  }

  /** Executa o conector de domínio de um serviceTask (nó `connector`). O resultado
   *  volta como VARIÁVEIS do processo (ex.: contratoId). É aqui que o passo final
   *  produz a entidade REAL (Contract/Partner), auditada, em vez de registro órfão.
   *  As variáveis coletadas nas atividades anteriores alimentam o DTO (por nome). */
  private async runConnector(
    node: WfNode,
    rawVars: Record<string, unknown>,
    ctx: ConnectorCtx,
  ): Promise<Record<string, unknown>> {
    const actorName = ctx.actor?.name
    const actorId = ctx.actor?.sub
    // Re-liga as variáveis mapeadas no designer ao nome que o conector espera; sem
    // mapa, cai na convenção de nome (os reads abaixo não mudam).
    const vars = applyInputMap(node.connectorInputs, rawVars)
    switch (node.connector) {
      case undefined:
      case '':
        return {} // serviceTask sem conector = passo automático de passagem

      case 'partners.create': {
        const created = await this.partners.create(
          {
            categoria: str(vars.categoria) ?? 'PJ_BR',
            razaoSocial: str(vars.razaoSocial) ?? str(vars.nome) ?? str(vars.titulo) ?? 'Parceiro via processo',
            documento: str(vars.documento),
            nomeFantasia: str(vars.nomeFantasia),
            email: str(vars.email),
            contatos: [],
            enderecos: [],
            bancos: [],
            socios: [],
          } as unknown as Parameters<PartnersService['create']>[0],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return { partnerId: created.id, partnerStatus: created.status }
      }

      case 'contracts.create': {
        const created = await this.contracts.create(
          {
            numero: str(vars.numero) ?? '',
            titulo: str(vars.titulo) ?? str(vars.objeto) ?? 'Contrato via processo',
            tipo: str(vars.tipo) ?? 'SERVICO',
            natureza: str(vars.natureza),
            descricao: str(vars.descricao),
            valorTotal: numOr(vars.valor ?? vars.valorTotal),
            moeda: str(vars.moeda),
            inicioVigencia: str(vars.inicioVigencia),
            terminoVigencia: str(vars.terminoVigencia),
          } as unknown as Parameters<ContractsService['create']>[0],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return { contratoId: created.id, contratoNumero: created.numero }
      }

      case 'contracts.aditivo': {
        // Registra um termo aditivo NO contrato-alvo (prorrogação/reajuste). O alvo
        // vem de uma variável (contratoId), tipicamente selecionada numa atividade
        // anterior ou produzida por um contracts.create do mesmo fluxo.
        const contratoId = resolveContractId(vars)
        if (!contratoId) throw new BadRequestException('Aditivo sem contrato-alvo (defina a variável contratoId)')
        const atual = await this.prisma.contract.findFirst({
          where: { id: contratoId, organizationId: ctx.organizationId },
          select: { aditivos: true },
        })
        if (!atual) throw new NotFoundException('Contrato-alvo do aditivo não encontrado')
        const existentes = Array.isArray(atual.aditivos) ? (atual.aditivos as unknown[]) : []
        const hoje = new Date().toISOString().slice(0, 10)
        const novo = aditivoFromVars(vars, randomUUID(), hoje)
        // ATIVO por padrão → applyAditivos passa a refletir término/valor na vigência.
        const updated = await this.contracts.update(
          contratoId,
          { aditivos: [...existentes, novo], motivo: str(vars.motivo) } as unknown as Parameters<ContractsService['update']>[1],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return { contratoId, aditivoId: novo.id, contratoSituacao: updated.situacao }
      }

      case 'contracts.distrato': {
        // Rescinde o contrato-alvo: transição de situação → RESCINDIDO (o motivo
        // acompanha a auditoria da transição). É o mesmo update() do domínio.
        const contratoId = resolveContractId(vars)
        if (!contratoId) throw new BadRequestException('Distrato sem contrato-alvo (defina a variável contratoId)')
        const motivo = str(vars.motivo) ?? str(vars.motivoDistrato) ?? str(vars.justificativa)
        const updated = await this.contracts.update(
          contratoId,
          { situacao: 'RESCINDIDO', motivo } as unknown as Parameters<ContractsService['update']>[1],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return { contratoId, contratoSituacao: updated.situacao }
      }

      case 'partners.activate': {
        // Aprova/ativa o parceiro-alvo (onboarding): status → ATIVO. Alvo por variável
        // (partnerId), normalmente produzida por um partners.create anterior no fluxo.
        const partnerId = resolvePartnerId(vars)
        if (!partnerId) throw new BadRequestException('Ativação sem parceiro-alvo (defina a variável partnerId)')
        const updated = await this.partners.update(
          partnerId,
          { status: 'ATIVO', motivo: str(vars.motivo) } as unknown as Parameters<PartnersService['update']>[1],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return { partnerId, partnerStatus: updated.status }
      }

      default:
        throw new BadRequestException(`Conector desconhecido: ${node.connector}`)
    }
  }

  // ── Persistência auxiliar ────────────────────────────────────────────────────
  private async persistTasks(
    client: Pick<PrismaService, 'workflowTask'>,
    instanceId: string,
    tasks: Array<{ token: { id: string; nodeId: string }; node: WfNode }>,
    organizationId: string,
    variables: Record<string, unknown>,
  ) {
    if (tasks.length === 0) return
    // Resolve o executor (papel+entidade → usuário[]) de cada tarefa ANTES de gravar.
    const rows = await Promise.all(tasks.map(async ({ token, node }) => ({
      instanceId,
      tokenId: token.id,
      nodeId: node.id,
      name: node.name ?? null,
      role: node.role ?? null,
      assignee: node.assignee ?? null,
      assignees: await this.resolveExecutor(node, organizationId, variables),
      formRef: node.formRef ?? null,
      dueAt: node.slaMinutes ? new Date(Date.now() + node.slaMinutes * 60_000) : null,
      status: 'PENDING',
    })))
    await client.workflowTask.createMany({ data: rows as never })
  }

  /** Resolve o executor de uma atividade (papel de PESSOA + entidade) em uma lista de
   *  usuários responsáveis. A entidade vem FIXA (id do desenho) ou por VARIÁVEL (id
   *  lido de uma variável do processo). ORG = papel global (sem entidade). Pool vazio
   *  (papel sem responsável cadastrado, ou variável ausente) → tarefa fica ABERTA. */
  private async resolveExecutor(
    node: WfNode,
    organizationId: string,
    variables: Record<string, unknown>,
  ): Promise<string[]> {
    const ex = node.executor
    if (!ex?.papelId) return []
    let entityId: string | undefined
    if (ex.entityType === 'ORG') {
      entityId = undefined
    } else if (ex.mode === 'VARIAVEL') {
      const v = variables[ex.entityVar ?? '']
      entityId = v == null || v === '' ? undefined : String(v)
      if (!entityId) return [] // variável ainda não definida → sem pool (tarefa aberta)
    } else {
      entityId = ex.entityId || undefined
      if (!entityId) return []
    }
    return this.roleAssignments.resolveUsers(organizationId, ex.papelId, ex.entityType, entityId)
  }

  private pendingTasks(instanceId: string) {
    return this.prisma.workflowTask.findMany({
      where: { instanceId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    })
  }
}
