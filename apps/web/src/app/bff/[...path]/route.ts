import { cookies } from 'next/headers'
import { SESSION_COOKIE, decodeToken, isExpired } from '@/lib/session'
import { tryRefresh } from '@/lib/auth-cookies'

/**
 * BFF (Backend-for-Frontend). Único ponto por onde o cliente fala com a API: o
 * browser chama `/bff/...` (mesma origem, SEM token) e é aqui, no SERVIDOR, que o
 * access token (cookie httpOnly) é lido e anexado como `Bearer`. Assim o token
 * NUNCA chega ao JavaScript — um XSS não consegue exfiltrá-lo. O refresh (com
 * rotação) também acontece aqui, de forma transparente.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? ''

// Cabeçalhos de resposta que fazem sentido repassar ao browser (downloads etc.).
const PASS_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-length', 'cache-control']

// Métodos com efeito colateral (mutações). Só estes exigem a checagem de origem.
function isMutating(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
}

/**
 * Defesa CSRF: como o `/bff` autentica pelo COOKIE httpOnly, uma mutação precisa
 * vir da PRÓPRIA origem — senão um site malicioso dispararia POST/PUT/PATCH/DELETE
 * com o cookie do usuário embutido. O `sameSite=lax` já mitiga; esta é a barreira
 * explícita (defesa em profundidade). Exige `Origin` cujo host bata com o `Host`.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params

  if (isMutating(req.method) && !sameOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origem não permitida' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  const search = new URL(req.url).search
  const target = `${API}/${path.join('/')}${search}`
  const store = await cookies()
  const clientIp = req.headers.get('x-forwarded-for') ?? undefined

  // Token do cookie; se ausente/expirado, tenta renovar ANTES da 1ª chamada.
  let token = store.get(SESSION_COOKIE)?.value
  const decoded = token ? decodeToken(token) : null
  if (!token || !decoded || isExpired(decoded.exp)) {
    token = (await tryRefresh(store, clientIp))?.accessToken
  }

  // Corpo é bufferizado (limite de upload é 25 MB) para poder repetir a chamada
  // após um refresh sem perder o stream já consumido.
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody ? await req.arrayBuffer() : undefined

  const forward = (bearer?: string): Promise<Response> => {
    const headers = new Headers()
    const ct = req.headers.get('content-type')
    if (ct) headers.set('content-type', ct)
    const accept = req.headers.get('accept')
    if (accept) headers.set('accept', accept)
    if (bearer) headers.set('authorization', `Bearer ${bearer}`)
    return fetch(target, { method: req.method, headers, body, redirect: 'manual' })
  }

  let apiRes = await forward(token)

  // Access recusado no meio do caminho: renova (single-flight) e repete uma vez.
  if (apiRes.status === 401) {
    const refreshed = await tryRefresh(store, clientIp)
    if (refreshed?.accessToken) apiRes = await forward(refreshed.accessToken)
  }

  const respHeaders = new Headers()
  for (const h of PASS_RESPONSE_HEADERS) {
    const v = apiRes.headers.get(h)
    if (v) respHeaders.set(h, v)
  }
  // Faz stream do corpo da resposta (downloads binários não são bufferizados).
  return new Response(apiRes.body, { status: apiRes.status, headers: respHeaders })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
