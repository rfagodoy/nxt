/* Regras da atividade dirigida por TELA (Contrato/Parceiro), usadas pelo `TaskDocView`,
   que hoje é o ÚNICO executor de atividade — venha ela da caixa de Tarefas ou de "Novo
   processo", que agora também abre a atividade como aba.
   Nasceram aqui porque existiam DOIS executores e eles divergiram: o runner concluía a
   atividade no ato de SALVAR a entidade, enquanto a caixa de tarefas exigia o "Concluir
   tarefa". Salvar é guardar o trabalho; concluir é entregá-lo — quem decide entregar é a
   pessoa, num clique só dela. O runner foi aposentado em 01/09/2026; estas regras ficam
   porque a distinção que elas guardam continua valendo. */
import type { StepFormSchema } from '@nxt/types'

export { screenIdVar, screenTargetVar, screenEntityFromVars, abasDaAtividade, type AbaDaAtividade } from '@nxt/screens-core'
import { screenIdVar } from '@nxt/screens-core'

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
