import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Aplica a nova senha a partir do token do e-mail.
 *
 * Aqui a mensagem de erro PODE ser específica, ao contrário do pedido: quem chegou até
 * aqui já tem um link em mãos, e "sua senha é muito curta" precisa aparecer para a
 * pessoa conseguir escolher outra. O que continua indistinguível é o motivo de o token
 * não servir — inválido, usado e vencido dão a mesma resposta.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.token || !body?.newPassword) {
    return NextResponse.json({ error: 'Link inválido ou senha não informada.' }, { status: 400 })
  }

  const clientIp = req.headers.get('x-forwarded-for') ?? undefined
  let res: Response
  try {
    res = await fetch(`${API}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientIp ? { 'x-forwarded-for': clientIp } : {}) },
      body: JSON.stringify({ token: body.token, newPassword: body.newPassword }),
    })
  } catch {
    return NextResponse.json({ error: 'Serviço indisponível. Tente novamente.' }, { status: 502 })
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    return NextResponse.json({ error: data?.message ?? 'Não foi possível redefinir a senha.' }, { status: res.status })
  }
  return NextResponse.json({ ok: true })
}
