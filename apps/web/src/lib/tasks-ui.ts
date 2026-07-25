/* Helpers de apresentação da caixa de Tarefas — compartilhados pelo board (página)
   e pelo documento de execução em aba (task-doc-view). */

import { FileText, Users, GitBranch, type LucideIcon } from 'lucide-react'
import type { ProcessFormSchema } from '@nxt/types'

export interface Task {
  id: string
  instanceId: string
  nodeId: string
  name?: string | null
  role?: string | null
  dueAt?: string | null
  createdAt: string
  instance?: { numero?: number | null; processDefinition?: { name?: string; kind?: string | null } }
}

export interface TimelineTask { id: string; name?: string | null; status: string; completedBy?: string | null }
export interface InstanceContext {
  instance: { processDefinition: { name: string; formSchema: ProcessFormSchema }; tasks?: TimelineTask[] }
  state?: { variables?: Record<string, unknown> }
}

export type Grp = 'crit' | 'warn' | 'week'

/** Deriva a urgência da tarefa a partir do prazo (dueAt) + rótulo humano. Toda
 *  atividade tem prazo obrigatório; tarefa sem dueAt (legado) cai em "Próximas". */
export function dueInfo(dueAt?: string | null): { grp: Grp; label: string } {
  if (!dueAt) return { grp: 'week', label: 'sem prazo' }
  const due = new Date(dueAt).getTime()
  const now = Date.now()
  const diff = due - now
  const H = 3_600_000, D = 86_400_000
  if (diff < 0) {
    const a = -diff
    const l = a < H ? `atrasada há ${Math.max(1, Math.round(a / 60000))} min`
      : a < D ? `atrasada há ${Math.round(a / H)}h`
      : `atrasada há ${Math.round(a / D)}d`
    return { grp: 'crit', label: l }
  }
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999)
  if (due <= endToday.getTime()) {
    const l = diff < H ? `vence em ${Math.max(1, Math.round(diff / 60000))} min` : `vence em ${Math.round(diff / H)}h`
    return { grp: 'warn', label: l }
  }
  const dias = Math.round(diff / D)
  const l = dias <= 6
    ? `vence ${new Date(dueAt).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}`
    : `vence ${new Date(dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
  return { grp: 'week', label: l }
}

/** Ícone/cores por tipo do workflow. */
export function kindMeta(kind?: string | null): { Icon: LucideIcon; cls: string; label: string } {
  if (kind === 'PARCEIRO') return { Icon: Users, cls: 'text-lime-600 dark:text-lime-400 bg-lime-500/10', label: 'Parceiro' }
  if (kind === 'CONTRATO' || kind === 'ADITIVO') return { Icon: FileText, cls: 'text-primary bg-primary/10', label: kind === 'ADITIVO' ? 'Aditivo' : 'Contrato' }
  return { Icon: GitBranch, cls: 'text-muted-foreground bg-muted', label: 'Processo' }
}

export const COLUMNS: { key: Grp; label: string; dot: string; rail: string }[] = [
  { key: 'crit', label: 'Atrasadas',    dot: 'bg-red-500',   rail: 'bg-red-500' },
  { key: 'warn', label: 'Vencem hoje',  dot: 'bg-amber-500', rail: 'bg-amber-500' },
  { key: 'week', label: 'Próximas',     dot: 'bg-primary',   rail: 'bg-primary' },
]
export const DUE_CHIP: Record<Grp, string> = {
  crit: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  week: 'bg-muted text-muted-foreground',
}
export const TASK_STATUS: Record<string, string> = { PENDING: 'atual', DONE: 'concluída', CANCELED: 'cancelada', RETURNED: 'devolvida' }
