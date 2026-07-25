'use client'

/* Consulta de UMA instância de processo, aberta como ABA na área de trabalho global
   (como contrato/parceiro). Standalone porque o host a renderiza. Substitui o antigo
   modal do Acompanhamento (/processos). */

import { useEffect, useState } from 'react'
import { Loader2, User, GitBranch, CheckCircle2, AlertTriangle, Undo2 } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import {
  STATUS, TASK_STATUS, fmt, humanDuration, taskPunctuality,
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
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {/* identidade da instância */}
      <div className="flex items-start gap-3 px-1 py-3 border-b shrink-0">
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

      {/* linha de situação */}
      <div className="px-1 py-2 border-b flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
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

      <div className="flex-1 overflow-y-auto py-4 px-1">
        {returns.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Undo2 className="h-3 w-3" />Devoluções ({returns.length})
            </p>
            <ol className="space-y-2">
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

        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Linha do tempo das atividades</p>
        {tasks === null ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…</div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma atividade registrada ainda.</p>
        ) : (
          <ol className="space-y-2">
            {tasks.map((t) => {
              const p = taskPunctuality(t)
              const doneCls = t.status === 'DONE' ? 'bg-emerald-500' : t.status === 'RETURNED' ? 'bg-amber-500' : t.status === 'CANCELED' ? 'bg-muted-foreground/40' : 'bg-sky-500'
              return (
                <li key={t.id} className="rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', doneCls)} />
                    <span className="text-sm font-medium flex-1 truncate">{t.name || t.nodeId}</span>
                    <span className="text-[11px] text-muted-foreground">{TASK_STATUS[t.status] ?? t.status}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-y-1 gap-x-3 text-[11px] text-muted-foreground pl-4">
                    {(t.role || t.assignee) && <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.role || t.assignee}</span>}
                    <span>Início: {fmt(t.createdAt)}</span>
                    <span>Prazo: {fmt(t.dueAt)}</span>
                    <span>Conclusão: {fmt(t.completedAt)}</span>
                    {t.completedBy && <span>Por: {t.completedBy}</span>}
                    <span className={p.cls}>Pontualidade: {p.label}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
