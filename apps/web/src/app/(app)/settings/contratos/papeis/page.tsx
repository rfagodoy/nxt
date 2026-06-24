'use client'

import { UserCheck } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'
import { INIT_PAPEIS, ORIGEM_OPTIONS, ORIGEM, PAPEIS_KEY } from '@/lib/contract-roles'

export default function PapeisContrato() {
  return (
    <LookupTablePage
      title="Papéis no contrato"
      description="Funções que as partes podem exercer e de onde cada papel busca a entidade"
      icon={UserCheck}
      storageKey={PAPEIS_KEY}
      initialData={INIT_PAPEIS}
      selectField={{ field: 'origem', label: 'Origem da parte', options: ORIGEM_OPTIONS, default: ORIGEM.EMPRESA_PARCEIRO }}
    />
  )
}
