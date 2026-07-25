'use client'

/* Consulta de UMA instância de processo, aberta como ABA na área de trabalho global
   (como contrato/parceiro). Standalone porque o host a renderiza. Substitui o antigo
   modal do Acompanhamento (/processos). Segue o padrão da casa: cabeçalho de
   identidade + seções em card + a linha do tempo numa TABELA densa (header fixo). */

import { useEffect, useState } from 'react'
import { Loader2, User, GitBranch, CheckCircle2, AlertTriangle, Undo2 } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import {
  STATUS, fmt, humanDuration, taskPunctuality, formatSla, taskStatusMeta,
  type Inst, type TaskRow, type ReturnRow,
} from '@/lib/processos-ui'

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

  return (
    <div className="mx-auto flex h-full max-w-[1100px] flex-col gap-3 pb-2">
      {/* identidade da instância */}
      <div className="flex items-start gap-3 shrink-0">
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

      {/* faixa de situação (chips) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] shrink-0">
        {inst.status === 'COMPLETED' && <span className="text-muted-foreground">Concluído em {fmt(inst.completedAt)} · durou {humanDuration(inst.durationMs)}</span>}
        {inst.status === 'ERROR' && inst.error && <span className="text-red-600 dark:text-red-400">{inst.error}</span>}
        {inst.processOnTime != null && (
          <span className={cn('inline-flex items-center gap-1', inst.processOnTime ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {inst.processOnTime ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {inst.processOnTime ? 'no prazo do processo' : 'fora do prazo'}{inst.processDueAt ? ` · prazo ${fmt(inst.processDueAt)}` : ''}
          </span>
        )}
        {inst.returnCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300"><Undo2 className="h-3 w-3" />reaberta {inst.returnCount}×</span>
        )}
      </div>

      {/* devoluções — card no padrão */}
      {returns.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm shrink-0">
          <div className="px-3 py-2 border-b flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <Undo2 className="h-3 w-3" />Devoluções ({returns.length})
          </div>
          <ol className="p-2.5 space-y-2">
            {returns.map((r) => (
              <li key={r.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium">{r.fromName || '—'}</span>
                  <Undo2 className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-medium">{r.toName || '—'}</span>
                </div>
                <p className="text-[12px] text-foreground/80 mt-1 leading-snug">“{r.reason}”</p>
                <p className="text-[11px] text-muted-foreground mt-1">{r.user} · {fmt(r.createdAt)}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* linha do tempo das atividades — TABELA densa (padrão da casa) */}
      <div className="rounded-xl border bg-card shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          Linha do tempo das atividades
        </div>
        <div className="overflow-auto flex-1 min-h-0">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b">
                {['Atividade', 'Início', 'Prazo', 'Data prevista', 'Pontualidade', 'Executor', 'Situação'].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap bg-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks === null ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhuma atividade registrada ainda.</td></tr>
              ) : tasks.map((t) => {
                const p = taskPunctuality(t)
                const sm = taskStatusMeta(t.status)
                const executor = t.completedBy || t.role || t.assignee || '—'
                return (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', sm.dot)} />{t.name || t.nodeId}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{fmt(t.createdAt)}</td>
                    <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{formatSla(t)}</td>
                    <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{fmt(t.dueAt)}</td>
                    <td className={cn('px-3 py-2 align-top whitespace-nowrap', p.cls)}>{p.label}</td>
                    <td className="px-3 py-2 align-top text-muted-foreground">
                      {executor !== '—'
                        ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3 shrink-0" />{executor}</span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', sm.pill)}>{sm.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
