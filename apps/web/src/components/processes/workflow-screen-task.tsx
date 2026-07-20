'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { getScreen } from '@/hooks/use-screens'
import { apiJson } from '@/lib/http'
import type { Screen } from '@/lib/screen-types'
import type { StepFormSchema } from '@nxt/types'
import ContractNewForm from '@/components/contracts/contract-new-form'
import PartnerNewForm from '@/components/partners/partner-new-form'
import { ContractDetailView } from '@/components/contracts/contract-detail-view'
import { PartnerDetailView } from '@/components/partners/partner-detail-view'

type ContractRow = Parameters<typeof ContractDetailView>[0]['row']
type PartnerRow = Parameters<typeof PartnerDetailView>[0]['partner']

/**
 * Runtime de uma atividade cujo formulário é uma TELA (Personalização de Telas). Renderiza
 * o cadastro completo dirigido por essa tela e, ao salvar, CRIA (novo) ou EDITA (por variável)
 * o Contrato/Parceiro REAL — depois conclui a tarefa expondo o id (contratoId/partnerId).
 */
export function WorkflowScreenTask({ step, variables, onComplete, onCancel }: {
  step: StepFormSchema
  variables: Record<string, unknown>
  onComplete: (data: Record<string, unknown>) => void
  onCancel?: () => void
}) {
  const [screen, setScreen] = useState<Screen | null | undefined>(undefined)
  const [entity, setEntity] = useState<ContractRow | PartnerRow | null | undefined>(
    step.entityMode === 'EDIT' ? undefined : null,
  )
  const [err, setErr] = useState<string | null>(null)

  const isContract = step.screenSubject === 'CONTRATO'
  const idVar = isContract ? 'contratoId' : 'partnerId'

  useEffect(() => {
    void (async () => {
      if (!step.screenRef) { setErr('Atividade sem tela configurada.'); return }
      const sc = await getScreen(step.screenRef)
      if (!sc) { setErr('Tela do formulário não encontrada.'); return }
      setScreen(sc)
      if (step.entityMode === 'EDIT') {
        const eid = step.entityVar ? variables[step.entityVar] : undefined
        if (!eid) { setErr('A atividade edita uma entidade, mas a variável com o id está vazia.'); return }
        const e = await apiJson<ContractRow | PartnerRow>(`/api/${isContract ? 'contracts' : 'partners'}/${eid}`)
        if (!e) { setErr('Entidade-alvo não encontrada.'); return }
        setEntity(e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.screenRef, step.entityMode, step.entityVar])

  if (err) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="flex-1">{err}</span>
        {onCancel && <button onClick={onCancel} className="shrink-0 text-xs underline">Fechar</button>}
      </div>
    )
  }
  if (screen === undefined || entity === undefined) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…
      </div>
    )
  }
  if (!screen) return null

  // CREATE → cria e expõe o id; EDIT → conclui expondo o id do alvo editado.
  const completeCreate = (r?: { id?: string }) => onComplete(r?.id ? { [idVar]: r.id } : {})
  const completeEdit = () => onComplete(step.entityVar && variables[step.entityVar] ? { [idVar]: String(variables[step.entityVar]) } : {})

  if (step.entityMode === 'EDIT') {
    return isContract
      ? <ContractDetailView row={entity as ContractRow} screen={screen} onClose={onCancel ?? (() => {})} onSaved={completeEdit} />
      : <PartnerDetailView partner={entity as PartnerRow} screen={screen} onClose={onCancel ?? (() => {})} onSaved={completeEdit} />
  }
  return isContract
    ? <ContractNewForm embedded screen={screen} onSaved={completeCreate} onCancel={onCancel} />
    : <PartnerNewForm embedded screen={screen} onSaved={completeCreate} onCancel={onCancel} />
}
