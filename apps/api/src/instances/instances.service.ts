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
  returnToken,
  returnTargets,
  nodesReachableFrom,
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
import { ReturnTaskDto } from './dto/return-task.dto'
import { AssignTaskDto } from './dto/assign-task.dto'
import { CancelInstanceDto } from './dto/cancel-instance.dto'
import type { CurrentUserData } from '../auth/current-user.decorator'
import { ContractsService } from '../contracts/contracts.service'
import { PartnersService } from '../partners/partners.service'
import { RoleAssignmentsService } from '../role-assignments/role-assignments.service'
import { SettingsService } from '../settings/settings.service'
import { WorkflowCalendarService, type StoredCalendar } from './workflow-calendar.service'
import { WorkflowNotifierService, type TaskNotice, type ProcessNotice } from '../notifications/workflow-notifier.service'
import { NOTIF_PARAMS_KEY, tarefasParams } from '../notifications/notification-params'

/** Ids de token únicos para o motor (viram WorkflowTask.tokenId). */
const runtime: WfRuntime = { genId: () => randomUUID() }

/** Contexto passado aos conectores de domínio (quem e qual org). */
interface ConnectorCtx {
  organizationId: string
  actor?: CurrentUserData
}

/** Quem deve ser avisado de uma tarefa: o pool resolvido do executor (papel+entidade)
 *  ou, na sua falta, o responsável direto (modelo antigo). Lista vazia = tarefa aberta,
 *  que o notificador transforma em aviso sem dono (visível para a org). */
const recipientsOf = (t: { assignees: unknown; assignee?: string | null }): string[] => {
  const pool = Array.isArray(t.assignees) ? (t.assignees as string[]) : []
  if (pool.length > 0) return pool
  return t.assignee ? [t.assignee] : []
}

