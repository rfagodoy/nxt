/**
 * Sair do editor de workflow com alterações não salvas (decisão do PO, 30/10/2026).
 *
 * RASCUNHO grava sozinho ao sair, como sempre foi: ninguém perde trabalho.
 * Workflow ATIVO nunca grava sozinho: gravar mudança de etapa o devolve a rascunho, e
 * isso não pode acontecer sem a pessoa ver. Ao sair, ela escolhe: salvar, descartar ou
 * continuar editando.
 */
export type AoSair = 'gravar' | 'perguntar' | 'nada'

export function aoSairDoEditor(s: { somenteLeitura: boolean; ativo: boolean; sujo: boolean }): AoSair {
  if (s.somenteLeitura || !s.sujo) return 'nada'
  return s.ativo ? 'perguntar' : 'gravar'
}

/** O que importa de um clique num link para decidir se ele navega DENTRO da aplicação,
 *  na mesma aba (o único caso em que o editor sai de tela e pode perguntar antes). */
export type CliqueEmLink = {
  button: number
  ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean
  defaultPrevented: boolean
  href: string
  target: string
  download: boolean
}

/** Caminho interno (com busca e âncora) para onde o clique levaria, ou null quando o
 *  clique não tira a pessoa do editor nesta aba: outro site, nova aba, download, âncora
 *  na mesma página ou clique que outro código já tratou. */
export function destinoInterno(c: CliqueEmLink, origem: string, caminhoAtual?: string): string | null {
  if (c.defaultPrevented || c.button !== 0 || c.ctrlKey || c.metaKey || c.shiftKey || c.altKey) return null
  if (c.download || (c.target && c.target !== '_self')) return null
  let url: URL
  try { url = new URL(c.href, origem) } catch { return null }
  if (url.origin !== origem) return null
  if (caminhoAtual !== undefined && url.pathname === caminhoAtual && url.search === '' && url.hash) return null
  return url.pathname + url.search + url.hash
}
