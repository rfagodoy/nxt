'use client'

import { FileSearch } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', label: 'Suporte e manutenção de sistemas de informação', active: true },
  { id: '2', label: 'Desenvolvimento de software sob demanda',        active: true },
  { id: '3', label: 'Fornecimento de equipamentos de informática',    active: true },
  { id: '4', label: 'Licenciamento de software',                      active: true },
  { id: '5', label: 'Locação de veículos',                            active: true },
  { id: '6', label: 'Prestação de serviços de segurança patrimonial', active: true },
  { id: '7', label: 'Consultoria jurídica',                           active: true },
]

export default function ObjetosContrato() {
  return (
    <LookupTablePage
      title="Objetos do contrato"
      description="Descrições padronizadas para o objeto dos contratos"
      icon={FileSearch}
      storageKey="primeapps:settings:contratos:objetos"
      initialData={INITIAL}
    />
  )
}
