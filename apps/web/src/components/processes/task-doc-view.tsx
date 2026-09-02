'use client'

/* Documento de EXECUÇÃO de uma tarefa, aberto como ABA na área de trabalho global
   (MDI) — substitui o antigo drawer lateral de /tarefas. Standalone (o host o
   renderiza) porque Next.js proíbe exportar componentes de um page.tsx de rota. */

import { useEffect, useState } from 'react'
import { Loader2, ArrowRight, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DynamicForm } from '@/components/modules/dynamic-form'
import { WorkflowScreenTask } from '@/components/processes/workflow-screen-task'
import { ProcessTrail } from '@/components/processes/process-trail'
import { ActivityHeader } from '@/components/processes/activity-header'
import { ReturnTaskButton, type ReturnTarget } from '@/components/processes/return-task-button'
import { DelegateTaskButton } from '@/components/processes/delegate-task-button'
import { apiFetch, apiJson } from '@/lib/http'
import { screenIdVar, screenEntityFromVars, screenBloqueio } from '@/lib/screen-task'
import { cn } from '@/lib/utils'
import { kindMeta, dueInfo, DUE_CHIP, type Task, type TimelineTask, type InstanceContext } from '@/lib/tasks-ui'
import type { StepFormSchema } from '@nxt/types'

const FORM_ID = 'task-advance-form'

/** onDone: concluída/devolvida → o host fecha a aba e recarrega o board.
 *  onNotice: mensagem a exibir no board. O tom importa: a aba FECHA ao concluir, então
 *  esta é a única confirmação que a pessoa recebe — sem ela, o trabalho some da tela e
 *  resta abrir Processos para conferir se de fato avançou. */
