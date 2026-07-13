import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, REFRESH_COOKIE, decodeToken, isExpired } from '@/lib/session'

/**
 * Protege o app. Considera autenticado se o access token está válido OU se há um
 * refresh token presente (otimista — o access curto expira a cada 15 min e seria
 * injusto mandar ao login a cada navegação; a renovação/validação real acontece
 * em /api/auth/session e nas chamadas à API).
 */
export function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const decoded = token ? decodeToken(token) : null
  const hasValidAccess = !!decoded && !isExpired(decoded.exp)
  const hasRefresh = !!req.cookies.get(REFRESH_COOKIE)?.value
  const isAuthed = hasValidAccess || hasRefresh
  const isAuthRoute = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')

  if (!isAuthed && !isAuthRoute) {
    const url = new URL('/sign-in', origin)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }
  if (isAuthed && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', origin))
  }
  return NextResponse.next()
}

export const config = {
  // Tudo exceto /api (handlers de auth), /bff (proxy — deve devolver 401 JSON, não
  // redirect HTML), assets e estáticos.
  matcher: ['/((?!api|bff|_next/static|_next/image|favicon.ico|.*\\.).*)'],
}
