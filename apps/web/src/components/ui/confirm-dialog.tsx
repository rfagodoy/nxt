'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Família de dialogs que SUBSTITUI `confirm()`/`alert()` nativos (auditoria de
 * 2026-08-21): o nativo ignora o tema, trava a aba inteira e não deixa explicar a
 * consequência. Visual e z-index seguem o modal de "Iniciar um processo"; portal no
 * body porque superfícies com backdrop-filter prendem `fixed` filhos (lição do
 * CancelInstanceButton).
 */

function Shell({ onScrim, children }: { onScrim: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40" onClick={onScrim} />
      <div className="glass relative w-full max-w-md rounded-2xl text-foreground overflow-hidden">
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Confirmação com consequência explicada. `onConfirm` pode ser async — o dialog
 *  trava os botões enquanto roda e fecha ao resolver (erro é problema do caller:
 *  mostre um NoticeDialog). */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', tone = 'default', onConfirm, onClose }: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  /** `danger` = ação destrutiva (botão vermelho). */
  tone?: 'default' | 'danger'
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => { if (open) setSubmitting(false) }, [open])
  if (!open) return null

  const confirmar = async () => {
    setSubmitting(true)
    try { await onConfirm() } finally { setSubmitting(false); onClose() }
  }

  return (
    <Shell onScrim={() => !submitting && onClose()}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <AlertTriangle className={tone === 'danger' ? 'h-4 w-4 text-destructive' : 'h-4 w-4 text-amber-500'} />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <button onClick={() => !submitting && onClose()} className="text-muted-foreground hover:text-foreground transition-colors" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-4 text-xs text-muted-foreground [&_b]:text-foreground">{description}</div>
      <div className="flex justify-end gap-2 px-4 pb-4">
        <Button variant="outline" size="sm" disabled={submitting} onClick={onClose}>Cancelar</Button>
        <Button variant={tone === 'danger' ? 'destructive' : 'default'} size="sm" disabled={submitting} onClick={() => void confirmar()}>
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}{confirmLabel}
        </Button>
      </div>
    </Shell>
  )
}

/** Aviso/erro com um só botão — o substituto direto do `alert()`. */
export function NoticeDialog({ open, title, message, tone = 'error', onClose }: {
  open: boolean
  title?: string
  message: ReactNode
  /** `error` = algo falhou; `info` = informação (ex.: "foi arquivado"). */
  tone?: 'error' | 'info'
  onClose: () => void
}) {
  if (!open) return null
  return (
    <Shell onScrim={onClose}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          {tone === 'error'
            ? <AlertTriangle className="h-4 w-4 text-destructive" />
            : <Info className="h-4 w-4 text-primary" />}
          <h2 className="text-sm font-semibold">{title ?? (tone === 'error' ? 'Não foi possível concluir' : 'Aviso')}</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-4 text-xs text-muted-foreground">{message}</div>
      <div className="flex justify-end px-4 pb-4">
        <Button size="sm" onClick={onClose}>Entendi</Button>
      </div>
    </Shell>
  )
}
