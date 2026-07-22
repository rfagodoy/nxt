'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Plus, ArrowUp, ArrowDown, ChevronsUpDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { StartProcessButton } from '@/components/processes/start-process-button'
import { useViews, type ViewState } from '@/hooks/use-views'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import { exportExcel } from '@/lib/export-excel'
import { ListToolbar } from '@/components/list/list-toolbar'
import { TablePagination } from '@/components/ui/table-pagination'
import { SERVER_OPERATORS, type FilterRow } from '@/lib/list-filter'
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

/* Colunas que o servidor sabe ordenar (espelha SORT_FIELD em partners.service.ts).
   As demais (cidade/contato base, nativas extras, custom das Telas) não têm ordenação
   server-side — o cabeçalho delas não deve parecer clicável (senão o clique reordena
   por createdAt em silêncio). */
const SORTABLE_KEYS = new Set(['nome', 'categoria', 'identificador', 'status'])

const COL_ORDER_KEY = 'nxt:columns:parceiros'

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


function stateKey(s: ViewState): string {
  return JSON.stringify({ sort: s.sort, filters: s.filters.filter(f => f.value.trim()), logic: s.logic })
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
  /* colunas ordenáveis server-side: nativas conhecidas + campos custom (o backend agora ordena por eles) */
  const sortableKeys = useMemo(
    () => new Set<string>([...SORTABLE_KEYS, ...screenCustomFields.map(f => f.id)]),
    [screenCustomFields],
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

  /* colunas oferecidas no filtro (padrão + custom da lista + campos das Telas) */
  const filterColumns = useMemo(() => [
    ...COLUMNS,
    ...tableFields.map(f => ({ key: f.name, label: f.label })),
    ...screenCustomFields.map(f => ({ key: f.id, label: f.label })),
  ], [tableFields, screenCustomFields])

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
  const [logic,        setLogic]        = useState<'AND' | 'OR'>('AND')
  const [filters,      setFilters]      = useState<FilterRow[]>([])
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(25)
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
          filters: filters.filter(f => f.value.trim()).map(({ col, op, value }) => ({ col, op, value })),
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

  /* recarrega a lista quando um documento é salvo na área de trabalho */
  useEffect(() => {
    const h = () => { void queryServer() }
    window.addEventListener('nxt:workspace:refresh', h)
    return () => window.removeEventListener('nxt:workspace:refresh', h)
  }, [queryServer])

  useEffect(() => { setPage(1) }, [debouncedSearch, filters, sort, logic, pageSize])

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    if (!id) {
      setSort({ col: 'nome', dir: 'asc' }); setFilters([]); setLogic('AND')
    } else {
      const v = views.find(v => v.id === id)
      if (!v) return
      setSort(v.sort); setFilters(v.filters); setLogic(v.logic)
    }
  }

  const handleSort = (col: string) =>
    setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const handleSaveView = (name: string) => {
    const v = saveView(name, { sort, filters: filters.filter(f => f.value.trim()), logic })
    setActiveViewId(v.id)
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
          filters: filters.filter(f => f.value.trim()).map(({ col, op, value }) => ({ col, op, value })),
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

  const pageRows           = displayRows
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

  return (
    <>
    <div className="flex h-full flex-col gap-3">

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
        <div className="flex items-center gap-2">
          <StartProcessButton kinds={['PARCEIRO']} />
          <button
            type="button"
            onClick={openNewPartner}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />Novo parceiro
          </button>
        </div>
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
      <ListToolbar
        search={search}
        onSearch={v => {
          setSearch(v)
          clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300)
        }}
        columns={filterColumns} operators={SERVER_OPERATORS}
        filters={filters} onFiltersChange={setFilters}
        logic={logic} onLogicChange={setLogic}
        views={views} activeViewId={activeViewId}
        onSelectView={selectView} onSaveView={handleSaveView} onDeleteView={handleDeleteView}
        onExport={() => { void handleExport() }} exportDisabled={serverTotal === 0}
        configSlot={
          <button onClick={() => setShowFields(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Settings2 className="h-3.5 w-3.5" />Configurações
          </button>
        }
        filteredCount={serverTotal} totalCount={serverTotal} busy={serverLoading}
      />

      {/* tabela */}
      <div className="rounded-xl border bg-card shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
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
                  {sortableKeys.has(col.key) ? (
                    <button
                      draggable={false}
                      onClick={() => handleSort(col.key)}
                      className="group inline-flex items-center hover:text-foreground transition-colors"
                    >
                      {col.label}<SortIcon col={col.key} />
                    </button>
                  ) : (
                    <span className="inline-flex items-center">{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {(search.trim() || filters.some(f => f.value.trim()))
                    ? 'Nenhum parceiro encontrado com os filtros aplicados.'
                    : 'Nenhum parceiro cadastrado.'}
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
        <TablePagination page={page} pageSize={pageSize} total={serverTotal} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>


    {showFields && <SettingsDrawer onClose={() => setShowFields(false)} />}
    </>
  )
}
