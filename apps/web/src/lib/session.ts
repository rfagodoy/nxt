// Sessão própria do Nxt (sem IdP externo). O token é o nosso JWT (HS256), emitido
// pela API. Aqui só LEMOS as claims para UX/roteamento — a verificação de
// assinatura é feita pela API a cada requisição; o cookie é httpOnly e definido
// apenas pelo servidor após o login, então decodificar sem verificar é seguro.

export const SESSION_COOKIE = 'nxt_session' // access token (JWT curto)
export const REFRESH_COOKIE = 'nxt_refresh' // refresh token (opaco, longo)

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  orgId: string
}

interface JwtClaims {
  sub?: string
  email?: string
  name?: string
  role?: string
  org_id?: string
  exp?: number
}

function b64urlToJson(payload: string): unknown {
  const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4))
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Decodifica o payload do JWT (sem verificar assinatura). Retorna usuário + exp. */
export function decodeToken(token: string): { user: SessionUser; exp: number } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const c = b64urlToJson(payload) as JwtClaims
    if (!c.sub || !c.org_id) return null
    return {
      user: {
        id: c.sub,
        email: c.email ?? '',
        name: c.name ?? '',
        role: c.role ?? 'user',
        orgId: c.org_id,
      },
      exp: c.exp ?? 0,
    }
  } catch {
    return null
  }
}

export function isExpired(exp: number): boolean {
  return exp > 0 && Date.now() >= exp * 1000
}
