/* Tipos e helpers de apresentação do Acompanhamento de processos — compartilhados
   pela lista (/processos) e pela aba de consulta de uma instância (process-instance-doc). */

import { Activity, CheckCircle2, AlertTriangle, PlayCircle, Ban, type LucideIcon } from 'lucide-react'

export interface Inst {
  id: string; numero: number | null; processName: string; version: number
  status: 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED'
  error: string | null; stepName: string | null; startedBy: string | null
  startedAt: string; completedAt: string | null; updatedAt: string
  currentStep: string | null; currentDueAt: string | null; currentOverdue: boolean
  totalSteps: number; doneSteps: number; hasSla: boolean; onTime: boolean; durationMs: number | null
  processDueAt: string | null; processOverdue: boolean; processOnTime: boolean | null
  returnCount: number
  /** cancelamento (nulos quando o processo não foi cancelado) */
  cancelReason?: string | null; cancelledBy?: string | null; cancelledAt?: string | null
}
export interface TaskRow {
  id: string; nodeId: string; name?: string | null; role?: string | null; assignee?: string | null
  status: string; createdAt: string; dueAt?: string | null; completedAt?: string | null; completedBy?: string | null
  slaBusinessDays?: number | null; slaBusinessHours?: number | null; slaBusinessMinutes?: number | null
  /** nomes dos responsáveis, resolvidos ao vivo pelo backend (o banco guarda ids) */
  assigneeNames?: string[]
}

/** Quem aparece na coluna "Executor": quem concluiu, senão quem é responsável hoje,
 *  senão o papel. Nunca um id — id é chave, não rótulo. */
export function taskExecutor(t: TaskRow): string {
  if (t.completedBy) return t.completedBy
  if (t.assigneeNames?.length) return t.assigneeNames.join(', ')
  return t.role || '—'
}

/** Prazo configurado da atividade em dias/horas/minutos ÚTEIS → texto humano. */
export function formatSla(t: Pick<TaskRow, 'slaBusinessDays' | 'slaBusinessHours' | 'slaBusinessMinutes'>): string {
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'} ${n === 1 ? 'útil' : 'úteis'}`
  if (t.slaBusinessDays != null) return plural(t.slaBusinessDays, 'dia')
  if (t.slaBusinessHours != null) return plural(t.slaBusinessHours, 'hora')
  if (t.slaBusinessMinutes != null) return plural(t.slaBusinessMinutes, 'minuto')
  return '—'
}

