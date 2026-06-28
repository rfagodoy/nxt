'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown,
  SlidersHorizontal, X, Check, Bookmark, ChevronDown, LayoutList,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { useViews, type ViewState } from '@/hooks/use-views'
import ExcelJS from 'exceljs'
import { SettingsDrawer } from '@/components/contracts/field-drawer'
import { effectiveSituacao } from '@/lib/contract-options'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import { useContractFields, useContractDefaultColumns, useContractFieldVisibility, NATIVE_FIELDS, COLUMN_ORDER_RESET_EVENT } from '@/hooks/use-contract-fields'
import { type Row, SIT_CLS, SIT_LABEL, BRL, fmtDate } from '@/components/contracts/contract-detail-view'
import { useWorkspace } from '@/contexts/workspace-context'



const COLUMNS = [
  { key: 'numero',          label: 'Número'         },
  { key: 'titulo',          label: 'Título'         },
  { key: 'tipo',            label: 'Tipo'           },
  { key: 'parte_principal', label: 'Partes'         },
  { key: 'inicio',          label: 'Início'         },
  { key: 'termino',         label: 'Término'        },
  { key: 'valor_total',     label: 'Valor total'    },
  { key: 'situacao',        label: 'Situação'       },
]

const OPERATORS = [
  { value: 'contains',    label: 'Contém'        },
  { value: 'notContains', label: 'Não contém'    },
  { value: 'eq',          label: 'Igual a'       },
  { value: 'neq',         label: 'Diferente de'  },
  { value: 'startsWith',  label: 'Começa com'    },
  { value: 'endsWith',    label: 'Termina com'   },
  { value: 'gt',          label: 'Maior que'     },
  { value: 'gte',         label: 'Maior ou igual'},
  { value: 'lt',          label: 'Menor que'     },
  { value: 'lte',         label: 'Menor ou igual'},
]

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500]
const COL_ORDER_KEY     = 'nxt:columns:contratos'

interface SortState { col: string; dir: 'asc' | 'desc' }
interface FilterRow { id: string; col: string; op: string; value: string }


function fieldValue(r: Row, key: string): string {
  if (key === 'valor_total')     return String(r.valor_total)
  if (key === 'termino')         return r.termino ?? ''
  /* a coluna "Partes" abrange contratante + contratada (nome e documento) */
  if (key === 'parte_principal') return [r.parte_principal, r.contratante_nome, r.contratante_doc, r.contratada_nome, r.contratada_doc].filter(Boolean).join(' ')
  return String(r[key as keyof Row] ?? '')
}

function applyOp(field: string, op: string, val: string): boolean {
  const f = field.toLowerCase(), v = val.toLowerCase()
  switch (op) {
    case 'eq':         return f === v
    case 'neq':        return f !== v
    case 'contains':   return f.includes(v)
    case 'notContains':return !f.includes(v)
    case 'startsWith': return f.startsWith(v)
    case 'endsWith':   return f.endsWith(v)
    case 'gt':  return f > v; case 'gte': return f >= v
    case 'lt':  return f < v; case 'lte': return f <= v
    default:    return true
  }
}

function stateKey(s: ViewState): string {
  return JSON.stringify({ sort: s.sort, filters: s.filters.filter(f => f.value.trim()), logic: s.logic })
}

function pageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}





