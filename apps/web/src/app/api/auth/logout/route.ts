import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { REFRESH_COOKIE } from '@/lib/session'
import { clearAuthCookies } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

/** Encerra a sessão: revoga o refresh token na API e limpa os cookies. */
export async function POST() {
  const store = await cookies()
  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      /* mesmo se a API falhar, limpamos os cookies localmente */
    }
  }
  clearAuthCookies(store)
  return NextResponse.json({ ok: true })
}
