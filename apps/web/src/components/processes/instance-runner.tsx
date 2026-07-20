'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, Loader2, ListChecks, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { DynamicForm } from '@/components/modules/dynamic-form'
import { WorkflowScreenTask } from '@/components/processes/workflow-screen-task'
import { apiFetch, apiJson } from '@/lib/http'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'

interface Task {
  id: string
  nodeId: string
  name?: string | null
  role?: string | null
}

interface Props {
  processDefinitionId: string
  processName: string
  formSchema: ProcessFormSchema
  /** dispara quando a instância conclui (para a lista de instâncias recarregar) */
  onFinished?: () => void
  onClose?: () => void
}

/** Executa uma instância de processo: inicia, mostra a tarefa atual como formulário
 *  (campos por atividade, casados por nodeId), conclui e segue o roteamento do motor
 *  até COMPLETED. Reaproveita o DynamicForm dos módulos. */
export function InstanceRunner({ processDefinitionId, processName, formSchema, onFinished, onClose }: Props) {
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [variables, setVariables] = useState<Record<string, unknown>>({})
  const [completed, setCompleted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Erro de conector de domínio (serviceTask): a instância parou em ERRO.
  const [errored, setErrored] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const startedRef = useRef(false)

  const stepFor = useCallback(
    (nodeId: string): StepFormSchema =>
      formSchema.steps?.find((s) => s.stepId === nodeId) ?? { stepId: nodeId, stepName: nodeId, fields: [] },
    [formSchema],
  )

  const start = useCallback(async () => {
    setError(null)
    const res = await apiFetch('/api/instances', {
      method: 'POST',
      body: JSON.stringify({ processDefinitionId }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.message || 'Não foi possível iniciar o processo.')
      return
    }
    const data = await res.json()
    setInstanceId(data.instance.id)
    setTasks(data.tasks ?? [])
    setVariables(data.instance?.state?.variables ?? {})
    setCompleted(!!data.completed)
    if (data.errored) setErrored(data.errored)
    if (data.completed) onFinished?.()
  }, [processDefinitionId, onFinished])

  // Recarrega as variáveis da instância (para atividades-tela em modo EDIT que dependem
  // de um id produzido por um passo anterior).
  const refreshVariables = useCallback(async (id: string) => {
    const ctx = await apiJson<{ state?: { variables?: Record<string, unknown> } }>(`/api/instances/${id}`)
    setVariables(ctx?.state?.variables ?? {})
  }, [])

  // Inicia UMA vez (guard contra re-execução do efeito — ex.: StrictMode).
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    start()
  }, [start])

  // Reprocessa a etapa automática que falhou (instância em ERRO). Reaproveita a
  // resposta padrão do motor (tasks/completed/errored) para retomar a execução.
  const retry = async () => {
    if (!instanceId) return
    setRetrying(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/instances/${instanceId}/retry`, { method: 'POST' })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível reprocessar.')
        return
      }
      const result = await res.json()
      setErrored(result.errored ?? null)
      setTasks(result.tasks ?? [])
      setCompleted(!!result.completed)
      if (result.completed) onFinished?.()
    } finally {
      setRetrying(false)
    }
  }

  const complete = async (data: Record<string, unknown>) => {
    const active = tasks[0]
    if (!active) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/instances/tasks/${active.id}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ data }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível concluir a tarefa.')
        return
      }
      const result = await res.json()
      setTasks(result.tasks ?? [])
      setCompleted(!!result.completed)
      if (result.errored) setErrored(result.errored)
      if (result.completed || result.errored) onFinished?.()
      else if (instanceId) await refreshVariables(instanceId) // variáveis frescas p/ a próxima etapa
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !instanceId) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-sm font-medium">{error}</p>
        {onClose && (
          <button onClick={onClose} className="mt-3 text-xs text-muted-foreground hover:text-foreground">
            Fechar
          </button>
        )}
      </div>
    )
  }

  if (!instanceId) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Iniciando…
      </div>
    )
  }

  if (errored) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h3 className="text-sm font-semibold">Processo interrompido</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Uma etapa automática de “{processName}” falhou: {errored}
        </p>
        {error && <p className="text-[11px] text-destructive mt-2">{error}</p>}
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={retry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
          >
            {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Tentar novamente
          </button>
          {onClose && (
            <button onClick={onClose} className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
              Fechar
            </button>
          )}
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-sm font-semibold">Processo concluído</h3>
        <p className="text-xs text-muted-foreground mt-1">Todas as etapas de “{processName}” foram executadas.</p>
        {onClose && (
          <button onClick={onClose} className="mt-4 inline-flex items-center rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            Fechar
          </button>
        )}
      </div>
    )
  }

  const active = tasks[0]

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40">
        <ListChecks className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{active?.name || active?.nodeId}</span>
        {active?.role && (
          <span className="text-[11px] text-muted-foreground">· executor: {active.role}</span>
        )}
        {tasks.length > 1 && (
          <span className="ml-auto text-[11px] text-muted-foreground">{tasks.length} tarefas pendentes</span>
        )}
      </div>

      <div className="p-4">
        {error && <p className="text-[11px] text-destructive mb-2">{error}</p>}
        {active && (() => {
          const step = stepFor(active.nodeId)
          // Atividade com TELA → renderiza o cadastro real (cria/edita a entidade).
          return step.screenRef ? (
            <WorkflowScreenTask key={active.id} step={step} variables={variables} onComplete={complete} onCancel={onClose} />
          ) : (
            <DynamicForm
              key={active.id}
              step={step}
              stepIndex={0}
              totalSteps={1}
              submitting={submitting}
              onSubmit={complete}
              onCancel={onClose}
            />
          )
        })()}
      </div>
    </div>
  )
}
