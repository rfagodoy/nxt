import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, decodeToken, isExpired } from '@/lib/session'
import { tryRefresh } from '@/lib/auth-cookies'

/**
 * Estado da sessão. Se o access token está válido, devolve {user, token}. Se
 * expirou/ausente mas há refresh válido, renova de forma transparente (rotação)
 * e devolve o novo token. Sem refresh → { user: null }.
 */
export async function GET(req: Request) {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    const decoded = decodeToken(token)
    if (decoded && !isExpired(decoded.exp)) {
      return NextResponse.json({ user: decoded.user, token })
    }
  }

  const refreshed = await tryRefresh(store, req.headers.get('x-forwarded-for') ?? undefined)
  if (refreshed) {
    const decoded = decodeToken(refreshed.accessToken)
    return NextResponse.json({ user: decoded?.user ?? refreshed.user, token: refreshed.accessToken })
  }
  return NextResponse.json({ user: null, token: null })
}
