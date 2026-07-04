'use client'

import { Wallet } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

const INITIAL = [
  { id: '1', label: 'PIX',                     active: true },
  { id: '2', label: 'Boleto bancário',         active: true },
  { id: '3', label: 'Transferência (TED/DOC)', active: true },
  { id: '4', label: 'Cartão de crédito',       active: true },
  { id: '5', label: 'Cartão de débito',        active: true },
  { id: '6', label: 'Dinheiro',                active: true },
  { id: '7', label: 'Cheque',                  active: true },
  { id: '8', label: 'Débito automático',       active: true },
  { id: '9', label: 'Outro',                   active: true },
]

export default function FormasPagamento() {
  return (
    <LookupTablePage
      title="Formas de pagamento"
      description="Meios usados nos lançamentos de pagamentos e recebimentos do contrato"
      icon={Wallet}
      storageKey="nxt:settings:contratos:formas-pagamento"
      initialData={INITIAL}
    />
  )
}