/* ══════════════════════════════════════════════════════════════ */
export default function ContratosPage() {
  const { views, saveView, deleteView } = useViews('contratos')
  const { fields: customFields }        = useContractFields()
  const { isColumnVisible }             = useContractDefaultColumns()
  const { isVisibleInTable }            = useContractFieldVisibility()
  const tableFields = customFields.filter(f => f.visible === 'form_and_table')
  const baseColumns = useMemo(() => COLUMNS.filter(c => isColumnVisible(c.key)), [isColumnVisible])
  const nativeTableCols = NATIVE_FIELDS.filter(f => isVisibleInTable(f.key)).map(f => ({ key: f.key, label: f.label }))

  const [allContratos, setAllContratos] = useState<Row[]>([])
  const loadContratos = useCallback(async (): Promise<Row[]> => {
    try {
      const res = await apiFetch(`/api/contracts`)
      if (res.ok) {
        const data = await res.json() as { rows: Row[] }
        const rows = data.rows ?? []
        setAllContratos(rows)
        return rows
      }
    } catch {}
    return []
  }, [])
  useEffect(() => { void loadContratos() }, [loadContratos])

  /* ── column order + drag ── */
  const [columnOrder, setColumnOrder] = useState<string[]>(() => COLUMNS.map(c => c.key))
  const [dragFrom,    setDragFrom]    = useState<number | null>(null)
  const [dragOver,    setDragOver]    = useState<number | null>(null)
  const storageLoaded = useRef(false)

  useEffect(() => {
    setColumnOrder(prev => {
      let base = prev
      if (!storageLoaded.current) {
        storageLoaded.current = true
        const s = cacheRead<string[] | null>(COL_ORDER_KEY, null); if (s) base = s
      }
      const allKeys = [...baseColumns.map(c => c.key), ...nativeTableCols.map(c => c.key), ...tableFields.map(f => f.name)]
      const reconciled = [...base.filter((k: string) => allKeys.includes(k)), ...allKeys.filter(k => !base.includes(k))]
      return reconciled.join(',') === prev.join(',') && base === prev ? prev : reconciled
    })
  }, [tableFields, baseColumns, nativeTableCols])

  useEffect(() => {
    if (!storageLoaded.current) return
    pushSetting(COL_ORDER_KEY, columnOrder)
  }, [columnOrder])

  /* hidrata a ordem das colunas a partir do backend no mount */
  useEffect(() => {
    void pullSetting<string[]>(COL_ORDER_KEY).then(remote => { if (remote) setColumnOrder(remote) })
  }, [])

  /* reset da ordem das colunas (disparado por "Restaurar padrão") */
  useEffect(() => {
    const handler = () => setColumnOrder(COLUMNS.map(c => c.key))
    window.addEventListener(COLUMN_ORDER_RESET_EVENT, handler)
    return () => window.removeEventListener(COLUMN_ORDER_RESET_EVENT, handler)
  }, [])

  const allColumns = useMemo(() => [
    ...baseColumns,
    ...nativeTableCols,
    ...tableFields.map(f => ({ key: f.name, label: f.label })),
  ], [baseColumns, nativeTableCols, tableFields])

  const orderedColumns = useMemo(() =>
    columnOrder.map(k => allColumns.find(c => c.key === k)).filter((c): c is typeof COLUMNS[0] => !!c),
    [columnOrder, allColumns],
  )

  const handleDragStart = (idx: number) => setDragFrom(idx)
  const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); if (idx !== dragOver) setDragOver(idx) }
  const handleDrop      = (idx: number) => {
    if (dragFrom === null || dragFrom === idx) return
    const next = [...columnOrder]; const [m] = next.splice(dragFrom, 1); next.splice(idx, 0, m)
    setColumnOrder(next)
  }
  const clearDrag = () => { setDragFrom(null); setDragOver(null) }

  /* ── estado da página ── */
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [sort,         setSort]         = useState<SortState | null>({ col: 'numero', dir: 'desc' })
  const [showFilters,  setShowFilters]  = useState(false)
  const [showViews,    setShowViews]    = useState(false)
  const [logic,        setLogic]        = useState<'AND' | 'OR'>('AND')
  const [filters,      setFilters]      = useState<FilterRow[]>([])
  const [saving,       setSaving]       = useState(false)
  const [viewName,     setViewName]     = useState('')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(10)
  const [showFields,   setShowFields]   = useState(false)

  /* ── área de trabalho global (abas no shell, sobrevivem à navegação) ── */
  const ws = useWorkspace()
  const openContract    = (row: Row) => ws.open({ id: `contract:${row.id}`, kind: 'contract', mode: 'detail', label: row.numero, data: row })
  const openNewContract = ()         => ws.open({ id: 'contract:new', kind: 'contract', mode: 'new', label: 'Novo contrato' })

  /* recarrega a lista quando um documento é salvo/transicionado na área de trabalho */
  useEffect(() => {
    const h = () => { void loadContratos() }
    window.addEventListener('nxt:workspace:refresh', h)
    return () => window.removeEventListener('nxt:workspace:refresh', h)
  }, [loadContratos])

  const saveInputRef = useRef<HTMLInputElement>(null)
  const viewsRef     = useRef<HTMLDivElement>(null)

  useEffect(() => { if (saving) saveInputRef.current?.focus() }, [saving])
  useEffect(() => {
    if (!showViews) return
    const h = (e: MouseEvent) => { if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) setShowViews(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showViews])
  useEffect(() => { setPage(1) }, [search, filters, sort, logic, pageSize])

  const selectView = (id: string | null) => {
    setActiveViewId(id); setShowViews(false)
    if (!id) { setSort({ col: 'numero', dir: 'desc' }); setFilters([]); setLogic('AND'); setShowFilters(false) }
    else { const v = views.find(v => v.id === id); if (!v) return; setSort(v.sort); setFilters(v.filters); setLogic(v.logic) }
  }

  const addFilter    = () => setFilters(p => [...p, { id: `f${Date.now()}`, col: 'numero', op: 'contains', value: '' }])
  const removeFilter = (id: string) => setFilters(p => p.filter(f => f.id !== id))
  const updateFilter = (id: string, key: keyof FilterRow, val: string) => setFilters(p => p.map(f => f.id === id ? { ...f, [key]: val } : f))
  const clearFilters = () => { setFilters([]); setSort(null); setLogic('AND') }
  const handleSort   = (col: string) => setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const handleSaveView = () => {
    if (!viewName.trim()) return
    const v = saveView(viewName.trim(), { sort, filters: filters.filter(f => f.value.trim()), logic })
    setActiveViewId(v.id); setSaving(false); setViewName('')
  }
  const handleDeleteView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); deleteView(id); if (activeViewId === id) selectView(null)
  }

  const handleExport = async () => {
    const HEADERS = COLUMNS.map(c => c.label)
    const wb = new ExcelJS.Workbook(); wb.creator = 'Nxt'; wb.created = new Date()
    const ws = wb.addWorksheet('Contratos')
    const exportName = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'
    ws.addRow([`Exportação — ${exportName}`]); ws.mergeCells(1, 1, 1, HEADERS.length)
    const t = ws.getCell('A1'); t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; t.alignment = { vertical: 'middle', horizontal: 'center' }; ws.getRow(1).height = 28
    const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    ws.addRow([`Gerado em ${date}  •  ${filteredRows.length} registro${filteredRows.length !== 1 ? 's' : ''}`]); ws.mergeCells(2, 1, 2, HEADERS.length)
    const s = ws.getCell('A2'); s.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } }
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; s.alignment = { vertical: 'middle', horizontal: 'center' }; ws.getRow(2).height = 18
    const hr = ws.addRow(HEADERS)
    hr.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } } })
    ws.getRow(3).height = 20
    filteredRows.forEach((r, i) => {
      const row = ws.addRow([r.numero, r.titulo, r.tipo, r.parte_principal, fmtDate(r.inicio), fmtDate(r.termino), BRL.format(r.valor_total), SIT_LABEL[effectiveSituacao(r.situacao, r.termino)] ?? r.situacao])
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } }; c.font = { size: 10 } }); row.height = 18
    })
    ws.columns.forEach((col, i) => { col.width = Math.min((HEADERS[i]?.length ?? 10) + 8, 60) })
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `contratos_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
  }

  const isModified = useMemo(() => {
    if (!activeViewId) return false
    const v = views.find(v => v.id === activeViewId); if (!v) return false
    return stateKey({ sort, filters, logic }) !== stateKey({ sort: v.sort, filters: v.filters, logic: v.logic })
  }, [activeViewId, views, sort, filters, logic])

  const filteredRows = useMemo(() => {
    let data = [...allContratos]
    const q = search.trim().toLowerCase()
    if (q) data = data.filter(r => orderedColumns.some(c => fieldValue(r, c.key).toLowerCase().includes(q)))
    const active = filters.filter(f => f.value.trim())
    if (active.length) data = data.filter(r => { const res = active.map(f => applyOp(fieldValue(r, f.col), f.op, f.value)); return logic === 'AND' ? res.every(Boolean) : res.some(Boolean) })
    if (sort) data.sort((a, b) => { const cmp = fieldValue(a, sort.col).localeCompare(fieldValue(b, sort.col), 'pt-BR', { sensitivity: 'base' }); return sort.dir === 'asc' ? cmp : -cmp })
    return data
  }, [allContratos, search, sort, filters, logic, orderedColumns])

  const totalFiltered      = filteredRows.length
  const totalPages         = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage           = Math.min(page, totalPages)
  const pageRows           = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const firstItem          = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize + 1
  const lastItem           = Math.min(safePage * pageSize, totalFiltered)
  const totalAll           = allContratos.length
  const activeFiltersCount = filters.filter(f => f.value.trim()).length
  const activeViewName     = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'

  function renderCell(row: Row, key: string, colIdx: number) {
    const sticky = colIdx === 0
      ? 'sticky left-0 z-[1] bg-card group-hover/row:bg-muted/30 transition-colors'
      : ''
    switch (key) {
      case 'numero':
        return <td key={key} className={cn('px-3 py-1 font-medium font-mono whitespace-nowrap', sticky)}><button type="button" onClick={() => openContract(row)} className="hover:text-primary hover:underline text-left">{row.numero}</button></td>
      case 'titulo':
        return <td key={key} className={cn('px-3 py-1 font-medium max-w-[200px] truncate', sticky)}>{row.titulo}</td>
      case 'tipo':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{row.tipo}</td>
      case 'parte_principal': {
        /* grid de 3 colunas: selo (uniforme) | nome (flexível) | documento (alinhado na própria coluna) */
        const linha = (label: string, badgeCls: string, nome?: string, doc?: string) => nome ? (
          <>
            <span className={cn('inline-flex w-full items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', badgeCls)}>{label}</span>
            <span className="font-medium text-foreground truncate min-w-0">{nome}</span>
            <span className="text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap">{doc || ''}</span>
          </>
        ) : null
        const ctn = linha('Contratante', 'bg-slate-500/10 text-slate-600 dark:text-slate-400', row.contratante_nome, row.contratante_doc)
        const ctd = linha('Contratada',  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', row.contratada_nome, row.contratada_doc)
        return (
          <td key={key} className={cn('px-3 py-1 text-xs', sticky)}>
            {ctn || ctd
              ? <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">{ctn}{ctd}</div>
              : <span className="text-muted-foreground">{row.parte_principal || '—'}</span>}
          </td>
        )
      }
      case 'inicio':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground tabular-nums whitespace-nowrap', sticky)}>{fmtDate(row.inicio)}</td>
      case 'termino':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground tabular-nums whitespace-nowrap', sticky)}>{fmtDate(row.termino)}</td>
      case 'valor_total':
        return <td key={key} className={cn('px-3 py-1 text-right tabular-nums whitespace-nowrap', sticky)}>{BRL.format(row.valor_total)}</td>
      case 'situacao': {
        const s = effectiveSituacao(row.situacao, row.termino)
        return <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}><span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${SIT_CLS[s]}`}>{SIT_LABEL[s]}</span></td>
      }
      default: {
        const v = (row as unknown as Record<string, unknown>)[key]
        let display: React.ReactNode = (v as string) || '—'
        if (key === 'valor_parcela')        display = v ? BRL.format(Number(v)) : '—'
        else if (key === 'data_assinatura') display = fmtDate((v as string) || null)
        else if (key === 'papel')           display = v ? (v as string) : '—'
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap',
          (key === 'valor_parcela' || key === 'data_assinatura') && 'tabular-nums', key === 'valor_parcela' && 'text-right', sticky)}>{display}</td>
      }
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (!sort || sort.col !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  }

  function SelFilter({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
    return <select value={value} onChange={e => onChange(e.target.value)} className={cn('h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}>{children}</select>
  }

  return (
    <>
    <div className="space-y-3">

      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Contratos</h1>
          <p className="text-[11px] text-muted-foreground">
            {activeViewId
              ? <>Visão: <span className="text-primary font-medium">{activeViewName}</span>{isModified && <span className="ml-1.5 text-orange-400">(modificada)</span>}</>
              : 'Gestão de contratos'
            }
          </p>
        </div>
        <button type="button" onClick={openNewContract}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />Novo contrato
        </button>
      </div>

      {/* cards de resumo */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: 'Total',       value: totalAll,                                                          cls: 'text-foreground'  },
          { label: 'Vigentes',    value: allContratos.filter(r => effectiveSituacao(r.situacao, r.termino) === 'VIGENTE').length,     cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Em cadastro', value: allContratos.filter(r => effectiveSituacao(r.situacao, r.termino) === 'EM_CADASTRO').length, cls: 'text-blue-600 dark:text-blue-400'       },
          { label: 'Vencidos',    value: allContratos.filter(r => effectiveSituacao(r.situacao, r.termino) === 'VENCIDO').length,     cls: 'text-amber-600 dark:text-amber-400'     },
          { label: 'Encerrados',  value: allContratos.filter(r => effectiveSituacao(r.situacao, r.termino) === 'ENCERRADO').length,   cls: 'text-muted-foreground'                  },
          { label: 'Rescindidos', value: allContratos.filter(r => effectiveSituacao(r.situacao, r.termino) === 'RESCINDIDO').length,  cls: 'text-red-600 dark:text-red-400'         },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Buscar em todas as colunas..." />
          </div>

          <button onClick={() => { setShowFilters(v => !v); setShowViews(false); if (!filters.length) addFilter() }}
            className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
              showFilters || activeFiltersCount > 0 ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
            <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
            {activeFiltersCount > 0 && <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{activeFiltersCount}</span>}
          </button>

          <div ref={viewsRef} className="relative">
            <button onClick={() => { setShowViews(v => !v); setShowFilters(false) }}
              className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
                activeViewId ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
              <LayoutList className="h-3.5 w-3.5" />{activeViewId ? activeViewName : 'Visões'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showViews && 'rotate-180')} />
            </button>
            {showViews && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-lg border bg-card shadow-lg py-1">
                <button onClick={() => selectView(null)} className={cn('flex w-full items-center gap-3 px-3 py-2 text-xs transition-colors', !activeViewId ? 'text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                  <Check className={cn('h-3.5 w-3.5 shrink-0', !activeViewId ? 'opacity-100' : 'opacity-0')} /><span>Todos</span>
                </button>
                {views.length > 0 && <div className="my-1 h-px bg-border" />}
                {views.map(v => (
                  <div key={v.id} className="group/item flex items-center">
                    <button onClick={() => selectView(v.id)} className={cn('flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-xs transition-colors', activeViewId === v.id ? 'text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                      <Check className={cn('h-3.5 w-3.5 shrink-0', activeViewId === v.id ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{v.name}</span>
                    </button>
                    <button onClick={e => handleDeleteView(e, v.id)} className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-all"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saving ? (
            <div className="flex items-center gap-1">
              <input ref={saveInputRef} value={viewName} onChange={e => setViewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') { setSaving(false); setViewName('') } }}
                placeholder="Nome da visão..."
                className="h-7 w-40 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <button onClick={handleSaveView} disabled={!viewName.trim()} className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setSaving(false); setViewName('') }} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setSaving(true); setShowViews(false) }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
              <Bookmark className="h-3.5 w-3.5" />Salvar visão
            </button>
          )}

          <button onClick={() => setShowFields(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-auto">
            <Settings2 className="h-3.5 w-3.5" />Configurações
          </button>

          <button onClick={() => { void handleExport() }} disabled={totalFiltered === 0}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>

          <p className="text-[11px] text-muted-foreground">
            {totalFiltered === totalAll ? <>{totalAll} registro{totalAll !== 1 ? 's' : ''}</> : <>{totalFiltered} de {totalAll} registro{totalAll !== 1 ? 's' : ''}</>}
          </p>
        </div>

        {showFilters && (
          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">Combinar condições com:</span>
              <div className="flex rounded-md border overflow-hidden">
                {(['AND', 'OR'] as const).map(l => (
                  <button key={l} onClick={() => setLogic(l)} className={cn('px-3 py-1 text-xs font-semibold transition-colors', logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                    {l === 'AND' ? 'E' : 'OU'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {filters.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{idx === 0 ? 'Se' : logic === 'AND' ? 'E' : 'OU'}</span>
                  <SelFilter value={f.col} onChange={v => updateFilter(f.id, 'col', v)} className="w-36">
                    {orderedColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </SelFilter>
                  <SelFilter value={f.op} onChange={v => updateFilter(f.id, 'op', v)} className="w-36">
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SelFilter>
                  <input value={f.value} onChange={e => updateFilter(f.id, 'value', e.target.value)} placeholder="Valor..."
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={addFilter} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar condição</button>
              {activeFiltersCount > 0 && <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar filtros</button>}
            </div>
          </div>
        )}
      </div>

      {/* tabela */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-19rem)]">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="border-b">
              {orderedColumns.map((col, idx) => (
                <th key={col.key} draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => { handleDrop(idx); clearDrag() }}
                  onDragEnd={clearDrag}
                  className={cn(
                    'text-left px-3 py-1.5 font-medium text-muted-foreground select-none cursor-grab active:cursor-grabbing transition-all whitespace-nowrap bg-muted',
                    col.key === 'valor_total' && 'text-right',
                    idx === 0 && 'sticky left-0 z-20 bg-muted',
                    dragFrom === idx && 'opacity-40',
                    dragOver === idx && dragOver !== dragFrom && 'border-l-2 border-primary bg-primary/5',
                  )}>
                  <button draggable={false} onClick={() => handleSort(col.key)} className="group inline-flex items-center hover:text-foreground transition-colors">
                    {col.label}<SortIcon col={col.key} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={orderedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhum contrato encontrado.</td></tr>
            ) : pageRows.map(r => (
              <tr key={r.id} className="group/row border-b last:border-0 hover:bg-muted/30 transition-colors">
                {orderedColumns.map((col, colIdx) => renderCell(r, col.key, colIdx))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Linhas por página:</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              className="h-6 rounded border border-input bg-background px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-[11px] text-muted-foreground">{totalFiltered === 0 ? '0' : `${firstItem}–${lastItem}`} de {totalFiltered}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '...' ? <span key={`e${i}`} className="flex h-6 w-6 items-center justify-center text-[11px] text-muted-foreground">…</span>
              : <button key={p} onClick={() => setPage(p)} className={cn('flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium transition-colors', safePage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{p}</button>
            )}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>

    {showFields && <SettingsDrawer onClose={() => setShowFields(false)} />}
    </>
  )
}
