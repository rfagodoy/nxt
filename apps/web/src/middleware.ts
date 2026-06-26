import type { NextFetchEvent, NextRequest } from 'next/server'
import { auth } from '@/auth'

/**
 * Protege todo o grupo (app): usuário não autenticado é mandado para /sign-in
 * (que redireciona ao Keycloak). Autenticado tentando acessar /sign-in volta ao app.
 */
const handler = auth((req) => {
  const { pathname, origin } = req.nextUrl
  const isAuthed = !!req.auth
  const isAuthRoute = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')

  if (!isAuthed && !isAuthRoute) {
    const url = new URL('/sign-in', origin)
    url.searchParams.set('callbackUrl', pathname)
    return Response.redirect(url)
  }
  if (isAuthed && isAuthRoute) {
    return Response.redirect(new URL('/dashboard', origin))
  }
})

// Wrapper com tipos concretos: evita o TS2742 do export default inferido.
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  return (handler as unknown as (
    req: NextRequest,
    ev: NextFetchEvent,
  ) => Response | undefined)(request, event)
}

export const config = {
  // Tudo exceto rotas internas do Auth.js, assets do Next e arquivos estáticos.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.).*)'],
}
