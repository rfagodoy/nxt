/* Regras puras da recuperação de senha — testáveis sem banco e sem servidor de e-mail.
 *
 * A parte difícil deste fluxo não é gerar um token: é não contar ao mundo quem tem
 * conta no sistema. Um endpoint público que responde diferente para "e-mail existe" e
 * "não existe" vira ferramenta de enumeração de usuários — e a lista de quem trabalha
 * na empresa é o primeiro passo de um ataque dirigido.
 */

/** Validade do link. Curto o bastante para limitar o estrago de um e-mail vazado,
 *  longo o bastante para quem só volta ao computador depois do almoço. */
export const RESET_TTL_MINUTES = 60

/** Intervalo mínimo entre dois pedidos do mesmo usuário. Sem isso, quem souber o
 *  e-mail de alguém pode encher a caixa da pessoa clicando repetidamente. */
export const RESET_COOLDOWN_SECONDS = 60

export type MotivoNaoEnviado =
  | 'usuario-inexistente'
  | 'usuario-inativo'
  | 'email-inentregavel'
  | 'sem-canal-de-email'
  | 'muito-recente'

/** O que a API responde SEMPRE, independentemente do que aconteceu por dentro. */
export const RESPOSTA_NEUTRA = {
  ok: true,
  mensagem: 'Se houver uma conta ativa com esse e-mail, o link de redefinição foi enviado.',
} as const

export interface TokenReset {
  expiresAt: Date
  usedAt: Date | null
}

/** Um token só serve se existe, não foi usado e não venceu. As três condições dão a
 *  MESMA resposta ao usuário de propósito: distinguir "não existe" de "já usado"
 *  contaria a um estranho que aquele link um dia foi válido. */
export function tokenUtilizavel(t: TokenReset | null | undefined, agora: Date = new Date()): boolean {
  if (!t) return false
  if (t.usedAt) return false
  return t.expiresAt.getTime() > agora.getTime()
}

/** Passou tempo suficiente desde o último pedido? */
export function podePedirDeNovo(ultimoPedidoEm: Date | null | undefined, agora: Date = new Date()): boolean {
  if (!ultimoPedidoEm) return true
  return agora.getTime() - ultimoPedidoEm.getTime() >= RESET_COOLDOWN_SECONDS * 1000
}

/** Monta o link que vai no e-mail. Sem barra dupla e sem token na parte visível da
 *  URL além do necessário — o token É o segredo, então nada mais vai junto. */
export function linkDeReset(webUrl: string, token: string): string {
  const base = (webUrl || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`
}

export function expiraEm(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + RESET_TTL_MINUTES * 60_000)
}
