'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
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
 * o cadastro completo dirigido por essa tela e CRIA (novo) ou EDITA (por variável) o
 * Contrato/Parceiro REAL — reportando o id ao pai via `onEntity`.
 *
 * ⚠️ Salvar a entidade NÃO conclui a tarefa (mudança pedida pelo PO): quem avança o
 * workflow é o botão "Avançar" no topo da tela (ver TaskDocView). Após o CREATE, este
 * componente passa a mostrar a entidade em EDIÇÃO — evita criar um segundo registro se
 * a pessoa salvar de novo antes de avançar.
 */
export function WorkflowScreenTask({ step, variables, entityId, onEntity, onCancel }: {
  step: StepFormSchema
  variables: Record<string, unknown>
  /** id atual da entidade (null = ainda não criada, em modo CREATE) */
  entityId: string | null
  /** reporta o id ao salvar a entidade (o pai guarda para o "Avançar") */
  onEntity: (id: string) => void
  onCancel?: () => void
}) {
  const [screen, setScreen] = useState<Screen | null | undefined>(undefined)
  const [entity, setEntity] = useState<ContractRow | PartnerRow | null | undefined>(entityId ? undefined : null)
  const [err, setErr] = useState<string | null>(null)

  const isContract = step.screenSubject === 'CONTRATO'
  const endpoint = isContract ? 'contracts' : 'partners'

  // Carrega a tela uma vez.
  useEffect(() => {
    void (async () => {
      if (!step.screenRef) { setErr('Atividade sem tela configurada.'); return }
      const sc = await getScreen(step.screenRef)
      if (!sc) { setErr('Tela do formulário não encontrada.'); return }
      setScreen(sc)
    })()
  }, [step.screenRef])

  // Carrega a entidade sempre que há um id (EDIT desde o início, ou após o CREATE).
  useEffect(() => {
    if (!entityId) { setEntity(null); return }
    let cancel = false
    setEntity(undefined)
    void (async () => {
      const e = await apiJson<ContractRow | PartnerRow>(`/api/${endpoint}/${entityId}`)
      if (cancel) return
      if (!e) { setErr('Entidade-alvo não encontrada.'); return }
      setEntity(e)
    })()
    return () => { cancel = true }
  }, [entityId, endpoint])

  if (err) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="flex-1">{err}</span>
        {onCancel && <button onClick={onCancel} className="shrink-0 text-xs underline">Fechar</button>}
      </div>
    )
  }
  if (screen === undefined || (entityId && entity === undefined)) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…
      </div>
    )
  }
  if (!screen) return null

  // Já tem entidade (EDIT ou pós-CREATE): mostra em edição. Salvar reporta o id (estável).
  if (entityId && entity) {
    return (
      <>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{isContract ? 'Contrato' : 'Parceiro'} salvo. Revise se quiser e clique em <span className="font-semibold">Avançar</span> para seguir o processo.</span>
        </div>
        {isContract
          ? <ContractDetailView row={entity as ContractRow} screen={screen} onClose={onCancel ?? (() => {})} onSaved={() => onEntity(entityId)} />
          : <PartnerDetailView partner={entity as PartnerRow} screen={screen} onClose={onCancel ?? (() => {})} onSaved={() => onEntity(entityId)} />}
      </>
    )
  }

  // CREATE: cria a entidade e reporta o id (sem avançar o workflow).
  const onCreated = (r?: { id?: string }) => { if (r?.id) onEntity(r.id) }
  return isContract
    ? <ContractNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} />
    : <PartnerNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} />
}
