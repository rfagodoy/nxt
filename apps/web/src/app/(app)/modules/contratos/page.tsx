'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Plus, ArrowUp, ArrowDown, ChevronsUpDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { StartProcessButton } from '@/components/processes/start-process-button'
import { useViews, type ViewState } from '@/hooks/use-views'
import { exportExcel } from '@/lib/export-excel'
import { ListToolbar } from '@/components/list/list-toolbar'
import { LoadErrorRow } from '@/components/list/load-error'
import { TablePagination } from '@/components/ui/table-pagination'
import { SERVER_OPERATORS, type FilterRow } from '@/lib/list-filter'
import { SettingsDrawer } from '@/components/contracts/field-drawer'
import { effectiveSituacao } from '@/lib/contract-options'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import { useContractFields, useContractDefaultColumns, useContractFieldVisibility, NATIVE_FIELDS, COLUMN_ORDER_RESET_EVENT } from '@/hooks/use-contract-fields'
import { useScreens } from '@/hooks/use-screens'
import { pickDefaultScreen } from '@/lib/screen-contract-layout'
import { formatScreenCellValue } from '@/lib/screen-value-format'
import type { ScreenField } from '@/lib/screen-types'
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

const COL_ORDER_KEY = 'nxt:columns:contratos'

interface SortState { col: string; dir: 'asc' | 'desc' }


/* fieldValue/applyOp (filtro client-side) MORRERAM aqui: busca/filtro/ordenação agora
   são server-side — a matriz de comparação vive em apps/api/src/contracts/list-query.ts. */

