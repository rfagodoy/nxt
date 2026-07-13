import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, decodeToken, isExpired } from '@/lib/session'
import { tryRefresh } from '@/lib/auth-cookies'

/**
 * Estado da sessão para o cliente. Devolve APENAS { user } — o token NUNCA é
 * exposto ao JavaScript (fica só no cookie httpOnly; o BFF o anexa no servidor).
 * Se o access expirou/ausente mas há refresh válido, renova de forma transparente.
 */
export async function GET(req: Request) {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    const decoded = decodeToken(token)
    if (decoded && !isExpired(decoded.exp)) {
      return NextResponse.json({ user: decoded.user })
    }
  }

  const refreshed = await tryRefresh(store, req.headers.get('x-forwarded-for') ?? undefined)
  if (refreshed) {
    const decoded = decodeToken(refreshed.accessToken)
    return NextResponse.json({ user: decoded?.user ?? refreshed.user })
  }
  return NextResponse.json({ user: null })
}
