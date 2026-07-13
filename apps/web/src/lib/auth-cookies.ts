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

type RefreshResult = { accessToken: string; refreshToken: string; user: unknown }

/**
 * Single-flight do refresh, chaveado pelo VALOR do refresh token antigo. A rotação
 * consome o refresh a cada uso e a API tem detecção de REUSO (um 2º uso do mesmo
 * token revoga a família inteira). Sem esta trava, N requisições que expiram juntas
 * mandariam o mesmo refresh em paralelo e derrubariam a sessão. Aqui só UMA chamada
 * real acontece; as demais (inclusive as que chegam logo depois, ainda com o cookie
 * antigo, antes do Set-Cookie propagar) reaproveitam o mesmo resultado por ~10s.
 */
const inflight = new Map<string, Promise<RefreshResult | null>>()

async function callRefresh(oldToken: string, clientIp?: string): Promise<RefreshResult | null> {
  try {
    const res = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientIp ? { 'x-forwarded-for': clientIp } : {}) },
      body: JSON.stringify({ refreshToken: oldToken }),
    })
    if (!res.ok) return null
    return (await res.json()) as RefreshResult
  } catch {
    return null
  }
}

function refreshTokens(oldToken: string, clientIp?: string): Promise<RefreshResult | null> {
  const existing = inflight.get(oldToken)
  if (existing) return existing
  const p = callRefresh(oldToken, clientIp)
  inflight.set(oldToken, p)
  // mantém o resultado no cache por uma curta janela após resolver, para absorver
  // requisições atrasadas que ainda carregam o refresh antigo (evita o reuso).
  void p.finally(() => setTimeout(() => inflight.delete(oldToken), 10_000))
  return p
}

/**
 * Renova os tokens junto à API usando o refresh do cookie (via single-flight). Em
 * sucesso, rotaciona (grava os novos cookies NESTA resposta) e retorna o novo access
 * token; em falha, limpa os cookies e retorna null.
 */
export async function tryRefresh(
  store: CookieStore,
  clientIp?: string,
): Promise<{ accessToken: string; user: unknown } | null> {
  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return null
  const data = await refreshTokens(refreshToken, clientIp)
  if (!data) {
    clearAuthCookies(store)
    return null
  }
  setAuthCookies(store, data.accessToken, data.refreshToken)
  return { accessToken: data.accessToken, user: data.user }
}
