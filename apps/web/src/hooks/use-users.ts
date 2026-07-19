'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/http'

export interface SelectableUser {
  id: string
  name: string
  email: string
}

// Cache em módulo: os usuários mudam pouco e o seletor aparece em vários lugares —
// busca uma vez por sessão e reaproveita (single-flight evita rajada de requests).
let cache: SelectableUser[] | null = null
let inflight: Promise<SelectableUser[]> | null = null

async function fetchUsers(): Promise<SelectableUser[]> {
  if (cache) return cache
  if (!inflight) {
    inflight = apiJson<SelectableUser[]>('/api/users/selectable')
      .then((d) => { cache = d ?? []; inflight = null; return cache })
      .catch(() => { inflight = null; return [] })
  }
  return inflight
}

/** Lista de usuários ATIVOS para seletores (id/nome/email). */
export function useSelectableUsers() {
  const [users, setUsers] = useState<SelectableUser[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    if (cache) { setUsers(cache); setLoading(false); return }
    let alive = true
    void fetchUsers().then((u) => { if (alive) { setUsers(u); setLoading(false) } })
    return () => { alive = false }
  }, [])

  return { users, loading }
}

/** Resolve o nome de um usuário pelo id (para leitura). */
export function useUserName(userId?: string): string {
  const { users } = useSelectableUsers()
  if (!userId) return ''
  return users.find((u) => u.id === userId)?.name ?? ''
}
