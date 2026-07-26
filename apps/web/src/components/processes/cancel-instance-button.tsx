'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/http'

/** Cancela uma instância de processo, com MOTIVO obrigatório. Substitui o antigo
 *  `confirm()` do painel de erros: cancelar interrompe o trabalho de outras pessoas,
 *  então o porquê precisa ficar no histórico — e quem tinha tarefa pendente é avisado.
 *  Modal portado para o body (superfícies com backdrop-filter prendem `fixed` filhos). */
export function CancelInstanceButton({ instanceId, processName, onCancelled, compact }: {
  instanceId: string
  processName?: string
  onCancelled: () => void
  /** botão de linha de tabela (ícone + rótulo curto) */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const submit = async () => {
    if (!reason.trim()) return
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/instances/${instanceId}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível cancelar.')
        return
      }
      setOpen(false)
      onCancelled()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); setReason(''); setError(null) }}
        title="Cancelar este processo"
        className={compact
          ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-muted transition-colors'
          : 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'}
      >
        <Ban className="h-3.5 w-3.5" />Cancelar
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && setOpen(false)} />
          <div className="glass relative w-full max-w-md rounded-xl p-4 text-popover-foreground shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><Ban className="h-4 w-4" />Cancelar processo</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {processName ? `"${processName}" ` : ''}será encerrado e as tarefas pendentes saem das caixas de quem as tinha.
                </p>
              </div>
              <button type="button" onClick={() => !submitting && setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-3">
              <label className="text-xs font-medium mb-1.5 block">Motivo <span className="text-destructive">*</span></label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
                placeholder="Explique por que está cancelando (fica no histórico do processo)…"
                className="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
            </div>

            {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>Voltar</Button>
              <Button size="sm" onClick={submit} disabled={submitting || !reason.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}Cancelar processo
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
