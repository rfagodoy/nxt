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
      } else {
        setData(null)
        setStatus('unauthenticated')
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

/** Encerra a sessão e leva ao login. */
export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    window.location.href = '/sign-in'
  }
}