function stateKey(s: ViewState): string {
  return JSON.stringify({ sort: s.sort, filters: s.filters.filter(f => f.value.trim()), logic: s.logic })
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

  /* ── campos personalizados das TELAS (Marco 3b — análogo ao de Parceiros) ──
     A tela padrão do Contrato define os campos custom disponíveis como colunas.
     A chave da coluna é o id do campo (cuid); filtro/busca/ordenação sobre eles
     acontecem no SERVIDOR (rótulo resolvido lá); o valor bruto da página vem na
     resposta da consulta para exibição. Colunas nascem OCULTAS. */
  const { screens: contratoScreens } = useScreens('CONTRATO')
  const defaultScreen = useMemo(() => pickDefaultScreen(contratoScreens), [contratoScreens])
  const screenCustomFields = useMemo<ScreenField[]>(
    () => (defaultScreen?.fields ?? []).filter(f => f.source === 'CUSTOM').sort((a, b) => a.order - b.order),
    [defaultScreen],
  )
  const screenCustomCols = useMemo(
    () => screenCustomFields.filter(f => isVisibleInTable(f.id)).map(f => ({ key: f.id, label: f.label })),
    [screenCustomFields, isVisibleInTable],
  )

  /* ── consulta SERVER-SIDE (auditoria 2026-08-21): a página deixa de baixar a base
     inteira + valores custom de todos os contratos; busca/filtro/ordenação/paginação
     acontecem na API (POST /api/contracts/query, espelho do padrão de Parceiros) e o
     navegador recebe SÓ a página corrente com os valores custom dela. ── */
  interface ContractStats { total: number; byEffective: Record<string, number> }
  const [serverRows,  setServerRows]  = useState<Row[]>([])
  const [serverTotal, setServerTotal] = useState(0)
  const [serverStats, setServerStats] = useState<ContractStats>({ total: 0, byEffective: {} })
  /* Falha de carga ≠ lista vazia — sem isto, API fora do ar viraria "Nenhum contrato
     cadastrado" (ver components/list/load-error.tsx). */
  const [erroCarga, setErroCarga] = useState(false)
  /* valores custom (Telas) da página corrente: subjectId → fieldId → valor bruto */
  const [screenVals, setScreenVals] = useState<Record<string, Record<string, string>>>({})
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reqIdRef    = useRef(0)

  /* linhas com os valores custom já FORMATADOS sob a chave do campo (id) — assim
     `fieldValue`/`renderCell`/ordenação/filtro/busca funcionam sem tratamento especial */
  const contratos = useMemo<Row[]>(() => {
    if (screenCustomFields.length === 0) return serverRows
    return serverRows.map(r => {
      const vals = screenVals[r.id]
      if (!vals) return r
      const extra: Record<string, string> = {}
      for (const f of screenCustomFields) {
        const fmt = formatScreenCellValue(f, vals[f.id])
        if (fmt) extra[f.id] = fmt
      }
      return { ...r, ...extra } as Row
    })
  }, [serverRows, screenVals, screenCustomFields])

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
      const allKeys = [...baseColumns.map(c => c.key), ...nativeTableCols.map(c => c.key), ...tableFields.map(f => f.name), ...screenCustomCols.map(c => c.key)]
      const reconciled = [...base.filter((k: string) => allKeys.includes(k)), ...allKeys.filter(k => !base.includes(k))]
      return reconciled.join(',') === prev.join(',') && base === prev ? prev : reconciled
    })
  }, [tableFields, baseColumns, nativeTableCols, screenCustomCols])

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
    ...screenCustomCols,
  ], [baseColumns, nativeTableCols, tableFields, screenCustomCols])

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
  const [logic,        setLogic]        = useState<'AND' | 'OR'>('AND')
  const [filters,      setFilters]      = useState<FilterRow[]>([])
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(25)
  const [showFields,   setShowFields]   = useState(false)

  /* ── query server-side (mesmo desenho do módulo Parceiros) ── */
  const queryServer = useCallback(async () => {
    const reqId = ++reqIdRef.current
    try {
      const res = await apiFetch(`/api/contracts/query`, {
        method: 'POST',
        body: JSON.stringify({
          page,
          pageSize,
          search:  debouncedSearch || undefined,
          sort:    sort ?? undefined,
          filters: filters.filter(f => f.value.trim()).map(({ col, op, value }) => ({ col, op, value })),
          logic,
        }),
      })
      if (reqId !== reqIdRef.current) return
      if (res.ok) {
        const data = await res.json() as { rows: Row[]; total: number; stats: ContractStats; customValues: Record<string, Record<string, string>> }
        setServerRows(data.rows)
        setServerTotal(data.total)
        setServerStats(data.stats)
        setScreenVals(data.customValues ?? {})
        setErroCarga(false)
      } else setErroCarga(true)
    } catch { if (reqId === reqIdRef.current) setErroCarga(true) }
  }, [page, pageSize, debouncedSearch, sort, filters, logic])
  useEffect(() => { void queryServer() }, [queryServer])

  /* ── área de trabalho global (abas no shell, sobrevivem à navegação) ── */
  const ws = useWorkspace()
  const openContract    = (row: Row) => ws.open({ id: `contract:${row.id}`, kind: 'contract', mode: 'detail', label: row.numero, data: row })
  const openNewContract = ()         => ws.open({ id: 'contract:new', kind: 'contract', mode: 'new', label: 'Novo contrato' })

  /* recarrega a lista quando um documento é salvo/transicionado na área de trabalho */
  useEffect(() => {
    const h = () => { void queryServer() }
    window.addEventListener('nxt:workspace:refresh', h)
    return () => window.removeEventListener('nxt:workspace:refresh', h)
  }, [queryServer])

  useEffect(() => { setPage(1) }, [debouncedSearch, filters, sort, logic, pageSize])

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    if (!id) { setSort({ col: 'numero', dir: 'desc' }); setFilters([]); setLogic('AND') }
    else { const v = views.find(v => v.id === id); if (!v) return; setSort(v.sort); setFilters(v.filters); setLogic(v.logic) }
  }

  const handleSort = (col: string) => setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const handleSaveView = (name: string) => {
    const v = saveView(name, { sort, filters: filters.filter(f => f.value.trim()), logic })
    setActiveViewId(v.id)
  }
  const handleDeleteView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); deleteView(id); if (activeViewId === id) selectView(null)
  }

  /* valor em TEXTO PLANO de uma coluna (base/nativa/custom) para a exportação.
     Colunas custom já vêm formatadas na linha mesclada (`contratos`) sob a chave do campo. */
  function cellText(row: Row, key: string): string {
    switch (key) {
      case 'inicio':          return fmtDate(row.inicio)
      case 'termino':         return fmtDate(row.termino)
      case 'valor_total':     return BRL.format(row.valor_total)
      case 'situacao':        return SIT_LABEL[effectiveSituacao(row.situacao, row.termino)] ?? row.situacao
      case 'valor_parcela':   return row.valor_parcela ? BRL.format(Number(row.valor_parcela)) : ''
      case 'data_assinatura': return row.data_assinatura ? fmtDate(row.data_assinatura) : ''
      default:                return String((row as unknown as Record<string, unknown>)[key] ?? '')
    }
  }

  const handleExport = async () => {
    /* A exportação leva o RECORTE atual inteiro (não só a página): repete a consulta
       com teto de 10.000 — mesmo desenho do módulo Parceiros. Os valores custom vêm
       na própria resposta. */
    let rows: Row[] = []
    let vals: Record<string, Record<string, string>> = {}
    try {
      const res = await apiFetch(`/api/contracts/query`, {
        method: 'POST',
        body: JSON.stringify({
          page: 1,
          pageSize: 10000,
          search:  debouncedSearch || undefined,
          sort:    sort ?? undefined,
          filters: filters.filter(f => f.value.trim()).map(({ col, op, value }) => ({ col, op, value })),
          logic,
        }),
      })
      if (!res.ok) return
      const data = await res.json() as { rows: Row[]; customValues: Record<string, Record<string, string>> }
      rows = data.rows; vals = data.customValues ?? {}
    } catch { return }
    if (!rows.length) return
    const fieldById = new Map(screenCustomFields.map(f => [f.id, f]))

    const exportName = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'
    /* A planilha leva EXATAMENTE as colunas visíveis na tela, na ordem escolhida
       (colunas padrão + nativas extras + personalizadas das Telas). */
    await exportExcel({
      fileName: 'contratos',
      sheet: 'Contratos',
      title: `Exportação — ${exportName}`,
      columns: orderedColumns.map(c => ({ header: c.label })),
      rows: rows.map(r => orderedColumns.map(c => {
        const f = fieldById.get(c.key)
        if (f) return formatScreenCellValue(f, vals[r.id]?.[f.id]) ?? ''
        return cellText(r, c.key)
      })),
    })
  }

  const isModified = useMemo(() => {
    if (!activeViewId) return false
    const v = views.find(v => v.id === activeViewId); if (!v) return false
    return stateKey({ sort, filters, logic }) !== stateKey({ sort: v.sort, filters: v.filters, logic: v.logic })
  }, [activeViewId, views, sort, filters, logic])

  /* busca/filtro/ordenação/paginação acontecem na API — `contratos` JÁ É a página. */
  const pageRows           = contratos
  const totalFiltered      = serverTotal
  const totalAll           = serverStats.total
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

  return (
    <>
    <div className="flex h-full flex-col gap-3">

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
        <div className="flex items-center gap-2">
          <StartProcessButton kinds={['CONTRATO', 'ADITIVO']} />
          <button type="button" onClick={openNewContract}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />Novo contrato
          </button>
        </div>
      </div>

      {/* cards de resumo — as categorias precisam FECHAR com o Total: enquanto
          "Cancelados" faltava aqui, um contrato cancelado entrava no Total e em
          nenhuma coluna, e a conta simplesmente não batia na tela. */}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          /* Contagem pela situação EFETIVA, agora vinda do servidor (stats.byEffective). */
          { label: 'Total',       value: totalAll,                                    cls: 'text-foreground'  },
          { label: 'Vigentes',    value: serverStats.byEffective.VIGENTE ?? 0,        cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Em cadastro', value: serverStats.byEffective.EM_CADASTRO ?? 0,    cls: 'text-blue-600 dark:text-blue-400'       },
          { label: 'Vencidos',    value: serverStats.byEffective.VENCIDO ?? 0,        cls: 'text-amber-600 dark:text-amber-400'     },
          { label: 'Encerrados',  value: serverStats.byEffective.ENCERRADO ?? 0,      cls: 'text-muted-foreground'                  },
          { label: 'Rescindidos', value: serverStats.byEffective.RESCINDIDO ?? 0,     cls: 'text-red-600 dark:text-red-400'         },
          { label: 'Cancelados',  value: serverStats.byEffective.CANCELADO ?? 0,      cls: 'text-muted-foreground'                  },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <ListToolbar
        search={search} onSearch={(v) => {
          setSearch(v)
          clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300)
        }}
        columns={orderedColumns} operators={SERVER_OPERATORS}
        filters={filters} onFiltersChange={setFilters}
        logic={logic} onLogicChange={setLogic}
        views={views} activeViewId={activeViewId}
        onSelectView={selectView} onSaveView={handleSaveView} onDeleteView={handleDeleteView}
        onExport={() => { void handleExport() }} exportDisabled={totalFiltered === 0}
        configSlot={
          <button onClick={() => setShowFields(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Settings2 className="h-3.5 w-3.5" />Configurações
          </button>
        }
        filteredCount={totalFiltered} totalCount={totalAll}
      />

      {/* tabela */}
      <div className="rounded-xl border bg-card shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
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
              erroCarga ? (
                <LoadErrorRow colSpan={orderedColumns.length} onRetry={() => void queryServer()} />
              ) : (
              <tr><td colSpan={orderedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
                {totalAll === 0 ? 'Nenhum contrato cadastrado.' : 'Nenhum contrato encontrado com os filtros aplicados.'}
              </td></tr>
              )
            ) : pageRows.map(r => (
              <tr key={r.id} className="group/row border-b last:border-0 hover:bg-muted/30 transition-colors">
                {orderedColumns.map((col, colIdx) => renderCell(r, col.key, colIdx))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <TablePagination page={page} pageSize={pageSize} total={totalFiltered} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>

    {showFields && <SettingsDrawer onClose={() => setShowFields(false)} />}
    </>
  )
}
