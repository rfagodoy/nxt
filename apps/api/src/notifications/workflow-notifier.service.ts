import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'
import { MailerService, layout, escapeHtml } from './mailer.service'
import { NOTIF_PARAMS_KEY, emailParams } from './notification-params'
import { WORKFLOW_TIPOS, fanOutTargets, dedupKeyFor } from './notification-rules'

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

export { WORKFLOW_TIPOS } from './notification-rules'

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
  ) {}

  /** Uma linha por destinatário; sem executor resolvido, uma linha sem dono. */
  private fanOut(task: TaskNotice, make: (userId: string | null) => Omit<Push, 'userId'>): Push[] {
    return fanOutTargets(task.assignees).map((userId) => ({ ...make(userId), userId }))
  }

  /** Grava os avisos (idempotente pelo dedupKey) e, para os que NASCERAM agora e têm
   *  destinatário, dispara o e-mail imediato. Nunca lança: um sininho mudo — ou um
   *  SMTP fora do ar — não pode derrubar a conclusão de uma tarefa nem a varredura.
   *
   *  Cria-e-depois-atualiza em vez de `upsert` porque a diferença IMPORTA: só o aviso
   *  novo vira e-mail. Um upsert que atualiza o texto de um aviso já lido não é fato
   *  novo para a pessoa, e mandaria e-mail toda varredura. */
  private async push(organizationId: string, rows: Push[]): Promise<number> {
    let ok = 0
    const novos: Array<{ id: string; userId: string; titulo: string; mensagem: string; severidade: string }> = []

    for (const r of rows) {
      try {
        const criado = await this.prisma.notification.create({
          data: {
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
          select: { id: true },
        })
        ok++
        if (r.userId) novos.push({ id: criado.id, userId: r.userId, titulo: r.titulo, mensagem: r.mensagem, severidade: r.severidade })
      } catch {
        // já existia (unique de dedupKey): atualiza o texto, sem e-mail
        try {
          await this.prisma.notification.update({
            where: { organizationId_dedupKey: { organizationId, dedupKey: r.dedupKey } },
            data: { severidade: r.severidade, titulo: r.titulo, mensagem: r.mensagem },
          })
          ok++
        } catch (e) {
          this.logger.error(`falha ao notificar (${r.dedupKey}): ${String(e)}`)
        }
      }
    }

    if (novos.length > 0) await this.emailNow(organizationId, novos)
    return ok
  }

  /** E-mail imediato dos avisos PESSOAIS recém-criados. Aviso sem dono (tarefa aberta)
   *  não vira e-mail de propósito: mandaria mensagem para a organização inteira sobre
   *  algo que não é responsabilidade de ninguém em particular. */
  private async emailNow(
    organizationId: string,
    novos: Array<{ id: string; userId: string; titulo: string; mensagem: string; severidade: string }>,
  ): Promise<void> {
    try {
      if (!this.mailer.enabled) return
      const params = emailParams((await this.settings.get(organizationId, NOTIF_PARAMS_KEY)).value)
      if (!params.imediato) return

      const ids = [...new Set(novos.map((n) => n.userId))]
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids }, organizationId, status: 'ATIVO' },
        select: { id: true, email: true, name: true },
      })
      const byId = new Map(users.map((u) => [u.id, u]))

      const enviados: string[] = []
      for (const n of novos) {
        const u = byId.get(n.userId)
        if (!u?.email) continue
        const ok = await this.mailer.send({
          to: u.email,
          subject: `[Nxt] ${n.titulo}`,
          text: `${n.titulo}\n\n${n.mensagem}\n\nAbra o Nxt para agir.`,
          html: layout(n.titulo, `<p>${escapeHtml(n.mensagem)}</p><p style="color:#6b7772">Abra o Nxt para agir.</p>`),
        })
        if (ok) enviados.push(n.id)
      }
      if (enviados.length > 0) {
        await this.prisma.notification.updateMany({ where: { id: { in: enviados } }, data: { emailedAt: new Date() } })
      }
    } catch (e) {
      this.logger.error(`falha no envio imediato de e-mail: ${String(e)}`)
    }
  }

  /** Caiu uma tarefa para alguém. */
  async taskAssigned(organizationId: string, tasks: TaskNotice[], process: ProcessNotice): Promise<number> {
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        dedupKey: dedupKeyFor('tarefa', t.id, userId),
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
        dedupKey: dedupKeyFor('tarefa', t.id, userId),
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
        dedupKey: dedupKeyFor('vence', t.id, userId),
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

  /** O prazo estourou. Some o aviso preventivo: ele já não descreve a realidade.
   *  Em `reaviso`, o texto assume que a pessoa já foi avisada — repetir a mesma frase
   *  faria o lembrete parecer defeito do sistema, e não insistência deliberada. */
  async taskOverdue(organizationId: string, tasks: TaskNotice[], opts: { reaviso?: boolean } = {}): Promise<number> {
    const ids = tasks.map((t) => t.id)
    if (ids.length > 0) {
      await this.prisma.notification
        .deleteMany({ where: { organizationId, taskId: { in: ids }, tipo: 'TAREFA_A_VENCER' } })
        .catch((e) => this.logger.error(`falha ao limpar avisos preventivos: ${String(e)}`))
    }
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        /* O reaviso carrega o DIA na chave: com a chave estável ele apenas atualizaria
           a linha existente — que a pessoa já leu — e o lembrete nasceria "lido", sem
           chamar atenção nenhuma. Um por dia de insistência, visível no histórico. */
        dedupKey: dedupKeyFor('vencida', t.id, userId, opts.reaviso ? new Date().toISOString().slice(0, 10) : undefined),
        tipo: 'TAREFA_VENCIDA',
        severidade: 'CRITICO',
        titulo: opts.reaviso ? `Ainda vencida: ${taskLabel(t)}` : `Prazo vencido: ${taskLabel(t)}`,
        mensagem: opts.reaviso
          ? `${ofTask(t)}: a atividade "${taskLabel(t)}" continua pendente desde ${fmtPrazo(t.dueAt)}.`
          : `${ofTask(t)}: a atividade "${taskLabel(t)}" venceu em ${fmtPrazo(t.dueAt)} e continua pendente.`,
        instanceId: t.instanceId,
        taskId: t.id,
      })),
    )
    return this.push(organizationId, rows)
  }

  /** Processo reaberto: a tarefa volta para a caixa de quem a tinha. Sem este aviso,
   *  ela reapareceria em silêncio — possivelmente já vencida, porque o prazo original
   *  é mantido e o tempo de cancelamento não é devolvido. */
  async taskResumed(
    organizationId: string,
    tasks: TaskNotice[],
    ctx: { reason: string; by: string },
  ): Promise<number> {
    const rows = tasks.flatMap((t) =>
      this.fanOut(t, (userId) => ({
        dedupKey: dedupKeyFor('tarefa', t.id, userId),
        tipo: 'TAREFA_ATRIBUIDA',
        severidade: 'ALERTA',
        titulo: `Processo reaberto: ${taskLabel(t)}`,
        mensagem: `${ofTask(t)}: ${ctx.by} desfez o cancelamento e a atividade "${taskLabel(t)}" está de volta com você. Motivo: ${ctx.reason}`,
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
        dedupKey: dedupKeyFor('tarefa', task.id, ctx.toUserId),
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
        dedupKey: dedupKeyFor('cancelado', instanceId, userId),
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
        where: { taskId: { in: taskIds }, tipo: { in: [...WORKFLOW_TIPOS] } },
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