export function TaskDocView({ task, onDone, onNotice }: {
  task: Task
  onDone: () => void
  onNotice?: (msg: string, tom?: 'aviso' | 'sucesso') => void
}) {
  const [step, setStep] = useState<StepFormSchema | null>(null)
  const [timeline, setTimeline] = useState<TimelineTask[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [returnTargets, setReturnTargets] = useState<ReturnTarget[] | null>(null)
  // id da entidade criada/editada por uma tarefa dirigida por Tela (para o "Avançar")
  const [entityId, setEntityId] = useState<string | null>(null)

  const isScreen = !!step?.screenRef
  const idVar = screenIdVar(step ?? {})

  useEffect(() => {
    let cancel = false
    setLoading(true)
    void (async () => {
      try {
        const ctx = await apiJson<InstanceContext>(`/api/instances/${task.instanceId}`)
        if (cancel) return
        const fs = ctx?.instance?.processDefinition?.formSchema
        const found = fs?.steps?.find((s) => s.stepId === task.nodeId)
        const vars = ctx?.state?.variables ?? {}
        setTimeline(ctx?.instance?.tasks ?? [])
        setStep(found ?? { stepId: task.nodeId, stepName: task.name || task.nodeId, fields: [] })
        /* Recupera o id da entidade-alvo da variável do processo → "Avançar" liberado
           (regra em screen-task.ts, compartilhada com o runner do "Novo processo"). */
        if (found?.screenRef) {
          const eid = screenEntityFromVars(found, vars)
          if (eid) setEntityId(eid)
        }
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [task.instanceId, task.nodeId, task.name])

  // alvos de devolução (decide se o "Retroceder" aparece — item 4)
  useEffect(() => {
    let cancel = false
    void (async () => {
      const t = await apiJson<ReturnTarget[]>(`/api/instances/tasks/${task.id}/return-targets`).catch(() => [])
      if (!cancel) setReturnTargets(t ?? [])
    })()
    return () => { cancel = true }
  }, [task.id])

  /** Conclui a tarefa (Avançar) com os dados coletados. */
  const complete = async (data: Record<string, unknown>) => {
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/instances/tasks/${task.id}/complete`, { method: 'PATCH', body: JSON.stringify({ data }) })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível avançar a tarefa.')
        return
      }
      const result = await res.json().catch(() => null)
      if (result?.errored) {
        onNotice?.(`A etapa automática falhou e o processo foi interrompido: ${result.errored}`, 'aviso')
      } else {
        const numero = task.instance?.numero != null ? `#${task.instance.numero}` : 'O processo'
        onNotice?.(
          proxima ? `Tarefa concluída — ${numero} seguiu para ${proxima}.` : `Tarefa concluída — ${numero} avançou.`,
          'sucesso',
        )
      }
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  // "Avançar" para tarefa dirigida por Tela: leva o id da entidade. Exige a entidade
  // salva (decisão do PO) — sem id, o processo seguiria sem referência à entidade.
  const advanceScreen = () => { if (entityId) void complete({ [idVar]: entityId }) }

  const km = kindMeta(task.instance?.processDefinition?.kind)
  const hasReturn = (returnTargets?.length ?? 0) > 0
  const advanceDisabled = submitting || (isScreen && !entityId)

  /* Bloqueio EXPLICADO, não só um botão apagado: antes o motivo vivia num `title`,
     invisível no toque e para quem não passa o mouse. (Texto em screen-task.ts.) */
  const bloqueio = screenBloqueio(step, entityId)

  const prazo = task.dueAt ? (() => {
    const info = dueInfo(task.dueAt)
    return { label: info.label, cls: DUE_CHIP[info.grp] }
  })() : null

  /* Próxima etapa pelo desenho do processo: a linha do tempo já traz as etapas em
     ordem, então a seguinte à atual é o destino provável. É informação, não promessa —
     um gateway pode desviar, e por isso o texto diz "vai para", não "irá para". */
  const proxima = (() => {
    const i = timeline.findIndex((t) => t.id === task.id)
    return i >= 0 && i + 1 < timeline.length ? (timeline[i + 1].name || null) : null
  })()

  return (
    /* A atividade vive dentro de um cartão com borda e fundo próprios, não solta sobre
       a Mesa de Vidro. Vir da caixa de Tarefas ou de "Novo processo" dá exatamente a
       mesma tela — este componente é o único executor de atividade do sistema.
       A coluna de altura cheia continua: é ela que mantém o rodapé de ações sempre
       visível enquanto o formulário rola por dentro. */
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Identidade da atividade (ActivityHeader).
          As instruções entram AQUI (texto corrido sob o título), não numa caixa
          colorida no corpo: ver o comentário em ActivityHeader. O tipo do workflow
          continua legível pelo ÍCONE à esquerda, que já é colorido por tipo. */}
      <ActivityHeader
        className="px-4 bg-muted/40"
        icone={<span className={cn('flex h-11 w-11 items-center justify-center rounded-xl shrink-0', km.cls)}><km.Icon className="h-5 w-5" /></span>}
        processo={task.instance?.processDefinition?.name}
        numero={task.instance?.numero ?? null}
        papel={task.role}
        titulo={task.name || task.nodeId}
        instrucoes={step?.instructions}
        /* O PRAZO fica onde a decisão acontece. Ele estava na lista e sumia justamente
           na tela em que a pessoa decide se faz agora ou depois. */
        direita={prazo ? (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap', prazo.cls)}>
            <Clock className="h-3.5 w-3.5" />{prazo.label}
          </span>
        ) : undefined}
      />

      {/* contexto: onde você está no processo — uma linha, expansível (ProcessTrail) */}
      <ProcessTrail timeline={timeline} currentTaskId={task.id} className="px-4" />

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-[12px] text-destructive mb-2">{error}</p>}
        {loading || !step ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…</div>
        ) : (
          <>
            {/* O bloqueio era dito DUAS vezes — nesta caixa e, palavra por palavra, no
                rodapé. Ficou uma só, ao lado do botão que ele desliga: é ali que a
                pessoa descobre que não dá para concluir, e ali que precisa do motivo. */}
            {isScreen ? (
              <WorkflowScreenTask key={task.id} step={step} entityId={entityId} onEntity={setEntityId} onEntityGone={() => setEntityId(null)} onCancel={onDone} />
            ) : (
              // o botão "Avançar" (topo) submete este form via `form=FORM_ID`
              <DynamicForm key={task.id} step={step} stepIndex={0} totalSteps={1} submitting={submitting} onSubmit={complete} formId={FORM_ID} hideActions />
            )}
          </>
        )}
      </div>

      {/* AÇÃO onde o trabalho termina. Estava no topo: a pessoa preenchia descendo e
          precisava voltar ao começo para concluir. As secundárias continuam à mão,
          com menos peso — a ação que 90% vêm fazer não pode competir com elas. */}
      <div className="shrink-0 border-t bg-muted/40 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[150px]">
          {bloqueio ? (
            <p className="text-[11.5px] text-amber-700 dark:text-amber-400">{bloqueio}</p>
          ) : proxima ? (
            /* Dizer para onde vai antes de ir: o sistema já mostra o custo antes do ato
               ao cancelar um processo; concluir merece o mesmo. */
            <p className="text-[11.5px] text-muted-foreground">Ao concluir, vai para <span className="font-semibold text-foreground">{proxima}</span></p>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">Ao concluir, o processo avança.</p>
          )}
        </div>
        <DelegateTaskButton taskId={task.id} onDelegated={onDone} />
        {hasReturn && <ReturnTaskButton taskId={task.id} onReturned={onDone} label="Retroceder" targets={returnTargets ?? undefined} />}
        <Button
          size="sm"
          onClick={isScreen ? advanceScreen : undefined}
          {...(!isScreen ? { type: 'submit' as const, form: FORM_ID } : {})}
          disabled={advanceDisabled}
          title={bloqueio ?? 'Concluir a tarefa e avançar o processo'}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Concluir tarefa
        </Button>
      </div>
    </div>
  )
}
