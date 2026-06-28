'use client'

import { CreditCard } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', label: 'À vista',      active: true },
  { id: '2', label: 'Parcelado',    active: true },
  { id: '3', label: 'Mensal',       active: true },
  { id: '4', label: 'Trimestral',   active: true },
  { id: '5', label: 'Semestral',    active: true },
  { id: '6', label: 'Anual',        active: true },
  { id: '7', label: 'Outro',        active: true },
]

export default function CondicoesPagamento() {
  return (
    <LookupTablePage
      title="Condições de pagamento"
      description="Formas e prazos de pagamento disponíveis em contratos"
      icon={CreditCard}
      storageKey="nxt:settings:contratos:condicoes"
      initialData={INITIAL}
    />
  )
}
