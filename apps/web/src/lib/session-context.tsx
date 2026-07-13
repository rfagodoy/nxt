'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { SessionUser } from '@/lib/session'

type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface SessionContextValue {
  data: { user: SessionUser } | null
  status: Status
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: 'loading',
  refresh: async () => {},
})

/** Provê a sessão (lida de /api/auth/session) para componentes client. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<{ user: SessionUser } | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' })
      const json = (await res.json()) as { user: SessionUser | null }
      if (json.user) {
        setData({ user: json.user })
        setStatus('authenticated')
        /* espelha o nome no localStorage para exibição e para os logs client-side
           (getLogUser). A AUTORIA da auditoria vem do token no backend — isto é só UX. */
        try { localStorage.setItem('nxt:user:name', json.user.name || json.user.email || '') } catch { /* SSR/quota */ }
      } else {
        setData(null)
        setStatus('unauthenticated')
        try { localStorage.removeItem('nxt:user:name') } catch { /* SSR/quota */ }
      }
    } catch {
      setData(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <SessionContext.Provider value={{ data, status, refresh }}>
      {children}
    </SessionContext.Provider>
  )
}

/** Drop-in compatível com o uso anterior: `const { data: session } = useSession()`. */
export function useSession() {
  return useContext(SessionContext)
}

// Namespaces limpos no logout: os atuais (`nxt:`) + restos dos sistemas anteriores
// (`primeapps:`/`conexos:` e as chaves do Clerk), que podem carregar PII/rascunhos.
const CLEAR_PREFIXES = ['nxt:', 'primeapps:', 'conexos:', '__clerk', 'clerk_']
// Cookies JS-legíveis do auth antigo (Clerk) — não são nossos (nosso token é httpOnly).
const LEGACY_COOKIE_PREFIXES = ['__session', '__clerk', '__client_uat']

/**
 * Limpa o estado client-side ao sair — importante em máquina compartilhada. Remove
 * PII de terceiros (ex.: logs de parceiro `nxt:logs:parceiros:*`), rascunhos e o cruft
 * legado (Clerk/primeapps/conexos). As preferências de UI re-hidratam do backend no
 * próximo login. Não toca no nosso token (httpOnly; some via /api/auth/logout).
 */
function clearClientState() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const keys: string[] = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k && CLEAR_PREFIXES.some((p) => k.startsWith(p))) keys.push(k)
      }
      keys.forEach((k) => store.removeItem(k))
    } catch { /* SSR/quota */ }
  }
  // Expira cookies legados JS-legíveis (best-effort; os nossos são httpOnly).
  try {
    for (const pair of document.cookie.split(';')) {
      const name = pair.split('=')[0].trim()
      if (name && LEGACY_COOKIE_PREFIXES.some((p) => name.startsWith(p))) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      }
    }
  } catch { /* SSR */ }
}

/** Encerra a sessão e leva ao login. */
export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    clearClientState()
    window.location.href = '/sign-in'
  }
}
