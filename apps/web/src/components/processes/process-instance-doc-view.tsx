'use client'

/* Consulta de UMA instância de processo, aberta como ABA na área de trabalho global
   (como contrato/parceiro). Standalone porque o host a renderiza. Segue o padrão da
   casa: cabeçalho de identidade + seções em card + tabelas densas COM BUSCA/FILTROS
   (mesmo motor das listas). "Linha do tempo" = estado atual; "Histórico" = trilha de
   eventos (concluída / retrocedida). */

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, User, GitBranch, CheckCircle2, Undo2, Clock, UserPlus, Ban, RotateCcw } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { TableToolbar } from '@/components/list/table-toolbar'
import { filterRows, type FilterRow } from '@/lib/list-filter'
import {
  STATUS, fmt, humanDuration, taskPunctuality, formatSla, taskStatusMeta, buildHistory, taskExecutor,
  type Inst, type TaskRow, type ReturnRow, type EventRow, type HistoryEvent,
} from '@/lib/processos-ui'

const execOf = (t: TaskRow) => taskExecutor(t)

interface Col<T> { key: string; label: string; get: (r: T) => string; cell: (r: T) => ReactNode; vcenter?: boolean }

/** Tabela de seção com busca + filtros (E/OU), no padrão do sistema. Sem título
 *  próprio — o rótulo é a sub-aba que a contém (padrão de contrato/parceiro). */
