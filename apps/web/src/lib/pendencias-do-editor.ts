import { faltasDaAtividade, religarVinculos, removerCaminho, type FluxoBlocos } from '@nxt/workflow-core'
import type { StepFormSchema } from '@nxt/types'

/* ─── Pendências e ações do editor ────────────────────────────────────────────
   Lógica pura que o editor (o desenho) usa ao abrir uma pendência e ao remover um caminho
   pela gaveta da escolha. */

/** Pergunta da etapa em que uma pendência deve abrir (ids das perguntas em PerguntasDaEtapa). */
export function secaoDaPendencia(p: { tipo: string }, passo?: Pick<StepFormSchema, 'stepName' | 'executor' | 'slaBusinessDays' | 'slaBusinessHours' | 'slaBusinessMinutes'>): string | undefined {
  if (p.tipo === 'atividade-incompleta') {
    const [falta] = faltasDaAtividade(passo ?? {})
    return falta === 'nome' ? 'identificacao' : falta === 'quem faz' ? 'executor' : falta === 'prazo' ? 'prazo' : undefined
  }
  if (p.tipo.startsWith('executor-')) return 'executor'
  if (p.tipo === 'tela-so-consulta' || p.tipo === 'registro-sem-origem') return 'formulario'
  return undefined
}

/** Remover um caminho de escolha leva as etapas dele; uma etapa vinculada cuja RAIZ estava
 *  ali promove a cópia (como `remover` faz com um item). Quem chama copia o passo da raiz
 *  para cada `promovidas[].para`. */
export function removerCaminhoComVinculos(f: FluxoBlocos, blocoId: string, caminhoId: string): { fluxo: FluxoBlocos; promovidas: Array<{ de: string; para: string }> } {
  return religarVinculos(removerCaminho(f, blocoId, caminhoId))
}