/** Rótulo humano da situação da tarefa + cor do ponto/pílula. */
export function taskStatusMeta(status: string): { label: string; dot: string; pill: string } {
  switch (status) {
    case 'DONE':     return { label: 'Concluída', dot: 'bg-emerald-500', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
    case 'RETURNED': return { label: 'Retrocedida', dot: 'bg-amber-500',   pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
    case 'CANCELED': return { label: 'Cancelada', dot: 'bg-muted-foreground/40', pill: 'bg-muted text-muted-foreground' }
    default:         return { label: 'Pendente',  dot: 'bg-sky-500',     pill: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' }
  }
}
export interface ReturnRow { id: string; fromNodeId?: string | null; fromName?: string | null; toName?: string | null; reason: string; user: string; createdAt: string }
/** Evento de processo que não é execução de etapa: delegação e cancelamento. */
export interface EventRow {
  id: string; instanceId: string; taskId?: string | null; event: 'DELEGADO' | 'CANCELADO' | string
  detail?: string | null; fromUser?: string | null; toUser?: string | null; toUserId?: string | null
  reason: string; user: string; createdAt: string
}

export const STATUS: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  RUNNING:   { label: 'Em andamento', icon: PlayCircle,   cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  COMPLETED: { label: 'Concluído',    icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  ERROR:     { label: 'Com erro',     icon: AlertTriangle, cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  CANCELLED: { label: 'Cancelado',    icon: Ban,          cls: 'bg-muted text-muted-foreground' },
}
export const STATUS_FALLBACK_ICON = Activity
export const TASK_STATUS: Record<string, string> = { PENDING: 'Pendente', DONE: 'Concluída', CANCELED: 'Cancelada', RETURNED: 'Retrocedida' }

export const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function humanDuration(ms: number | null): string {
  if (ms == null) return '—'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

export function pontualidadeLabel(i: Inst): string { return i.processOnTime == null ? 'sem prazo' : i.processOnTime ? 'no prazo' : 'atrasado' }

/** Um registro do HISTÓRICO do processo (trilha cronológica de eventos). Carrega a
 *  TAREFA da atividade (para as colunas Início/Prazo/Data prevista/Pontualidade/Executor). */
export interface HistoryEvent {
  key: string
  ts: string
  kind: 'done' | 'return' | 'delegate' | 'cancel'
  /** a atividade envolvida; ausente no cancelamento, que é da INSTÂNCIA, não de uma etapa */
  task?: TaskRow
  /** retrocesso: para onde voltou; delegação: para quem foi */
  to?: string
  /** delegação: de quem saiu */
  from?: string
  reason?: string
  /** quem executou a AÇÃO (devolveu/delegou/cancelou) */
  by?: string
  /** rótulo quando não há tarefa (cancelamento) */
  label?: string
}

/** Monta o histórico: cada atividade CONCLUÍDA (DONE) ou RETROCEDIDA (RETURNED) vira um
 *  evento, carregando a tarefa (colunas de atividade). No retrocesso, casa o WorkflowReturn
 *  pelo nó de origem (mais próximo no tempo) para o destino + motivo. As delegações e o
 *  cancelamento (WorkflowEvent) entram na MESMA trilha — quem consulta quer a história do
 *  processo, não uma aba por tipo de registro. Mais recente primeiro. */
export function buildHistory(tasks: TaskRow[], returns: ReturnRow[], events: EventRow[] = []): HistoryEvent[] {
  const evs: HistoryEvent[] = []
  for (const t of tasks) {
    if (!t.completedAt) continue
    if (t.status === 'DONE') {
      evs.push({ key: `d:${t.id}`, ts: t.completedAt, kind: 'done', task: t })
    } else if (t.status === 'RETURNED') {
      const cands = returns.filter((r) => r.fromNodeId === t.nodeId)
      const ret = cands.sort((a, b) =>
        Math.abs(+new Date(a.createdAt) - +new Date(t.completedAt!)) - Math.abs(+new Date(b.createdAt) - +new Date(t.completedAt!)))[0]
      evs.push({ key: `r:${t.id}`, ts: t.completedAt, kind: 'return', task: t, to: ret?.toName ?? '', reason: ret?.reason ?? '', by: ret?.user })
    }
  }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  for (const e of events) {
    if (e.event === 'DELEGADO') {
      evs.push({
        key: `g:${e.id}`, ts: e.createdAt, kind: 'delegate',
        task: e.taskId ? byId.get(e.taskId) : undefined,
        label: e.detail ?? undefined,
        from: e.fromUser ?? '', to: e.toUser ?? '', reason: e.reason, by: e.user,
      })
    } else if (e.event === 'CANCELADO') {
      evs.push({ key: `c:${e.id}`, ts: e.createdAt, kind: 'cancel', label: e.detail ?? undefined, reason: e.reason, by: e.user })
    }
  }
  return evs.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
}

export function taskPunctuality(t: TaskRow): { label: string; cls: string } {
  const now = Date.now()
  if (!t.dueAt) return { label: 'sem prazo', cls: 'text-muted-foreground' }
  const due = new Date(t.dueAt).getTime()
  if (t.completedAt) return new Date(t.completedAt).getTime() <= due
    ? { label: 'no prazo', cls: 'text-emerald-600 dark:text-emerald-400' }
    : { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' }
  return due < now ? { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' } : { label: 'no prazo', cls: 'text-muted-foreground' }
}
