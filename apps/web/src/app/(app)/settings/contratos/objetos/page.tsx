'use client'

import { FileSearch } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'
import { INIT_OBJETOS } from '@/lib/contract-options'

export default function ObjetosContrato() {
  return (
    <LookupTablePage
      title="Objetos do contrato"
      description="Descrições padronizadas para o objeto dos contratos"
      icon={FileSearch}
      storageKey="nxt:settings:contratos:objetos"
      initialData={INIT_OBJETOS}
      withCode
      codeLabel="Código"
      codePlaceholder="Ex: SERV01"
      codeMaxLength={15}
      codeAlnum
    />
  )
}
