'use client'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

// O access token vive num cookie httpOnly; obtemos seu valor via /api/auth/session
// (que renova de forma transparente se preciso) e o memorizamos.
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

function withAuth(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // FormData (upload) define seu próprio Content-Type com boundary — não forçar JSON.
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return { ...init, headers }
}

/**
 * Fetch autenticado (cliente). Anexa o Bearer; em 401, tenta um refresh único e
 * repete a chamada. Se ainda falhar, manda para o login. O tenant vem do token
 * no backend — NÃO envie organizationId.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await fetch(`${API}${path}`, withAuth(init, await getToken()))
  if (res.status !== 401 || typeof window === 'undefined') return res

  // Access expirado/ inválido: tenta renovar uma vez e repete.
  cachedToken = null
  try {
    const r = await fetch('/api/auth/refresh', { method: 'POST' })
    if (r.ok) {
      cachedToken = ((await r.json()) as { token: string | null }).token
      res = await fetch(`${API}${path}`, withAuth(init, cachedToken))
    }
  } catch {
    /* cai no redirect abaixo */
  }

  if (res.status === 401) {
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
