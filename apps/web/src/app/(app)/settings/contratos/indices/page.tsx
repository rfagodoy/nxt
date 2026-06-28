'use client'

import { TrendingUp } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', label: 'IPCA',   active: true },
  { id: '2', label: 'IGPM',   active: true },
  { id: '3', label: 'INPC',   active: true },
  { id: '4', label: 'CDI',    active: true },
  { id: '5', label: 'SELIC',  active: true },
  { id: '6', label: 'Fixo',   active: true },
  { id: '7', label: 'Nenhum', active: true },
]

export default function IndicesReajuste() {
  return (
    <LookupTablePage
      title="Índices de reajuste"
      description="Índices econômicos utilizados para reajuste de contratos"
      icon={TrendingUp}
      storageKey="nxt:settings:contratos:indices"
      initialData={INITIAL}
    />
  )
}
