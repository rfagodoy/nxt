import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { setAuthCookies } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Login: encaminha credenciais à API e, em sucesso, guarda o access token e o
 * refresh token em cookies httpOnly. Repassa 423 (bloqueado) / 429 (throttle)
 * para a UI mostrar a mensagem certa.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 })
  }

  const clientIp = req.headers.get('x-forwarded-for') ?? undefined
  let res: Response
  try {
    res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientIp ? { 'x-forwarded-for': clientIp } : {}) },
      body: JSON.stringify({ email: body.email, password: body.password }),
    })
  } catch {
    return NextResponse.json({ error: 'Serviço indisponível. Tente novamente.' }, { status: 502 })
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    if (res.status === 423 || res.status === 429) {
      return NextResponse.json({ error: data?.message ?? 'Tente novamente mais tarde.' }, { status: res.status })
    }
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string; user?: unknown }
  const store = await cookies()
  setAuthCookies(store, data.accessToken, data.refreshToken)
  return NextResponse.json({ user: data.user ?? null })
}
