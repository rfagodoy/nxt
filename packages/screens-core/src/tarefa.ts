/* Regras da ATIVIDADE dirigida por tela — quais telas (abas) ela abre, qual edita e quais
   campos ela trava a mais. Moram no core porque a API confere a gravação de uma tarefa
   com a mesma leitura da etapa que a tela fez. */
import type { StepFormSchema } from '@nxt/types'
import type { LockContext } from './locks'

/** Variável do processo que carrega o id da entidade criada pela etapa. */
export const screenIdVar = (step: Pick<StepFormSchema, 'screenSubject'>): 'contratoId' | 'partnerId' =>
  step.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId'

/** Variável de onde LER a entidade-alvo ao abrir a etapa: SEMPRE a do registro do PROCESSO
 *  (`contratoId`/`partnerId`). EDIT e VIEW trabalham sobre o registro que uma etapa
 *  anterior criou — o processo não tem outro, então perguntar "qual contrato" era ruído
 *  (pedido do PO, 13/09/2026). `entityVar` gravado em desenhos antigos é ignorado.
 *  CREATE relê a mesma variável: se já tem valor, este processo já criou a entidade numa
 *  passagem anterior (devolução) e a etapa EDITA aquela, em vez de criar uma segunda. */
export const screenTargetVar = (step: Pick<StepFormSchema, 'screenSubject'>): string => screenIdVar(step)

/** Id da entidade-alvo lido das variáveis do processo (null quando ainda não existe). */
export function screenEntityFromVars(step: StepFormSchema, variables: Record<string, unknown>): string | null {
  const varName = screenTargetVar(step)
  const v = varName ? variables[varName] : undefined
  return v == null || v === '' ? null : String(v)
}

/** Uma aba da atividade dirigida por tela. Todas mostram o MESMO registro. */
export interface AbaDaAtividade { screenRef: string; editavel: boolean; principal: boolean }

/** Abas da atividade: a tela principal primeiro, depois as adicionais na ordem do desenho.
 *  Na CONSULTA (entityMode VIEW) nenhuma aba edita, qualquer que seja o modo marcado nela:
 *  a atividade inteira é de leitura. Tela repetida entra uma vez só. */
export function abasDaAtividade(step: Pick<StepFormSchema, 'screenRef' | 'entityMode' | 'extraScreens'>): AbaDaAtividade[] {
  if (!step.screenRef) return []
  const leitura = step.entityMode === 'VIEW'
  const vistas = new Set<string>([step.screenRef])
  const abas: AbaDaAtividade[] = [{ screenRef: step.screenRef, editavel: !leitura, principal: true }]
  for (const e of step.extraScreens ?? []) {
    if (!e.screenRef || vistas.has(e.screenRef)) continue
    vistas.add(e.screenRef)
    abas.push({ screenRef: e.screenRef, editavel: !leitura && e.mode !== 'VIEW', principal: false })
  }
  return abas
}

/**
 * Camadas de trava que a ETAPA impõe numa das suas telas — ou null se a tela não é aba
 * desta etapa (aí a gravação não pode se valer da tarefa). Aba de consulta força a tela
 * inteira em consulta; os campos travados da atividade só valem ao EDITAR (ao criar não
 * há o que travar — decisão do PO, 13/09/2026).
 */
export function travasDaEtapa(
  step: Pick<StepFormSchema, 'screenRef' | 'entityMode' | 'extraScreens' | 'lockedFields'>,
  telaId: string,
): LockContext | null {
  const aba = abasDaAtividade(step).find(a => a.screenRef === telaId)
  if (!aba) return null
  const lock: LockContext = {}
  if (!aba.editavel) lock.screenReadOnly = true
  if (step.entityMode === 'EDIT' && step.lockedFields?.length) lock.stepLocked = new Set(step.lockedFields)
  return lock
}