/** Linha de tarefa (com o processo junto) → o que o sininho precisa saber. */
const toNotice = (t: {
  id: string; name: string | null; assignees: unknown; assignee?: string | null; dueAt: Date | null
  instance: { id: string; numero: number | null; processDefinition: { name: string } }
}): TaskNotice => ({
  id: t.id,
  name: t.name,
  instanceId: t.instance.id,
  assignees: recipientsOf(t),
  dueAt: t.dueAt,
  process: { name: t.instance.processDefinition.name, numero: t.instance.numero },
})

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
    private readonly calendar: WorkflowCalendarService,
    private readonly notifier: WorkflowNotifierService,
    private readonly settings: SettingsService,
  ) {}

  /** Prazo (dueAt) de uma atividade: dias/horas ÚTEIS no calendário comercial da org
   *  (precede o slaMinutes legado). Sem prazo configurado → null. */
  private dueAtFor(node: WfNode, cal: StoredCalendar): Date | null {
    const days = node.slaBusinessDays ?? 0
    // minutos úteis entram como fração de hora (addBusinessTime acumula em minutos).
    const hours = (node.slaBusinessHours ?? 0) + (node.slaBusinessMinutes ?? 0) / 60
    if (days > 0 || hours > 0) return this.calendar.computeDue(new Date(), days, hours, cal)
    if (node.slaMinutes && node.slaMinutes > 0) return new Date(Date.now() + node.slaMinutes * 60_000)
    return null
  }

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
    let createdTasks: TaskNotice[] = []
    const instance = await this.prisma.$transaction(async (tx) => {
      // Número SEQUENCIAL do processo por organização (protocolo, começa em 1). Lê o
      // maior número existente na org e soma 1 dentro da transação. ⚠️ dois inícios
      // exatamente simultâneos poderiam ler o mesmo máximo (escala baixa, aceitável).
      const last = await tx.processInstance.findFirst({
        where: { processDefinition: { organizationId }, numero: { not: null } },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      })
      const numero = (last?.numero ?? 0) + 1
      const created = await tx.processInstance.create({
        data: {
          processDefinitionId: process.id,
          numero,
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
      if (!settled.errored) createdTasks = await this.persistTasks(tx, created.id, settled.tasksToCreate, organizationId, settled.state.variables)
      await this.persistCompensations(tx, created.id, settled.compensations)
      return created
    })

    await this.notifier.taskAssigned(organizationId, createdTasks, { name: process.name, numero: instance.numero })

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
    let createdTasks: TaskNotice[] = []
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
        if (!settled.errored) createdTasks = await this.persistTasks(tx, task.instanceId, settled.tasksToCreate, organizationId, settled.state.variables)
        await this.persistCompensations(tx, task.instanceId, settled.compensations)
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

    // O aviso desta tarefa não pede mais ação; o das próximas nasce agora.
    await this.notifier.clearForTasks([task.id])
    if (settled.completed && !settled.errored) await this.notifier.clearForInstance(task.instanceId)
    await this.notifier.taskAssigned(organizationId, createdTasks, this.processNotice(task.instance))

    return {
      instanceId: task.instanceId,
      completed: settled.completed,
      errored: settled.errored ?? null,
      tasks: await this.pendingTasks(task.instanceId),
    }
  }

  /** Identificação do processo para as mensagens do sininho. */
  private processNotice(instance: { numero: number | null; processDefinition: { name: string } }): ProcessNotice {
    return { name: instance.processDefinition.name, numero: instance.numero }
  }

  // ── Devolver (retroceder para uma etapa anterior) ────────────────────────────

  /** Carrega a tarefa + grafo congelado e confere quem pode agir. Compartilhado
   *  por tudo que age sobre uma tarefa pendente: devolver, consultar alvos, delegar. */
  private async loadActionableTask(taskId: string, organizationId: string, actor?: CurrentUserData) {
    const task = await this.prisma.workflowTask.findFirst({
      where: { id: taskId, instance: { processDefinition: { organizationId } } },
      include: { instance: { include: { processDefinition: true } } },
    })
    if (!task) throw new NotFoundException('Tarefa não encontrada')
    if (task.status !== 'PENDING') throw new BadRequestException('Tarefa já concluída ou cancelada')
    if (task.instance.status !== 'RUNNING') throw new BadRequestException('Instância não está em execução')

    const roleKeys = await this.roles.roleKeysForUser(organizationId, actor?.sub ?? '')
    if (!canActOnTask(task, actor?.sub ?? '', roleKeys, this.isAdmin(actor))) {
      throw new ForbiddenException('Você não é o executor desta tarefa')
    }

    const graph =
      (task.instance.graphSnapshot as unknown as WfGraph | null) ??
      (task.instance.processDefinition.compiledGraph as unknown as WfGraph | null)
    if (!graph || !graph.nodes) throw new BadRequestException('Processo sem grafo compilado')

    return { task, graph, state: task.instance.state as unknown as WfState }
  }

  /** Etapas para onde esta tarefa pode ser devolvida. Traz também as BLOQUEADAS
   *  (com o motivo) — some-las sem explicação faria o usuário achar que o sistema
   *  esqueceu a etapa. */
  async returnTargetsFor(taskId: string, organizationId: string, actor?: CurrentUserData) {
    const { task, graph, state } = await this.loadActionableTask(taskId, organizationId, actor)
    try {
      return returnTargets(graph, state, task.tokenId)
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e))
    }
  }

  /** Devolve o processo para uma etapa anterior: descarta o que estava em voo
   *  abaixo do alvo (inclusive ramos paralelos irmãos), recria a tarefa no alvo e
   *  registra a auditoria. Preserva as variáveis — a pessoa corrige o que já existe. */
  async returnTask(taskId: string, dto: ReturnTaskDto, organizationId: string, actor?: CurrentUserData) {
    const { task, graph, state: prevState } = await this.loadActionableTask(taskId, organizationId, actor)
    const prevRevision = task.instance.revision
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('Informe o motivo da devolução')

    // Roda o motor ANTES de reivindicar a tarefa: alvo inválido / bloqueado por
    // conector é erro de VALIDAÇÃO (400), não pode marcar a tarefa nem levar a
    // instância a ERRO (por isso não passa pelo `settle`). Devolver nunca executa
    // conector — o alvo é sempre atividade humana, onde a propagação para.
    let result: WfRunResult
    try {
      result = returnToken(graph, prevState, task.tokenId, dto.targetNodeId, runtime)
    } catch (e) {
      if (e instanceof WfError) throw new BadRequestException(e.message)
      throw e
    }

    const tasksToCreate: Array<{ token: { id: string; nodeId: string }; node: WfNode }> = []
    const tokensToCancel: string[] = []
    for (const e of result.effects) {
      if (e.kind === 'createTask') tasksToCreate.push({ token: e.token, node: e.node })
      // o token DESTA tarefa também é descartado, mas ela fica RETURNED (não CANCELED):
      // é o registro de que houve devolução, não de que a tarefa sumiu.
      else if (e.kind === 'cancelTask' && e.token.id !== task.tokenId) tokensToCancel.push(e.token.id)
    }

    // Anti-corrida (1/2): reivindica a tarefa por CAS antes de mexer na instância.
    const claim = await this.prisma.workflowTask.updateMany({
      where: { id: task.id, status: 'PENDING' },
      data: {
        status: 'RETURNED',
        completedBy: actor?.name ?? 'Usuário do sistema',
        completedById: actor?.sub ?? null,
        completedAt: new Date(),
      },
    })
    if (claim.count === 0) throw new BadRequestException('Tarefa já concluída ou cancelada')

    const fromName = graph.nodes[task.nodeId]?.name ?? task.name ?? null
    const toName = graph.nodes[dto.targetNodeId]?.name ?? null
    let reopened: TaskNotice[] = []

    // COMPENSAÇÃO (F5): as ações automáticas COMPENSATE que rodaram DENTRO do sub-grafo
    // descartado precisam ser DESFEITAS antes de reabrir a etapa — senão seguir de novo
    // lançaria o aditivo/ativação em dobro. Rodo as inversas AGORA (com a tarefa já
    // reivindicada); se uma falhar, reverto a reivindicação e recuso (400). Os
    // compensadores são idempotentes, então uma repetição rara (lock otimístico abaixo)
    // não causa dano.
    const discarded = new Set(nodesReachableFrom(graph, dto.targetNodeId))
    const comps = (await this.prisma.workflowCompensation.findMany({
      where: { instanceId: task.instanceId, undoneAt: null },
      orderBy: { createdAt: 'desc' }, // desfaz o mais recente primeiro
    })).filter((c) => discarded.has(c.nodeId))

    try {
      for (const c of comps) {
        await this.runCompensator(c.undoData as unknown as Record<string, unknown>, { organizationId, actor })
      }
    } catch (e) {
      // inversa falhou → devolve a tarefa a PENDING e recusa (nada foi devolvido)
      await this.prisma.workflowTask.updateMany({
        where: { id: task.id, status: 'RETURNED' },
        data: { status: 'PENDING', completedBy: null, completedById: null, completedAt: null },
      })
      throw new BadRequestException(`Não foi possível desfazer uma ação automática: ${e instanceof Error ? e.message : String(e)}`)
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Anti-corrida (2/2): mesmo lock otimístico da conclusão. Se um ramo
        // paralelo concluiu no meio do caminho, o estado mudou e esta devolução
        // partiria de uma foto velha — melhor recusar e recarregar.
        const upd = await tx.processInstance.updateMany({
          where: { id: task.instanceId, revision: prevRevision },
          data: { state: result.state as never, status: 'RUNNING', revision: { increment: 1 }, completedAt: null },
        })
        if (upd.count === 0) {
          throw new ConflictException('A instância foi alterada por outra ação simultânea. Recarregue e tente novamente.')
        }
        // ramos irmãos descartados saem da caixa de quem os tinha
        if (tokensToCancel.length > 0) {
          await tx.workflowTask.updateMany({
            where: { instanceId: task.instanceId, tokenId: { in: tokensToCancel }, status: 'PENDING' },
            data: { status: 'CANCELED' },
          })
        }
        reopened = await this.persistTasks(tx, task.instanceId, tasksToCreate, organizationId, result.state.variables)
        // marca as compensações que rodaram como desfeitas (some da lista de ativas)
        if (comps.length > 0) {
          await tx.workflowCompensation.updateMany({
            where: { id: { in: comps.map((c) => c.id) } },
            data: { undoneAt: new Date() },
          })
        }
        await tx.workflowReturn.create({
          data: {
            instanceId: task.instanceId,
            fromNodeId: task.nodeId,
            fromName,
            toNodeId: dto.targetNodeId,
            toName,
            reason,
            user: actor?.name ?? 'Usuário do sistema',
            userId: actor?.sub ?? null,
          },
        })
      })
    } catch (e) {
      if (e instanceof ConflictException) {
        // desfaz a reivindicação: a tarefa volta a PENDING para ser refeita
        await this.prisma.workflowTask.updateMany({
          where: { id: task.id, status: 'RETURNED' },
          data: { status: 'PENDING', completedBy: null, completedById: null, completedAt: null },
        })
      }
      throw e
    }

    // Limpa os avisos das tarefas que a devolução encerrou (esta e os ramos
    // descartados) e avisa quem recebeu a etapa de volta — com o motivo, que é a
    // única informação que evita refazer o mesmo trabalho do mesmo jeito.
    await this.notifier.clearSettledTasks(task.instanceId)
    await this.notifier.taskReturned(organizationId, reopened, this.processNotice(task.instance), {
      fromName,
      reason,
      by: actor?.name ?? 'Usuário do sistema',
    })

    return {
      instanceId: task.instanceId,
      returnedTo: dto.targetNodeId,
      returnedToName: toName,
      canceled: tokensToCancel.length,
      tasks: await this.pendingTasks(task.instanceId),
    }
  }

  // ── Delegar (passar a tarefa para outra pessoa) ──────────────────────────────

  /** Reatribui uma tarefa pendente a outro usuário. Existe porque processo parado
   *  por férias/desligamento é o modo mais banal de um workflow morrer: sem isto, a
   *  única saída seria um administrador editar o banco.
   *  Quem pode: o executor atual (repassa o que é seu) ou um administrador. */
  async assignTask(taskId: string, dto: AssignTaskDto, organizationId: string, actor?: CurrentUserData) {
    const { task } = await this.loadActionableTask(taskId, organizationId, actor)
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('Informe o motivo da delegação')

    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId },
      select: { id: true, name: true, status: true },
    })
    if (!target) throw new NotFoundException('Usuário não encontrado nesta organização')
    if (target.status !== 'ATIVO') throw new BadRequestException('Usuário inativo não pode receber tarefas')

    const pool = Array.isArray(task.assignees) ? (task.assignees as string[]) : []
    if (pool.length === 1 && pool[0] === target.id) {
      throw new BadRequestException('A tarefa já está com este usuário')
    }

    // Nome de quem estava com ela (snapshot para o histórico ler sem depender do
    // cadastro atual). Pool vazio = tarefa estava aberta, sem dono.
    const anteriores = pool.length
      ? (await this.prisma.user.findMany({ where: { id: { in: pool } }, select: { name: true } })).map((u) => u.name)
      : []
    const fromUser = anteriores.length ? anteriores.join(', ') : null

    await this.prisma.$transaction([
      // o POOL é a fonte da verdade de quem pode atuar (canActOnTask): trocá-lo já
      // transfere a tarefa. `role` fica como estava — é o desenho do processo, não
      // a atribuição desta execução.
      this.prisma.workflowTask.update({
        where: { id: task.id },
        data: { assignees: [target.id] as never, assignee: target.id },
      }),
      this.prisma.workflowEvent.create({
        data: {
          instanceId: task.instanceId,
          taskId: task.id,
          event: 'DELEGADO',
          detail: task.name,
          fromUser,
          toUser: target.name,
          toUserId: target.id,
          reason,
          user: actor?.name ?? 'Usuário do sistema',
          userId: actor?.sub ?? null,
        },
      }),
    ])

    // O aviso antigo é de quem não é mais responsável; o novo dono recebe o dele.
    await this.notifier.clearForTasks([task.id])
    await this.notifier.taskDelegated(
      organizationId,
      { id: task.id, name: task.name, instanceId: task.instanceId, assignees: [target.id], dueAt: task.dueAt },
      this.processNotice(task.instance),
      { toUserId: target.id, reason, by: actor?.name ?? 'Usuário do sistema' },
    )

    return { taskId: task.id, assignedTo: target.id, assignedToName: target.name }
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
      include: {
        processDefinition: { select: { name: true } },
        tasks: { orderBy: { createdAt: 'asc' } },
        // último cancelamento: a lista precisa dizer POR QUE o processo parou
        events: { where: { event: 'CANCELADO' }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { returns: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const cal = await this.calendar.get(organizationId)
    const now = Date.now()
    const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null)
    return instances.map((inst) => {
      const state = inst.state as unknown as WfState | null
      const graph = inst.graphSnapshot as unknown as WfGraph | null
      const vars = state?.variables ?? {}
      const error = (vars.__connectorError ?? vars.__engineError) as string | undefined
      // Etapa parada = token de serviceTask (o conector automático que falhou).
      const stuck = state?.tokens?.map((t) => graph?.nodes?.[t.nodeId]).find((n) => n?.type === 'serviceTask')

      const tasks = inst.tasks ?? []
      const pending = tasks.filter((t) => t.status === 'PENDING')
      const done = tasks.filter((t) => t.status === 'DONE')
      const current = pending[0] // etapa atual (1ª pendente)
      const currentDueMs = ms(current?.dueAt)
      const currentOverdue = currentDueMs != null && currentDueMs < now
      // pontualidade: nenhuma concluída fora do prazo e nenhuma pendente vencida
      const anyLate = done.some((t) => t.dueAt && t.completedAt && ms(t.completedAt)! > ms(t.dueAt)!)
      const hasSla = tasks.some((t) => t.dueAt)
      const startMs = ms(inst.startedAt)
      const endMs = ms(inst.completedAt)

      // SLA DE PROCESSO (derivado): soma dos SLAs das atividades (userTask) do grafo
      // congelado, aplicada em dias/horas ÚTEIS a partir do início. Ramificação exclusiva
      // super-estima (soma todos os ramos → prazo mais folgado); documentado como escolha.
      let slaDays = 0, slaHours = 0
      for (const n of Object.values(graph?.nodes ?? {})) {
        if (n?.type === 'userTask') { slaDays += n.slaBusinessDays ?? 0; slaHours += (n.slaBusinessHours ?? 0) + (n.slaBusinessMinutes ?? 0) / 60 }
      }
      const hasProcessSla = slaDays > 0 || slaHours > 0
      const processDueAt = hasProcessSla && startMs != null ? this.calendar.computeDue(new Date(startMs), slaDays, slaHours, cal) : null
      const processDueMs = ms(processDueAt)
      const processOverdue = processDueMs != null && inst.status === 'RUNNING' && processDueMs < now
      const processOnTime = !hasProcessSla ? null
        : inst.status === 'COMPLETED' ? (endMs == null || processDueMs == null || endMs <= processDueMs)
        : inst.status === 'RUNNING' ? !processOverdue
        : null

      return {
        id: inst.id,
        numero: inst.numero ?? null,
        processName: inst.processDefinition?.name ?? 'Processo',
        version: inst.definitionVersion,
        status: inst.status,
        error: error ?? null,
        stepName: stuck?.name ?? stuck?.id ?? null,
        startedBy: inst.startedBy ?? null,
        startedAt: inst.startedAt,
        completedAt: inst.completedAt ?? null,
        updatedAt: inst.updatedAt,
        // acompanhamento
        currentStep: current?.name ?? current?.nodeId ?? null,
        currentDueAt: current?.dueAt ?? null,
        currentOverdue,
        totalSteps: tasks.length,
        doneSteps: done.length,
        hasSla,
        onTime: !anyLate && !currentOverdue,
        durationMs: startMs != null && endMs != null ? endMs - startMs : null,
        // SLA de processo (derivado da soma das atividades)
        processDueAt,
        processOverdue,
        processOnTime,
        // devoluções: quantas vezes o processo foi retrocedido. O SLA acima é otimista
        // num processo devolvido (a soma não conta as reaberturas) → a UI usa isto para
        // ressalvar a Pontualidade.
        returnCount: inst._count?.returns ?? 0,
        // cancelamento: motivo e autor (vazios quando o processo não foi cancelado)
        cancelReason: inst.events?.[0]?.reason ?? null,
        cancelledBy: inst.events?.[0]?.user ?? null,
        cancelledAt: inst.events?.[0]?.createdAt ?? null,
      }
    })
  }

  /** Gargalos (Fase 3): tempo MÉDIO por etapa (tarefa concluída → createdAt..completedAt),
   *  agrupado por nome de atividade. Devolve as mais lentas (top 5) para a tela de
   *  Acompanhamento destacar onde o processo mais demora. */
  async stepMetrics(organizationId: string) {
    const tasks = await this.prisma.workflowTask.findMany({
      where: { status: 'DONE', completedAt: { not: null }, instance: { processDefinition: { organizationId } } },
      select: { name: true, nodeId: true, createdAt: true, completedAt: true },
    })
    const byStep = new Map<string, { name: string; totalMs: number; count: number }>()
    for (const t of tasks) {
      const dur = (t.completedAt as Date).getTime() - t.createdAt.getTime()
      if (dur < 0) continue
      const key = t.name || t.nodeId
      const cur = byStep.get(key) ?? { name: key, totalMs: 0, count: 0 }
      cur.totalMs += dur; cur.count += 1
      byStep.set(key, cur)
    }
    const slowest = [...byStep.values()]
      .map((s) => ({ name: s.name, avgMs: Math.round(s.totalMs / s.count), count: s.count }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5)
    return { slowest }
  }

  async getInstanceWithContext(instanceId: string, organizationId: string) {
    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, processDefinition: { organizationId } },
      include: {
        processDefinition: true,
        tasks: { orderBy: { createdAt: 'asc' } },
        returns: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!instance) throw new NotFoundException('Instância não encontrada')

    // Grafo CONGELADO da instância (imune a edição do processo depois) para ler o SLA
    // configurado de cada atividade; fallback no grafo vivo para instâncias antigas.
    const snap =
      (instance.graphSnapshot as unknown as WfGraph | null) ??
      (instance.processDefinition.compiledGraph as unknown as WfGraph | null)
    const state = instance.state as unknown as WfState

    // Nomes dos responsáveis, RESOLVIDOS AO VIVO a partir dos ids (o banco guarda id;
    // o rótulo se resolve na leitura). Sem isto a tela mostraria o id cru de quem
    // recebeu a tarefa — visível assim que a delegação passou a gravar o usuário.
    const userIds = [...new Set(instance.tasks.flatMap((t) => {
      const pool = Array.isArray(t.assignees) ? (t.assignees as string[]) : []
      return t.assignee ? [...pool, t.assignee] : pool
    }))]
    const nameById = new Map(
      userIds.length
        ? (await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
        : [],
    )

    // Enriquece cada tarefa com o PRAZO configurado (dias/horas/minutos úteis) do nó —
    // a tela de consulta mostra numa coluna. `dueAt` (data prevista) já vem na tarefa.
    const tasks = instance.tasks.map((t) => {
      const node = snap?.nodes?.[t.nodeId]
      const pool = Array.isArray(t.assignees) ? (t.assignees as string[]) : []
      const ids = pool.length ? pool : t.assignee ? [t.assignee] : []
      return {
        ...t,
        slaBusinessDays: node?.slaBusinessDays ?? null,
        slaBusinessHours: node?.slaBusinessHours ?? null,
        slaBusinessMinutes: node?.slaBusinessMinutes ?? null,
        // nomes de quem pode executar (vazio = tarefa aberta)
        assigneeNames: ids.map((id) => nameById.get(id)).filter((n): n is string => !!n),
      }
    })

    return {
      instance: { ...instance, tasks },
      state,
      graph: snap,
      pendingTasks: tasks.filter((t) => t.status === 'PENDING'),
      returns: instance.returns, // histórico de devoluções (F4) — de/para/motivo/autor/quando
      events: instance.events,   // delegações e cancelamento — a outra metade do histórico
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
      include: { instance: { include: { processDefinition: { select: { name: true, kind: true } } } } },
      orderBy: { createdAt: 'asc' },
    })

    if (opts.mine === false) return tasks

    // "minhas tarefas": lista pessoal (isAdmin=false de propósito — o admin também
    // tem a SUA caixa; a visão de tudo é o mine=false).
    const userId = opts.actor?.sub ?? ''
    const roleKeys = await this.roles.roleKeysForUser(organizationId, userId)
    return tasks.filter((t) => canActOnTask(t, userId, roleKeys, false))
  }

  /** Tarefas pendentes com prazo, num recorte de tempo, com o processo junto — a
   *  base das duas varreduras (a preventiva e a de vencidas). */
  private async tasksWithDue(where: Record<string, unknown>) {
    return this.prisma.workflowTask.findMany({
      where,
      include: {
        instance: {
          select: {
            id: true, numero: true,
            processDefinition: { select: { name: true, organizationId: true } },
          },
        },
      },
    })
  }

  /** Agrupa por organização: as varreduras rodam globais (o agendador não tem
   *  tenant), mas notificação e parâmetros são por org. */
  private byOrg<T extends { instance: { processDefinition: { organizationId: string } } }>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>()
    for (const r of rows) {
      const org = r.instance.processDefinition.organizationId
      const list = map.get(org)
      if (list) list.push(r)
      else map.set(org, [r])
    }
    return map
  }

  /** Varre tarefas PENDING vencidas (dueAt < agora) ainda não escalonadas, marca
   *  (escalatedAt) e AVISA os executores. Chamada pelo WorkflowScheduler no boot e
   *  em intervalo. `organizationId` opcional escopa (disparo manual); sem ele, varre tudo. */
  async sweepOverdue(organizationId?: string): Promise<number> {
    const where: Record<string, unknown> = {
      status: 'PENDING',
      dueAt: { lt: new Date() },
      escalatedAt: null,
    }
    if (organizationId) where.instance = { processDefinition: { organizationId } }

    const overdue = await this.tasksWithDue(where)
    if (overdue.length === 0) return 0
    await this.prisma.workflowTask.updateMany({
      where: { id: { in: overdue.map((t) => t.id) } },
      data: { escalatedAt: new Date() },
    })

    for (const [org, rows] of this.byOrg(overdue)) {
      await this.notifier.taskOverdue(org, rows.map(toNotice))
    }
    return overdue.length
  }

  /** Varre tarefas PENDING cujo prazo está PERTO de estourar e avisa quem pode agir
   *  enquanto ainda dá tempo — o valor do prazo está em chegar antes dele, não em
   *  registrar o atraso depois. A antecedência é por organização (parâmetros de
   *  notificação); `enabled: false` desliga. */
  async sweepDueSoon(organizationId?: string): Promise<number> {
    const now = new Date()
    const where: Record<string, unknown> = {
      status: 'PENDING',
      dueAt: { gt: now },
      escalatedAt: null,
    }
    if (organizationId) where.instance = { processDefinition: { organizationId } }

    const upcoming = await this.tasksWithDue(where)
    if (upcoming.length === 0) return 0

    let avisadas = 0
    for (const [org, rows] of this.byOrg(upcoming)) {
      const params = tarefasParams((await this.settings.get(org, NOTIF_PARAMS_KEY)).value)
      if (!params.enabled) continue
      const limite = now.getTime() + params.antecedenciaHoras * 3_600_000
      const perto = rows.filter((t) => t.dueAt !== null && t.dueAt.getTime() <= limite)
      if (perto.length === 0) continue
      await this.notifier.taskDueSoon(org, perto.map(toNotice))
      avisadas += perto.length
    }
    return avisadas
  }

  /** Cancela a instância, com MOTIVO registrado no histórico e aviso a quem tinha
   *  tarefa pendente — o trabalho dessas pessoas para aqui, e elas não deveriam
   *  descobrir isso abrindo a caixa de tarefas e não achando mais nada.
   *  Quem pode: administrador ou quem iniciou o processo. */
  async cancel(instanceId: string, organizationId: string, dto: CancelInstanceDto, actor?: CurrentUserData) {
    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, processDefinition: { organizationId } },
      include: { processDefinition: { select: { name: true } } },
    })
    if (!instance) throw new NotFoundException('Instância não encontrada')
    // Também cancela instâncias em ERRO (antes ficavam presas para sempre).
    if (instance.status !== 'RUNNING' && instance.status !== 'ERROR') {
      throw new BadRequestException('Só é possível cancelar instâncias em execução ou com erro')
    }
    if (!this.isAdmin(actor) && instance.startedById && instance.startedById !== actor?.sub) {
      throw new ForbiddenException('Só um administrador ou quem iniciou o processo pode cancelá-lo')
    }
    const reason = (dto?.reason ?? '').trim()
    if (!reason) throw new BadRequestException('Informe o motivo do cancelamento')

    // Quem perde trabalho com o cancelamento (antes de as tarefas irem para CANCELED).
    const pendentes = await this.prisma.workflowTask.findMany({
      where: { instanceId, status: 'PENDING' },
      select: { id: true, assignees: true, assignee: true },
    })
    const atingidos = pendentes.flatMap(recipientsOf)

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
      this.prisma.workflowEvent.create({
        data: {
          instanceId,
          event: 'CANCELADO',
          detail: instance.processDefinition.name,
          reason,
          user: actor?.name ?? 'Usuário do sistema',
          userId: actor?.sub ?? null,
        },
      }),
    ])

    await this.notifier.clearForInstance(instanceId)
    await this.notifier.processCancelled(
      organizationId,
      instanceId,
      atingidos.filter((id) => id !== actor?.sub), // quem cancelou não precisa se avisar
      this.processNotice(instance),
      { reason, by: actor?.name ?? 'Usuário do sistema' },
    )

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
      await this.persistCompensations(tx, instanceId, settled.compensations)
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
    compensations: Array<{ nodeId: string; connector: string; undoData: Record<string, unknown> }>
    completed: boolean
    errored?: string
  }> {
    let state: WfState = fallbackState
    const tasksToCreate: Array<{ token: { id: string; nodeId: string }; node: WfNode }> = []
    const compensations: Array<{ nodeId: string; connector: string; undoData: Record<string, unknown> }> = []
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
      compensations,
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
      let out: { outputs: Record<string, unknown>; compensation?: Record<string, unknown> }
      try {
        out = await this.runConnector(svc.node, state.variables, ctx)
      } catch (e) {
        // Conector de domínio falhou: instância para em ERRO (o token do serviceTask
        // permanece parado). Guardamos a causa nas variáveis para diagnóstico.
        const msg = msgOf(e)
        state = { ...state, variables: { ...state.variables, __connectorError: msg } }
        return { state, tasksToCreate, compensations, completed: false, errored: msg }
      }
      // Registra COMO desfazer este passo, se for uma ação compensável (COMPENSATE).
      // Só grava quando o conector produziu dados de inversa (create não produz).
      if (svc.node.onReturn === 'COMPENSATE' && out.compensation) {
        compensations.push({ nodeId: svc.node.id, connector: String(out.compensation.connector ?? svc.node.connector ?? ''), undoData: out.compensation })
      }
      // Retomada do token após o conector: erro do motor aqui também vira ERRO.
      try {
        const next = completeToken(graph, state, svc.token.id, out.outputs, runtime)
        state = next.state
        absorb(next.effects)
      } catch (e) {
        if (e instanceof WfError) return engineErrored(state, msgOf(e))
        throw e
      }
    }

    return { state, tasksToCreate, compensations, completed }
  }

  /** Executa o conector de domínio de um serviceTask (nó `connector`). O resultado
   *  volta como VARIÁVEIS do processo (ex.: contratoId). É aqui que o passo final
   *  produz a entidade REAL (Contract/Partner), auditada, em vez de registro órfão.
   *  As variáveis coletadas nas atividades anteriores alimentam o DTO (por nome). */
  private async runConnector(
    node: WfNode,
    rawVars: Record<string, unknown>,
    ctx: ConnectorCtx,
  ): Promise<{ outputs: Record<string, unknown>; compensation?: Record<string, unknown> }> {
    const actorName = ctx.actor?.name
    const actorId = ctx.actor?.sub
    // Re-liga as variáveis mapeadas no designer ao nome que o conector espera; sem
    // mapa, cai na convenção de nome (os reads abaixo não mudam).
    const vars = applyInputMap(node.connectorInputs, rawVars)
    switch (node.connector) {
      case undefined:
      case '':
        return { outputs: {} } // serviceTask sem conector = passo automático de passagem

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
        return { outputs: { partnerId: created.id, partnerStatus: created.status } }
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
        return { outputs: { contratoId: created.id, contratoNumero: created.numero } }
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
        // compensação: remover ESTE aditivo (por id) do contrato-alvo
        return {
          outputs: { contratoId, aditivoId: novo.id, contratoSituacao: updated.situacao },
          compensation: { connector: 'contracts.aditivo', contratoId, aditivoId: novo.id },
        }
      }

      case 'contracts.distrato': {
        // Rescinde o contrato-alvo: transição de situação → RESCINDIDO (o motivo
        // acompanha a auditoria da transição). É o mesmo update() do domínio.
        const contratoId = resolveContractId(vars)
        if (!contratoId) throw new BadRequestException('Distrato sem contrato-alvo (defina a variável contratoId)')
        const motivo = str(vars.motivo) ?? str(vars.motivoDistrato) ?? str(vars.justificativa)
        // captura a situação ANTES para a compensação restaurá-la (não assumir VIGENTE)
        const prev = await this.prisma.contract.findFirst({
          where: { id: contratoId, organizationId: ctx.organizationId },
          select: { situacao: true },
        })
        const updated = await this.contracts.update(
          contratoId,
          { situacao: 'RESCINDIDO', motivo } as unknown as Parameters<ContractsService['update']>[1],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return {
          outputs: { contratoId, contratoSituacao: updated.situacao },
          compensation: prev?.situacao ? { connector: 'contracts.distrato', contratoId, prevSituacao: prev.situacao } : undefined,
        }
      }

      case 'partners.activate': {
        // Aprova/ativa o parceiro-alvo (onboarding): status → ATIVO. Alvo por variável
        // (partnerId), normalmente produzida por um partners.create anterior no fluxo.
        const partnerId = resolvePartnerId(vars)
        if (!partnerId) throw new BadRequestException('Ativação sem parceiro-alvo (defina a variável partnerId)')
        // captura o status ANTES para a compensação restaurá-lo
        const prevP = await this.prisma.partner.findFirst({
          where: { id: partnerId, organizationId: ctx.organizationId },
          select: { status: true },
        })
        const updated = await this.partners.update(
          partnerId,
          { status: 'ATIVO', motivo: str(vars.motivo) } as unknown as Parameters<PartnersService['update']>[1],
          ctx.organizationId,
          actorName,
          actorId,
        )
        return {
          outputs: { partnerId, partnerStatus: updated.status },
          compensation: prevP?.status ? { connector: 'partners.activate', partnerId, prevStatus: prevP.status } : undefined,
        }
      }

      default:
        throw new BadRequestException(`Conector desconhecido: ${node.connector}`)
    }
  }

  /** Conectores com INVERSA definida — os únicos que podem receber onReturn=COMPENSATE.
   *  A ativação valida contra esta lista; a devolução chama `runCompensator`. */
  private static readonly COMPENSABLE = new Set(['contracts.aditivo', 'contracts.distrato', 'partners.activate'])

  /** Roda a inversa de uma ação compensável (desfaz o efeito de domínio). Usada na
   *  devolução, ANTES de reabrir a etapa anterior. Idempotente onde dá (ex.: remover
   *  um aditivo que já não existe é no-op). */
  private async runCompensator(undoData: Record<string, unknown>, ctx: ConnectorCtx) {
    const actorName = ctx.actor?.name
    const actorId = ctx.actor?.sub
    const connector = String(undoData.connector ?? '')
    switch (connector) {
      case 'contracts.aditivo': {
        // remove ESTE aditivo (por id) do contrato-alvo
        const contratoId = String(undoData.contratoId ?? '')
        const aditivoId = String(undoData.aditivoId ?? '')
        const atual = await this.prisma.contract.findFirst({ where: { id: contratoId, organizationId: ctx.organizationId }, select: { aditivos: true } })
        if (!atual) return // contrato sumiu → nada a desfazer
        const existentes = Array.isArray(atual.aditivos) ? (atual.aditivos as Array<{ id?: string }>) : []
        const restante = existentes.filter((a) => a?.id !== aditivoId)
        if (restante.length === existentes.length) return // já não estava lá (no-op)
        await this.contracts.update(contratoId, { aditivos: restante, motivo: 'Compensação: devolução do processo' } as unknown as Parameters<ContractsService['update']>[1], ctx.organizationId, actorName, actorId)
        return
      }
      case 'contracts.distrato': {
        // restaura a situação anterior ao distrato
        const contratoId = String(undoData.contratoId ?? '')
        const prevSituacao = String(undoData.prevSituacao ?? '')
        if (!contratoId || !prevSituacao) return
        await this.contracts.update(contratoId, { situacao: prevSituacao, motivo: 'Compensação: devolução do processo' } as unknown as Parameters<ContractsService['update']>[1], ctx.organizationId, actorName, actorId)
        return
      }
      case 'partners.activate': {
        // restaura o status anterior à ativação
        const partnerId = String(undoData.partnerId ?? '')
        const prevStatus = String(undoData.prevStatus ?? '')
        if (!partnerId || !prevStatus) return
        await this.partners.update(partnerId, { status: prevStatus, motivo: 'Compensação: devolução do processo' } as unknown as Parameters<PartnersService['update']>[1], ctx.organizationId, actorName, actorId)
        return
      }
      default:
        throw new BadRequestException(`Ação "${connector}" não tem compensação definida`)
    }
  }

  // ── Persistência auxiliar ────────────────────────────────────────────────────

  /** Grava o log de compensação (como desfazer) das ações COMPENSATE que rodaram. */
  private async persistCompensations(
    client: Pick<PrismaService, 'workflowCompensation'>,
    instanceId: string,
    comps: Array<{ nodeId: string; connector: string; undoData: Record<string, unknown> }>,
  ) {
    if (comps.length === 0) return
    await client.workflowCompensation.createMany({
      data: comps.map((c) => ({ instanceId, nodeId: c.nodeId, connector: c.connector, undoData: c.undoData })) as never,
    })
  }

  /** Grava as tarefas do lote e DEVOLVE o que criou, para quem chamou notificar os
   *  executores depois do commit (nunca dentro da transação: um sininho lento ou
   *  fora do ar não pode segurar — nem desfazer — o avanço do processo).
   *  Os ids são gerados aqui porque `createMany` não devolve as linhas criadas. */
  private async persistTasks(
    client: Pick<PrismaService, 'workflowTask'>,
    instanceId: string,
    tasks: Array<{ token: { id: string; nodeId: string }; node: WfNode }>,
    organizationId: string,
    variables: Record<string, unknown>,
  ): Promise<TaskNotice[]> {
    if (tasks.length === 0) return []
    // Calendário comercial da org (uma leitura por lote) para o prazo em dias/horas úteis.
    const cal = await this.calendar.get(organizationId)
    // Resolve o executor (papel+entidade → usuário[]) de cada tarefa ANTES de gravar.
    const rows = await Promise.all(tasks.map(async ({ token, node }) => ({
      id: randomUUID(),
      instanceId,
      tokenId: token.id,
      nodeId: node.id,
      name: node.name ?? null,
      role: node.role ?? null,
      assignee: node.assignee ?? null,
      assignees: await this.resolveExecutor(node, organizationId, variables),
      formRef: node.formRef ?? null,
      dueAt: this.dueAtFor(node, cal),
      status: 'PENDING',
    })))
    await client.workflowTask.createMany({ data: rows as never })
    return rows.map((r) => ({
      id: r.id, name: r.name, instanceId, assignees: recipientsOf(r), dueAt: r.dueAt,
    }))
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
