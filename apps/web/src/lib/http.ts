'use client'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

// O token vive num cookie httpOnly; obtemos seu valor via /api/auth/session e o
// memorizamos para não bater nessa rota a cada chamada. Em 401, limpamos e
// mandamos ao login.
let cachedToken: string | null = null

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' })
    const json = (await res.json()) as { token: string | null }
    cachedToken = json.token
    return cachedToken
  } catch {
    return null
  }
}

/**
 * Fetch autenticado para uso no cliente. Anexa o Bearer token da sessão e prefixa
 * a base da API. O tenant (organizationId) vem do token no backend — NÃO envie
 * organizationId no corpo/query.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // FormData (upload) define seu próprio Content-Type com boundary — não forçar JSON.
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  // Token expirado/inválido: descarta o cache e força novo login.
  if (res.status === 401 && typeof window !== 'undefined') {
    cachedToken = null
    const back = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/sign-in?callbackUrl=${back}`
  }
  return res
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
