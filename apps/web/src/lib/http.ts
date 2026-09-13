'use client'

/**
 * Fetch autenticado (cliente). Fala com o BFF (`/bff/...`, MESMA origem) — NUNCA
 * diretamente com a API. O token vive só no cookie httpOnly e é anexado pelo
 * servidor (proxy em app/bff): o JavaScript nunca vê o token, então um XSS não
 * consegue roubá-lo. O refresh também é transparente no proxy; aqui só tratamos o
 * 401 final (refresh falhou) redirecionando ao login. O tenant vem do token no
 * backend — NÃO envie organizationId.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  // FormData (upload) define seu próprio Content-Type com boundary — não forçar JSON.
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`/bff${path}`, { ...init, headers })

  if (res.status === 401 && typeof window !== 'undefined') {
    const back = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/sign-in?callbackUrl=${back}`
  }
  return res
}

/** Mensagem de falha que diz O MOTIVO devolvido pela API (Nest: `{ message: string | string[] }`),
 *  em vez de só "Erro (400)". Sem corpo legível, cai no texto padrão com o código. */
export async function motivoDoErro(res: Response, padrao: string): Promise<string> {
  try {
    const body = await res.clone().json() as { message?: unknown }
    const m = Array.isArray(body?.message)
      ? body.message.filter((x): x is string => typeof x === 'string').join('; ')
      : typeof body?.message === 'string' ? body.message : ''
    if (m.trim()) return `${padrao}: ${m.trim()}`
  } catch { /* resposta sem JSON */ }
  return `${padrao} (erro ${res.status}).`
}

/** Variante que já faz parse de JSON e retorna null em erro/!ok. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await apiFetch(path, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
