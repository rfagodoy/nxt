'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Undo2, Loader2, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'

interface ReturnTarget { nodeId: string; name?: string; blockedBy?: string }

/** Botão "Devolver" da tarefa: abre um painel que carrega os alvos anteriores
 *  (GET return-targets), exige um destino desbloqueado + motivo, e chama a API.
 *  Os alvos BLOQUEADOS aparecem desabilitados com o motivo — some-los pareceria
 *  que o sistema esqueceu a etapa (ver [[project_workflow_devolver]]). */
export function ReturnTaskButton({ taskId, onReturned }: { taskId: string; onReturned: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [targets, setTargets] = useState<ReturnTarget[] | null>(null)
  const [sel, setSel] = useState<string>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const openPanel = useCallback(async () => {
    setOpen(true); setError(null); setSel(''); setReason(''); setTargets(null); setLoading(true)
    try {
      const data = await apiJson<ReturnTarget[]>(`/api/instances/tasks/${taskId}/return-targets`)
      setTargets(data ?? [])
    } catch {
      setError('Não foi possível carregar as etapas.')
      setTargets([])
    } finally {
      setLoading(false)
    }
  }, [taskId])

  const submit = async () => {
    if (!sel || !reason.trim()) return
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/instances/tasks/${taskId}/return`, {
        method: 'POST',
        body: JSON.stringify({ targetNodeId: sel, reason: reason.trim() }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(e?.message || 'Não foi possível devolver.')
        return
      }
      setOpen(false)
      onReturned()
    } finally {
      setSubmitting(false)
    }
  }

  const usable = (targets ?? []).filter((t) => !t.blockedBy)
  const blocked = (targets ?? []).filter((t) => t.blockedBy)

  return (
    <>
      <Button variant="outline" size="sm" onClick={openPanel} title="Devolver para uma etapa anterior">
        <Undo2 className="h-3.5 w-3.5" />Devolver
      </Button>

      {/* portado para o body: o drawer de Tarefas tem backdrop-filter (glass-panel), que
          prende o `fixed` do filho ao retângulo do drawer — ver [[project_liquid_glass]]. */}
      {open && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => !submitting && setOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-[70] w-96 max-w-[92vw] glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><Undo2 className="h-4 w-4" />Devolver processo</h2>
                <p className="text-[11px] text-muted-foreground">Volta o processo para uma etapa anterior refazer</p>
              </div>
              <button type="button" onClick={() => !submitting && setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando etapas…</div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium mb-1.5 block">Devolver para <span className="text-destructive">*</span></label>
                    {usable.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground rounded-md border border-dashed p-3">
                        Não há etapa anterior para onde devolver.
                        {blocked.length > 0 && ' As anteriores estão após uma ação automática já executada (abaixo).'}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {usable.map((t) => (
                          <button key={t.nodeId} type="button" onClick={() => setSel(t.nodeId)}
                            className={cn('w-full text-left rounded-md border px-3 py-2 text-xs transition-colors',
                              sel === t.nodeId ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted')}>
                            {t.name || t.nodeId}
                          </button>
                        ))}
                      </div>
                    )}
                    {blocked.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {blocked.map((t) => (
                          <div key={t.nodeId} className="rounded-md border border-dashed bg-muted/20 px-3 py-2 opacity-70">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="line-through">{t.name || t.nodeId}</span>
                            </div>
                            <p className="text-[10.5px] text-muted-foreground/80 mt-0.5 leading-snug">
                              Bloqueada: a ação automática “{t.blockedBy}” já foi executada e seria refeita.
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1.5 block">Motivo <span className="text-destructive">*</span></label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      placeholder="Explique por que está devolvendo (fica no histórico do processo)…"
                      className="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
                  </div>

                  {error && <p className="text-[12px] text-destructive">{error}</p>}
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-end gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
              <Button size="sm" onClick={submit} disabled={submitting || !sel || !reason.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}Devolver
              </Button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
