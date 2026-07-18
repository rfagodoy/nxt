import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { WorkflowRolesService } from '../workflow-roles/workflow-roles.service'
import { canActOnTask } from './task-access'
import {
  startProcess,
  completeToken,
  cancelProcess,
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

/** Ids de token únicos para o motor (viram WorkflowTask.tokenId). */
const runtime: WfRuntime = { genId: () => randomUUID() }

/** Contexto passado aos conectores de domínio (quem e qual org). */
interface ConnectorCtx {
  organizationId: string
  actor?: CurrentUserData
}

const str = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v))
const numOr = (v: unknown): number | undefined => {
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
    const settled = await this.settle(graph, startProcess(graph, dto.variables ?? {}, runtime), {
      organizationId,
      actor,
    })
    const status = settled.errored ? 'ERROR' : settled.completed ? 'COMPLETED' : 'RUNNING'

    const instance = await this.prisma.processInstance.create({
      data: {
        processDefinitionId: process.id,
        definitionVersion: process.version,
        status,
        state: settled.state as never,
        startedBy: actor?.name ?? null,
        startedById: actor?.sub ?? null,
        completedAt: settled.completed && !settled.errored ? new Date() : null,
      },
    })

    await this.persistTasks(instance.id, settled.tasksToCreate)

    return {
      instance,
      tasks: await this.pendingTasks(instance.id),
      completed: settled.completed,
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

    const graph = task.instance.processDefinition.compiledGraph as unknown as WfGraph | null
    if (!graph || !graph.nodes) throw new BadRequestException('Processo sem grafo compilado')

    const prevState = task.instance.state as unknown as WfState
    const data = dto.data ?? {}

    // Avança o motor a partir do token desta tarefa (executando conectores).
    const settled = await this.settle(graph, completeToken(graph, prevState, task.tokenId, data, runtime), {
      organizationId,
      actor,
    })
    const status = settled.errored ? 'ERROR' : settled.completed ? 'COMPLETED' : 'RUNNING'

    await this.prisma.$transaction([
      this.prisma.workflowTask.update({
        where: { id: task.id },
        data: {
          status: 'DONE',
          data: data as never,
          completedBy: actor?.name ?? 'Usuário do sistema',
          completedById: actor?.sub ?? null,
          completedAt: new Date(),
        },
      }),
      this.prisma.processInstance.update({
        where: { id: task.instanceId },
        data: {
          state: settled.state as never,
          status,
          completedAt: settled.completed && !settled.errored ? new Date() : null,
        },
      }),
    ])

    await this.persistTasks(task.instanceId, settled.tasksToCreate)

    return {
      instanceId: task.instanceId,
      completed: settled.completed,
      errored: settled.errored ?? null,
      tasks: await this.pendingTasks(task.instanceId),
    }
  }

  // ── Consultas ────────────────────────────────────────────────────────────────
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
    if (instance.status !== 'RUNNING') {
      throw new BadRequestException('Só é possível cancelar instâncias em execução')
    }

    const state = cancelProcess(instance.state as unknown as WfState)

    const [updated] = await this.prisma.$transaction([
      this.prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'CANCELLED', state: state as never },
      }),
      this.prisma.workflowTask.updateMany({
        where: { instanceId, status: 'PENDING' },
        data: { status: 'CANCELED' },
      }),
    ])

    return updated
  }

  // ── Motor: resolução de efeitos ──────────────────────────────────────────────
  /** Consome os efeitos de uma execução: acumula as userTasks a criar e executa
   *  os service-tasks automáticos (conectores na F5) até o motor descansar. */
  private async settle(
    graph: WfGraph,
    result: WfRunResult,
    ctx: ConnectorCtx,
  ): Promise<{
    state: WfState
    tasksToCreate: Array<{ token: { id: string; nodeId: string }; node: WfNode }>
    completed: boolean
    errored?: string
  }> {
    let state = result.state
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

    absorb(result.effects)

    while (serviceQueue.length > 0) {
      const svc = serviceQueue.shift() as { token: { id: string; nodeId: string }; node: WfNode }
      let out: Record<string, unknown>
      try {
        out = await this.runConnector(svc.node, state.variables, ctx)
      } catch (e) {
        // Conector de domínio falhou: instância para em ERRO (o token do serviceTask
        // permanece parado). Guardamos a causa nas variáveis para diagnóstico.
        const msg = e instanceof Error ? e.message : String(e)
        state = { ...state, variables: { ...state.variables, __connectorError: msg } }
        return { state, tasksToCreate, completed: false, errored: msg }
      }
      const next = completeToken(graph, state, svc.token.id, out, runtime)
      state = next.state
      absorb(next.effects)
    }

    return { state, tasksToCreate, completed }
  }

  /** Executa o conector de domínio de um serviceTask (nó `connector`). O resultado
   *  volta como VARIÁVEIS do processo (ex.: contratoId). É aqui que o passo final
   *  produz a entidade REAL (Contract/Partner), auditada, em vez de registro órfão.
   *  As variáveis coletadas nas atividades anteriores alimentam o DTO (por nome). */
  private async runConnector(
    node: WfNode,
    vars: Record<string, unknown>,
    ctx: ConnectorCtx,
  ): Promise<Record<string, unknown>> {
    const actorName = ctx.actor?.name
    const actorId = ctx.actor?.sub
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

      default:
        throw new BadRequestException(`Conector desconhecido: ${node.connector}`)
    }
  }

  // ── Persistência auxiliar ────────────────────────────────────────────────────
  private async persistTasks(
    instanceId: string,
    tasks: Array<{ token: { id: string; nodeId: string }; node: WfNode }>,
  ) {
    if (tasks.length === 0) return
    await this.prisma.workflowTask.createMany({
      data: tasks.map(({ token, node }) => ({
        instanceId,
        tokenId: token.id,
        nodeId: node.id,
        name: node.name ?? null,
        role: node.role ?? null,
        assignee: node.assignee ?? null,
        formRef: node.formRef ?? null,
        dueAt: node.slaMinutes ? new Date(Date.now() + node.slaMinutes * 60_000) : null,
        status: 'PENDING',
      })),
    })
  }

  private pendingTasks(instanceId: string) {
    return this.prisma.workflowTask.findMany({
      where: { instanceId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    })
  }
}
