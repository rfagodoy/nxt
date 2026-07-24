'use client'

/* Documento de EXECUÇÃO de uma tarefa, aberto como ABA na área de trabalho global
   (MDI) — substitui o antigo drawer lateral de /tarefas. Standalone (o host o
   renderiza) porque Next.js proíbe exportar componentes de um page.tsx de rota. */

import { useEffect, useState } from 'react'
import { Loader2, Info } from 'lucide-react'
import { DynamicForm } from '@/components/modules/dynamic-form'
import { WorkflowScreenTask } from '@/components/processes/workflow-screen-task'
import { ReturnTaskButton } from '@/components/processes/return-task-button'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { dueInfo, kindMeta, DUE_CHIP, TASK_STATUS, type Task, type TimelineTask, type InstanceContext } from '@/lib/tasks-ui'
import type { StepFormSchema } from '@nxt/types'

/** onDone: concluída/devolvida → o host fecha a aba e recarrega o board.
 *  onNotice: mensagem a exibir no board (ex.: etapa automática seguinte falhou). */
export function TaskDocView({ task, onDone, onNotice }: {
  task: Task
  onDone: () => void
  onNotice?: (msg: string) => void
}) {
  const [step, setStep] = useState<StepFormSchema | null>(null)
  const [variables, setVariables] = useState<Record<string, unknown>>({})
  const [timeline, setTimeline] = useState<TimelineTask[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    void (async () => {
      try {
        const ctx = await apiJson<InstanceContext>(`/api/instances/${task.instanceId}`)
        if (cancel) return
        const fs = ctx?.instance?.processDefinition?.formSchema
        const found = fs?.steps?.find((s) => s.stepId === task.nodeId)
        setVariables(ctx?.state?.variables ?? {})
        setTimeline(ctx?.instance?.tasks ?? [])
        setStep(found ?? { stepId: task.nodeId, stepName: task.name || task.nodeId, fields: [] })
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [task.instanceId, task.nodeId, task.name])

  const complete = async (data: Record<string, unknown>) => {
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/instances/tasks/${task.id}/complete`, { method: 'PATCH', body: JSON.stringify({ data }) })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível concluir a tarefa.')
        return
      }
      const result = await res.json().catch(() => null)
      if (result?.errored) onNotice?.(`A etapa automática falhou e o processo foi interrompido: ${result.errored}`)
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  const km = kindMeta(task.instance?.processDefinition?.kind)
  const info = dueInfo(task.dueAt)

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {/* cabeçalho de identidade da tarefa */}
      <div className="flex items-start gap-3 px-1 py-3 border-b shrink-0">
        <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl shrink-0', km.cls)}><km.Icon className="h-5 w-5" /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight leading-snug">{task.name || task.nodeId}</h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            {km.label} · {task.instance?.processDefinition?.name}{task.role ? ` · ${task.role}` : ''}
          </p>
        </div>
        <span className={cn('text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap', DUE_CHIP[info.grp])}>{info.label}</span>
        <ReturnTaskButton taskId={task.id} onReturned={onDone} />
      </div>

      {/* contexto: onde você está no processo */}
      {timeline.length > 1 && (
        <div className="px-1 py-3 border-b">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-2">Onde você está</p>
          <div className="flex flex-col gap-1.5">
            {timeline.map((tl) => {
              const done = tl.status === 'DONE'
              const cur = tl.id === task.id
              return (
                <div key={tl.id} className="flex items-center gap-2.5">
                  <span className={cn('h-2 w-2 rounded-full shrink-0', done ? 'bg-primary' : cur ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/30')} />
                  <span className={cn('text-[12.5px]', cur ? 'font-semibold' : done ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{tl.name || 'Etapa'}</span>
                  {done && tl.completedBy && <span className="text-[11px] text-muted-foreground/70">· {tl.completedBy}</span>}
                  {cur && <span className="ml-auto text-[10px] uppercase tracking-wide text-primary font-semibold">sua vez</span>}
                  {!cur && <span className="ml-auto text-[10px] text-muted-foreground/60">{TASK_STATUS[tl.status] ?? ''}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4">
        {error && <p className="text-[12px] text-destructive mb-2">{error}</p>}
        {loading || !step ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…</div>
        ) : (
          <>
            {step.instructions?.trim() && (
              <div className="mb-3 flex gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80 leading-snug whitespace-pre-line">{step.instructions.trim()}</p>
              </div>
            )}
            {step.screenRef ? (
              <WorkflowScreenTask key={task.id} step={step} variables={variables} onComplete={complete} onCancel={onDone} />
            ) : (
              <DynamicForm key={task.id} step={step} stepIndex={0} totalSteps={1} submitting={submitting} onSubmit={complete} onCancel={onDone} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
