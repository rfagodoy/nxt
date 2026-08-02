'use client'

/* ─── Histórico da DEFINIÇÃO do workflow ───────────────────────────────────────
   Duas perguntas, duas abas: "o que era antes" (versões, com restaurar) e "quem
   mexeu" (auditoria). Nasceu do incidente de 01/08/2026, em que uma gravação vazia
   apagou o desenho de um workflow e a recuperação dependeu de uma cópia que existia
   por acaso. Aqui voltar atrás é uma ação da tela, não uma escavação no banco. */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { History, X, Loader2, RotateCcw, User, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiJson, apiFetch } from '@/lib/http'
import { cn } from '@/lib/utils'

interface Versao {
  id: string; version: number; status: string; reason: string
  atividades: number; user: string; createdAt: string
}
interface Mudanca { field: string; label: string; before: string; after: string }
interface Auditoria { id: string; user: string; event: string; changes: Mudanca[]; createdAt: string }

/** Por que este retrato existe — é o que ajuda a escolher para onde voltar. */
const MOTIVO: Record<string, string> = {
  SOBRESCRITA: 'Antes de uma alteração',
  ATIVACAO: 'Ao ativar',
  RESTAURACAO: 'Antes de restaurar',
}
const EVENTO: Record<string, string> = {
  CRIADO: 'Criado', ATUALIZADO: 'Alterado', ATIVADO: 'Ativado',
  INATIVADO: 'Inativado', REATIVADO: 'Reativado', RESTAURADO: 'Restaurado',
}
const SITUACAO: Record<string, string> = {
  DRAFT: 'Rascunho', ACTIVE: 'Ativo', INACTIVE: 'Inativo', ARCHIVED: 'Arquivado',
}
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ProcessHistoryDrawer({ processId }: { processId: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [aba, setAba] = useState<'versoes' | 'auditoria'>('versoes')
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [auditoria, setAuditoria] = useState<Auditoria[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [restaurando, setRestaurando] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const [v, a] = await Promise.all([
        apiJson<Versao[]>(`/api/processes/${processId}/versions`),
        apiJson<Auditoria[]>(`/api/processes/${processId}/audit`),
      ])
      setVersoes(v ?? []); setAuditoria(a ?? [])
    } catch (e) {
      console.error('[historico]', e)
      setErro('Não foi possível carregar o histórico.')
    } finally { setLoading(false) }
  }, [processId])

  const abrir = () => { setOpen(true); setConfirmando(null); carregar() }

  /* Restaurar recarrega a página: o editor guarda o desenho em memória e continuaria
     mostrando o antigo. Alterações não salvas se perdem — por isso a confirmação. */
  const restaurar = async (versionId: string) => {
    setRestaurando(versionId); setErro(null)
    try {
      const res = await apiFetch(`/api/processes/${processId}/versions/${versionId}/restore`, { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      window.location.reload()
    } catch (e) {
      console.error('[historico] restaurar', e)
      setErro('Não foi possível restaurar esta versão.')
      setRestaurando(null)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir} title="Ver versões anteriores do desenho e quem o alterou">
        <History className="h-4 w-4" />Histórico
      </Button>

      {open && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => !restaurando && setOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-[70] w-[26rem] max-w-[92vw] glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><History className="h-4 w-4" />Histórico do workflow</h2>
                <p className="text-[11px] text-muted-foreground">O desenho de antes, e quem o alterou</p>
              </div>
              <button type="button" onClick={() => !restaurando && setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
              {([['versoes', `Versões${versoes.length ? ` (${versoes.length})` : ''}`], ['auditoria', 'Quem alterou']] as const).map(([id, rotulo]) => (
                <button key={id} type="button" onClick={() => setAba(id)}
                  className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    aba === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {erro && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-[11.5px]">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{erro}
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando…</div>
              ) : aba === 'versoes' ? (
                versoes.length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground rounded-md border border-dashed p-3 leading-snug">
                    Ainda não há versões guardadas. A partir de agora, cada alteração e cada ativação deixam um retrato aqui — é dele que se volta atrás.
                  </p>
                ) : versoes.map((v) => (
                  <div key={v.id} className="rounded-lg border bg-card/60 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">{MOTIVO[v.reason] ?? v.reason}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{quando(v.createdAt)}</p>
                      </div>
                      <span className="text-[10px] font-semibold rounded-full bg-muted px-2 py-0.5 shrink-0">v{v.version}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      <span className={cn('font-medium', v.atividades === 0 && 'text-destructive')}>
                        {v.atividades} atividade{v.atividades === 1 ? '' : 's'}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{SITUACAO[v.status] ?? v.status}</span>
                      <span aria-hidden>·</span>
                      <span className="flex items-center gap-1 truncate"><User className="h-3 w-3 shrink-0" />{v.user}</span>
                    </div>

                    {confirmando === v.id ? (
                      <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                        <p className="text-[11px] leading-snug">
                          Substitui o desenho atual por este. O estado de agora vira uma versão, então dá para voltar — mas alterações não salvas se perdem.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Button size="sm" variant="destructive" className="h-7 text-[11px]" disabled={!!restaurando} onClick={() => restaurar(v.id)}>
                            {restaurando === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}Restaurar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={!!restaurando} onClick={() => setConfirmando(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmando(v.id)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                        <RotateCcw className="h-3 w-3" />Restaurar esta versão
                      </button>
                    )}
                  </div>
                ))
              ) : auditoria.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground rounded-md border border-dashed p-3">Nenhuma alteração registrada ainda.</p>
              ) : auditoria.map((a) => (
                <div key={a.id} className="rounded-lg border bg-card/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{EVENTO[a.event] ?? a.event}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{quando(a.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate"><User className="h-3 w-3 shrink-0" />{a.user}</p>
                  {a.changes?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {a.changes.map((c, i) => (
                        <li key={i} className="text-[11px] leading-snug">
                          <span className="text-muted-foreground">{c.label}: </span>
                          <span className="line-through text-muted-foreground/70">{c.before}</span>
                          <span className="mx-1" aria-hidden>→</span>
                          <span className="font-medium">{c.after}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
