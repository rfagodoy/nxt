import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Pede o link de redefinição. Repassa para a API e devolve SEMPRE a mesma resposta —
 * inclusive quando a API está fora do ar.
 *
 * Parece exagero tratar indisponibilidade como sucesso, mas não é: se este endpoint
 * respondesse diferente conforme o e-mail existisse, viraria uma forma de descobrir
 * quem tem conta no sistema. A única mensagem honesta e segura é "se houver conta,
 * enviamos" — e ela vale para todos os casos.
 */
const NEUTRA = { ok: true, mensagem: 'Se houver uma conta ativa com esse e-mail, o link de redefinição foi enviado.' }

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.email) return NextResponse.json({ error: 'Informe o e-mail.' }, { status: 400 })

  const clientIp = req.headers.get('x-forwarded-for') ?? undefined
  try {
    await fetch(`${API}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientIp ? { 'x-forwarded-for': clientIp } : {}) },
      body: JSON.stringify({ email: body.email }),
    })
  } catch {
    // engolido de propósito — ver comentário acima
  }
  return NextResponse.json(NEUTRA)
}
