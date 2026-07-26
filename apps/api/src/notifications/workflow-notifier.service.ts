import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

/* Avisos do WORKFLOW no sininho. O motor sabe QUANDO algo acontece; este serviço
   decide QUEM precisa saber e com que urgência.

   Duas regras que valem para tudo aqui:
   1) Tarefa é PESSOAL — o aviso nasce com destinatário (`userId`), um por executor
      resolvido. Tarefa sem executor (papel sem responsável cadastrado) vira aviso
      SEM dono (`userId` null): aparece para toda a org, que é exatamente o sinal de
      que ninguém foi designado.
   2) Aviso é ESTADO, não histórico — quando a tarefa sai de PENDING (concluída,
      devolvida, delegada, cancelada) os avisos dela são removidos. Quem quer o
      histórico consulta o processo; o sininho mostra só o que ainda pede ação. */

/** O mínimo que o notificador precisa saber de uma tarefa. */
export interface TaskNotice {
  id: string
  name: string | null
  instanceId: string
  assignees: string[]
  dueAt: Date | null
  /** De que processo esta tarefa é. Obrigatório nas VARREDURAS (cada tarefa do lote
   *  pode ser de um processo diferente); dispensável quando quem chama já sabe. */
  process?: ProcessNotice
}

/** Identificação do processo, para a mensagem dizer de onde a tarefa veio. */
export interface ProcessNotice {
  name: string
  numero?: number | null
}

interface Push {
  dedupKey: string
  userId: string | null
  tipo: string
  severidade: string
  titulo: string
  mensagem: string
  instanceId?: string
  taskId?: string
}

/** Tipos emitidos aqui — usado também para limpar sem tocar nos avisos de contrato. */
export const WORKFLOW_TIPOS = [
  'TAREFA_ATRIBUIDA',
  'TAREFA_A_VENCER',
  'TAREFA_VENCIDA',
  'PROCESSO_DEVOLVIDO',
  'PROCESSO_CANCELADO',
]

const fmtPrazo = (d: Date | null): string =>
  d
    ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

const taskLabel = (t: TaskNotice): string => t.name?.trim() || 'Atividade sem nome'

const processLabel = (p: ProcessNotice): string =>
  p.numero ? `${p.name} nº ${p.numero}` : p.name

/** Rótulo do processo de uma tarefa vinda de varredura. */
const ofTask = (t: TaskNotice): string => processLabel(t.process ?? { name: 'Processo' })

@Injectable()
export class WorkflowNotifierService {
  private readonly logger = new Logger('WorkflowNotifier')

  constructor(private readonly prisma: PrismaService) {}

  /** Uma linha por destinatário; sem executor resolvido, uma linha sem dono. */
  private fanOut(task: TaskNotice, make: (userId: string | null) => Omit<Push, 'userId'>): Push[] {
    const targets: Array<string | null> = task.assignees.length > 0 ? [...task.assignees] : [null]
    return targets.map((userId) => ({ ...make(userId), userId }))
  }

  /** Grava os avisos (idempotente pelo dedupKey). Nunca lança: um sininho mudo não
   *  pode derrubar a conclusão de uma tarefa nem a varredura de prazos. */
  private async push(organizationId: string, rows: Push[]): Promise<number> {
    let ok = 0
    for (const r of rows) {
      try {
        await this.prisma.notification.upsert({
          where: { organizationId_dedupKey: { organizationId, dedupKey: r.dedupKey } },
          create: {
            organizationId,
            dedupKey: r.dedupKey,
            userId: r.userId,
            instanceId: r.instanceId ?? null,
            taskId: r.taskId ?? null,
            tipo: r.tipo,
            severidade: r.severidade,
            titulo: r.titulo,
            mensagem: r.mensagem,
          },
          update: { severidade: r.severidade, titulo: r.titulo, mensagem: r.mensagem },
        })
        ok++
      } catch (e) {
        this.logger.error(`falha ao notificar (${r.dedupKey}): ${String(e)}`)
      }
    }
    return ok
  }

