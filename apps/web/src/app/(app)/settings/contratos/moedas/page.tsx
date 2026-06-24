'use client'

import { Coins } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', code: 'BRL', label: 'Real brasileiro',  active: true },
  { id: '2', code: 'USD', label: 'Dólar americano',  active: true },
  { id: '3', code: 'EUR', label: 'Euro',             active: true },
  { id: '4', code: 'GBP', label: 'Libra esterlina',  active: true },
  { id: '5', code: 'ARS', label: 'Peso argentino',   active: false },
  { id: '6', code: 'JPY', label: 'Iene japonês',     active: false },
]

export default function Moedas() {
  return (
    <LookupTablePage
      title="Moedas"
      description="Moedas disponíveis para contratos"
      icon={Coins}
      storageKey="primeapps:settings:contratos:moedas"
      initialData={INITIAL}
      withCode
      codeLabel="Código ISO"
      codePlaceholder="Ex: BRL"
    />
  )
}
