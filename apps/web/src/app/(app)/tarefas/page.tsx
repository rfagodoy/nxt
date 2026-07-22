'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Loader2, RefreshCw, AlertTriangle, X, CheckCircle2, FileText, Users, GitBranch, ChevronRight, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DynamicForm } from '@/components/modules/dynamic-form'
import { WorkflowScreenTask } from '@/components/processes/workflow-screen-task'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'

interface Task {
  id: string
  instanceId: string
  nodeId: string
  name?: string | null
  role?: string | null
  dueAt?: string | null
  createdAt: string
  instance?: { processDefinition?: { name?: string; kind?: string | null } }
}

interface TimelineTask { id: string; name?: string | null; status: string; completedBy?: string | null }
interface InstanceContext {
  instance: { processDefinition: { name: string; formSchema: ProcessFormSchema }; tasks?: TimelineTask[] }
  state?: { variables?: Record<string, unknown> }
}

type Grp = 'crit' | 'warn' | 'week' | 'none'

/** Deriva a urgência da tarefa a partir do prazo (dueAt) + rótulo humano. */
function dueInfo(dueAt?: string | null): { grp: Grp; label: string } {
  if (!dueAt) return { grp: 'none', label: 'sem prazo' }
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
function kindMeta(kind?: string | null) {
  if (kind === 'PARCEIRO') return { Icon: Users, cls: 'text-lime-600 dark:text-lime-400 bg-lime-500/10', label: 'Parceiro' }
  if (kind === 'CONTRATO' || kind === 'ADITIVO') return { Icon: FileText, cls: 'text-primary bg-primary/10', label: kind === 'ADITIVO' ? 'Aditivo' : 'Contrato' }
  return { Icon: GitBranch, cls: 'text-muted-foreground bg-muted', label: 'Processo' }
}

const COLUMNS: { key: Grp; label: string; dot: string; rail: string }[] = [
  { key: 'crit', label: 'Atrasadas',    dot: 'bg-red-500',              rail: 'bg-red-500' },
  { key: 'warn', label: 'Vencem hoje',  dot: 'bg-amber-500',            rail: 'bg-amber-500' },
  { key: 'week', label: 'Próximas',     dot: 'bg-primary',              rail: 'bg-primary' },
  { key: 'none', label: 'Sem prazo',    dot: 'bg-muted-foreground/40',  rail: 'bg-border' },
]
const DUE_CHIP: Record<Grp, string> = {
  crit: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  week: 'bg-muted text-muted-foreground',
  none: 'bg-muted text-muted-foreground/80',
}
const TASK_STATUS: Record<string, string> = { PENDING: 'atual', DONE: 'concluída', CANCELED: 'cancelada' }

export default function TarefasPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [active, setActive] = useState<Task | null>(null)
  const [step, setStep] = useState<StepFormSchema | null>(null)
  const [variables, setVariables] = useState<Record<string, unknown>>({})
  const [timeline, setTimeline] = useState<TimelineTask[]>([])
  const [loadingStep, setLoadingStep] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<Task[]>('/api/instances/tasks')
    setTasks(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const openTask = async (t: Task) => {
    setActive(t); setStep(null); setError(null); setLoadingStep(true); setTimeline([])
    try {
      const ctx = await apiJson<InstanceContext>(`/api/instances/${t.instanceId}`)
      const fs = ctx?.instance?.processDefinition?.formSchema
      const found = fs?.steps?.find((s) => s.stepId === t.nodeId)
      setVariables(ctx?.state?.variables ?? {})
      setTimeline(ctx?.instance?.tasks ?? [])
      setStep(found ?? { stepId: t.nodeId, stepName: t.name || t.nodeId, fields: [] })
    } finally {
      setLoadingStep(false)
    }
  }
  const closeDrawer = () => { setActive(null); setStep(null) }

  const complete = async (data: Record<string, unknown>) => {
    if (!active) return
    const doneId = active.id
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/instances/tasks/${doneId}/complete`, { method: 'PATCH', body: JSON.stringify({ data }) })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível concluir a tarefa.')
        return
      }
      const result = await res.json().catch(() => null)
      setNotice(result?.errored ? `A etapa automática falhou e o processo foi interrompido: ${result.errored}` : null)
      closeDrawer()
      // anima o card saindo do board, depois recarrega
      setCompletingId(doneId)
      setTimeout(() => { setCompletingId(null); void load() }, 420)
    } finally {
      setSubmitting(false)
    }
  }

  const stats = useMemo(() => {
    const r = tasks ?? []
    let crit = 0, warn = 0
    r.forEach((t) => { const g = dueInfo(t.dueAt).grp; if (g === 'crit') crit++; else if (g === 'warn') warn++ })
    return { total: r.length, crit, warn }
  }, [tasks])

  const byGroup = useMemo(() => {
    const g: Record<Grp, Task[]> = { crit: [], warn: [], week: [], none: [] }
    ;(tasks ?? []).forEach((t) => g[dueInfo(t.dueAt).grp].push(t))
    return g
  }, [tasks])

  const kind = active?.instance?.processDefinition?.kind
  const km = kindMeta(kind)

  return (
    <div className="flex h-full flex-col gap-3">
      <style jsx>{`
        @keyframes drawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes scrimIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cardOut { 30% { transform: translateX(6px); } 100% { transform: translateX(120%); opacity: 0; } }
        .drawer-in { animation: drawerIn .28s cubic-bezier(.4,0,.2,1); }
        .scrim-in { animation: scrimIn .2s ease; }
        .card-out { animation: cardOut .42s cubic-bezier(.4,0,.2,1) forwards; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) { .drawer-in,.scrim-in,.card-out { animation: none !important; } }
      `}</style>

      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Tarefas</h1>
          <p className="text-[11px] text-muted-foreground">Suas tarefas, priorizadas por prazo</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* cards de resumo (padrão das listas) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: 'Total',       value: stats.total,        cls: 'text-foreground' },
          { label: 'Atrasadas',   value: stats.crit,         cls: 'text-red-600 dark:text-red-400' },
          { label: 'Vencem hoje', value: stats.warn,         cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Próximas',    value: byGroup.week.length, cls: 'text-primary' },
          { label: 'Sem prazo',   value: byGroup.none.length, cls: 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('text-sm font-bold tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 hover:opacity-70" title="Dispensar"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* board */}
      {tasks === null ? (
        <div className="flex items-center justify-center py-16 text-xs text-muted-foreground xl:flex-1"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-sm flex items-center justify-center xl:flex-1 xl:min-h-0">
          <EmptyState icon={CheckCircle2} tone="success" size="lg" title="Tudo em dia! 🎉" description="Nenhuma tarefa aguardando você." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 xl:grid-rows-1 gap-3 items-start xl:items-stretch xl:flex-1 xl:min-h-0">
          {COLUMNS.map((col) => {
            const items = byGroup[col.key]
            return (
              <div key={col.key} className="rounded-xl border bg-muted/30 p-2.5 flex flex-col gap-2 min-h-[120px] xl:min-h-0">
                <div className="flex items-center gap-2 px-1 pt-1 pb-0.5 shrink-0">
                  <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground bg-card border rounded-md px-1.5 py-0.5 tabular-nums">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 text-center py-3">vazio</p>
                ) : items.map((t) => {
                  const info = dueInfo(t.dueAt)
                  const m = kindMeta(t.instance?.processDefinition?.kind)
                  const out = completingId === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTask(t)}
                      className={cn(
                        'group relative text-left w-full bg-card border rounded-xl p-3 pl-3.5 shadow-sm overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30',
                        out && 'card-out',
                      )}
                    >
                      <span className={cn('absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full', col.rail)} />
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', m.cls)}><m.Icon className="h-4 w-4" /></span>
                        <span className="text-sm font-medium leading-tight line-clamp-2">{t.name || t.nodeId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap tabular-nums', DUE_CHIP[info.grp])}>{info.label}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{t.instance?.processDefinition?.name || 'Processo'}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 ml-auto shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  )
                })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* drawer de execução */}
      {active && (
        <>
          <div className="scrim-in fixed inset-0 z-40 bg-black/40" onClick={closeDrawer} />
          <aside className="drawer-in fixed top-0 right-0 z-50 h-full w-full max-w-[720px] glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">
            <div className="flex items-start gap-3 px-5 py-4 border-b">
              <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl shrink-0', km.cls)}><km.Icon className="h-5 w-5" /></span>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold tracking-tight leading-snug">{active.name || active.nodeId}</h2>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  {km.label} · {active.instance?.processDefinition?.name}{active.role ? ` · ${active.role}` : ''}
                </p>
              </div>
              <span className={cn('text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap', DUE_CHIP[dueInfo(active.dueAt).grp])}>{dueInfo(active.dueAt).label}</span>
              <button onClick={closeDrawer} className="ml-1 h-8 w-8 grid place-items-center rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
            </div>

            {/* contexto: o que já andou no processo */}
            {timeline.length > 1 && (
              <div className="px-5 py-3 border-b bg-muted/30">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-2">Onde você está</p>
                <div className="flex flex-col gap-1.5">
                  {timeline.map((tl) => {
                    const done = tl.status === 'DONE'
                    const cur = tl.id === active.id
                    return (
                      <div key={tl.id} className="flex items-center gap-2.5">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', done ? 'bg-primary' : cur ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/30')} />
                        <span className={cn('text-[12.5px]', cur ? 'font-semibold' : done ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{tl.name || 'Etapa'}</span>
                        {done && tl.completedBy && <span className="text-[11px] text-muted-foreground/70">· {tl.completedBy}</span>}
                        {cur && <span className="ml-auto text-[10px] uppercase tracking-wide text-primary font-semibold">sua vez</span>}
                        {!cur && <span className="ml-auto text-[10px] text-muted-foreground/60">{TASK_STATUS[tl.status] ?? ''}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {error && <p className="text-[12px] text-destructive mb-2">{error}</p>}
              {loadingStep || !step ? (
                <div className="flex items-center justify-center py-10 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…</div>
              ) : (
                <>
                  {step.instructions?.trim() && (
                    <div className="mb-3 flex gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground/80 leading-snug whitespace-pre-line">{step.instructions.trim()}</p>
                    </div>
                  )}
                  {step.screenRef ? (
                    <WorkflowScreenTask key={active.id} step={step} variables={variables} onComplete={complete} onCancel={closeDrawer} />
                  ) : (
                    <DynamicForm key={active.id} step={step} stepIndex={0} totalSteps={1} submitting={submitting} onSubmit={complete} onCancel={closeDrawer} />
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
