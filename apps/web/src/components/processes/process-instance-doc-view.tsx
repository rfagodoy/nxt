'use client'

/* Consulta de UMA instância de processo, aberta como ABA na área de trabalho global
   (como contrato/parceiro). Standalone porque o host a renderiza. Segue o padrão da
   casa: cabeçalho de identidade + seções em card + tabelas densas (header fixo).
   - "Linha do tempo das atividades": estado atual de cada atividade.
   - "Histórico": trilha cronológica (concluída / retrocedida), como Contratos/Parceiros. */

import { useEffect, useState } from 'react'
import { Loader2, User, GitBranch, CheckCircle2, AlertTriangle, Undo2, Clock } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import {
  STATUS, fmt, humanDuration, taskPunctuality, formatSla, taskStatusMeta, buildHistory,
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
  const history = tasks ? buildHistory(tasks, returns) : []

  return (
    <div className="mx-auto h-full max-w-[1100px] overflow-y-auto">
      <div className="flex flex-col gap-3 pb-6">
        {/* identidade da instância */}
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

        {/* faixa de situação (chips) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
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

        {/* linha do tempo das atividades — TABELA densa (padrão da casa) */}
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="px-3 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Linha do tempo das atividades</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
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
                        <span className="inline-flex items-center gap-2 font-medium"><span className={cn('h-2 w-2 rounded-full shrink-0', sm.dot)} />{t.name || t.nodeId}</span>
                      </td>
                      <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{fmt(t.createdAt)}</td>
                      <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{formatSla(t)}</td>
                      <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{fmt(t.dueAt)}</td>
                      <td className={cn('px-3 py-2 align-top whitespace-nowrap', p.cls)}>{p.label}</td>
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {executor !== '—' ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3 shrink-0" />{executor}</span> : '—'}
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
        </section>

        {/* Histórico — trilha de eventos (conclusão / retrocesso), como Contratos/Parceiros */}
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="px-3 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="h-3 w-3" />Histórico
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b">
                  {['Evento', 'Data / Hora', 'Usuário', 'Detalhe'].map((h) => (
                    <th key={h} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap bg-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks === null ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum evento registrado ainda.</td></tr>
                ) : history.map((e) => {
                  const done = e.kind === 'done'
                  return (
                    <tr key={e.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                          done ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                          {done ? <CheckCircle2 className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}
                          {done ? 'Concluída' : 'Retrocedida'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">{fmt(e.ts)}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><User className="h-3 w-3 shrink-0" />{e.user}</span>
                      </td>
                      <td className="px-3 py-2">
                        {done ? (
                          <span className="font-medium">{e.activity}</span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1.5 font-medium">{e.from}<Undo2 className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />{e.to}</span>
                            {e.reason && <span className="block text-[11px] text-muted-foreground italic mt-0.5">motivo: {e.reason}</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
