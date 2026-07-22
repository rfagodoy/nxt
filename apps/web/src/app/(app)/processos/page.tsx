'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  Activity, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock,
  PlayCircle, Ban, X, User, GitBranch, Settings2, ChevronsUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StartProcessButton } from '@/components/processes/start-process-button'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/http'
import { useViews } from '@/hooks/use-views'
import { exportExcel } from '@/lib/export-excel'
import { TablePagination } from '@/components/ui/table-pagination'
import { ListToolbar } from '@/components/list/list-toolbar'
import { type FilterRow, matchOp, norm } from '@/lib/list-filter'

interface Inst {
  id: string; processName: string; version: number
  status: 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED'
  error: string | null; stepName: string | null; startedBy: string | null
  startedAt: string; completedAt: string | null; updatedAt: string
  currentStep: string | null; currentDueAt: string | null; currentOverdue: boolean
  totalSteps: number; doneSteps: number; hasSla: boolean; onTime: boolean; durationMs: number | null
}
interface TaskRow {
  id: string; nodeId: string; name?: string | null; role?: string | null; assignee?: string | null
  status: string; createdAt: string; dueAt?: string | null; completedAt?: string | null; completedBy?: string | null
}
interface SortState { col: string; dir: 'asc' | 'desc' }

const STATUS: Record<string, { label: string; icon: typeof Activity; cls: string }> = {
  RUNNING:   { label: 'Em andamento', icon: PlayCircle,   cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  COMPLETED: { label: 'Concluído',    icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  ERROR:     { label: 'Com erro',     icon: AlertTriangle, cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  CANCELLED: { label: 'Cancelado',    icon: Ban,          cls: 'bg-muted text-muted-foreground' },
}
const TASK_STATUS: Record<string, string> = { PENDING: 'Pendente', DONE: 'Concluída', CANCELED: 'Cancelada' }

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
function pontualidadeLabel(i: Inst): string { return !i.hasSla ? 'sem prazo' : i.onTime ? 'no prazo' : 'atrasado' }
function taskPunctuality(t: TaskRow): { label: string; cls: string } {
  const now = Date.now()
  if (!t.dueAt) return { label: 'sem prazo', cls: 'text-muted-foreground' }
  const due = new Date(t.dueAt).getTime()
  if (t.completedAt) return new Date(t.completedAt).getTime() <= due
    ? { label: 'no prazo', cls: 'text-emerald-600 dark:text-emerald-400' }
    : { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' }
  return due < now ? { label: 'atrasada', cls: 'text-red-600 dark:text-red-400' } : { label: 'no prazo', cls: 'text-muted-foreground' }
}

interface Col { key: string; label: string; align?: 'right'; text: (i: Inst) => string; sortVal?: (i: Inst) => string | number; node: (i: Inst) => ReactNode }
const COLS: Col[] = [
  {
    key: 'processo', label: 'Processo', text: (i) => `${i.processName} v${i.version}`, sortVal: (i) => norm(i.processName),
    node: (i) => (
      <>
        <p className="font-medium">{i.processName} <span className="text-[11px] text-muted-foreground font-normal">v{i.version}</span></p>
        <p className="text-[11px] text-muted-foreground">{i.doneSteps}/{i.totalSteps} etapa{i.totalSteps !== 1 ? 's' : ''}</p>
      </>
    ),
  },
  {
    key: 'situacao', label: 'Situação', text: (i) => STATUS[i.status]?.label ?? i.status,
    node: (i) => { const st = STATUS[i.status] ?? STATUS.RUNNING; return (
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', st.cls)}><st.icon className="h-3 w-3" />{st.label}</span>
    ) },
  },
  { key: 'iniciadoPor', label: 'Iniciado por', text: (i) => i.startedBy || '—', node: (i) => <span className="text-muted-foreground">{i.startedBy || '—'}</span> },
  { key: 'inicio', label: 'Início', text: (i) => fmt(i.startedAt), sortVal: (i) => new Date(i.startedAt).getTime(), node: (i) => <span className="text-muted-foreground whitespace-nowrap">{fmt(i.startedAt)}</span> },
  {
    key: 'etapa', label: 'Etapa atual / conclusão',
    text: (i) => i.status === 'RUNNING' ? (i.currentStep || '—') : i.status === 'ERROR' ? (i.error || i.stepName || 'erro') : i.status === 'COMPLETED' ? `concluído em ${fmt(i.completedAt)}` : '—',
    node: (i) => i.status === 'RUNNING' ? (
      <div className="flex items-center gap-2">
        <span>{i.currentStep || '—'}</span>
        {i.currentDueAt && <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', i.currentOverdue ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'text-amber-600')}><Clock className="h-3 w-3" />{i.currentOverdue ? 'atrasada' : `vence ${fmt(i.currentDueAt)}`}</span>}
      </div>
    ) : i.status === 'ERROR' ? (
      <span className="inline-flex items-start gap-1 text-red-700 dark:text-red-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span className="max-w-xs truncate">{i.error || i.stepName || 'erro'}</span></span>
    ) : i.status === 'COMPLETED' ? (
      <span className="text-muted-foreground">em {fmt(i.completedAt)} · durou {humanDuration(i.durationMs)}</span>
    ) : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'pontualidade', label: 'Pontualidade', text: pontualidadeLabel,
    node: (i) => !i.hasSla ? <span className="text-muted-foreground">sem prazo</span>
      : i.onTime ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />no prazo</span>
      : <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="h-3 w-3" />atrasado</span>,
  },
]
const HIDDEN_KEY = 'nxt:cols:processos:hidden'

export default function ProcessosPage() {
  const { views, saveView, deleteView } = useViews('processos')
  const [rows, setRows] = useState<Inst[] | null>(null)
  const [detail, setDetail] = useState<Inst | null>(null)
  const [tasks, setTasks] = useState<TaskRow[] | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>({ col: 'inicio', dir: 'desc' })
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showConfig, setShowConfig] = useState(false)
  const configRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  const load = useCallback(async () => { setRows(await apiJson<Inst[]>('/api/instances') ?? []) }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    mounted.current = true
    try { const raw = localStorage.getItem(HIDDEN_KEY); if (raw) setHidden(new Set(JSON.parse(raw))) } catch {}
  }, [])
  useEffect(() => { if (mounted.current) try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])) } catch {} }, [hidden])
  useEffect(() => { setPage(1) }, [search, filters, sort, logic, pageSize])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (configRef.current && !configRef.current.contains(e.target as Node)) setShowConfig(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const openDetail = async (inst: Inst) => {
    setDetail(inst); setTasks(null)
    const ctx = await apiJson<{ instance?: { tasks?: TaskRow[] } }>(`/api/instances/${inst.id}`)
    setTasks(ctx?.instance?.tasks ?? [])
  }

  const visibleCols = useMemo(() => COLS.filter((c) => !hidden.has(c.key)), [hidden])
  const all = useMemo(() => rows ?? [], [rows])
  const stats = useMemo(() => ({
    total: all.length,
    running: all.filter((i) => i.status === 'RUNNING').length,
    completed: all.filter((i) => i.status === 'COMPLETED').length,
    error: all.filter((i) => i.status === 'ERROR').length,
    overdue: all.filter((i) => i.status === 'RUNNING' && i.currentOverdue).length,
  }), [all])

  const filtered = useMemo(() => {
    const q = norm(search)
    const active = filters.filter((f) => f.value.trim())
    return all.filter((i) => {
      if (q && !COLS.some((c) => norm(c.text(i)).includes(q))) return false
      if (!active.length) return true
      const res = active.map((f) => { const col = COLS.find((c) => c.key === f.col); return col ? matchOp(col.text(i), f.op, f.value) : true })
      return logic === 'AND' ? res.every(Boolean) : res.some(Boolean)
    })
  }, [all, search, filters, logic])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = COLS.find((c) => c.key === sort.col)
    if (!col) return filtered
    const val = (i: Inst) => col.sortVal ? col.sortVal(i) : norm(col.text(i))
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const pageRows = sorted.slice((Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize))) - 1) * pageSize, Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize))) * pageSize)
  const handleSort = (col: string) => setSort((p) => !p || p.col !== col ? { col, dir: 'asc' } : p.dir === 'asc' ? { col, dir: 'desc' } : null)

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    if (!id) { setSort({ col: 'inicio', dir: 'desc' }); setFilters([]); setLogic('AND') }
    else { const v = views.find((v) => v.id === id); if (!v) return; setSort(v.sort); setFilters(v.filters); setLogic(v.logic) }
  }
  const onSaveView = (name: string) => { const v = saveView(name, { sort, filters: filters.filter((f) => f.value.trim()), logic }); setActiveViewId(v.id) }
  const onDeleteView = (e: React.MouseEvent, id: string) => { e.stopPropagation(); deleteView(id); if (activeViewId === id) selectView(null) }

  const handleExport = async () => {
    await exportExcel({
      fileName: 'processos', sheet: 'Processos',
      title: `Acompanhamento de processos — ${views.find((v) => v.id === activeViewId)?.name ?? 'Todos'}`,
      columns: visibleCols.map((c) => ({ header: c.label, align: c.align })),
      rows: sorted.map((i) => visibleCols.map((c) => c.text(i))),
    })
  }

  const configSlot = (
    <div ref={configRef} className="relative">
      <button onClick={() => setShowConfig((v) => !v)} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <Settings2 className="h-3.5 w-3.5" />Configurações
      </button>
      {showConfig && (
        <div className="glass absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl p-1.5">
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Colunas visíveis</p>
          {COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={(e) => setHidden((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(c.key); else n.add(c.key); return n })} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs">{c.label}</span>
            </label>
          ))}
          {hidden.size > 0 && <button onClick={() => setHidden(new Set())} className="mt-1 w-full text-left px-2 py-1.5 text-[11px] text-primary hover:bg-muted rounded-md">Mostrar todas</button>}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Processos</h1>
          <p className="text-[11px] text-muted-foreground">Acompanhamento das execuções — em andamento e concluídas</p>
        </div>
        <div className="flex items-center gap-2">
          <StartProcessButton />
          <Button variant="outline" size="sm" onClick={load} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: 'Total', value: stats.total, cls: 'text-foreground' },
          { label: 'Em andamento', value: stats.running, cls: 'text-sky-600 dark:text-sky-400' },
          { label: 'Concluídos', value: stats.completed, cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Com erro', value: stats.error, cls: 'text-red-600 dark:text-red-400' },
          { label: 'Atrasados', value: stats.overdue, cls: 'text-amber-600 dark:text-amber-400' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('text-sm font-bold tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      <ListToolbar
        search={search} onSearch={setSearch}
        columns={COLS.map((c) => ({ key: c.key, label: c.label }))}
        filters={filters} onFiltersChange={setFilters} logic={logic} onLogicChange={setLogic}
        views={views} activeViewId={activeViewId} onSelectView={selectView} onSaveView={onSaveView} onDeleteView={onDeleteView}
        onExport={() => { void handleExport() }} exportDisabled={sorted.length === 0}
        configSlot={configSlot}
        filteredCount={sorted.length} totalCount={all.length}
      />

      <div className="rounded-xl border bg-card shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="border-b">
                {visibleCols.map((col) => (
                  <th key={col.key} className={cn('text-left px-3 py-1.5 font-medium text-muted-foreground select-none whitespace-nowrap bg-muted', col.align === 'right' && 'text-right')}>
                    <button onClick={() => handleSort(col.key)} className="group inline-flex items-center hover:text-foreground transition-colors">
                      {col.label}
                      {!sort || sort.col !== col.key
                        ? <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />
                        : sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={visibleCols.length} className="px-3 py-10 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={visibleCols.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {all.length === 0 ? 'Nenhum processo iniciado.' : 'Nenhum processo encontrado com os filtros aplicados.'}
                </td></tr>
              ) : pageRows.map((i) => (
                <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDetail(i)}>
                  {visibleCols.map((col) => (
                    <td key={col.key} className={cn('px-3 py-2 align-top', col.align === 'right' && 'text-right')}>{col.node(i)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} pageSize={pageSize} total={sorted.length} onPage={setPage} onPageSize={setPageSize} />
      </div>

      {detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="glass w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl text-foreground overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', (STATUS[detail.status] ?? STATUS.RUNNING).cls)}>{STATUS[detail.status]?.label}</span>
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