  /** Caiu uma tarefa para alguém. */
  async taskAssigned(organizationId: string, tasks: TaskNotice[], process: ProcessNotice): Promise<number> {
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        dedupKey: `wf-tarefa:${t.id}:${userId ?? 'org'}`,
        tipo: 'TAREFA_ATRIBUIDA',
        severidade: 'INFO',
        titulo: `Nova tarefa: ${taskLabel(t)}`,
        mensagem: t.dueAt
          ? `${processLabel(process)}: a atividade "${taskLabel(t)}" está com você. Prazo: ${fmtPrazo(t.dueAt)}.`
          : `${processLabel(process)}: a atividade "${taskLabel(t)}" está com você.`,
        instanceId: t.instanceId,
        taskId: t.id,
      })),
    )
    return this.push(organizationId, rows)
  }

  /** O processo voltou para uma etapa anterior — quem a recebe precisa do MOTIVO,
   *  senão refaz o mesmo trabalho do mesmo jeito. Substitui o aviso de tarefa nova
   *  nas tarefas recriadas pela devolução (dois avisos para o mesmo fato é ruído). */
  async taskReturned(
    organizationId: string,
    tasks: TaskNotice[],
    process: ProcessNotice,
    ctx: { fromName: string | null; reason: string; by: string },
  ): Promise<number> {
    const origem = ctx.fromName ? ` de "${ctx.fromName}"` : ''
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        dedupKey: `wf-tarefa:${t.id}:${userId ?? 'org'}`,
        tipo: 'PROCESSO_DEVOLVIDO',
        severidade: 'ALERTA',
        titulo: `Devolvido: ${taskLabel(t)}`,
        mensagem: `${processLabel(process)}: ${ctx.by} devolveu o processo${origem} para "${taskLabel(t)}". Motivo: ${ctx.reason}`,
        instanceId: t.instanceId,
        taskId: t.id,
      })),
    )
    return this.push(organizationId, rows)
  }

  /** O prazo está perto de estourar (aviso preventivo da varredura). */
  async taskDueSoon(organizationId: string, tasks: TaskNotice[]): Promise<number> {
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        dedupKey: `wf-vence:${t.id}:${userId ?? 'org'}`,
        tipo: 'TAREFA_A_VENCER',
        severidade: 'ALERTA',
        titulo: `Prazo próximo: ${taskLabel(t)}`,
        mensagem: `${ofTask(t)}: a atividade "${taskLabel(t)}" vence em ${fmtPrazo(t.dueAt)}.`,
        instanceId: t.instanceId,
        taskId: t.id,
      })),
    )
    return this.push(organizationId, rows)
  }

  /** O prazo estourou. Some o aviso preventivo: ele já não descreve a realidade. */
  async taskOverdue(organizationId: string, tasks: TaskNotice[]): Promise<number> {
    const ids = tasks.map((t) => t.id)
    if (ids.length > 0) {
      await this.prisma.notification
        .deleteMany({ where: { organizationId, taskId: { in: ids }, tipo: 'TAREFA_A_VENCER' } })
        .catch((e) => this.logger.error(`falha ao limpar avisos preventivos: ${String(e)}`))
    }
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        dedupKey: `wf-vencida:${t.id}:${userId ?? 'org'}`,
        tipo: 'TAREFA_VENCIDA',
        severidade: 'CRITICO',
        titulo: `Prazo vencido: ${taskLabel(t)}`,
        mensagem: `${ofTask(t)}: a atividade "${taskLabel(t)}" venceu em ${fmtPrazo(t.dueAt)} e continua pendente.`,
        instanceId: t.instanceId,
        taskId: t.id,
      })),
    )
    return this.push(organizationId, rows)
  }

  /** Delegação: o novo responsável precisa saber que a tarefa é dele agora. */
  async taskDelegated(
    organizationId: string,
    task: TaskNotice,
    process: ProcessNotice,
    ctx: { toUserId: string; reason: string; by: string },
  ): Promise<number> {
    return this.push(organizationId, [
      {
        dedupKey: `wf-tarefa:${task.id}:${ctx.toUserId}`,
        userId: ctx.toUserId,
        tipo: 'TAREFA_ATRIBUIDA',
        severidade: 'ALERTA',
        titulo: `Tarefa delegada a você: ${taskLabel(task)}`,
        mensagem: ctx.reason
          ? `${processLabel(process)}: ${ctx.by} delegou "${taskLabel(task)}" a você. Motivo: ${ctx.reason}`
          : `${processLabel(process)}: ${ctx.by} delegou "${taskLabel(task)}" a você.`,
        instanceId: task.instanceId,
        taskId: task.id,
      },
    ])
  }

  /** Processo cancelado: avisa quem tinha tarefa pendente (o trabalho dele parou). */
  async processCancelled(
    organizationId: string,
    instanceId: string,
    recipients: string[],
    process: ProcessNotice,
    ctx: { reason: string; by: string },
  ): Promise<number> {
    const targets: Array<string | null> = recipients.length > 0 ? [...new Set(recipients)] : []
    if (targets.length === 0) return 0
    return this.push(
      organizationId,
      targets.map((userId) => ({
        dedupKey: `wf-cancelado:${instanceId}:${userId ?? 'org'}`,
        userId,
        tipo: 'PROCESSO_CANCELADO',
        severidade: 'ALERTA',
        titulo: 'Processo cancelado',
        mensagem: `${processLabel(process)} foi cancelado por ${ctx.by}. Motivo: ${ctx.reason}`,
        instanceId,
      })),
    )
  }

  /** A tarefa saiu de PENDING → os avisos dela não pedem mais ação. */
  async clearForTasks(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return
    try {
      await this.prisma.notification.deleteMany({
        where: { taskId: { in: taskIds }, tipo: { in: WORKFLOW_TIPOS } },
      })
    } catch (e) {
      this.logger.error(`falha ao limpar avisos das tarefas: ${String(e)}`)
    }
  }

  /** Limpa os avisos de todas as tarefas do processo que já saíram de PENDING.
   *  Usado depois de operações que encerram várias de uma vez (devolução descarta
   *  ramos inteiros), onde enumerar os ids no caminho seria frágil. */
  async clearSettledTasks(instanceId: string): Promise<void> {
    try {
      const settled = await this.prisma.workflowTask.findMany({
        where: { instanceId, status: { not: 'PENDING' } },
        select: { id: true },
      })
      await this.clearForTasks(settled.map((t) => t.id))
    } catch (e) {
      this.logger.error(`falha ao limpar avisos das tarefas encerradas: ${String(e)}`)
    }
  }

  /** O processo acabou (concluído/cancelado) → limpa o que sobrou das tarefas dele. */
  async clearForInstance(instanceId: string): Promise<void> {
    try {
      await this.prisma.notification.deleteMany({
        where: { instanceId, tipo: { in: WORKFLOW_TIPOS.filter((t) => t !== 'PROCESSO_CANCELADO') } },
      })
    } catch (e) {
      this.logger.error(`falha ao limpar avisos do processo: ${String(e)}`)
    }
  }
}
