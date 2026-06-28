import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, decodeToken, isExpired } from '@/lib/session'

/**
 * Protege o app: sem sessão válida (cookie httpOnly com o nosso JWT) → /sign-in.
 * Autenticado tentando acessar /sign-in volta ao app. A verificação real do
 * token acontece na API; aqui só lemos as claims para rotear.
 */
export function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const decoded = token ? decodeToken(token) : null
  const isAuthed = !!decoded && !isExpired(decoded.exp)
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
  // Tudo exceto as rotas /api (inclui nossos handlers de auth), assets e estáticos.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)'],
}
