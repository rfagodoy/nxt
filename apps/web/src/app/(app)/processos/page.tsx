'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Activity, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock,
  PlayCircle, Ban, ChevronRight, X, User, GitBranch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/http'

interface Inst {
  id: string
  processName: string
  version: number
  status: 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED'
  error: string | null
  stepName: string | null
  startedBy: string | null
  startedAt: string
  completedAt: string | null
  updatedAt: string
  currentStep: string | null
  currentDueAt: string | null
  currentOverdue: boolean
  totalSteps: number
  doneSteps: number
  hasSla: boolean
  onTime: boolean
  durationMs: number | null
}

interface TaskRow {
  id: string
  nodeId: string
  name?: string | null
  role?: string | null
  assignee?: string | null
  status: string
  createdAt: string
  dueAt?: string | null
  completedAt?: string | null
  completedBy?: string | null
}

const STATUS: Record<string, { label: string; icon: typeof Activity; cls: string; dot: string }> = {
  RUNNING:   { label: 'Em andamento', icon: PlayCircle,  cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',       dot: 'bg-sky-500' },
  COMPLETED: { label: 'Concluído',    icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  ERROR:     { label: 'Com erro',     icon: AlertTriangle, cls: 'bg-red-500/10 text-red-600 dark:text-red-400',       dot: 'bg-red-500' },
  CANCELLED: { label: 'Cancelado',    icon: Ban,          cls: 'bg-muted text-muted-foreground',                     dot: 'bg-muted-foreground/50' },
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

function humanDuration(ms: number | null): string {
  if (ms == null) return '—'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

/** Pontualidade de uma atividade: no prazo / atrasada / sem prazo. */
function taskPunctuality(t: TaskRow): { label: string; cls: string } {
  const now = Date.now()
  if (!t.dueAt) return { label: 'sem prazo', cls: 'text-muted-foreground' }
  const due = new Date(t.dueAt).getTime()
  if (t.completedAt) {
    return new Date(t.completedAt).getTime() <= due
      ? { label: 'no prazo', cls: 'text-emerald-600 dark:text-emerald-400' }
      : { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' }
  }
  return due < now
    ? { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' }
    : { label: 'no prazo', cls: 'text-muted-foreground' }
}

const TASK_STATUS: Record<string, string> = { PENDING: 'Pendente', DONE: 'Concluída', CANCELED: 'Cancelada' }

export default function ProcessosPage() {
  const [rows, setRows] = useState<Inst[] | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED'>('ALL')
  const [detail, setDetail] = useState<Inst | null>(null)
  const [tasks, setTasks] = useState<TaskRow[] | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<Inst[]>('/api/instances')
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const openDetail = async (inst: Inst) => {
    setDetail(inst); setTasks(null)
    const ctx = await apiJson<{ instance?: { tasks?: TaskRow[] } }>(`/api/instances/${inst.id}`)
    setTasks(ctx?.instance?.tasks ?? [])
  }

  const stats = useMemo(() => {
    const r = rows ?? []
    return {
      total: r.length,
      running: r.filter((i) => i.status === 'RUNNING').length,
      completed: r.filter((i) => i.status === 'COMPLETED').length,
      overdue: r.filter((i) => i.status === 'RUNNING' && i.currentOverdue).length,
    }
  }, [rows])

  const filtered = (rows ?? []).filter((i) => filter === 'ALL' || i.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Processos</h1>
          <p className="text-[11px] text-muted-foreground">Acompanhamento das execuções — em andamento e concluídas</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={stats.total} icon={<Activity className="h-4 w-4" />} onClick={() => setFilter('ALL')} active={filter === 'ALL'} />
        <Stat label="Em andamento" value={stats.running} icon={<PlayCircle className="h-4 w-4" />} onClick={() => setFilter('RUNNING')} active={filter === 'RUNNING'} tone="sky" />
        <Stat label="Concluídos" value={stats.completed} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setFilter('COMPLETED')} active={filter === 'COMPLETED'} tone="emerald" />
        <Stat label="Atrasados" value={stats.overdue} icon={<Clock className="h-4 w-4" />} onClick={() => setFilter('RUNNING')} active={false} tone="red" />
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {rows === null ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold">Nenhum processo {filter !== 'ALL' ? 'nesta situação' : 'iniciado'}</h3>
            <p className="text-xs text-muted-foreground mt-1">Inicie um processo pelo Dashboard, Contratos ou Parceiros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-3 py-1.5">Processo</th>
                  <th className="text-left font-medium px-3 py-1.5 w-32">Situação</th>
                  <th className="text-left font-medium px-3 py-1.5 w-36">Iniciado por</th>
                  <th className="text-left font-medium px-3 py-1.5 w-28">Início</th>
                  <th className="text-left font-medium px-3 py-1.5">Etapa atual / conclusão</th>
                  <th className="text-left font-medium px-3 py-1.5 w-28">Pontualidade</th>
                  <th className="px-3 py-1.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const st = STATUS[i.status] ?? STATUS.RUNNING
                  return (
                    <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(i)}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{i.processName} <span className="text-[11px] text-muted-foreground font-normal">v{i.version}</span></p>
                        <p className="text-[11px] text-muted-foreground">{i.doneSteps}/{i.totalSteps} etapa{i.totalSteps !== 1 ? 's' : ''}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', st.cls)}>
                          <st.icon className="h-3 w-3" />{st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-[12px]">{i.startedBy || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-[12px] whitespace-nowrap">{fmt(i.startedAt)}</td>
                      <td className="px-3 py-2">
                        {i.status === 'RUNNING' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[12px]">{i.currentStep || '—'}</span>
                            {i.currentDueAt && (
                              <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                                i.currentOverdue ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'text-amber-600')}>
                                <Clock className="h-3 w-3" />{i.currentOverdue ? 'atrasada' : `vence ${fmt(i.currentDueAt)}`}
                              </span>
                            )}
                          </div>
                        ) : i.status === 'ERROR' ? (
                          <span className="inline-flex items-start gap-1 text-[12px] text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span className="max-w-xs truncate">{i.error || i.stepName || 'erro'}</span>
                          </span>
                        ) : i.status === 'COMPLETED' ? (
                          <span className="text-[12px] text-muted-foreground">em {fmt(i.completedAt)} · durou {humanDuration(i.durationMs)}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {!i.hasSla ? <span className="text-[11px] text-muted-foreground">sem prazo</span>
                          : i.onTime ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />no prazo</span>
                          : <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400"><AlertTriangle className="h-3 w-3" />atrasado</span>}
                      </td>
                      <td className="px-3 py-2 text-right"><ChevronRight className="h-4 w-4 text-muted-foreground inline" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border bg-card text-foreground shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{detail.processName} <span className="text-[11px] text-muted-foreground font-normal">v{detail.version}</span></p>
                  <p className="text-[11px] text-muted-foreground">Iniciado por {detail.startedBy || '—'} em {fmt(detail.startedAt)}</p>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-4 py-2 border-b flex items-center gap-2 text-[11px]">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', (STATUS[detail.status] ?? STATUS.RUNNING).cls)}>
                {STATUS[detail.status]?.label}
              </span>
              {detail.status === 'COMPLETED' && <span className="text-muted-foreground">Concluído em {fmt(detail.completedAt)} · durou {humanDuration(detail.durationMs)}</span>}
              {detail.status === 'ERROR' && detail.error && <span className="text-red-600 dark:text-red-400 truncate">{detail.error}</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Linha do tempo das atividades</p>
              {tasks === null ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…</div>
              ) : tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma atividade registrada ainda.</p>
              ) : (
                <ol className="space-y-2">
                  {tasks.map((t) => {
                    const p = taskPunctuality(t)
                    const doneCls = t.status === 'DONE' ? 'bg-emerald-500' : t.status === 'CANCELED' ? 'bg-muted-foreground/40' : 'bg-sky-500'
                    return (
                      <li key={t.id} className="rounded-lg border p-2.5">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', doneCls)} />
                          <span className="text-sm font-medium flex-1 truncate">{t.name || t.nodeId}</span>
                          <span className="text-[11px] text-muted-foreground">{TASK_STATUS[t.status] ?? t.status}</span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-y-1 gap-x-3 text-[11px] text-muted-foreground pl-4">
                          {(t.role || t.assignee) && <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.role || t.assignee}</span>}
                          <span>Início: {fmt(t.createdAt)}</span>
                          <span>Prazo: {fmt(t.dueAt)}</span>
                          <span>Conclusão: {fmt(t.completedAt)}</span>
                          {t.completedBy && <span>Por: {t.completedBy}</span>}
                          <span className={p.cls}>Pontualidade: {p.label}</span>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, icon, onClick, active, tone }: {
  label: string; value: number; icon: React.ReactNode; onClick?: () => void; active?: boolean
  tone?: 'sky' | 'emerald' | 'red'
}) {
  const toneCls = tone === 'sky' ? 'text-sky-600 dark:text-sky-400'
    : tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-primary'
  return (
    <button onClick={onClick}
      className={cn('rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40', active && 'border-primary ring-1 ring-primary/30')}>
      <div className="flex items-center justify-between">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-muted', toneCls)}>{icon}</span>
        <span className="text-xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-xs font-medium text-muted-foreground mt-1">{label}</p>
    </button>
  )
}
