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
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import { exportExcel } from '@/lib/export-excel'
import { SettingsDrawer } from '@/components/partners/field-drawer'
import { usePartnerFields, useFieldVisibility, useDefaultColumns, NATIVE_FIELDS, CORE_TABLE_KEYS, COLUMN_ORDER_RESET_EVENT } from '@/hooks/use-partner-fields'
import { useScreens, getScreenValuesBatch } from '@/hooks/use-screens'
import { pickDefaultScreen } from '@/lib/screen-partner-layout'
import { formatScreenCellValue } from '@/lib/screen-value-format'
import type { ScreenField } from '@/lib/screen-types'
import { useWorkspace } from '@/contexts/workspace-context'



const STATUS_CLS: Record<string, string> = {
  ATIVO:            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  EM_CADASTRAMENTO: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  INATIVO:          'bg-muted text-muted-foreground',
}
const STATUS_LABEL: Record<string, string> = {
  ATIVO:            'Ativo',
  EM_CADASTRAMENTO: 'Em cadastramento',
  INATIVO:          'Inativo',
}
const TIPO_CLS: Record<string, string> = {
  'PJ Brasileira': 'bg-blue-500/10 text-blue-600 dark:text-blue-400', 'PJ Estrangeira': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'PF Brasileira': 'bg-teal-500/10 text-teal-600 dark:text-teal-400', 'PF Estrangeira': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
}

const COLUMNS = [
  { key: 'nome',          label: 'Nome / Razão Social' },
  { key: 'categoria',     label: 'Categoria'           },
  { key: 'identificador', label: 'Identificador'       },
  { key: 'cidade',        label: 'Localização'         },
  { key: 'contato',       label: 'Contato'             },
  { key: 'status',        label: 'Status'              },
]

const OPERATORS = [
  { value: 'contains',      label: 'Contém'           },
  { value: 'notContains',   label: 'Não contém'       },
  { value: 'eq',            label: 'Igual a'          },
  { value: 'neq',           label: 'Diferente de'     },
  { value: 'startsWith',    label: 'Começa com'       },
  { value: 'notStartsWith', label: 'Não começa com'   },
  { value: 'endsWith',      label: 'Termina com'      },
  { value: 'notEndsWith',   label: 'Não termina com'  },
  { value: 'gt',            label: 'Maior que'        },
  { value: 'gte',           label: 'Maior ou igual a' },
  { value: 'lt',            label: 'Menor que'        },
  { value: 'lte',           label: 'Menor ou igual a' },
]



const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500]
const COL_ORDER_KEY     = 'nxt:columns:parceiros'

interface Row {
  id: string; nome: string; categoria: string; identificador: string
  cidade: string; estado: string; contato: string; status: string
  /* campos nativos extras — retornados pela API */
  nomeFantasia: string; ie: string; im: string; paisOrigem: string
  rg: string; orgaoExpedidor: string; dataNascimento: string
  dataAbertura: string; naturezaJuridica: string; cnaePrincipal: string; cnaesSecundarios: string
  email: string; telefone: string; celular: string; cargo: string; website: string
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string
  address1: string; address2: string; endPais: string
  banco: string; tipoConta: string; agencia: string; conta: string; pix: string
  socNome: string; socDoc: string; socPart: string; socCargo: string
  [key: string]: string
}

