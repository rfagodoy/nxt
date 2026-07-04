'use client'

import { FilePlus2 } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'

/* `efeito` define o que cada tipo altera no contrato — comanda qual editor aparece no aditivo. */
const INITIAL = [
  { id: '1', label: 'Prorrogação de prazo',              active: true, efeito: 'termino' },
  { id: '2', label: 'Reajuste / Repactuação de valor',   active: true, efeito: 'valor'   },
  { id: '3', label: 'Acréscimo de escopo',               active: true, efeito: 'objeto'  },
  { id: '4', label: 'Supressão de escopo',               active: true, efeito: 'objeto'  },
  { id: '5', label: 'Cessão / Sub-rogação',              active: true, efeito: 'partes'  },
  { id: '6', label: 'Reequilíbrio econômico-financeiro', active: true, efeito: 'valor'   },
  { id: '7', label: 'Re-ratificação',                    active: true, efeito: 'nenhum'  },
  { id: '8', label: 'Outro',                             active: true, efeito: 'nenhum'  },
]

const EFEITOS = [
  { value: 'termino', label: 'Altera término (prorrogação)' },
  { value: 'valor',   label: 'Altera valor' },
  { value: 'objeto',  label: 'Altera objeto (escopo)' },
  { value: 'partes',  label: 'Cessão de parte' },
  { value: 'nenhum',  label: 'Apenas registro/descrição' },
]

export default function TiposAditivo() {
  return (
    <LookupTablePage
      title="Tipos de aditivo"
      description="Categorias de termo aditivo e o que cada uma altera no contrato"
      icon={FilePlus2}
      storageKey="nxt:settings:contratos:tipos-aditivo"
      initialData={INITIAL}
      selectField={{ field: 'efeito', label: 'Efeito no contrato', options: EFEITOS, default: 'nenhum' }}
    />
  )
}
