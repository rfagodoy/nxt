'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Loader2, RefreshCw, RotateCw, XCircle, CheckCircle2, ArrowLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, apiJson } from '@/lib/http'

interface ErrInstance {
  id: string
  processName: string
  version: number
  status: string
  error: string | null
  stepName: string | null
  startedBy: string | null
  startedAt: string
  updatedAt: string
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function InstanciasErroPage() {
  const [rows, setRows] = useState<ErrInstance[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<ErrInstance[]>('/api/instances?status=ERROR')
    setRows(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const retry = async (inst: ErrInstance) => {
    setBusy(inst.id)
    setNotice(null)
    try {
      const res = await apiFetch(`/api/instances/${inst.id}/retry`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice({ kind: 'err', text: body?.message || 'Não foi possível reprocessar.' })
        return
      }
      // Reprocessou: pode ter avançado/concluído, ou falhado de novo (segue em ERRO).
      setNotice(
        body?.errored
          ? { kind: 'err', text: `A etapa falhou novamente: ${body.errored}` }
          : { kind: 'ok', text: `Instância de "${inst.processName}" reprocessada com sucesso.` },
      )
      await load()
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (inst: ErrInstance) => {
    if (!confirm(`Cancelar definitivamente esta instância de "${inst.processName}"? Isso encerra o processo e não pode ser desfeito.`)) return
    setBusy(inst.id)
    setNotice(null)
    try {
      const res = await apiFetch(`/api/instances/${inst.id}/cancel`, { method: 'PATCH' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setNotice({ kind: 'err', text: body?.message || 'Não foi possível cancelar.' })
        return
      }
      setNotice({ kind: 'ok', text: `Instância de "${inst.processName}" cancelada.` })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/processes" className="text-muted-foreground hover:text-foreground transition-colors" title="Voltar aos processos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-base font-semibold tracking-tight">Instâncias com erro</h1>
          </div>
          <p className="text-[11px] text-muted-foreground ml-6">Processos interrompidos numa etapa automática — reprocesse após corrigir a causa, ou cancele</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} title="Recarregar">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {notice && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
          notice.kind === 'ok'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
        }`}>
          {notice.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 hover:opacity-70" title="Dispensar">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {rows === null ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500/60 mb-3" />
            <h3 className="text-sm font-semibold">Nenhuma instância com erro 🎉</h3>
            <p className="text-xs text-muted-foreground mt-1">Todos os processos em andamento estão saudáveis</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-medium px-3 py-1.5">Processo / etapa parada</th>
                <th className="text-left font-medium px-3 py-1.5">Causa do erro</th>
                <th className="text-left font-medium px-3 py-1.5 w-40">Iniciado por</th>
                <th className="text-left font-medium px-3 py-1.5 w-28">Atualizado</th>
                <th className="text-right font-medium px-3 py-1.5 w-52">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inst) => (
                <tr key={inst.id} className="border-b last:border-0 align-top hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <p className="font-medium">{inst.processName} <span className="text-[11px] text-muted-foreground font-normal">v{inst.version}</span></p>
                    {inst.stepName && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <ChevronRight className="h-3 w-3" />{inst.stepName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-start gap-1.5 text-[12px] text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="max-w-md">{inst.error || 'Erro não especificado'}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-[12px]">{inst.startedBy || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-[12px] whitespace-nowrap">{fmt(inst.updatedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" disabled={busy === inst.id} onClick={() => retry(inst)} title="Reexecutar a etapa automática que falhou">
                        {busy === inst.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                        Reprocessar
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === inst.id} onClick={() => cancel(inst)} title="Cancelar a instância">
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
