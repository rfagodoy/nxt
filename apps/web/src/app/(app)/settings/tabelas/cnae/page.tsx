'use client'

import { Briefcase } from 'lucide-react'
import { CatalogViewPage } from '@/components/settings/catalog-view'

export default function CnaeTable() {
  return (
    <CatalogViewPage
      title="CNAE — Classificação Nacional de Atividades Econômicas"
      description="Catálogo oficial de subclasses CNAE (fonte: IBGE). Consulta apenas — usado para associar atividades aos parceiros."
      icon={Briefcase}
      endpoint="/api/cnae"
      serverSearch
      codeLabel="CNAE"
    />
  )
}
