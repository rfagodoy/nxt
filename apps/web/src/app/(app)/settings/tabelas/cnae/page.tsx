'use client'

import { Briefcase } from 'lucide-react'
import { CatalogViewPage } from '@/components/settings/catalog-view'
import { CNAE_INATIVOS_KEY } from '@/hooks/use-catalogs'

export default function CnaeTable() {
  return (
    <CatalogViewPage
      title="CNAE — Classificação Nacional de Atividades Econômicas"
      description="Catálogo oficial de subclasses CNAE (fonte: IBGE). Ative/desative quais atividades ficam disponíveis para os parceiros."
      icon={Briefcase}
      endpoint="/api/cnae"
      inativosKey={CNAE_INATIVOS_KEY}
      serverSearch
      codeLabel="CNAE"
    />
  )
}
