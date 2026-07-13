'use client'

import { Scale } from 'lucide-react'
import { CatalogViewPage } from '@/components/settings/catalog-view'

export default function NaturezaJuridicaTable() {
  return (
    <CatalogViewPage
      title="Natureza Jurídica das Entidades"
      description="Naturezas jurídicas das entidades obrigadas à apresentação do QSA (fonte: Receita Federal). Consulta apenas."
      icon={Scale}
      endpoint="/api/natureza-juridica"
      codeLabel="Código"
    />
  )
}
