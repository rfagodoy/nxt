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
}
export interface TaskRow {
  id: string; nodeId: string; name?: string | null; role?: string | null; assignee?: string | null
  status: string; createdAt: string; dueAt?: string | null; completedAt?: string | null; completedBy?: string | null
  slaBusinessDays?: number | null; slaBusinessHours?: number | null; slaBusinessMinutes?: number | null
}

/** Prazo configurado da atividade em dias/horas/minutos ÚTEIS → texto humano. */
export function formatSla(t: Pick<TaskRow, 'slaBusinessDays' | 'slaBusinessHours' | 'slaBusinessMinutes'>): string {
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'} úte${n === 1 ? 'l' : 'is'}`
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
export interface ReturnRow { id: string; fromName?: string | null; toName?: string | null; reason: string; user: string; createdAt: string }

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

/** Um registro do HISTÓRICO do processo (trilha cronológica de eventos). */
export interface HistoryEvent {
  key: string
  ts: string
  user: string
  kind: 'done' | 'return'
  /** conclusão: nome da atividade concluída */
  activity?: string
  /** retrocesso: de → para + motivo */
  from?: string
  to?: string
  reason?: string
}

/** Monta o histórico do processo: cada CONCLUSÃO de atividade (task DONE) e cada
 *  RETROCESSO (WorkflowReturn) vira um evento. Mais recente primeiro. */
export function buildHistory(tasks: TaskRow[], returns: ReturnRow[]): HistoryEvent[] {
  const evs: HistoryEvent[] = []
  for (const t of tasks) {
    if (t.status === 'DONE' && t.completedAt) {
      evs.push({ key: `d:${t.id}`, ts: t.completedAt, user: t.completedBy || '—', kind: 'done', activity: t.name || t.nodeId })
    }
  }
  for (const r of returns) {
    evs.push({ key: `r:${r.id}`, ts: r.createdAt, user: r.user, kind: 'return', from: r.fromName || '—', to: r.toName || '—', reason: r.reason })
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
