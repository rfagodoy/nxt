'use client'

/* Histórico de notificações do usuário. O sininho mostra o que ainda pede ação;
   esta tela mostra o passado — paginada NO BANCO (a lista nunca carrega tudo). */

import { useState, useEffect, useCallback } from 'react'
import {
  Bell, CalendarClock, RefreshCw, Gauge, Inbox, Clock, AlarmClock, Undo2, Ban,
  CheckCheck, Loader2, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TablePagination } from '@/components/ui/table-pagination'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'

interface Notif {
  id: string; tipo: string; severidade: string; titulo: string; mensagem: string
  contractNumero: string; instanceId: string; taskId: string
  createdAt: string; read: boolean
}
interface Page { items: Notif[]; total: number; page: number; pageSize: number }

const TIPO_ICON: Record<string, LucideIcon> = {
  VIGENCIA: CalendarClock, REAJUSTE: RefreshCw, CONSUMO: Gauge,
  TAREFA_ATRIBUIDA: Inbox, TAREFA_A_VENCER: Clock, TAREFA_VENCIDA: AlarmClock,
  PROCESSO_DEVOLVIDO: Undo2, PROCESSO_CANCELADO: Ban,
}
const TIPO_LABEL: Record<string, string> = {
  VIGENCIA: 'Vigência', REAJUSTE: 'Reajuste', CONSUMO: 'Consumo',
  TAREFA_ATRIBUIDA: 'Tarefa atribuída', TAREFA_A_VENCER: 'Prazo próximo', TAREFA_VENCIDA: 'Prazo vencido',
  PROCESSO_DEVOLVIDO: 'Processo devolvido', PROCESSO_CANCELADO: 'Processo cancelado',
}
const SEV_CLS: Record<string, string> = {
  CRITICO: 'bg-red-500/10 text-red-600 dark:text-red-400',
  ALERTA:  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  INFO:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
})

export default function NotificacoesHistoricoPage() {
  const [data, setData] = useState<Page | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [tipo, setTipo] = useState('')
  const [unread, setUnread] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (tipo) qs.set('tipo', tipo)
      if (unread) qs.set('unread', '1')
      setData(await apiJson<Page>(`/api/notifications/history?${qs}`))
    } finally { setBusy(false) }
  }, [page, pageSize, tipo, unread])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1) }, [tipo, unread, pageSize])

  const markAll = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' })
    await load()
    try { window.dispatchEvent(new Event('nxt:workspace:refresh')) } catch { /* SSR */ }
  }

  const rows = data?.items ?? []

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Notificações</h1>
          <p className="text-[11px] text-muted-foreground">Tudo o que você foi avisado — o sininho mostra só o que ainda pede ação</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markAll}><CheckCheck className="h-3.5 w-3.5" />Marcar todas como lidas</Button>
          <Button variant="outline" size="sm" onClick={load} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" onClick={() => setUnread((u) => !u)}
          className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
            unread ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
          Somente não lidas
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {busy ? '…' : `${data?.total ?? 0} registro${(data?.total ?? 0) === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="rounded-xl border bg-card shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
          {data === null ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando…</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Bell} title="Nenhuma notificação" description={tipo || unread ? 'Nenhuma notificação com os filtros aplicados.' : 'Você ainda não recebeu avisos.'} />
          ) : (
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b">
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground bg-muted whitespace-nowrap">Tipo</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground bg-muted">Aviso</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground bg-muted whitespace-nowrap">Quando</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground bg-muted whitespace-nowrap">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => {
                  const Icon = TIPO_ICON[n.tipo] ?? Bell
                  return (
                    <tr key={n.id} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors', !n.read && 'bg-primary/[0.03]')}>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', SEV_CLS[n.severidade] ?? SEV_CLS.INFO)}>
                            <Icon className="h-3 w-3" />
                          </span>
                          {TIPO_LABEL[n.tipo] ?? n.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p className={cn('text-xs', !n.read && 'font-semibold')}>{n.titulo}</p>
                        <p className="text-[11px] text-muted-foreground">{n.mensagem}</p>
                      </td>
                      <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">{fmt(n.createdAt)}</td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        {n.read
                          ? <span className="text-muted-foreground">lida</span>
                          : <span className="inline-flex items-center gap-1 text-primary font-medium"><span className="h-1.5 w-1.5 rounded-full bg-primary" />não lida</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <TablePagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>
  )
}
