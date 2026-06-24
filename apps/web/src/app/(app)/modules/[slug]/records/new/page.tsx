'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { DynamicForm } from '@/components/modules/dynamic-form'
import type { StepFormSchema } from '@primeapps/types'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ processDefinitionId: string; organizationId: string }>
}

export default function NewRecordPage({ params, searchParams }: PageProps) {
  const { slug } = use(params)
  const { processDefinitionId, organizationId } = use(searchParams)

  const router = useRouter()
  const [instanceId, setInstanceId]   = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<StepFormSchema | null>(null)
  const [stepIndex, setStepIndex]     = useState(0)
  const [totalSteps, setTotalSteps]   = useState(0)
  const [completed, setCompleted]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [started, setStarted]         = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  const startProcess = async () => {
    setSubmitting(true)
    try {
      const res  = await fetch(`${apiUrl}/api/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processDefinitionId, organizationId }),
      })
      const data = await res.json()
      setInstanceId(data.instance.id)
      setCurrentStep(data.currentStep)
      setTotalSteps(data.totalSteps)
      setStepIndex(0)
      setStarted(true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleStepSubmit = async (formData: Record<string, unknown>) => {
    if (!instanceId) return
    setSubmitting(true)
    try {
      const res  = await fetch(`${apiUrl}/api/instances/${instanceId}/advance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData }),
      })
      const data = await res.json()
      if (data.completed) {
        setCompleted(true)
      } else {
        setCurrentStep(data.currentStep)
        setStepIndex(data.stepIndex)
        setTotalSteps(data.totalSteps)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (completed) {
    return (
      <div className="max-w-lg mx-auto mt-10 text-center space-y-3">
        <div className="flex justify-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        </div>
        <h2 className="text-base font-semibold">Registro criado com sucesso!</h2>
        <p className="text-xs text-muted-foreground">
          O processo foi concluído e o registro foi adicionado ao módulo.
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Link
            href={`/modules/${slug}`}
            className="inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Ver módulo
          </Link>
          <button
            onClick={() => { setStarted(false); setCompleted(false); setInstanceId(null) }}
            className="inline-flex items-center gap-1.5 h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors"
          >
            Criar outro
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/modules/${slug}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Novo registro</h1>
          <p className="text-[11px] text-muted-foreground">{slug}</p>
        </div>
      </div>

      {!started ? (
        <div className="rounded-lg border bg-card p-6 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            Clique em iniciar para começar o preenchimento do formulário de {totalSteps || '...'} etapas.
          </p>
          <button
            onClick={startProcess}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Iniciando...' : 'Iniciar preenchimento'}
          </button>
        </div>
      ) : currentStep && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{currentStep.stepName}</span>
              <span className="text-muted-foreground">Etapa {stepIndex + 1} de {totalSteps}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(stepIndex / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          <DynamicForm
            step={currentStep}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            onSubmit={handleStepSubmit}
            onCancel={() => router.push(`/modules/${slug}`)}
            submitting={submitting}
          />
        </div>
      )}
    </div>
  )
}
