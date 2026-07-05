'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'

export interface LookupEntry {
  id: string
  code?: string
  label: string
  active: boolean
  origem?: string         // papéis: origem da parte no contrato
  classificacao?: string  // tipos de unidade: Custo | Lucro | Neutro
  efeito?: string         // tipos de aditivo: termino | valor | objeto | partes | nenhum
}

export function useLookupTable(storageKey: string, initialData: LookupEntry[]) {
  const [entries, setEntries] = useState<LookupEntry[]>([])
  const ref     = useRef<LookupEntry[]>([])
  const loaded  = useRef(false)
  const changeEvent = `${storageKey}:change`

  const apply = useCallback((next: LookupEntry[]) => {
    ref.current = next
    setEntries(next)
  }, [])

  const persist = useCallback((next: LookupEntry[]) => {
    apply(next)
    pushSetting(storageKey, next)              // cache local + backend
    window.dispatchEvent(new Event(changeEvent))
  }, [apply, storageKey, changeEvent])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      const cached = cacheRead<LookupEntry[] | null>(storageKey, null)
      apply(cached ?? initialData)
    }

    // hidrata do backend; se vazio, semeia o default (cache atual ou initialData)
    void pullSetting<LookupEntry[]>(storageKey).then(remote => {
      if (remote) apply(remote)
      else        pushSetting(storageKey, ref.current)
    })

    const handler = () => {
      const fresh = cacheRead<LookupEntry[] | null>(storageKey, null)
      if (fresh) apply(fresh)
    }
    window.addEventListener(changeEvent, handler)
    return () => window.removeEventListener(changeEvent, handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const add    = useCallback((entry: Omit<LookupEntry, 'id'>) => persist([...ref.current, { ...entry, id: `e_${Date.now()}` }]), [persist])
  const remove = useCallback((id: string) => persist(ref.current.filter(e => e.id !== id)), [persist])
  const update = useCallback((id: string, data: Partial<Omit<LookupEntry, 'id'>>) =>
    persist(ref.current.map(e => e.id === id ? { ...e, ...data } : e)), [persist])
  const toggle = useCallback((id: string) =>
    persist(ref.current.map(e => e.id === id ? { ...e, active: !e.active } : e)), [persist])
  /** Substitui a lista inteira de uma vez (merge/sincronização em lote). */
  const replace = useCallback((next: LookupEntry[]) => persist(next), [persist])

  const active = entries.filter(e => e.active)

  return { entries, active, add, remove, update, toggle, replace }
}
