import { desenhoParaBlocos, lerDesenhoV2, type FluxoBlocos, type ProblemaDoDesenho } from '@nxt/workflow-core'

export const DESENHO_CORROMPIDO = 'O desenho gravado deste workflow está corrompido. Abra-o no editor, confira e salve de novo antes de ativar.'

/** Desenho livre (v2, PO 30/10/2026): na ativação, o SERVIDOR converte o desenho em blocos;
 *  o que vem do navegador não é aceito pronto. `null` = workflow sem desenho v2 (em blocos
 *  ou antigo): segue o caminho de sempre. Na recusa, `problemas` traz as formas e setas
 *  culpadas de cada frase (o editor as destaca). */
export function blocosDaAtivacao(formSchema: { steps?: Array<{ stepId?: string; stepName?: string }>; desenho?: unknown }):
  { fluxo: FluxoBlocos } | { erro: string; problemas: ProblemaDoDesenho[] } | null {
  const desenho = lerDesenhoV2(formSchema.desenho)
  // diz ser v2 e não se lê: os blocos gravados podem não ser o que a pessoa desenhou
  if (!desenho) return (formSchema.desenho as { versao?: unknown } | undefined)?.versao === 2 ? { erro: DESENHO_CORROMPIDO, problemas: [] } : null
  const nomes = new Map((formSchema.steps ?? []).map((s) => [s.stepId, s.stepName?.trim() || '']))
  const c = desenhoParaBlocos(desenho, { nomeDe: (id) => nomes.get(id) || '' })
  if (!c.ok) return { erro: c.problemas.map((p) => p.mensagem).join('\n'), problemas: c.problemas }
  return { fluxo: c.fluxo }
}
