'use client'

import { Globe } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'
import type { LookupEntry } from '@/hooks/use-lookup-table'
import { PAISES } from '@/lib/paises'

const INITIAL_PAISES: LookupEntry[] = PAISES.map((nome, i) => ({
  id: String(i + 1), label: nome, active: true,
}))

export default function PaisesPage() {
  return (
    <LookupTablePage
      title="Países"
      description="Lista de países disponíveis para seleção em parceiros e endereços"
      icon={Globe}
      storageKey="primeapps:settings:tabelas:paises:v2"
      initialData={INITIAL_PAISES}
    />
  )
}
