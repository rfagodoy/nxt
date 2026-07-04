import 'server-only'
import { SESSION_COOKIE, REFRESH_COOKIE } from './session'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

// Tipo mínimo do cookie store (await cookies()) que usamos nos route handlers.
type CookieStore = {
  get: (name: string) => { value: string } | undefined
  set: (name: string, value: string, opts?: Record<string, unknown>) => void
  delete: (name: string) => void
}

/**
 * Cookies de SESSÃO (sem maxAge/expires): o navegador os descarta ao ser fechado,
 * forçando novo login. A sessão sobrevive apenas enquanto o navegador estiver aberto
 * (o access de 15min é renovado pelo refresh do cookie durante o uso).
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

export function setAuthCookies(store: CookieStore, accessToken: string, refreshToken: string): void {
  store.set(SESSION_COOKIE, accessToken, cookieOptions())
  store.set(REFRESH_COOKIE, refreshToken, cookieOptions())
}

export function clearAuthCookies(store: CookieStore): void {
  store.delete(SESSION_COOKIE)
  store.delete(REFRESH_COOKIE)
}

/**
 * Renova os tokens junto à API usando o refresh do cookie. Em sucesso, rotaciona
 * (grava os novos cookies) e retorna o novo access token; em falha, limpa os
 * cookies e retorna null.
 */
export async function tryRefresh(
  store: CookieStore,
  clientIp?: string,
): Promise<{ accessToken: string; user: unknown } | null> {
  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return null
  try {
    const res = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientIp ? { 'x-forwarded-for': clientIp } : {}) },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      clearAuthCookies(store)
      return null
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string; user: unknown }
    setAuthCookies(store, data.accessToken, data.refreshToken)
    return { accessToken: data.accessToken, user: data.user }
  } catch {
    return null
  }
}
