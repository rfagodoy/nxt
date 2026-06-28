import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { tryRefresh } from '@/lib/auth-cookies'

/** Renova o access token a partir do refresh (cookie httpOnly), com rotação. */
export async function POST(req: Request) {
  const store = await cookies()
  const result = await tryRefresh(store, req.headers.get('x-forwarded-for') ?? undefined)
  if (!result) return NextResponse.json({ token: null }, { status: 401 })
  return NextResponse.json({ token: result.accessToken })
}
