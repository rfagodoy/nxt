'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import PartnerNewForm from '@/components/partners/partner-new-form'
import type { EntityRef } from '@/components/contracts/entity-search-modal'

/* Cadastro de parceiro SOBRE o contrato, sem sair da tela.
   Antes, "Cadastrar novo parceiro" navegava para /modules/parceiros/new?from=contratos
   e o formulário, nesse caminho, NÃO salvava nada: guardava um objeto falso
   (id `p_<timestamp>`) no sessionStorage que ninguém lia. O parceiro não era criado
   nem associado, e o contrato em preenchimento ficava para trás.
   Agora o formulário roda embutido aqui — grava pela API como qualquer parceiro — e
   devolve a entidade REAL para o contrato associar à parte. */
export function NewPartnerPanel({ onCreated, onClose }: {
  onCreated: (entity: EntityRef) => void
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[70] w-[46rem] max-w-[96vw] glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Cadastrar novo parceiro</h2>
            <p className="text-[11px] text-muted-foreground">Ao salvar, o parceiro entra nas Partes envolvidas deste contrato</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <PartnerNewForm
            embedded
            onCancel={onClose}
            onSaved={(r) => {
              // sem id não há o que associar (o form já mostrou o erro)
              if (!r?.id) { onClose(); return }
              onCreated({ ref_tipo: 'PARCEIRO', ref_id: r.id, nome: r.razaoSocial, documento: r.documento ?? '' })
            }}
          />
        </div>
      </div>
    </>,
    document.body,
  )
}
