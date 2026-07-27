/* Formato de log. Puro e testável — o formato é justamente o que ninguém confere até
 * o dia em que precisa procurar uma linha específica às duas da manhã.
 *
 * Em PRODUÇÃO sai JSON de uma linha por evento, porque log de produção não é lido por
 * gente: é lido por `grep`, por coletor, por quem exporta para uma planilha. Em
 * desenvolvimento sai texto colorido, porque aí é lido por gente mesmo.
 *
 * Regra dura: NUNCA logar corpo de requisição, cabeçalho de autorização, senha, token
 * ou documento. O log costuma ser o lugar menos protegido do sistema — vai para arquivo
 * em disco, é copiado em chamado de suporte, aparece em captura de tela. O que não pode
 * vazar não entra aqui.
 */

export interface EventoLog {
  nivel: 'log' | 'error' | 'warn' | 'debug' | 'verbose'
  contexto?: string
  mensagem: string
  requestId?: string
  /** Campos extras já saneados por quem chama. */
  extra?: Record<string, unknown>
  timestamp: string
}

/** Chaves que nunca podem sair no log, mesmo que alguém as passe em `extra`.
 *  É rede de segurança: a regra principal é não coletar, esta é para quando falhar. */
const PROIBIDAS = new Set([
  'password', 'senha', 'newpassword', 'currentpassword', 'token', 'accesstoken',
  'refreshtoken', 'authorization', 'cookie', 'secret', 'pass', 'documento', 'cpf', 'cnpj',
])

export function sanear(extra: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!extra) return undefined
  const saida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(extra)) {
    saida[k] = PROIBIDAS.has(k.toLowerCase()) ? '[oculto]' : v
  }
  return saida
}

export function formatarJson(e: EventoLog): string {
  const linha: Record<string, unknown> = {
    ts: e.timestamp,
    nivel: e.nivel,
    ctx: e.contexto,
    msg: e.mensagem,
    ...(e.requestId ? { req: e.requestId } : {}),
    ...(sanear(e.extra) ?? {}),
  }
  for (const k of Object.keys(linha)) if (linha[k] === undefined) delete linha[k]
  return JSON.stringify(linha)
}

export function formatarTexto(e: EventoLog): string {
  const req = e.requestId ? ` [${e.requestId}]` : ''
  const ctx = e.contexto ? ` [${e.contexto}]` : ''
  const extra = e.extra && Object.keys(e.extra).length > 0 ? ` ${JSON.stringify(sanear(e.extra))}` : ''
  return `${e.timestamp} ${e.nivel.toUpperCase().padEnd(5)}${ctx}${req} ${e.mensagem}${extra}`
}

/** Classifica a requisição para o log de acesso. 4xx e 5xx contam histórias
 *  diferentes: 4xx é quase sempre cliente errado, 5xx é sempre nosso. */
export function nivelPorStatus(status: number): EventoLog['nivel'] {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'log'
}

/** Tira identificadores da rota para o log agrupar: `/api/contracts/ckz9.../aditivos`
 *  vira `/api/contracts/:id/aditivos`. Sem isso, contar "quantas chamadas neste
 *  endpoint" é impossível — cada id vira um endpoint diferente. */
export function rotaGenerica(url: string): string {
  const semQuery = url.split('?')[0]
  return semQuery
    .split('/')
    .map((p) => {
      if (!p) return p
      if (/^c[a-z0-9]{20,}$/i.test(p)) return ':id'                                   // cuid
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) return ':id' // uuid
      if (/^\d+$/.test(p)) return ':n'
      return p
    })
    .join('/')
}
