'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, Loader2, X, ShieldAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'

type Candidato = { id: string; name: string | null; email: string }
type Candidatos = {
  restrito: boolean
  motivo: string | null
  papelId: string | null
  entityType: string | null
  podeVerTodos: boolean
  candidatos: Candidato[]
}

/** Botão "Delegar" da tarefa: passa a responsabilidade para outro usuário, com
 *  motivo obrigatório (fica no histórico do processo). Existe porque processo
 *  travado por férias/desligamento é o jeito mais banal de um workflow morrer —
 *  sem isto, a saída seria um administrador editar o banco.
 *
 *  A lista NÃO é a organização inteira: mostra quem ocupa o PAPEL previsto no desenho
 *  da atividade (papel + entidade), porque delegar para fora disso furaria a própria
 *  configuração do workflow. O backend aplica a mesma regra — aqui é conveniência.
 *  Exceção do administrador: num papel de uma pessoa só, a regra estrita travaria a
 *  tarefa justamente no caso que o "Delegar" existe para resolver.
 *
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
  const [dados, setDados] = useState<Candidatos | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const openPanel = () => {
    setOpen(true); setError(null); setUserId(undefined); setReason(''); setVerTodos(false); setDados(null)
    setCarregando(true)
    void (async () => {
      try {
        const r = await apiJson<Candidatos>(`/api/instances/tasks/${taskId}/delegate-candidates`)
        setDados(r ?? null)
      } finally {
        setCarregando(false)
      }
    })()
  }

  /* "Ver todos" é do administrador e recarrega do servidor — não é um filtro escondido
     no cliente, que daria a impressão de que a lista restrita era só cosmética. */
  const carregarTodos = () => {
    setCarregando(true); setUserId(undefined)
    void (async () => {
      try {
        const r = await apiJson<{ candidatos: Candidato[] }>(`/api/instances/tasks/${taskId}/delegate-candidates/all`)
        if (r) { setDados((d) => (d ? { ...d, candidatos: r.candidatos } : d)); setVerTodos(true) }
      } finally {
        setCarregando(false)
      }
    })()
  }

  const lista = dados?.candidatos ?? []
  const vazio = !carregando && lista.length === 0

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

                {carregando && (
                  <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando quem pode receber…
                  </div>
                )}

                {!carregando && lista.length > 0 && (
                  <div className="rounded-md border divide-y max-h-56 overflow-y-auto rolagem-visivel">
                    {lista.map((u) => (
                      <button key={u.id} type="button" onClick={() => setUserId(u.id)}
                        className={cn('w-full text-left px-2.5 py-1.5 transition-colors',
                          userId === u.id ? 'bg-primary/10' : 'hover:bg-muted/60')}>
                        <div className="text-xs font-medium truncate">{u.name || u.email}</div>
                        {u.name && <div className="text-[10.5px] text-muted-foreground truncate">{u.email}</div>}
                      </button>
                    ))}
                  </div>
                )}

                {vazio && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                    {verTodos
                      ? 'Não há outro usuário ativo nesta organização para receber a tarefa.'
                      : 'Ninguém além de você ocupa o papel previsto nesta atividade. Cadastre outra pessoa no papel (em Responsáveis) para poder delegar.'}
                  </div>
                )}

                {!carregando && dados && (
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    {dados.restrito && !verTodos
                      ? 'Somente quem ocupa o papel definido para esta atividade no workflow.'
                      : dados.motivo ?? 'Todos os usuários ativos da organização.'}
                    {' '}A tarefa sai da sua caixa e entra na dele, com aviso no sininho.
                  </p>
                )}

                {!carregando && dados?.restrito && dados.podeVerTodos && !verTodos && (
                  <button type="button" onClick={carregarTodos}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                    <Users className="h-3 w-3" />Ver todos os usuários (fora do papel)
                  </button>
                )}

                {verTodos && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-2.5 py-1.5 text-[10.5px] text-amber-800 dark:text-amber-200">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Você está fora da regra do workflow: esta pessoa não ocupa o papel previsto para a atividade.</span>
                  </div>
                )}
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
