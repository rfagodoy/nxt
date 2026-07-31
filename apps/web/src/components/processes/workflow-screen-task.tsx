'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'
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
 * o cadastro completo dirigido por essa tela e CRIA (novo), EDITA ou apenas CONSULTA (por
 * variável) o Contrato/Parceiro REAL — reportando o id ao pai via `onEntity`.
 *
 * ⚠️ Salvar a entidade NÃO conclui a tarefa (mudança pedida pelo PO): quem avança o
 * workflow é o botão "Avançar" no topo da tela (ver TaskDocView). Após o CREATE, este
 * componente passa a mostrar a entidade em EDIÇÃO — evita criar um segundo registro se
 * a pessoa salvar de novo antes de avançar.
 *
 * VIEW é a etapa de análise/ciência: carrega a entidade como o EDIT, mas a tela abre
 * travada e sem nenhum botão que grave. A pessoa lê e conclui a tarefa.
 */
export function WorkflowScreenTask({ step, entityId, onEntity, onCancel }: {
  step: StepFormSchema
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
  const isView = step.entityMode === 'VIEW'

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

  // Já tem entidade (EDIT, VIEW ou pós-CREATE): mostra a tela. Salvar reporta o id (estável).
  if (entityId && entity) {
    return (
      <>
        {isView ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-sky-300/60 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30 px-3 py-2 text-[12px] text-sky-800 dark:text-sky-200">
            <Eye className="h-4 w-4 shrink-0" />
            <span>Esta etapa é de <span className="font-semibold">consulta</span>: o {isContract ? 'contrato' : 'parceiro'} abre em leitura. Confira e clique em <span className="font-semibold">Concluir</span> para seguir o processo.</span>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{isContract ? 'Contrato' : 'Parceiro'} salvo. Revise se quiser e clique em <span className="font-semibold">Concluir</span> para seguir o processo.</span>
          </div>
        )}
        {isContract
          ? <ContractDetailView row={entity as ContractRow} screen={screen} readOnly={isView} onClose={onCancel ?? (() => {})} onSaved={() => onEntity(entityId)} />
          : <PartnerDetailView partner={entity as PartnerRow} screen={screen} readOnly={isView} onClose={onCancel ?? (() => {})} onSaved={() => onEntity(entityId)} />}
      </>
    )
  }

  /* VIEW sem entidade carregada = a variável do processo não trouxe id (etapa anterior não
     rodou, ou o desenho aponta para variável errada). Dizer isso é melhor do que abrir um
     formulário de criação vazio, que gravaria um registro novo sem ninguém pedir. */
  if (isView) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="flex-1">
          Etapa de consulta sem {isContract ? 'contrato' : 'parceiro'} para mostrar: a variável
          {step.entityVar ? <> <span className="font-mono">{step.entityVar}</span></> : ''} ainda não tem valor neste processo.
        </span>
      </div>
    )
  }

  // CREATE: cria a entidade e reporta o id (sem avançar o workflow).
  const onCreated = (r?: { id?: string }) => { if (r?.id) onEntity(r.id) }
  return isContract
    ? <ContractNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} />
    : <PartnerNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} />
}
