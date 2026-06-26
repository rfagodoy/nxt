'use client'

import { getSession, signIn } from 'next-auth/react'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

// Evita disparar múltiplos re-logins quando várias chamadas tomam 401 juntas.
let reauthInFlight = false

/**
 * Fetch autenticado para uso no cliente. Anexa o Bearer token da sessão Keycloak
 * e prefixa a base da API. O tenant (organizationId) vem do token no backend —
 * NÃO envie organizationId no corpo/query.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await getSession()
  const headers = new Headers(init.headers)
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`)
  // FormData (upload) define seu próprio Content-Type com boundary — não forçar JSON.
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  // Sessão local válida mas token do IdP morto (ex.: refresh expirado/Keycloak
  // reiniciado): força um novo login OIDC de verdade. Navegar para /sign-in
  // "quicaria" (o middleware vê a sessão NextAuth como válida e volta ao app).
  if (res.status === 401 && typeof window !== 'undefined' && !reauthInFlight) {
    reauthInFlight = true
    void signIn('keycloak', { callbackUrl: window.location.pathname + window.location.search })
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
