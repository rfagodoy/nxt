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
}
export interface ReturnRow { id: string; fromName?: string | null; toName?: string | null; reason: string; user: string; createdAt: string }

export const STATUS: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  RUNNING:   { label: 'Em andamento', icon: PlayCircle,   cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  COMPLETED: { label: 'Concluído',    icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  ERROR:     { label: 'Com erro',     icon: AlertTriangle, cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  CANCELLED: { label: 'Cancelado',    icon: Ban,          cls: 'bg-muted text-muted-foreground' },
}
export const STATUS_FALLBACK_ICON = Activity
export const TASK_STATUS: Record<string, string> = { PENDING: 'Pendente', DONE: 'Concluída', CANCELED: 'Cancelada', RETURNED: 'Devolvida' }

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

export function taskPunctuality(t: TaskRow): { label: string; cls: string } {
  const now = Date.now()
  if (!t.dueAt) return { label: 'sem prazo', cls: 'text-muted-foreground' }
  const due = new Date(t.dueAt).getTime()
  if (t.completedAt) return new Date(t.completedAt).getTime() <= due
    ? { label: 'no prazo', cls: 'text-emerald-600 dark:text-emerald-400' }
    : { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' }
  return due < now ? { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' } : { label: 'no prazo', cls: 'text-muted-foreground' }
}
