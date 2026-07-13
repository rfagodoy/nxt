'use client'

import { Scale } from 'lucide-react'
import { CatalogViewPage } from '@/components/settings/catalog-view'
import { NATUREZA_INATIVOS_KEY } from '@/hooks/use-catalogs'

export default function NaturezaJuridicaTable() {
  return (
    <CatalogViewPage
      title="Natureza Jurídica das Entidades"
      description="Naturezas jurídicas das entidades obrigadas à apresentação do QSA (fonte: Receita Federal). Ative/desative as disponíveis para os parceiros."
      icon={Scale}
      endpoint="/api/natureza-juridica"
      inativosKey={NATUREZA_INATIVOS_KEY}
      codeLabel="Código"
    />
  )
}
