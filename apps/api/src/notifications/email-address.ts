/* Endereço entregável, ou não.
 *
 * Por que isto existe: o usuário `admin` nasce com `admin@nxt.local` — domínio que só
 * existe dentro da máquina. O sistema tentou entregar, o provedor devolveu "domínio
 * não encontrado" e o quique voltou para a caixa do remetente.
 *
 * Isso não é cosmético. Provedor de e-mail mede taxa de quique, e remetente que insiste
 * em endereço morto perde reputação e acaba suspenso — derrubando o aviso de TODO
 * mundo por causa de uma conta de teste. Melhor não tentar.
 *
 * Não é validação de existência da caixa: só um provedor sabe disso. É o filtro do que
 * é comprovadamente impossível de entregar.
 */

/** TLDs reservados que NUNCA existem na internet pública.
 *  RFC 2606/6761 (test, example, invalid, localhost), RFC 6762 (local, mDNS) e
 *  `internal`, reservado pela ICANN em 2024 para uso privado. */
const TLDS_NAO_ROTEAVEIS = new Set(['local', 'localhost', 'internal', 'invalid', 'test', 'example'])

/** Domínios de documentação (RFC 2606): aparecem em exemplo colado e nunca recebem. */
const DOMINIOS_DE_EXEMPLO = new Set(['example.com', 'example.org', 'example.net'])

/* Sintaxe: deliberadamente permissiva. O objetivo não é policiar a RFC 5321 — é pegar
   o que nem chega a ser um endereço (vazio, sem @, sem ponto no domínio, com espaço). */
const FORMATO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+$/

export type MotivoInentregavel = 'formato' | 'dominio-nao-roteavel' | 'dominio-de-exemplo'

/** `null` = entregável. Caso contrário, por que não é. */
export function motivoInentregavel(email: string | null | undefined): MotivoInentregavel | null {
  const e = (email ?? '').trim().toLowerCase()
  if (!FORMATO.test(e)) return 'formato'
  const dominio = e.slice(e.lastIndexOf('@') + 1)
  if (DOMINIOS_DE_EXEMPLO.has(dominio)) return 'dominio-de-exemplo'
  const tld = dominio.slice(dominio.lastIndexOf('.') + 1)
  if (TLDS_NAO_ROTEAVEIS.has(tld)) return 'dominio-nao-roteavel'
  return null
}

export function isDeliverableEmail(email: string | null | undefined): boolean {
  return motivoInentregavel(email) === null
}

/** Frase para a tela e para o log. Diz o que fazer, não só o que houve. */
export function explicaInentregavel(email: string, motivo: MotivoInentregavel): string {
  const alvo = email.trim() || '(vazio)'
  if (motivo === 'formato') return `"${alvo}" não é um endereço de e-mail válido.`
  if (motivo === 'dominio-de-exemplo') return `"${alvo}" usa um domínio de exemplo, que não recebe mensagens. Cadastre o endereço real.`
  return `O domínio de "${alvo}" não existe fora desta máquina, então a mensagem nunca seria entregue. Cadastre o endereço real do usuário.`
}
