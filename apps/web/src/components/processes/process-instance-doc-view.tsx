'use client'

/* Consulta de UMA instância de processo, aberta como ABA na área de trabalho global
   (como contrato/parceiro). Standalone porque o host a renderiza. Segue o padrão da
   casa: cabeçalho de identidade + seções em card + tabelas densas COM BUSCA/FILTROS
   (mesmo motor das listas). "Linha do tempo" = estado atual; "Histórico" = trilha de
   eventos (concluída / retrocedida). */

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, User, GitBranch, CheckCircle2, AlertTriangle, Undo2, Clock } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { TableToolbar } from '@/components/list/table-toolbar'
import { filterRows, type FilterRow } from '@/lib/list-filter'
import {
  STATUS, fmt, humanDuration, taskPunctuality, formatSla, taskStatusMeta, buildHistory,
  type Inst, type TaskRow, type ReturnRow, type HistoryEvent,
} from '@/lib/processos-ui'

const execOf = (t: TaskRow) => t.completedBy || t.role || t.assignee || '—'

interface Col<T> { key: string; label: string; get: (r: T) => string; cell: (r: T) => ReactNode }

/** Tabela de seção com busca + filtros (E/OU), no padrão do sistema. */
function FilteredTable<T>({ title, icon, cols, rows, rowKey, emptyText }: {
  title: string; icon: ReactNode
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
      <div className="px-3 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        {icon}{title}
      </div>
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
              <tr key={rowKey(r)} className="border-b last:border-0 hover:bg-muted/30 transition-colors align-top">
                {cols.map((c) => <td key={c.key} className="px-3 py-2 align-top">{c.cell(r)}</td>)}
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

  useEffect(() => {
    let cancel = false
    setTasks(null); setReturns([])
    void (async () => {
      const ctx = await apiJson<{ instance?: { tasks?: TaskRow[] }; returns?: ReturnRow[] }>(`/api/instances/${inst.id}`)
      if (cancel) return
      setTasks(ctx?.instance?.tasks ?? [])
      setReturns(ctx?.returns ?? [])
    })()
    return () => { cancel = true }
  }, [inst.id])

  const st = STATUS[inst.status] ?? STATUS.RUNNING
  const history = tasks ? buildHistory(tasks, returns) : null

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

  // colunas do HISTÓRICO (eventos) — Evento, Atividade, Início, Prazo, Data prevista, Pontualidade, Executor, Detalhe
  const eventLabel = (e: HistoryEvent) => e.kind === 'done' ? 'Concluída' : 'Retrocedida'
  const detailText = (e: HistoryEvent) => e.kind === 'return' ? `para ${e.to || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}` : '—'
  const histCols: Col<HistoryEvent>[] = [
    { key: 'atividade', label: 'Atividade', get: (e) => e.task.name || e.task.nodeId, cell: (e) => <span className="font-medium">{e.task.name || e.task.nodeId}</span> },
    { key: 'inicio', label: 'Início', get: (e) => fmt(e.task.createdAt), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{fmt(e.task.createdAt)}</span> },
    { key: 'prazo', label: 'Prazo', get: (e) => formatSla(e.task), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{formatSla(e.task)}</span> },
    { key: 'prevista', label: 'Data prevista', get: (e) => fmt(e.task.dueAt), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{fmt(e.task.dueAt)}</span> },
    { key: 'pontualidade', label: 'Pontualidade', get: (e) => taskPunctuality(e.task).label, cell: (e) => <span className={cn('whitespace-nowrap', taskPunctuality(e.task).cls)}>{taskPunctuality(e.task).label}</span> },
    { key: 'executor', label: 'Executor', get: (e) => execOf(e.task), cell: (e) => execOf(e.task) !== '—' ? <span className="inline-flex items-center gap-1 text-muted-foreground"><User className="h-3 w-3 shrink-0" />{execOf(e.task)}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'situacao', label: 'Situação', get: eventLabel,
      cell: (e) => <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap',
        e.kind === 'done' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
        {e.kind === 'done' ? <CheckCircle2 className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}{eventLabel(e)}</span> },
    { key: 'detalhe', label: 'Detalhe', get: detailText,
      cell: (e) => e.kind === 'return'
        ? <span className="text-muted-foreground"><Undo2 className="h-3 w-3 inline mr-1 text-amber-600 dark:text-amber-400" />para <span className="font-medium text-foreground">{e.to || '—'}</span>{e.reason && <span className="block text-[11px] italic mt-0.5">motivo: {e.reason}</span>}</span>
        : <span className="text-muted-foreground">—</span> },
  ]

  return (
    <div className="mx-auto h-full max-w-[1200px] overflow-y-auto">
      <div className="flex flex-col gap-3 pb-6">
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

        {/* chips de situação */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          {inst.status === 'COMPLETED' && <span className="text-muted-foreground">Concluído em {fmt(inst.completedAt)} · durou {humanDuration(inst.durationMs)}</span>}
          {inst.status === 'ERROR' && inst.error && <span className="text-red-600 dark:text-red-400">{inst.error}</span>}
          {inst.processOnTime != null && (
            <span className={cn('inline-flex items-center gap-1', inst.processOnTime ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {inst.processOnTime ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {inst.processOnTime ? 'no prazo do processo' : 'fora do prazo'}{inst.processDueAt ? ` · prazo ${fmt(inst.processDueAt)}` : ''}
            </span>
          )}
          {inst.returnCount > 0 && <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300"><Undo2 className="h-3 w-3" />reaberta {inst.returnCount}×</span>}
        </div>

        <FilteredTable title="Linha do tempo das atividades" icon={<GitBranch className="h-3 w-3" />}
          cols={timelineCols} rows={tasks} rowKey={(t) => t.id} emptyText="Nenhuma atividade registrada ainda." />

        <FilteredTable title="Histórico" icon={<Clock className="h-3 w-3" />}
          cols={histCols} rows={history} rowKey={(e) => e.key} emptyText="Nenhum evento registrado ainda." />
      </div>
    </div>
  )
}
