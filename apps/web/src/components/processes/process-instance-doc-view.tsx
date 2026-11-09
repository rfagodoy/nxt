'use client'

/* Consulta de UMA instância de processo, aberta como ABA na área de trabalho global
   (como contrato/parceiro). Standalone porque o host a renderiza. Segue o padrão da
   casa: cabeçalho de identidade + seções em card + tabelas densas COM BUSCA/FILTROS
   (mesmo motor das listas). "Linha do tempo" = estado atual; "Histórico" = trilha de
   eventos (concluída / retrocedida). */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Loader2, User, GitBranch, CheckCircle2, Undo2, Clock, UserPlus, Ban, RotateCcw, AlertTriangle } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { useAoVivo } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import { DENS_CEL, DENS_CAB, DENS_TABELA } from '@/lib/densidade'
import { TableToolbar } from '@/components/list/table-toolbar'
import { filterRows, type FilterRow } from '@/lib/list-filter'
import {
  STATUS, fmt, humanDuration, taskPunctuality, formatSla, taskStatusMeta, buildHistory, taskExecutor,
  type Inst, type TaskRow, type ReturnRow, type EventRow, type HistoryEvent,
} from '@/lib/processos-ui'

const execOf = (t: TaskRow) => taskExecutor(t)

interface Col<T> { key: string; label: string; get: (r: T) => string; cell: (r: T) => ReactNode }

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
    <section className="rounded-xl border bg-card p-[var(--secao-pad)] space-y-[var(--form-gap)] shadow-sm">
      <TableToolbar search={search} onSearch={setSearch} columns={cols} filters={filters} onFiltersChange={setFilters}
        logic={logic} onLogicChange={setLogic} filteredCount={filtered.length} totalCount={rows?.length ?? 0} />
      <div className="rounded-lg border overflow-x-auto">
        <table className={cn('w-full', DENS_TABELA)}>
          <thead>
            <tr className="border-b bg-[hsl(240_5%_97%)] dark:bg-[hsl(240_21%_15%)]">
              {cols.map((c) => <th key={c.key} className={cn('text-left font-medium text-muted-foreground whitespace-nowrap', DENS_CAB)}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-xs text-muted-foreground">{rows.length === 0 ? emptyText : 'Nenhum registro com os filtros aplicados.'}</td></tr>
            ) : filtered.map((r) => (
              <tr key={rowKey(r)} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {cols.map((c) => <td key={c.key} className={cn(DENS_CEL, 'align-middle')}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ProcessInstanceDocView({ inst: instAoAbrir, onClose }: { inst: Inst; onClose?: () => void }) {
  /** a linha da instância RELIDA (a da aba é a foto do momento em que ela abriu) */
  const [instViva, setInstViva] = useState<Inst | null>(null)
  const inst = instViva?.id === instAoAbrir.id ? instViva : instAoAbrir
  const [tasks, setTasks] = useState<TaskRow[] | null>(null)
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  // Sub-aba ativa (padrão contrato/parceiro): sempre abre em "Andamento"; o Histórico
  // é destino deliberado — sinalizado por um contador/realce, mas nunca aberto sozinho.
  const [tab, setTab] = useState<'andamento' | 'historico'>('andamento')


  /* Acompanhamento AO VIVO (PO, 04/10/2026): a aba lia a instância uma vez só, ao abrir —
     concluir as tarefas em outras abas deixava tudo "Pendente" aqui, e as atividades que
     nasceram depois (ex.: a 2ª validação do RH) nem apareciam. Agora relê a cada escrita
     da organização (tempo real) e ao voltar para a aba. */
  const id = instAoAbrir.id
  const carregar = useCallback(async (inicial: boolean) => {
    const [ctx, linha] = await Promise.all([
      apiJson<{ instance?: { tasks?: TaskRow[] }; returns?: ReturnRow[]; events?: EventRow[] }>(`/api/instances/${id}`),
      apiJson<Inst[]>(`/api/instances?id=${encodeURIComponent(id)}`),
    ])
    if (linha?.[0]?.id === id) setInstViva(linha[0])
    if (!ctx) { if (inicial) setTasks([]); return } // falha numa releitura não apaga o que já está na tela
    setTasks(ctx.instance?.tasks ?? [])
    setReturns(ctx.returns ?? [])
    setEvents(ctx.events ?? [])
  }, [id])

  useEffect(() => {
    setTasks(null); setReturns([]); setEvents([])
    void carregar(true)
  }, [carregar])
  useAoVivo(() => { void carregar(false) })

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
    blocked:  { label: 'Conclusão recusada', icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  }
  const activityOf = (e: HistoryEvent) => e.task ? (e.task.name || e.task.nodeId) : (e.label || '—')
  const detailText = (e: HistoryEvent) =>
    e.kind === 'return'   ? `para ${e.to || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'delegate' ? `de ${e.from || 'tarefa aberta'} para ${e.to || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'cancel'   ? `cancelado por ${e.by || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'reopen'   ? `reaberto por ${e.by || '—'}${e.reason ? ` · motivo: ${e.reason}` : ''}`
    : e.kind === 'blocked'  ? `${e.by || '—'} tentou concluir · ${e.reason ?? ''}`
    : '—'
  const histCols: Col<HistoryEvent>[] = [
    { key: 'atividade', label: 'Atividade', get: activityOf, cell: (e) => <span className="font-medium">{activityOf(e)}</span> },
    { key: 'inicio', label: 'Início', get: (e) => fmt(e.task?.createdAt), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{fmt(e.task?.createdAt)}</span> },
    { key: 'prazo', label: 'Prazo', get: (e) => e.task ? formatSla(e.task) : '—', cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{e.task ? formatSla(e.task) : '—'}</span> },
    { key: 'prevista', label: 'Data prevista', get: (e) => fmt(e.task?.dueAt), cell: (e) => <span className="text-muted-foreground whitespace-nowrap">{fmt(e.task?.dueAt)}</span> },
    { key: 'pontualidade', label: 'Pontualidade', get: (e) => e.task ? taskPunctuality(e.task).label : '—',
      cell: (e) => e.task ? <span className={cn('whitespace-nowrap', taskPunctuality(e.task).cls)}>{taskPunctuality(e.task).label}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'executor', label: 'Executor', get: (e) => e.task ? execOf(e.task) : (e.by || '—'),
      cell: (e) => {
        const who = e.task ? execOf(e.task) : (e.by || '—')
        return who !== '—' ? <span className="inline-flex items-center gap-1 text-muted-foreground"><User className="h-3 w-3 shrink-0" />{who}</span> : <span className="text-muted-foreground">—</span>
      } },
    { key: 'situacao', label: 'Situação', get: (e) => EVENT_META[e.kind].label,
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
            {e.kind === 'blocked' && <><span className="font-medium text-foreground">{e.by || '—'}</span> tentou concluir</>}
            {e.reason && <span className="block text-[11px] italic mt-0.5">{e.kind === 'blocked' ? e.reason : <>motivo: {e.reason}</>}</span>}
          </span>
        )
      } },
  ]

  const hasReturn = inst.returnCount > 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* cabeçalho fixo: identidade + avisos + sub-abas (padrão de contrato/parceiro) */}
      <div className="shrink-0 space-y-3">
        {/* identidade */}
        <div className="rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-4 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold truncate max-w-[460px]">{inst.processName}</h2>
              {/* o selo não pode dizer "Em andamento" ao lado da faixa "Processo parado" */}
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                inst.status === 'RUNNING' && inst.bloqueio ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : st.cls)}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {inst.status === 'RUNNING' && inst.bloqueio ? 'Parado' : st.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
              {inst.numero != null && <>
                <span className="font-mono">#{inst.numero}</span>
                <span className="text-muted-foreground/40">·</span>
              </>}
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">v{inst.version}</span>
              <span className="text-muted-foreground/40">·</span>
              <span>Iniciado por {inst.startedBy || '—'} em {fmt(inst.startedAt)}</span>
            </div>
            {/* como terminou — só conclusão/erro (prazo do processo e "reaberta N×" foram
                removidos a pedido; o detalhe de retrocesso vive no Histórico). */}
            {(inst.status === 'COMPLETED' || inst.status === 'ENDED_INCOMPLETE' || (inst.status === 'ERROR' && inst.error) || (inst.status === 'CANCELLED' && inst.cancelReason)) && (
              <p className="mt-1 text-[11px]">
                {inst.status === 'COMPLETED' && <span className="text-muted-foreground">Concluído em {fmt(inst.completedAt)} · durou {humanDuration(inst.durationMs)}</span>}
                {/* Acabou o que havia para fazer sem passar pelo evento de fim: quem consulta
                    precisa ler isso na cara do documento, não deduzir do silêncio. */}
                {inst.status === 'ENDED_INCOMPLETE' && (
                  <span className="text-amber-600 dark:text-amber-400">
                    Encerrado sem conclusão em {fmt(inst.completedAt)} · durou {humanDuration(inst.durationMs)} — nenhum caminho passou pelo fim do processo
                  </span>
                )}
                {inst.status === 'ERROR' && inst.error && <span className="text-red-600 dark:text-red-400">{inst.error}</span>}
                {/* cancelamento sem motivo à vista é um fim de linha inexplicável */}
                {inst.status === 'CANCELLED' && inst.cancelReason && (
                  <span className="text-muted-foreground">Cancelado por {inst.cancelledBy || '—'} em {fmt(inst.cancelledAt)} · motivo: <span className="italic">{inst.cancelReason}</span></span>
                )}
              </p>
            )}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>
          )}
        </div>
        {inst.bloqueio && (
          /* PARADO numa escolha sem caminho: dizer onde, por quê e o que fazer */
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Processo parado{inst.bloqueio.tarefa ? <> em “{inst.bloqueio.tarefa}”</> : null}</p>
              <p className="mt-0.5">{inst.bloqueio.mensagem}</p>
              <p className="mt-1 text-[11px] opacity-80">{inst.bloqueio.por} tentou concluir em {fmt(inst.bloqueio.em)}. A atividade continua com quem a executa; depois do ajuste, é só concluir de novo.</p>
            </div>
          </div>
        )}

        {inst.status === 'RUNNING' && !inst.bloqueio && !!inst.aguardando?.length && (
          /* a linha principal já chegou ao Fim: dizer por que o processo ainda não encerrou */
          <p role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">Aguardando: {inst.aguardando.join(', ')}.</span> A linha principal já terminou. O processo encerra quando as linhas paralelas forem concluídas.
          </p>
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
              tab === 'historico' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              history?.length === 0 && tab !== 'historico' && 'opacity-55')}>
            <Clock className="h-3.5 w-3.5" />Histórico
            {history && history.length > 0 && (
              <span className={cn('ml-0.5 rounded px-1 text-[10px] font-bold tabular-nums',
                hasReturn ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-muted text-foreground/70')}>
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* corpo ROLÁVEL — só a sub-aba ativa */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-3">
        {tab === 'andamento' ? (
          <FilteredTable cols={timelineCols} rows={tasks} rowKey={(t) => t.id} emptyText="Nenhuma atividade registrada ainda." />
        ) : (
          <FilteredTable cols={histCols} rows={history} rowKey={(e) => e.key} emptyText="Nenhum evento registrado ainda." />
        )}
      </div>
    </div>
  )
}
