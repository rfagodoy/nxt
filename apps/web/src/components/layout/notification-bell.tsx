'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CalendarClock, RefreshCw, Gauge, CheckCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { useWorkspace } from '@/contexts/workspace-context'

interface Notif {
  id: string; tipo: string; severidade: string; titulo: string; mensagem: string
  contractId: string; contractNumero: string; contractTitulo: string; createdAt: string; read: boolean
}

const TIPO_ICON: Record<string, LucideIcon> = { VIGENCIA: CalendarClock, REAJUSTE: RefreshCw, CONSUMO: Gauge }
const SEV_CLS: Record<string, string> = {
  CRITICO: 'bg-red-500/10 text-red-600 dark:text-red-400',
  ALERTA:  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  INFO:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

function relTime(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora'
  const m = Math.round(s / 60); if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60); if (h < 24) return `há ${h}h`
  const d = Math.round(h / 24); if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/* Row mínimo para abrir o contrato na workspace (o ContractDetailView busca o resto por id). */
function minimalRow(n: Notif) {
  return {
    id: n.contractId, numero: n.contractNumero, titulo: n.contractTitulo, tipo: '', parte_principal: '',
    inicio: '', termino: null, valor_total: 0, situacao: 'VIGENTE', documento: '', papel: '',
    data_assinatura: '', moeda: '', valor_parcela: 0, condicao_pagamento: '',
  }
}

export function NotificationBell({ className }: { className?: string }) {
  const ws = useWorkspace()
  const [items, setItems] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try { const res = await apiFetch('/api/notifications'); if (res.ok) setItems(await res.json() as Notif[]) } catch { /* ignore */ }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const iv = setInterval(() => void load(), 120_000)                 // poll a cada 2 min
    const onRefresh = () => void load()
    window.addEventListener('nxt:workspace:refresh', onRefresh)         // atualiza após salvar/rodar
    return () => { clearInterval(iv); window.removeEventListener('nxt:workspace:refresh', onRefresh) }
  }, [load])

  // Ancora o painel à direita do sino, alinhado pela base. Painel vai num PORTAL no body
  // para que o backdrop-filter (Liquid Glass) amostre a página real — se ficasse dentro
  // da sidebar (que já tem backdrop-filter), o blur não se aplica e o conteúdo vaza.
  const toggle = () => {
    setOpen(o => {
      if (!o && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        setPos({ left: r.right + 8, bottom: window.innerHeight - r.bottom })
      }
      return !o
    })
  }
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unread = items.filter(i => !i.read).length

  const openContract = async (n: Notif) => {
    setOpen(false)
    if (!n.read) {
      setItems(p => p.map(i => i.id === n.id ? { ...i, read: true } : i))
      try { await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' }) } catch { /* ignore */ }
    }
    ws.open({ id: `contract:${n.contractId}`, kind: 'contract', mode: 'detail', label: n.contractNumero || 'Contrato', data: minimalRow(n) })
  }
  const markAll = async () => {
    setItems(p => p.map(i => ({ ...i, read: true })))
    try { await apiFetch('/api/notifications/read-all', { method: 'POST' }) } catch { /* ignore */ }
  }

  return (
    <div className="relative">
      <button ref={btnRef} onClick={toggle} title="Notificações"
        className={cn('relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-colors', className)}>
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', left: pos.left, bottom: pos.bottom }}
          className="glass z-50 w-[360px] overflow-hidden rounded-xl text-popover-foreground">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold">Notificações{unread > 0 && <span className="ml-1.5 text-muted-foreground">({unread})</span>}</span>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors">
                <CheckCheck className="h-3.5 w-3.5" />Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <Bell className="h-7 w-7 opacity-30" />
                <p className="text-xs">Nenhuma notificação.</p>
              </div>
            ) : items.map(n => {
              const Icon = TIPO_ICON[n.tipo] ?? Bell
              return (
                <button key={n.id} onClick={() => void openContract(n)}
                  className={cn('flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50', !n.read && 'bg-primary/[0.04]')}>
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', SEV_CLS[n.severidade] ?? SEV_CLS.INFO)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('truncate text-xs', !n.read ? 'font-semibold' : 'font-medium')}>{n.titulo}</span>
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{n.mensagem}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{n.contractNumero} · {relTime(n.createdAt)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
