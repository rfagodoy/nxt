'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiJson } from '@/lib/http'
import { pushSetting, pullSetting, cacheRead } from '@/lib/settings-store'

export interface CatalogEntry {
  code: string
  descricao: string
}

// Conjunto de codes DESATIVADOS por organização (o catálogo em si é global; a
// ativação/desativação é per-tenant, guardada num AppSetting admin-only — mesmo
// modelo das demais Tabelas auxiliares).
export const CNAE_INATIVOS_KEY = 'nxt:settings:catalogos:cnae-inativos'
export const NATUREZA_INATIVOS_KEY = 'nxt:settings:catalogos:natureza-inativos'

/** Codes desativados de um catálogo (por org) + toggle. Cache local + backend. */
export function useCatalogInactive(storageKey: string) {
  const [inactive, setInactive] = useState<Set<string>>(() => new Set(cacheRead<string[]>(storageKey, [])))

  useEffect(() => {
    void pullSetting<string[]>(storageKey).then(v => {
      if (Array.isArray(v)) setInactive(new Set(v))
    })
  }, [storageKey])

  const toggle = useCallback((code: string) => {
    setInactive(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      pushSetting(storageKey, [...next]) // fire-and-forget; backend exige admin
      return next
    })
  }, [storageKey])

  return { inactive, toggle }
}

// Cache de módulo: a Natureza Jurídica (~dezenas) é buscada uma vez por sessão.
let natjurCache: CatalogEntry[] | null = null

/** Naturezas jurídicas ATIVAS (catálogo QSA menos as desativadas na organização). */
export function useNaturezaJuridica(): CatalogEntry[] {
  const [list, setList] = useState<CatalogEntry[]>(natjurCache ?? [])
  const { inactive } = useCatalogInactive(NATUREZA_INATIVOS_KEY)

  useEffect(() => {
    if (natjurCache) return
    let alive = true
    void apiJson<CatalogEntry[]>('/api/natureza-juridica').then(d => {
      if (!alive) return
      natjurCache = d ?? []
      setList(natjurCache)
    })
    return () => { alive = false }
  }, [])

  return list.filter(n => !inactive.has(n.code))
}
