'use client'

import { Paperclip } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', label: 'Contrato original',    active: true },
  { id: '2', label: 'Proposta comercial',   active: true },
  { id: '3', label: 'Aditivo',              active: true },
  { id: '4', label: 'Distrato',             active: true },
  { id: '5', label: 'Ata de reunião',       active: true },
  { id: '6', label: 'Laudo técnico',        active: true },
  { id: '7', label: 'Nota fiscal',          active: true },
  { id: '8', label: 'Outros',               active: true },
]

export default function TiposAnexo() {
  return (
    <LookupTablePage
      title="Tipos de anexo"
      description="Categorias de documentos que podem ser anexados a um contrato"
      icon={Paperclip}
      storageKey="nxt:settings:contratos:anexos"
      initialData={INITIAL}
    />
  )
}
