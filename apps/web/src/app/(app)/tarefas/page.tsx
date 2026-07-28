'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, AlertTriangle, X, CheckCircle2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/workspace-context'
import { dueInfo, kindMeta, COLUMNS, DUE_CHIP, type Task, type Grp, valorCurto } from '@/lib/tasks-ui'

export default function TarefasPage() {
  const ws = useWorkspace()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [notice, setNotice] = useState<{ msg: string; tom: 'aviso' | 'sucesso' } | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<Task[]>('/api/instances/tasks')
    setTasks(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  // A execução da tarefa acontece numa ABA (área de trabalho global). Ao concluir ou
  // devolver, o host fecha a aba e dispara 'nxt:workspace:refresh' → recarrega o board;
  // um erro da etapa automática seguinte chega por 'nxt:tasks:notice'.
  useEffect(() => {
    const onRefresh = () => void load()
    const onNotice = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; tom: 'aviso' | 'sucesso' } | string>).detail
      if (!d) return setNotice(null)
      setNotice(typeof d === 'string' ? { msg: d, tom: 'aviso' } : d)
      /* Confirmação de sucesso se recolhe sozinha: ela fecha o ciclo e sai de cena.
         Aviso de FALHA fica até a pessoa dispensar — quem precisa agir não pode
         perder a mensagem por não estar olhando. */
      if (typeof d !== 'string' && d.tom === 'sucesso') setTimeout(() => setNotice(null), 6000)
    }
    window.addEventListener('nxt:workspace:refresh', onRefresh)
    window.addEventListener('nxt:tasks:notice', onNotice as EventListener)
    return () => {
      window.removeEventListener('nxt:workspace:refresh', onRefresh)
      window.removeEventListener('nxt:tasks:notice', onNotice as EventListener)
    }
  }, [load])

  /** Abre a tarefa como documento na área de trabalho (padrão MDI da casa). */
  const openTask = (t: Task) =>
    ws.open({ id: `task:${t.id}`, kind: 'task', mode: 'detail', label: t.name || t.nodeId, data: t })

  const stats = useMemo(() => {
    const r = tasks ?? []
    let crit = 0, warn = 0
    r.forEach((t) => { const g = dueInfo(t.dueAt).grp; if (g === 'crit') crit++; else if (g === 'warn') warn++ })
    return { total: r.length, crit, warn }
  }, [tasks])

  const byGroup = useMemo(() => {
    const g: Record<Grp, Task[]> = { crit: [], warn: [], week: [] }
    ;(tasks ?? []).forEach((t) => g[dueInfo(t.dueAt).grp].push(t))
    return g
  }, [tasks])

  return (
    <div className="flex h-full flex-col gap-3">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Tarefas</h1>
          <p className="text-[11px] text-muted-foreground">Suas tarefas, priorizadas por prazo</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* cards de resumo (padrão das listas) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Total',       value: stats.total,        cls: 'text-foreground' },
          { label: 'Atrasadas',   value: stats.crit,         cls: 'text-red-600 dark:text-red-400' },
          { label: 'Vencem hoje', value: stats.warn,         cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Próximas',    value: byGroup.week.length, cls: 'text-primary' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('text-sm font-bold tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      {notice && (
        <div className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]',
          notice.tom === 'sucesso'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        )}>
          {notice.tom === 'sucesso'
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 hover:opacity-70" title="Dispensar"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* board */}
      {tasks === null ? (
        <div className="flex items-center justify-center py-16 text-xs text-muted-foreground xl:flex-1"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-sm flex items-center justify-center xl:flex-1 xl:min-h-0">
          <EmptyState icon={CheckCircle2} tone="success" size="lg" title="Tudo em dia! 🎉" description="Nenhuma tarefa aguardando você." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 xl:grid-rows-1 gap-3 items-start xl:items-stretch xl:flex-1 xl:min-h-0">
          {COLUMNS.map((col) => {
            const items = byGroup[col.key]
            return (
              <div key={col.key} className="rounded-xl border bg-muted/30 p-2.5 flex flex-col gap-2 min-h-[120px] xl:min-h-0">
                <div className="flex items-center gap-2 px-1 pt-1 pb-0.5 shrink-0">
                  <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground bg-card border rounded-md px-1.5 py-0.5 tabular-nums">{items.length}</span>
                </div>
                {/* Rola em qualquer largura — não só em telas grandes — e com a barra
                    VISÍVEL: sem ela o último cartão fica cortado na borda e nada indica
                    que há mais tarefas embaixo. */}
                <div className="rolagem-visivel flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1.5 xl:max-h-none xl:flex-1 xl:min-h-0">
                {items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 text-center py-3">vazio</p>
                ) : items.map((t) => {
                  const info = dueInfo(t.dueAt)
                  const m = kindMeta(t.instance?.processDefinition?.kind)
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTask(t)}
                      className="group relative text-left w-full bg-card border rounded-xl p-3 pl-3.5 shadow-sm overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30"
                    >
                      <span className={cn('absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full', col.rail)} />
                      {/* `items-start` + quebra livre: o nome da tarefa é o dado
                          principal do cartão e não pode ser o primeiro a ser cortado.
                          O cartão cresce; a coluna é que rola. */}
                      <div className="flex items-start gap-2.5 mb-2">
                        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', m.cls)}><m.Icon className="h-4 w-4" /></span>
                        <span className="text-sm font-medium leading-snug break-words min-w-0">{t.name || t.nodeId}</span>
                      </div>
                      {/* Sobre o que é a tarefa: sem isto, duas tarefas do mesmo prazo
                          chegam com o mesmo peso — a de R$ 4 mil e a de R$ 400 mil. */}
                      {t.assunto && (
                        <p className="mb-1.5 text-[11px] leading-snug text-foreground/80 break-words" title={t.assunto.titulo}>
                          {t.assunto.contraparte ?? t.assunto.titulo}
                          {valorCurto(t.assunto.valor, t.assunto.moeda) && (
                            <span className="ml-1.5 font-semibold tabular-nums">{valorCurto(t.assunto.valor, t.assunto.moeda)}</span>
                          )}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap tabular-nums', DUE_CHIP[info.grp])}>{info.label}</span>
                        {t.instance?.numero != null && <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{t.instance.numero}</span>}
                        <span className="text-[11px] text-muted-foreground break-words min-w-0 flex-1">{t.instance?.processDefinition?.name || 'Processo'}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  )
                })}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
