import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, decodeToken } from '@/lib/session'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''
const FALLBACK_MAXAGE = 60 * 60 * 8 // 8h

/**
 * Login: encaminha credenciais para a API, e em caso de sucesso guarda o nosso
 * JWT num cookie httpOnly (fonte da verdade da sessão). Nunca devolve o token no
 * corpo — o cliente o obtém via GET /api/auth/session quando precisa.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
    })
  } catch {
    return NextResponse.json({ error: 'Serviço indisponível. Tente novamente.' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
  }

  const data = (await res.json()) as { token: string; user?: unknown }
  const decoded = decodeToken(data.token)
  const maxAge = decoded?.exp
    ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
    : FALLBACK_MAXAGE

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })

  return NextResponse.json({ user: decoded?.user ?? data.user ?? null })
}
