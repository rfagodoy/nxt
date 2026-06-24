'use client'

import { Network } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'
import { INIT_TIPOS_UNIDADE, TIPOS_UNIDADE_KEY, CLASSIFICACAO_OPTIONS, CLASSIFICACAO } from '@/lib/unit-types'

export default function TiposUnidadePage() {
  return (
    <LookupTablePage
      title="Tipos de unidade"
      description="Tipos das unidades do organograma. Cada tipo é classificado como Custo, Lucro ou Neutro."
      icon={Network}
      storageKey={TIPOS_UNIDADE_KEY}
      initialData={INIT_TIPOS_UNIDADE}
      withCode
      codeLabel="Código"
      codePlaceholder="Ex: CC"
      selectField={{ field: 'classificacao', label: 'Classificação', options: CLASSIFICACAO_OPTIONS, default: CLASSIFICACAO.NEUTRO }}
    />
  )
}
