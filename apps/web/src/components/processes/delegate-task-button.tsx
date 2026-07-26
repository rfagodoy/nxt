'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/ui/user-select'
import { apiFetch } from '@/lib/http'

/** Botão "Delegar" da tarefa: passa a responsabilidade para outro usuário, com
 *  motivo obrigatório (fica no histórico do processo). Existe porque processo
 *  travado por férias/desligamento é o jeito mais banal de um workflow morrer —
 *  sem isto, a saída seria um administrador editar o banco.
 *  Mesmo padrão visual do "Devolver": painel lateral portado para o body (o drawer
 *  de Tarefas tem backdrop-filter, que prenderia um `fixed` filho ao seu retângulo). */
export function DelegateTaskButton({ taskId, onDelegated, label = 'Delegar' }: {
  taskId: string
  onDelegated: () => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | undefined>()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const openPanel = () => { setOpen(true); setError(null); setUserId(undefined); setReason('') }

  const submit = async () => {
    if (!userId || !reason.trim()) return
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/instances/tasks/${taskId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, reason: reason.trim() }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível delegar.')
        return
      }
      setOpen(false)
      onDelegated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openPanel} title="Passar esta tarefa para outra pessoa">
        <UserPlus className="h-3.5 w-3.5" />{label}
      </Button>

      {open && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => !submitting && setOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-[70] w-96 max-w-[92vw] glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><UserPlus className="h-4 w-4" />Delegar tarefa</h2>
                <p className="text-[11px] text-muted-foreground">Transfere a responsabilidade para outro usuário</p>
              </div>
              <button type="button" onClick={() => !submitting && setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block">Delegar para <span className="text-destructive">*</span></label>
                <UserSelect value={userId} onChange={setUserId} placeholder="Escolher usuário…" clearable />
                <p className="mt-1 text-[10.5px] text-muted-foreground">A tarefa sai da sua caixa e entra na dele, com aviso no sininho.</p>
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block">Motivo <span className="text-destructive">*</span></label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                  placeholder="Explique por que está delegando (fica no histórico do processo)…"
                  className="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
              </div>

              {error && <p className="text-[12px] text-destructive">{error}</p>}
            </div>

            <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-end gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
              <Button size="sm" onClick={submit} disabled={submitting || !userId || !reason.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Delegar
              </Button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
