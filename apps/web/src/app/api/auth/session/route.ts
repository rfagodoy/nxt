import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, decodeToken, isExpired } from '@/lib/session'

/**
 * Estado da sessão atual. Devolve o usuário e o token (para o cliente anexar o
 * Bearer nas chamadas à API). Sem cookie válido → { user: null }.
 */
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ user: null, token: null })

  const decoded = decodeToken(token)
  if (!decoded || isExpired(decoded.exp)) {
    return NextResponse.json({ user: null, token: null })
  }
  return NextResponse.json({ user: decoded.user, token })
}
