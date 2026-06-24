'use client'

import { Tag } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', label: 'Prestação de Serviços', active: true },
  { id: '2', label: 'Fornecimento de Bens',  active: true },
  { id: '3', label: 'Locação',               active: true },
  { id: '4', label: 'Parceria / Convênio',   active: true },
  { id: '5', label: 'Licença de Software',   active: true },
  { id: '6', label: 'Outro',                 active: true },
]

export default function TiposContrato() {
  return (
    <LookupTablePage
      title="Tipos de contrato"
      description="Categorias disponíveis para classificar contratos"
      icon={Tag}
      storageKey="primeapps:settings:contratos:tipos"
      initialData={INITIAL}
    />
  )
}
