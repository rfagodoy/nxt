'use client'

import { Globe } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'
import { PAISES_SEED, PAISES_STORAGE_KEY } from '@/lib/paises'

export default function PaisesPage() {
  return (
    <LookupTablePage
      title="Países"
      description="Lista de países disponíveis para seleção em parceiros e endereços"
      icon={Globe}
      storageKey={PAISES_STORAGE_KEY}
      initialData={PAISES_SEED}
    />
  )
}