interface SortState  { col: string; dir: 'asc' | 'desc' }
interface FilterRow  { id: string; col: string; op: string; value: string }





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
export default function ParceirosPage() {
  const { views, saveView, deleteView }  = useViews('parceiros')
  const { fields: customFields }         = usePartnerFields()
  const { isVisibleInTable }             = useFieldVisibility()
  const { isColumnVisible }              = useDefaultColumns()
  const tableFields = customFields.filter(f => f.visible === 'table' || f.visible === 'both')

  /* colunas padrão visíveis (usuário pode ocultar via "Configurar campos") */
  const baseColumns = useMemo(() => COLUMNS.filter(c => isColumnVisible(c.key)), [isColumnVisible])

  /* mapeamento de chave de campo nativo → coluna na tabela */
  const NATIVE_COL_MAP: Record<string, string> = {
    nome_fantasia:   'nomeFantasia', ie:             'ie',        im:          'im',
    rg:              'rg',           orgao_expedidor:'orgaoExpedidor', data_nascimento: 'dataNascimento',
    data_abertura:   'dataAbertura', natureza_juridica: 'naturezaJuridica',
    cnae_principal:  'cnaePrincipal', cnaes_secundarios: 'cnaesSecundarios',
    pais_origem:     'paisOrigem',   con_email:      'email',     con_telefone:'telefone',
    con_celular:     'celular',      con_cargo:      'cargo',     con_website: 'website',
    end_cep:         'cep',          end_logradouro: 'logradouro',end_numero:  'numero',
    end_complemento: 'complemento',  end_bairro:     'bairro',   end_address1:'address1',
    end_address2:    'address2',     end_pais:       'endPais',
    ban_banco:       'banco',        ban_tipo_conta: 'tipoConta', ban_agencia: 'agencia',
    ban_conta:       'conta',        ban_pix:        'pix',
    soc_nome:        'socNome',      soc_documento:  'socDoc',    soc_participacao:'socPart',
    soc_cargo:       'socCargo',
  }
  const nativeTableCols = NATIVE_FIELDS
    .filter(nf => !CORE_TABLE_KEYS.has(nf.key) && isVisibleInTable(nf.key) && nf.key in NATIVE_COL_MAP)
    .map(nf => ({ key: NATIVE_COL_MAP[nf.key], label: nf.label }))

  /* ── campos personalizados das TELAS (Marco 3b) ──
     A tela padrão do Fornecedor define os campos custom disponíveis como colunas.
     A chave da coluna é o id do campo (cuid); o valor vem de ScreenFieldValue (em lote).
     Colunas nascem OCULTAS e são ligadas no "Configurações" (mesmo store dos nativos). */
  const { screens: fornecedorScreens }  = useScreens('FORNECEDOR')
  const defaultScreen = useMemo(() => pickDefaultScreen(fornecedorScreens), [fornecedorScreens])
  const screenCustomFields = useMemo<ScreenField[]>(
    () => (defaultScreen?.fields ?? []).filter(f => f.source === 'CUSTOM').sort((a, b) => a.order - b.order),
    [defaultScreen],
  )
  const screenCustomCols = useMemo(
    () => screenCustomFields.filter(f => isVisibleInTable(f.id)).map(f => ({ key: f.id, label: f.label })),
    [screenCustomFields, isVisibleInTable],
  )

  /* ── dados do servidor ── */
  const [serverRows,      setServerRows]      = useState<Row[]>([])
  const [serverTotal,     setServerTotal]     = useState(0)
  const [serverStats,     setServerStats]     = useState({ total: 0, ativo: 0, inativo: 0, emCadastramento: 0 })
  const [serverLoading,   setServerLoading]   = useState(false)
  /* valores dos campos custom (Telas) da página corrente: subjectId → fieldId → valor bruto */
  const [screenVals,      setScreenVals]      = useState<Record<string, Record<string, string>>>({})
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reqIdRef    = useRef(0)

  /* ── column order ── */
  const [columnOrder, setColumnOrder] = useState<string[]>(() => COLUMNS.map(c => c.key))
  const [dragFrom,    setDragFrom]    = useState<number | null>(null)
  const [dragOver,    setDragOver]    = useState<number | null>(null)
  const storageLoaded = useRef(false)

  /* reconcilia columnOrder quando tableFields ou colunas nativas mudam */
  useEffect(() => {
    const allKeys = [
      ...baseColumns.map(c => c.key),
      ...nativeTableCols.map(c => c.key),
      ...tableFields.map(f => f.name),
      ...screenCustomCols.map(c => c.key),
    ]

    setColumnOrder(prev => {
      let base = prev
      if (!storageLoaded.current) {
        storageLoaded.current = true
        const saved = cacheRead<string[] | null>(COL_ORDER_KEY, null)
        if (saved) base = saved
      }
      const reconciled = [
        ...base.filter(k => allKeys.includes(k)),
        ...allKeys.filter(k => !base.includes(k)),
      ]
      return reconciled.join(',') === prev.join(',') && base === prev ? prev : reconciled
    })
  }, [tableFields, nativeTableCols, baseColumns, screenCustomCols])

  /* persiste (cache local + backend) sempre que columnOrder muda */
  useEffect(() => {
    if (!storageLoaded.current) return
    pushSetting(COL_ORDER_KEY, columnOrder)
  }, [columnOrder])

  /* hidrata a ordem das colunas a partir do backend no mount */
  useEffect(() => {
    void pullSetting<string[]>(COL_ORDER_KEY).then(remote => { if (remote) setColumnOrder(remote) })
  }, [])

  /* reset da ordem das colunas (disparado por "Restaurar padrão" no drawer) */
  useEffect(() => {
    const handler = () => setColumnOrder(COLUMNS.map(c => c.key))
    window.addEventListener(COLUMN_ORDER_RESET_EVENT, handler)
    return () => window.removeEventListener(COLUMN_ORDER_RESET_EVENT, handler)
  }, [])

  /* lista de colunas ordenadas */
  const allColumns = useMemo(() => [
    ...baseColumns,
    ...nativeTableCols,
    ...tableFields.map(f => ({ key: f.name, label: f.label })),
    ...screenCustomCols,
  ], [baseColumns, nativeTableCols, tableFields, screenCustomCols])

  const orderedColumns = useMemo(() =>
    columnOrder
      .map(k => allColumns.find(c => c.key === k))
      .filter((c): c is typeof allColumns[0] => !!c),
    [columnOrder, allColumns],
  )

  /* ── drag handlers ── */
  const handleDragStart = (idx: number) => setDragFrom(idx)
  const handleDragOver  = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (idx !== dragOver) setDragOver(idx)
  }
  const handleDrop = (idx: number) => {
    if (dragFrom === null || dragFrom === idx) return
    const next = [...columnOrder]
    const [moved] = next.splice(dragFrom, 1)
    next.splice(idx, 0, moved)
    setColumnOrder(next)
  }
  const clearDrag = () => { setDragFrom(null); setDragOver(null) }

  /* ── área de trabalho global (abas no shell, sobrevivem à navegação) ── */
  const ws = useWorkspace()
  const openPartner = (partnerId: string, label: string) =>
    ws.open({ id: `partner:${partnerId}`, kind: 'partner', mode: 'detail', label })
  const openNewPartner = () => ws.open({ id: 'partner:new', kind: 'partner', mode: 'new', label: 'Novo parceiro' })

  /* ── restante do estado ── */
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [sort,         setSort]         = useState<SortState | null>({ col: 'nome', dir: 'asc' })
  const [showFilters,  setShowFilters]  = useState(false)
  const [showViews,    setShowViews]    = useState(false)
  const [logic,        setLogic]        = useState<'AND' | 'OR'>('AND')
  const [filters,      setFilters]      = useState<FilterRow[]>([])
  const [saving,       setSaving]       = useState(false)
  const [viewName,     setViewName]     = useState('')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(10)
  const [showFields,   setShowFields]   = useState(false)

  /* ── query server-side ── */
  const queryServer = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setServerLoading(true)
    try {
      const res = await apiFetch(`/api/partners/query`, {
        method: 'POST',
        body: JSON.stringify({
          page,
          pageSize,
          search:  debouncedSearch || undefined,
          sort:    sort   ?? undefined,
          filters: filters.filter(f => f.value.trim()),
          logic,
        }),
      })
      if (reqId !== reqIdRef.current) return
      if (res.ok) {
        const data = await res.json() as { rows: Row[]; total: number; stats: { total: number; ativo: number; inativo: number; emCadastramento: number } }
        setServerRows(data.rows)
        setServerTotal(data.total)
        if (data.stats) setServerStats(data.stats)
      }
    } catch {}
    finally { if (reqId === reqIdRef.current) setServerLoading(false) }
  }, [page, pageSize, debouncedSearch, sort, filters, logic]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void queryServer() }, [queryServer])

  /* busca os valores custom (Telas) dos parceiros da página, em lote */
  useEffect(() => {
    const ids = serverRows.map(r => r.id)
    if (!ids.length || screenCustomFields.length === 0) { setScreenVals({}); return }
    let cancelled = false
    void getScreenValuesBatch('PARTNER', ids).then(rows => {
      if (cancelled) return
      const map: Record<string, Record<string, string>> = {}
      for (const r of rows) (map[r.subjectId] ??= {})[r.fieldId] = r.value
      setScreenVals(map)
    })
    return () => { cancelled = true }
  }, [serverRows, screenCustomFields])

  /* linhas com os valores custom já FORMATADOS sob a chave do campo (id) */
  const displayRows = useMemo<Row[]>(() => {
    if (screenCustomFields.length === 0) return serverRows
    return serverRows.map(r => {
      const vals = screenVals[r.id]
      if (!vals) return r
      const extra: Record<string, string> = {}
      for (const f of screenCustomFields) {
        const fmt = formatScreenCellValue(f, vals[f.id])
        if (fmt) extra[f.id] = fmt
      }
      return { ...r, ...extra }
    })
  }, [serverRows, screenVals, screenCustomFields])

  const saveInputRef   = useRef<HTMLInputElement>(null)
  const viewsRef       = useRef<HTMLDivElement>(null)
  /* recarrega a lista quando um documento é salvo na área de trabalho */
  useEffect(() => {
    const h = () => { void queryServer() }
    window.addEventListener('nxt:workspace:refresh', h)
    return () => window.removeEventListener('nxt:workspace:refresh', h)
  }, [queryServer])

  useEffect(() => { if (saving) saveInputRef.current?.focus() }, [saving])

  useEffect(() => {
    if (!showViews) return
    const handler = (e: MouseEvent) => {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) setShowViews(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showViews])

  useEffect(() => { setPage(1) }, [debouncedSearch, filters, sort, logic, pageSize])

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    setShowViews(false)
    if (!id) {
      setSort({ col: 'nome', dir: 'asc' }); setFilters([]); setLogic('AND'); setShowFilters(false)
    } else {
      const v = views.find(v => v.id === id)
      if (!v) return
      setSort(v.sort); setFilters(v.filters); setLogic(v.logic)
    }
  }

  const addFilter    = () => setFilters(p => [...p, { id: `f${Date.now()}`, col: 'nome', op: 'contains', value: '' }])
  const removeFilter = (id: string) => setFilters(p => p.filter(f => f.id !== id))
  const updateFilter = (id: string, key: keyof FilterRow, val: string) =>
    setFilters(p => p.map(f => f.id === id ? { ...f, [key]: val } : f))
  const clearFilters = () => { setFilters([]); setSort(null); setLogic('AND') }

  const handleSort = (col: string) =>
    setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const handleSaveView = () => {
    if (!viewName.trim()) return
    const v = saveView(viewName.trim(), { sort, filters: filters.filter(f => f.value.trim()), logic })
    setActiveViewId(v.id)
    setSaving(false)
    setViewName('')
  }

  const handleDeleteView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteView(id)
    if (activeViewId === id) selectView(null)
  }

  const handleExport = async () => {
    let rows: Row[] = []
    try {
      const res = await apiFetch(`/api/partners/query`, {
        method: 'POST',
        body: JSON.stringify({
          page: 1,
          pageSize: 10000,
          search:  debouncedSearch || undefined,
          sort:    sort   ?? undefined,
          filters: filters.filter(f => f.value.trim()),
          logic,
        }),
      })
      if (!res.ok) return
      rows = ((await res.json()) as { rows: Row[] }).rows
    } catch { return }
    if (!rows.length) return

    /* valores custom (Telas) de TODOS os parceiros exportados, em lote */
    const customVals: Record<string, Record<string, string>> = {}
    if (screenCustomFields.length) {
      const batch = await getScreenValuesBatch('PARTNER', rows.map(r => r.id))
      for (const b of batch) (customVals[b.subjectId] ??= {})[b.fieldId] = b.value
    }
    const fieldById = new Map(screenCustomFields.map(f => [f.id, f]))

    const exportName = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'
    const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    /* A planilha leva EXATAMENTE as colunas visíveis na tela, na ordem escolhida
       (colunas padrão + nativas extras + personalizadas das Telas). */
    await exportExcel({
      fileName: 'parceiros',
      sheet: 'Parceiros',
      title: `Exportação — ${exportName}`,
      subtitle: `Gerado em ${date}  •  ${serverTotal} registro${serverTotal !== 1 ? 's' : ''}`,
      columns: orderedColumns.map(c => ({ header: c.label })),
      rows: rows.map(p => orderedColumns.map(c => {
        const f = fieldById.get(c.key)
        return f ? formatScreenCellValue(f, customVals[p.id]?.[c.key]) : cellText(p, c.key)
      })),
    })
  }

  const isModified = useMemo(() => {
    if (!activeViewId) return false
    const v = views.find(v => v.id === activeViewId)
    if (!v) return false
    return stateKey({ sort, filters, logic }) !== stateKey({ sort: v.sort, filters: v.filters, logic: v.logic })
  }, [activeViewId, views, sort, filters, logic])

  const totalFiltered      = serverTotal
  const totalPages         = Math.max(1, Math.ceil(serverTotal / pageSize))
  const safePage           = page
  const pageRows           = displayRows
  const firstItem          = serverTotal === 0 ? 0 : (page - 1) * pageSize + 1
  const lastItem           = Math.min(page * pageSize, serverTotal)
  const activeFiltersCount = filters.filter(f => f.value.trim()).length
  const activeViewName     = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'

  /* valor em TEXTO PLANO de uma coluna base/nativa (usado na exportação) */
  function cellText(row: Row, key: string): string {
    switch (key) {
      case 'categoria': return row.categoria
      case 'cidade':    return [row.cidade, row.estado].filter(Boolean).join(' — ')
      case 'status':    return STATUS_LABEL[row.status] ?? row.status
      case 'dataNascimento': {
        const raw = row.dataNascimento
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split('-').reverse().join('/') : (raw || '')
      }
      default: return row[key] ?? ''
    }
  }

  /* renderiza célula pelo key da coluna */
  function renderCell(row: Row, key: string, colIdx: number) {
    /* coluna fixa precisa de fundo OPACO senão o conteúdo que rola atrás vaza.
       hover = equivalente opaco de muted/30 sobre card (mesma cor, sem transparência). */
    const sticky = colIdx === 0
      ? 'sticky left-0 z-10 bg-card group-hover/row:bg-[hsl(240_5%_97%)] dark:group-hover/row:bg-[hsl(240_21%_15%)] transition-colors'
      : ''
    switch (key) {
      case 'nome':
        return (
          <td key={key} className={cn('px-3 py-1 font-medium whitespace-nowrap', sticky)}>
            <button type="button" onClick={() => { void openPartner(row.id, row.nome) }} className="hover:text-primary hover:underline text-left">{row.nome}</button>
          </td>
        )
      case 'categoria':
        return (
          <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}>
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${TIPO_CLS[row.categoria]}`}>{row.categoria}</span>
          </td>
        )
      case 'identificador': {
        const docTipo = row.categoria === 'PJ Brasileira' ? 'CNPJ' : row.categoria === 'PF Brasileira' ? 'CPF' : row.identificador ? 'Cód.' : ''
        return (
          <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}>
            <span className="flex items-center gap-1.5">
              {docTipo && <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{docTipo}</span>}
              <span className="font-mono text-muted-foreground">{row.identificador || '—'}</span>
            </span>
          </td>
        )
      }
      case 'cidade':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{[row.cidade, row.estado].filter(Boolean).join(' — ')}</td>
      case 'contato':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{row.contato}</td>
      case 'status':
        return (
          <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}>
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
          </td>
        )
      case 'dataNascimento': {
        const raw = row.dataNascimento
        const fmt = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split('-').reverse().join('/') : raw
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap tabular-nums', sticky)}>{fmt || '—'}</td>
      }
      default:
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{row[key] || '—'}</td>
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (!sort || sort.col !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />
    return sort.dir === 'asc'
      ? <ArrowUp   className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  }

  function Sel({ value, onChange, children, className }: {
    value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string
  }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className={cn('h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}>
        {children}
      </select>
    )
  }

  return (
    <>
    <div className="space-y-3">

      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Parceiros</h1>
          <p className="text-[11px] text-muted-foreground">
            {activeViewId
              ? <>Visão: <span className="text-primary font-medium">{activeViewName}</span>
                  {isModified && <span className="ml-1.5 text-orange-400">(modificada)</span>}
                </>
              : 'Cadastro e gestão de parceiros'
            }
          </p>
        </div>
        <button
          type="button"
          onClick={openNewPartner}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Novo parceiro
        </button>
      </div>

      {/* cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total',            value: serverStats.total,           cls: 'text-foreground' },
          { label: 'Em cadastramento', value: serverStats.emCadastramento, cls: 'text-blue-600 dark:text-blue-400'       },
          { label: 'Ativos',           value: serverStats.ativo,           cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Inativos',         value: serverStats.inativo,         cls: 'text-muted-foreground'                  },
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
            <input value={search} onChange={e => {
              const v = e.target.value
              setSearch(v)
              clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300)
            }}
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Buscar em todas as colunas..." />
          </div>

          <button
            onClick={() => { setShowFilters(v => !v); setShowViews(false); if (!filters.length) addFilter() }}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
              showFilters || activeFiltersCount > 0
                ? 'border-primary bg-primary/5 text-primary'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <div ref={viewsRef} className="relative">
            <button
              onClick={() => { setShowViews(v => !v); setShowFilters(false) }}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
                activeViewId
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              {activeViewId ? activeViewName : 'Visões'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showViews && 'rotate-180')} />
            </button>

            {showViews && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-lg border bg-card shadow-lg py-1">
                <button
                  onClick={() => selectView(null)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-xs transition-colors',
                    !activeViewId ? 'text-primary font-medium' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', !activeViewId ? 'opacity-100' : 'opacity-0')} />
                  <span>Todos</span>
                </button>
                {views.length > 0 && <div className="my-1 h-px bg-border" />}
                {views.map(v => (
                  <div key={v.id} className="group/item flex items-center">
                    <button
                      onClick={() => selectView(v.id)}
                      className={cn(
                        'flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-xs transition-colors',
                        activeViewId === v.id ? 'text-primary font-medium' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('h-3.5 w-3.5 shrink-0', activeViewId === v.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button
                      onClick={(e) => handleDeleteView(e, v.id)}
                      className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-all"
                      title="Excluir visão"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saving ? (
            <div className="flex items-center gap-1">
              <input
                ref={saveInputRef}
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveView()
                  if (e.key === 'Escape') { setSaving(false); setViewName('') }
                }}
                placeholder="Nome da visão..."
                className="h-7 w-40 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button onClick={handleSaveView} disabled={!viewName.trim()}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { setSaving(false); setViewName('') }}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setSaving(true); setShowViews(false) }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              <Bookmark className="h-3.5 w-3.5" />Salvar visão
            </button>
          )}

          <button
            onClick={() => setShowFields(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-auto"
          >
            <Settings2 className="h-3.5 w-3.5" />Configurações
          </button>

          <button
            onClick={() => { void handleExport() }}
            disabled={totalFiltered === 0}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>

          <p className="text-[11px] text-muted-foreground">
            {serverLoading ? '…' : `${serverTotal} registro${serverTotal !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* painel de filtros */}
        {showFilters && (
          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">Combinar condições com:</span>
              <div className="flex rounded-md border overflow-hidden">
                {(['AND', 'OR'] as const).map(l => (
                  <button key={l} onClick={() => setLogic(l)}
                    className={cn('px-3 py-1 text-xs font-semibold transition-colors',
                      logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                    {l === 'AND' ? 'E' : 'OU'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {filters.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {idx === 0 ? 'Se' : logic === 'AND' ? 'E' : 'OU'}
                  </span>
                  <Sel value={f.col} onChange={v => updateFilter(f.id, 'col', v)} className="w-40">
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    {tableFields.map(tf => <option key={tf.name} value={tf.name}>{tf.label}</option>)}
                  </Sel>
                  <Sel value={f.op} onChange={v => updateFilter(f.id, 'op', v)} className="w-40">
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                  <input
                    value={f.value}
                    onChange={e => updateFilter(f.id, 'value', e.target.value)}
                    placeholder="Valor..."
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={addFilter} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                <Plus className="h-3.5 w-3.5" />Adicionar condição
              </button>
              {activeFiltersCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Limpar filtros
                </button>
              )}
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
                <th
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => { handleDrop(idx); clearDrag() }}
                  onDragEnd={clearDrag}
                  className={cn(
                    'text-left px-3 py-1.5 font-medium text-muted-foreground select-none transition-all whitespace-nowrap bg-muted',
                    'cursor-grab active:cursor-grabbing',
                    idx === 0 && 'sticky left-0 z-20 bg-muted', // opaco p/ sticky vertical + horizontal
                    dragFrom === idx && 'opacity-40',
                    dragOver === idx && dragOver !== dragFrom && 'border-l-2 border-primary bg-primary/5',
                  )}
                >
                  <button
                    draggable={false}
                    onClick={() => handleSort(col.key)}
                    className="group inline-flex items-center hover:text-foreground transition-colors"
                  >
                    {col.label}<SortIcon col={col.key} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Nenhum registro encontrado com os filtros aplicados.
                </td>
              </tr>
            ) : pageRows.map(p => (
              <tr key={p.id} className="group/row border-b last:border-0 hover:bg-muted/30 transition-colors">
                {orderedColumns.map((col, colIdx) => renderCell(p, col.key, colIdx))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* rodapé com paginação */}
        <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Linhas por página:</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="h-6 rounded border border-input bg-background px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-[11px] text-muted-foreground">
              {totalFiltered === 0 ? '0' : `${firstItem}–${lastItem}`} de {totalFiltered}
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`e${i}`} className="flex h-6 w-6 items-center justify-center text-[11px] text-muted-foreground">…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium transition-colors',
                    safePage === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}>
                  {p}
                </button>
              )
            )}

            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>


    {showFields && <SettingsDrawer onClose={() => setShowFields(false)} />}
    </>
  )
}
