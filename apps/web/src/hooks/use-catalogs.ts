'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/http'

export interface CatalogEntry {
  code: string
  descricao: string
}

// Cache de módulo: a Natureza Jurídica (~dezenas) é buscada uma vez por sessão e
// reaproveitada por todos os formulários de parceiro.
let natjurCache: CatalogEntry[] | null = null

/** Lista completa das naturezas jurídicas (catálogo QSA). Carrega uma vez e cacheia. */
export function useNaturezaJuridica(): CatalogEntry[] {
  const [list, setList] = useState<CatalogEntry[]>(natjurCache ?? [])
  useEffect(() => {
    if (natjurCache) return
    let alive = true
    void apiJson<CatalogEntry[]>('/api/natureza-juridica').then((d) => {
      if (!alive) return
      natjurCache = d ?? []
      setList(natjurCache)
    })
    return () => {
      alive = false
    }
  }, [])
  return list
}
