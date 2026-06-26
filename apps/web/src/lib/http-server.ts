import 'server-only'
import { auth } from '@/auth'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Fetch autenticado para Server Components / SSR. Pega o token da sessão no
 * servidor (auth()) e anexa o Bearer. O tenant vem do token no backend.
 */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await auth()
  const headers = new Headers(init.headers)
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`)
  return fetch(`${API}${path}`, { cache: 'no-store', ...init, headers })
}
