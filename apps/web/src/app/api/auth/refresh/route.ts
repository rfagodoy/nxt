import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { tryRefresh } from '@/lib/auth-cookies'

/**
 * Renova o access token a partir do refresh (cookie httpOnly), com rotação. NÃO
 * devolve o token ao cliente (ele fica só no cookie httpOnly, anexado pelo BFF) —
 * só sinaliza sucesso/falha. O refresh do dia a dia é feito pelo proxy em app/bff.
 */
export async function POST(req: Request) {
  const store = await cookies()
  const result = await tryRefresh(store, req.headers.get('x-forwarded-for') ?? undefined)
  if (!result) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}
