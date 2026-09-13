/* Regras da atividade dirigida por TELA (Contrato/Parceiro), usadas pelo `TaskDocView`,
   que hoje é o ÚNICO executor de atividade — venha ela da caixa de Tarefas ou de "Novo
   processo", que agora também abre a atividade como aba.
   Nasceram aqui porque existiam DOIS executores e eles divergiram: o runner concluía a
   atividade no ato de SALVAR a entidade, enquanto a caixa de tarefas exigia o "Concluir
   tarefa". Salvar é guardar o trabalho; concluir é entregá-lo — quem decide entregar é a
   pessoa, num clique só dela. O runner foi aposentado em 01/09/2026; estas regras ficam
   porque a distinção que elas guardam continua valendo. */
import type { StepFormSchema } from '@nxt/types'

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

/** Por que "Concluir" está bloqueado, na língua de quem está executando — ou null se não
 *  está. Explicado, não só um botão apagado: na CONSULTA a pessoa não tem o que salvar,
 *  então mandá-la "salvar" seria uma instrução impossível de cumprir. */
export function screenBloqueio(step: StepFormSchema | null | undefined, entityId: string | null): string | null {
  if (!step?.screenRef || entityId) return null
  const entidade = screenIdVar(step) === 'contratoId' ? 'contrato' : 'parceiro'
  return step.entityMode === 'VIEW'
    ? `Esta etapa consulta um ${entidade} que o processo ainda não tem: nenhuma etapa anterior o criou. Avise quem desenhou o workflow.`
    : `Salve o ${entidade} antes de concluir — o processo precisa da referência para seguir.`
}