function FilteredTable<T>({ cols, rows, rowKey, emptyText }: {
  cols: Col<T>[]
  rows: T[] | null
  rowKey: (r: T) => string
  emptyText: string
}) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const filtered = rows ? filterRows(rows, cols, search, filters, logic) : []

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="px-3 pt-2.5">
        <TableToolbar search={search} onSearch={setSearch} columns={cols} filters={filters} onFiltersChange={setFilters}
          logic={logic} onLogicChange={setLogic} filteredCount={filtered.length} totalCount={rows?.length ?? 0} />
      </div>
      <div className="overflow-x-auto mt-2">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b">
              {cols.map((c) => <th key={c.key} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap bg-muted">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-xs text-muted-foreground">{rows.length === 0 ? emptyText : 'Nenhum registro com os filtros aplicados.'}</td></tr>
            ) : filtered.map((r) => (
              <tr key={rowKey(r)} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {cols.map((c) => <td key={c.key} className={cn('px-3 py-2', c.vcenter ? 'align-middle' : 'align-top')}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ProcessInstanceDocView({ inst }: { inst: Inst }) {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null)
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  // Sub-aba ativa (padrão contrato/parceiro): sempre abre em "Andamento"; o Histórico
  // é destino deliberado — sinalizado por um contador/realce, mas nunca aberto sozinho.
  const [tab, setTab] = useState<'andamento' | 'historico'>('andamento')

  useEffect(() => {
    let cancel = false
    setTasks(null); setReturns([]); setEvents([])
    void (async () => {
      const ctx = await apiJson<{ instance?: { tasks?: TaskRow[] }; returns?: ReturnRow[]; events?: EventRow[] }>(`/api/instances/${inst.id}`)
      if (cancel) return
      setTasks(ctx?.instance?.tasks ?? [])
      setReturns(ctx?.returns ?? [])
      setEvents(ctx?.events ?? [])
    })()
    return () => { cancel = true }
  }, [inst.id])

  const st = STATUS[inst.status] ?? STATUS.RUNNING
  const history = tasks ? buildHistory(tasks, returns, events) : null

  // colunas da LINHA DO TEMPO (estado das atividades)
  const timelineCols: Col<TaskRow>[] = [
    { key: 'atividade', label: 'Atividade', get: (t) => t.name || t.nodeId,
      cell: (t) => <span className="inline-flex items-center gap-2 font-medium"><span className={cn('h-2 w-2 rounded-full shrink-0', taskStatusMeta(t.status).dot)} />{t.name || t.nodeId}</span> },
    { key: 'inicio', label: 'Início', get: (t) => fmt(t.createdAt), cell: (t) => <span className="text-muted-foreground whitespace-nowrap">{fmt(t.createdAt)}</span> },
    { key: 'prazo', label: 'Prazo', get: (t) => formatSla(t), cell: (t) => <span className="text-muted-foreground whitespace-nowrap">{formatSla(t)}</span> },
    { key: 'prevista', label: 'Data prevista', get: (t) => fmt(t.dueAt), cell: (t) => <span className="text-muted-foreground whitespace-nowrap">{fmt(t.dueAt)}</span> },
    { key: 'pontualidade', label: 'Pontualidade', get: (t) => taskPunctuality(t).label, cell: (t) => <span className={cn('whitespace-nowrap', taskPunctuality(t).cls)}>{taskPunctuality(t).label}</span> },
    { key: 'executor', label: 'Executor', get: (t) => execOf(t), cell: (t) => execOf(t) !== '—' ? <span className="inline-flex items-center gap-1 text-muted-foreground"><User className="h-3 w-3 shrink-0" />{execOf(t)}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'situacao', label: 'Situação', get: (t) => taskStatusMeta(t.status).label, cell: (t) => <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', taskStatusMeta(t.status).pill)}>{taskStatusMeta(t.status).label}</span> },
  ]

  // colunas do HISTÓRICO (eventos) — Evento, Atividade, Início, Prazo, Data prevista, Pontualidade, Executor, Detalhe.
  // Delegação e cancelamento entram na mesma tabela: o cancelamento é da INSTÂNCIA (não
  // tem atividade), então as colunas de tarefa caem para "—" em vez de sumir a linha.
  const EVENT_META: Record<HistoryEvent['kind'], { label: string; icon: typeof CheckCircle2; cls: string }> = {
    done:     { label: 'Concluída',   icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    return:   { label: 'Retrocedida', icon: Undo2,        cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    delegate: { label: 'Delegada',    icon: UserPlus,     cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
    cancel:   { label: 'Cancelado',   icon: Ban,          cls: 'bg-muted text-muted-foreground' },
    reopen:   { label: 'Reaberto',    icon: RotateCcw,    cls: 'bg-primary/10 text-primary' },
  }
  const activityOf = (e: HistoryEvent) => e.task ? (e.task.name || e.task.nodeId) : (e.label || '—')
  const detailText = (e: HistoryEvent) =>
    e.kind === 'return'   ? `para ${e.to || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'delegate' ? `de ${e.from || 'tarefa aberta'} para ${e.to || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'cancel'   ? `cancelado por ${e.by || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'reopen'   ? `reaberto por ${e.by || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : '—'
  const histCols: Col<HistoryEvent>[] = [
    { key: 'atividade', label: 'Atividade', vcenter: true, get: activityOf, cell: (e) => <span className="font-medium">{activityOf(e)}</span> },
    { key: 'inicio', label: 'Início', vcenter: true, get: (e) => fmt(e.task?.createdAt), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{fmt(e.task?.createdAt)}</span> },
    { key: 'prazo', label: 'Prazo', vcenter: true, get: (e) => e.task ? formatSla(e.task) : '—', cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{e.task ? formatSla(e.task) : '—'}</span> },
    { key: 'prevista', label: 'Data prevista', vcenter: true, get: (e) => fmt(e.task?.dueAt), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{fmt(e.task?.dueAt)}</span> },
    { key: 'pontualidade', label: 'Pontualidade', vcenter: true, get: (e) => e.task ? taskPunctuality(e.task).label : '—',
      cell: (e) => e.task ? <span className={cn('whitespace-nowrap', taskPunctuality(e.task).cls)}>{taskPunctuality(e.task).label}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'executor', label: 'Executor', vcenter: true, get: (e) => e.task ? execOf(e.task) : (e.by || '—'),
      cell: (e) => {
        const who = e.task ? execOf(e.task) : (e.by || '—')
        return who !== '—' ? <span className="inline-flex items-center gap-1 text-muted-foreground"><User className="h-3 w-3 shrink-0" />{who}</span> : <span className="text-muted-foreground">—</span>
      } },
    { key: 'situacao', label: 'Situação', vcenter: true, get: (e) => EVENT_META[e.kind].label,
      cell: (e) => {
        const m = EVENT_META[e.kind]
        return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap', m.cls)}>
          <m.icon className="h-3 w-3" />{m.label}</span>
      } },
    { key: 'detalhe', label: 'Detalhe', get: detailText,
      cell: (e) => {
        if (e.kind === 'done') return <span className="text-muted-foreground">—</span>
        const m = EVENT_META[e.kind]
        return (
          <span className="text-muted-foreground">
            <m.icon className={cn('h-3 w-3 inline mr-1', e.kind === 'return' ? 'text-amber-600 dark:text-amber-400' : e.kind === 'delegate' ? 'text-sky-600 dark:text-sky-400' : '')} />
            {e.kind === 'return' && <>para <span className="font-medium text-foreground">{e.to || '—'}</span></>}
            {e.kind === 'delegate' && <>de <span className="font-medium text-foreground">{e.from || 'tarefa aberta'}</span> para <span className="font-medium text-foreground">{e.to || '—'}</span></>}
            {e.kind === 'cancel' && <>cancelado por <span className="font-medium text-foreground">{e.by || '—'}</span></>}
            {e.kind === 'reopen' && <>reaberto por <span className="font-medium text-foreground">{e.by || '—'}</span></>}
            {e.reason && <span className="block text-[11px] italic mt-0.5">motivo: {e.reason}</span>}
          </span>
        )
      } },
  ]

  const hasReturn = inst.returnCount > 0

  return (
    <div className="mx-auto h-full max-w-[1200px] flex flex-col">
      {/* cabeçalho FIXO: identidade + situação + sub-abas (não rola) */}
      <div className="flex flex-col gap-3 shrink-0">
        {/* identidade */}
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0 bg-primary/10 text-primary"><GitBranch className="h-5 w-5" /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold tracking-tight leading-snug">
              {inst.numero != null && <span className="font-mono text-muted-foreground">#{inst.numero} </span>}
              {inst.processName} <span className="text-[11px] text-muted-foreground font-normal">v{inst.version}</span>
            </h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">Iniciado por {inst.startedBy || '—'} em {fmt(inst.startedAt)}</p>
          </div>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0', st.cls)}>
            <st.icon className="h-3 w-3" />{st.label}
          </span>
        </div>

        {/* chips de situação — só conclusão/erro (prazo do processo e "reaberta N×"
            foram removidos a pedido; o detalhe de retrocesso vive no Histórico). */}
        {(inst.status === 'COMPLETED' || (inst.status === 'ERROR' && inst.error) || (inst.status === 'CANCELLED' && inst.cancelReason)) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
            {inst.status === 'COMPLETED' && <span className="text-muted-foreground">Concluído em {fmt(inst.completedAt)} · durou {humanDuration(inst.durationMs)}</span>}
            {inst.status === 'ERROR' && inst.error && <span className="text-red-600 dark:text-red-400">{inst.error}</span>}
            {/* cancelamento sem motivo à vista é um fim de linha inexplicável */}
            {inst.status === 'CANCELLED' && inst.cancelReason && (
              <span className="text-muted-foreground">Cancelado por {inst.cancelledBy || '—'} em {fmt(inst.cancelledAt)} · motivo: <span className="italic">{inst.cancelReason}</span></span>
            )}
          </div>
        )}

        {/* sub-abas: Andamento (estado atual) | Histórico (trilha de auditoria). O
            Histórico ganha um contador; quando houve retrocesso o badge fica âmbar
            para sinalizar "aqui há o que consultar" sem trocar de aba automaticamente. */}
        <div className="flex items-center gap-1 flex-wrap border-b pb-2">
          <button type="button" onClick={() => setTab('andamento')}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === 'andamento' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            <GitBranch className="h-3.5 w-3.5" />Andamento
          </button>
          <button type="button" onClick={() => setTab('historico')}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === 'historico' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            <Clock className="h-3.5 w-3.5" />Histórico
            {history && history.length > 0 && (
              <span className={cn('ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 h-4 min-w-4 text-[10px] font-semibold tabular-nums',
                hasReturn ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-muted-foreground/15 text-muted-foreground')}>
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* corpo ROLÁVEL — só a sub-aba ativa */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-3 pb-6">
        {tab === 'andamento' ? (
          <FilteredTable cols={timelineCols} rows={tasks} rowKey={(t) => t.id} emptyText="Nenhuma atividade registrada ainda." />
        ) : (
          <FilteredTable cols={histCols} rows={history} rowKey={(e) => e.key} emptyText="Nenhum evento registrado ainda." />
        )}
      </div>
    </div>
  )
}
