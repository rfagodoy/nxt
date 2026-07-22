'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Plus, Zap, Pencil, Trash2, Loader2, RefreshCw, AlertTriangle, Play,
  Settings2, ChevronsUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { useViews } from '@/hooks/use-views'
import { exportExcel } from '@/lib/export-excel'
import { TablePagination } from '@/components/ui/table-pagination'
import { ListToolbar } from '@/components/list/list-toolbar'
import { type FilterRow, matchOp, norm } from '@/lib/list-filter'

interface ProcessRow {
  id: string
  name: string
  description?: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  version: number
  kind?: string | null
  updatedAt: string
}
interface SortState { col: string; dir: 'asc' | 'desc' }

const KIND_LABEL: Record<string, string> = { CONTRATO: 'Contrato', ADITIVO: 'Aditivo', PARCEIRO: 'Parceiro' }
const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:   { label: 'Ativo',     cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  DRAFT:    { label: 'Rascunho',  cls: 'bg-muted text-muted-foreground' },
  ARCHIVED: { label: 'Arquivado', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

interface Col { key: string; label: string; align?: 'right'; text: (p: ProcessRow) => string; sortVal?: (p: ProcessRow) => string | number; node: (p: ProcessRow) => ReactNode }
const COLS: Col[] = [
  {
    key: 'processo', label: 'Workflow', text: (p) => p.name, sortVal: (p) => norm(p.name),
    node: (p) => (
      <>
        <Link href={`/processes/${p.id}/edit`} className="font-medium hover:underline">{p.name}</Link>
        {p.description && <p className="text-[11px] text-muted-foreground truncate max-w-md">{p.description}</p>}
      </>
    ),
  },
  {
    key: 'tipo', label: 'Tipo', text: (p) => (p.kind && KIND_LABEL[p.kind]) || '—',
    node: (p) => (p.kind && KIND_LABEL[p.kind]) ? <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]">{KIND_LABEL[p.kind]}</span> : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'situacao', label: 'Situação', text: (p) => STATUS[p.status]?.label ?? p.status,
    node: (p) => { const st = STATUS[p.status] ?? STATUS.DRAFT; return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', st.cls)}>{st.label}</span> },
  },
  { key: 'versao', label: 'Versão', text: (p) => `v${p.version}`, sortVal: (p) => p.version, node: (p) => <span className="text-muted-foreground tabular-nums">v{p.version}</span> },
  { key: 'atualizado', label: 'Atualizado', text: (p) => fmtDate(p.updatedAt), sortVal: (p) => new Date(p.updatedAt).getTime(), node: (p) => <span className="text-muted-foreground whitespace-nowrap">{fmtDate(p.updatedAt)}</span> },
]
const HIDDEN_KEY = 'nxt:cols:workflows:hidden'

export default function WorkflowsPage() {
  const { views, saveView, deleteView } = useViews('workflows')
  const [rows, setRows] = useState<ProcessRow[] | null>(null)
  const [errCount, setErrCount] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>({ col: 'atualizado', dir: 'desc' })
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showConfig, setShowConfig] = useState(false)
  const configRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  const load = useCallback(async () => {
    const [data, errs] = await Promise.all([
      apiJson<ProcessRow[]>('/api/processes'),
      apiJson<unknown[]>('/api/instances?status=ERROR'),
    ])
    setRows(data ?? [])
    setErrCount(errs?.length ?? 0)
  }, [])
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

  const activate = async (id: string) => {
    setBusy(id)
    try {
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) { const err = await res.json().catch(() => null); alert(err?.message || 'Não foi possível ativar o workflow.'); return }
      await load()
    } finally { setBusy(null) }
  }
  const remove = async (p: ProcessRow) => {
    if (!confirm(`Excluir o workflow "${p.name}"? Se houver execuções, ele será apenas arquivado (o histórico é preservado).`)) return
    setBusy(p.id)
    try {
      const res = await apiFetch(`/api/processes/${p.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { alert(body?.message || 'Não foi possível excluir o workflow.'); return }
      if (body?.action === 'archived') alert('Este workflow tem histórico de execuções, então foi ARQUIVADO (não excluído) — as instâncias e a auditoria foram preservadas.')
      await load()
    } finally { setBusy(null) }
  }

  const visibleCols = useMemo(() => COLS.filter((c) => !hidden.has(c.key)), [hidden])
  const all = useMemo(() => rows ?? [], [rows])
  const stats = useMemo(() => ({
    total: all.length,
    active: all.filter((p) => p.status === 'ACTIVE').length,
    draft: all.filter((p) => p.status === 'DRAFT').length,
    archived: all.filter((p) => p.status === 'ARCHIVED').length,
  }), [all])

  const filtered = useMemo(() => {
    const q = norm(search)
    const active = filters.filter((f) => f.value.trim())
    return all.filter((p) => {
      if (q && !COLS.some((c) => norm(c.text(p)).includes(q))) return false
      if (!active.length) return true
      const res = active.map((f) => { const col = COLS.find((c) => c.key === f.col); return col ? matchOp(col.text(p), f.op, f.value) : true })
      return logic === 'AND' ? res.every(Boolean) : res.some(Boolean)
    })
  }, [all, search, filters, logic])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = COLS.find((c) => c.key === sort.col)
    if (!col) return filtered
    const val = (p: ProcessRow) => col.sortVal ? col.sortVal(p) : norm(col.text(p))
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize)
  const handleSort = (col: string) => setSort((p) => !p || p.col !== col ? { col, dir: 'asc' } : p.dir === 'asc' ? { col, dir: 'desc' } : null)

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    if (!id) { setSort({ col: 'atualizado', dir: 'desc' }); setFilters([]); setLogic('AND') }
    else { const v = views.find((v) => v.id === id); if (!v) return; setSort(v.sort); setFilters(v.filters); setLogic(v.logic) }
  }
  const onSaveView = (name: string) => { const v = saveView(name, { sort, filters: filters.filter((f) => f.value.trim()), logic }); setActiveViewId(v.id) }
  const onDeleteView = (e: React.MouseEvent, id: string) => { e.stopPropagation(); deleteView(id); if (activeViewId === id) selectView(null) }

  const handleExport = async () => {
    await exportExcel({
      fileName: 'workflows', sheet: 'Workflows',
      title: `Workflows — ${views.find((v) => v.id === activeViewId)?.name ?? 'Todos'}`,
      columns: visibleCols.map((c) => ({ header: c.label, align: c.align })),
      rows: sorted.map((p) => visibleCols.map((c) => c.text(p))),
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Workflows</h1>
          <p className="text-[11px] text-muted-foreground">Desenhe e configure os workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/processes/instancias"
            className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
              errCount > 0 ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' : 'hover:bg-muted')}
            title="Painel de instâncias com erro"
          >
            <AlertTriangle className="h-3.5 w-3.5" />Instâncias com erro
            {errCount > 0 && <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white min-w-[16px]">{errCount}</span>}
          </Link>
          <Button variant="outline" size="sm" onClick={load} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Link href="/processes/new" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />Novo workflow
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, cls: 'text-foreground' },
          { label: 'Ativos', value: stats.active, cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Rascunhos', value: stats.draft, cls: 'text-muted-foreground' },
          { label: 'Arquivados', value: stats.archived, cls: 'text-amber-600 dark:text-amber-400' },
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

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-19rem)]">
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
                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground bg-muted whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={visibleCols.length + 1} className="px-3 py-10 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 1} className="px-3 py-8 text-center text-xs text-muted-foreground">{all.length === 0 ? 'Nenhum workflow criado.' : 'Nenhum workflow encontrado.'}</td></tr>
              ) : pageRows.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  {visibleCols.map((col) => (
                    <td key={col.key} className={cn('px-3 py-2 align-top', col.align === 'right' && 'text-right')}>{col.node(p)}</td>
                  ))}
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === 'DRAFT' && (
                        <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => activate(p.id)}>
                          {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}Ativar
                        </Button>
                      )}
                      {p.status === 'ACTIVE' && (
                        <Link href={`/processes/${p.id}?iniciar=1`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted transition-colors" title="Iniciar o workflow">
                          <Play className="h-3.5 w-3.5" />Iniciar
                        </Link>
                      )}
                      <Link href={`/processes/${p.id}/edit`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted transition-colors" title="Abrir no editor">
                        <Pencil className="h-3.5 w-3.5" />Editar
                      </Link>
                      <button onClick={() => remove(p)} disabled={busy === p.id} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50" title="Excluir (ou arquivar se houver execuções)">
                        <Trash2 className="h-3.5 w-3.5" />Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} pageSize={pageSize} total={sorted.length} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>
  )
}
