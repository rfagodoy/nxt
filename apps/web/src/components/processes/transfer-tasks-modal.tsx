'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightLeft, Loader2, X, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/ui/user-select'
import { apiFetch, apiJson } from '@/lib/http'

interface Preview {
  total: number
  tasks: { id: string; name: string; dueAt: string | null; numero: number | null; processName: string }[]
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem prazo'

/** Transfere TODAS as tarefas pendentes de um usuário para outro (férias, afastamento,
 *  desligamento). Mostra ANTES o que será movido: uma ação que mexe no trabalho de duas
 *  pessoas de uma vez não pode ser um botão que só responde "pronto". */
export function TransferTasksModal({ fromUserId, fromUserName, onClose, onDone }: {
  fromUserId: string
  fromUserName: string
  onClose: () => void
  onDone: (moved: number, toName: string) => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [toUserId, setToUserId] = useState<string | undefined>()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const load = useCallback(async () => {
    setPreview(await apiJson<Preview>(`/api/instances/transfer-preview?fromUserId=${fromUserId}`).catch(() => ({ total: 0, tasks: [] })))
  }, [fromUserId])
  useEffect(() => { void load() }, [load])

  const submit = async () => {
    if (!toUserId || !reason.trim()) return
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch('/api/instances/transfer', {
        method: 'POST',
        body: JSON.stringify({ fromUserId, toUserId, reason: reason.trim() }),
      })
      const body = await res.json().catch(() => null) as { moved?: number; to?: string; message?: string } | null
      if (!res.ok) { setError(body?.message || 'Não foi possível transferir.'); return }
      onDone(body?.moved ?? 0, body?.to ?? '')
    } finally { setSubmitting(false) }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && onClose()} />
      <div className="glass relative w-full max-w-lg rounded-xl p-4 text-popover-foreground shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><ArrowRightLeft className="h-4 w-4" />Transferir tarefas</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Move as tarefas pendentes de <span className="font-medium text-foreground">{fromUserName}</span> para outra pessoa</p>
          </div>
          <button type="button" onClick={() => !submitting && onClose()} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 rounded-lg border bg-muted/20 max-h-48 overflow-y-auto">
          {preview === null ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Levantando as tarefas…</div>
          ) : preview.total === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Este usuário não tem tarefas pendentes.</p>
          ) : (
            <ul className="divide-y">
              {preview.tasks.map((t) => (
                <li key={t.id} className="px-3 py-2 text-xs">
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t.numero != null ? `#${t.numero} · ` : ''}{t.processName}
                    <span className="inline-flex items-center gap-1 ml-1.5"><Clock className="h-3 w-3" />{fmt(t.dueAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {preview && preview.total > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">{preview.total} tarefa{preview.total === 1 ? '' : 's'} será{preview.total === 1 ? '' : 'ão'} movida{preview.total === 1 ? '' : 's'}.</p>
        )}

        <div className="mt-3">
          <label className="text-xs font-medium mb-1.5 block">Transferir para <span className="text-destructive">*</span></label>
          <UserSelect value={toUserId} onChange={setToUserId} exclude={[fromUserId]} placeholder="Escolher usuário…" clearable />
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium mb-1.5 block">Motivo <span className="text-destructive">*</span></label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Ex.: férias de 01/08 a 15/08 (fica no histórico de cada processo)…"
            className="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
        </div>

        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button size="sm" onClick={submit} disabled={submitting || !toUserId || !reason.trim() || (preview?.total ?? 0) === 0}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}Transferir
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
