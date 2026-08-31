/* Regras da atividade dirigida por TELA (Contrato/Parceiro), compartilhadas pelos dois
   lugares que executam uma tarefa: o documento da caixa de tarefas (TaskDocView) e o
   runner do "Novo processo" (InstanceRunner).
   Existem aqui porque os dois divergiram: o runner concluía a atividade no ato de SALVAR
   a entidade, enquanto a caixa de tarefas exigia o "Concluir tarefa". Salvar é guardar o
   trabalho; concluir é entregá-lo — quem decide entregar é a pessoa, num clique só dela. */
import type { StepFormSchema } from '@nxt/types'

/** Variável do processo que carrega o id da entidade criada pela etapa. */
export const screenIdVar = (step: Pick<StepFormSchema, 'screenSubject'>): 'contratoId' | 'partnerId' =>
  step.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId'

/** Variável de onde LER a entidade-alvo ao abrir a etapa. CREATE relê a variável que ele
 *  mesmo escreve: se já tem valor, este processo já criou a entidade numa passagem
 *  anterior (devolução) e a etapa EDITA aquela, em vez de criar uma segunda. */
export const screenTargetVar = (step: StepFormSchema): string | undefined =>
  (step.entityMode ?? 'CREATE') === 'CREATE' ? screenIdVar(step) : step.entityVar

/** Id da entidade-alvo lido das variáveis do processo (null quando ainda não existe). */
export function screenEntityFromVars(step: StepFormSchema, variables: Record<string, unknown>): string | null {
  const varName = screenTargetVar(step)
  const v = varName ? variables[varName] : undefined
  return v == null || v === '' ? null : String(v)
}

/** Por que "Concluir" está bloqueado, na língua de quem está executando — ou null se não
 *  está. Explicado, não só um botão apagado: na CONSULTA a pessoa não tem o que salvar,
 *  então mandá-la "salvar" seria uma instrução impossível de cumprir. */
export function screenBloqueio(step: StepFormSchema | null | undefined, entityId: string | null): string | null {
  if (!step?.screenRef || entityId) return null
  const entidade = screenIdVar(step) === 'contratoId' ? 'contrato' : 'parceiro'
  return step.entityMode === 'VIEW'
    ? `Esta etapa consulta um ${entidade} que o processo ainda não tem. Avise quem desenhou o workflow: a variável de origem não foi preenchida.`
    : `Salve o ${entidade} antes de concluir — o processo precisa da referência para seguir.`
}
