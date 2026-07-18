'use client'

import { useEffect, useState, useCallback } from 'react'
import { ListChecks, Loader2, Inbox, RefreshCw, ChevronRight, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DynamicForm } from '@/components/modules/dynamic-form'
import { apiFetch, apiJson } from '@/lib/http'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'

interface Task {
  id: string
  instanceId: string
  nodeId: string
  name?: string | null
  role?: string | null
  dueAt?: string | null
  createdAt: string
  instance?: { processDefinition?: { name?: string } }
}

interface InstanceContext {
  instance: { processDefinition: { name: string; formSchema: ProcessFormSchema } }
}

export default function TarefasPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [active, setActive] = useState<Task | null>(null)
  const [step, setStep] = useState<StepFormSchema | null>(null)
  const [loadingStep, setLoadingStep] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<Task[]>('/api/instances/tasks')
    setTasks(data ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openTask = async (t: Task) => {
    setActive(t)
    setStep(null)
    setError(null)
    setLoadingStep(true)
    try {
      const ctx = await apiJson<InstanceContext>(`/api/instances/${t.instanceId}`)
      const fs = ctx?.instance?.processDefinition?.formSchema
      const found = fs?.steps?.find((s) => s.stepId === t.nodeId)
      setStep(found ?? { stepId: t.nodeId, stepName: t.name || t.nodeId, fields: [] })
    } finally {
      setLoadingStep(false)
    }
  }

  const complete = async (data: Record<string, unknown>) => {
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
      setActive(null)
      setStep(null)
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Minhas tarefas</h1>
          <p className="text-[11px] text-muted-foreground">Atividades de processos aguardando você</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} title="Recarregar">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        {/* Lista */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Pendentes</span>
            {tasks && <span className="ml-auto text-[11px] text-muted-foreground">{tasks.length}</span>}
          </div>
          {tasks === null ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma tarefa pendente 🎉</p>
            </div>
          ) : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => openTask(t)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors ${
                      active?.id === t.id ? 'bg-muted/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.name || t.nodeId}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {t.instance?.processDefinition?.name || 'Processo'}
                        {t.role ? ` · ${t.role}` : ''}
                      </p>
                    </div>
                    {t.dueAt &&
                      (new Date(t.dueAt) < new Date() ? (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                          <Clock className="h-3 w-3" /> Atrasada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                          <Clock className="h-3 w-3" />
                          vence {new Date(t.dueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ))}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Painel da tarefa selecionada */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {!active ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center px-6 py-10">
              <ListChecks className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Selecione uma tarefa para executá-la</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b bg-muted/40">
                <p className="text-sm font-semibold">{active.name || active.nodeId}</p>
                <p className="text-[11px] text-muted-foreground">
                  {active.instance?.processDefinition?.name}
                  {active.role ? ` · executor: ${active.role}` : ''}
                </p>
              </div>
              <div className="p-4">
                {error && <p className="text-[11px] text-destructive mb-2">{error}</p>}
                {loadingStep || !step ? (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…
                  </div>
                ) : (
                  <DynamicForm
                    key={active.id}
                    step={step}
                    stepIndex={0}
                    totalSteps={1}
                    submitting={submitting}
                    onSubmit={complete}
                    onCancel={() => {
                      setActive(null)
                      setStep(null)
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
