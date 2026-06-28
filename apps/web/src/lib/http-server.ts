import 'server-only'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Fetch autenticado para Server Components / SSR. Lê o token do cookie de sessão
 * e anexa o Bearer. O tenant vem do token no backend.
 */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API}${path}`, { cache: 'no-store', ...init, headers })
}
