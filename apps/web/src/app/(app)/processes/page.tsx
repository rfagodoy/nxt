'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, GitBranch, Zap, Play, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiFetch, apiJson } from '@/lib/http'

interface ProcessRow {
  id: string
  name: string
  description?: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  version: number
  updatedAt: string
}

const STATUS: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' }> = {
  DRAFT: { label: 'Rascunho', variant: 'secondary' },
  ACTIVE: { label: 'Ativo', variant: 'default' },
  ARCHIVED: { label: 'Arquivado', variant: 'outline' },
}

export default function ProcessesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<ProcessRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errCount, setErrCount] = useState(0)

  const load = useCallback(async () => {
    const [data, errs] = await Promise.all([
      apiJson<ProcessRow[]>('/api/processes'),
      apiJson<unknown[]>('/api/instances?status=ERROR'),
    ])
    setRows(data ?? [])
    setErrCount(errs?.length ?? 0)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activate = async (id: string) => {
    setBusy(id)
    try {
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.message || 'Não foi possível ativar o processo.')
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Processos</h1>
          <p className="text-[11px] text-muted-foreground">Desenhe fluxos BPMN e execute-os</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/processes/instancias"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              errCount > 0
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                : 'hover:bg-muted'
            }`}
            title="Painel de instâncias com erro"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Instâncias com erro
            {errCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white min-w-[16px]">
                {errCount}
              </span>
            )}
          </Link>
          <Button variant="outline" size="sm" onClick={load} title="Recarregar">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Link
            href="/processes/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo processo
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {rows === null ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitBranch className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold">Nenhum processo criado</h3>
            <p className="text-xs text-muted-foreground mt-1">Crie seu primeiro processo BPMN para começar</p>
            <Link
              href="/processes/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Criar processo
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-medium px-3 py-1.5">Processo</th>
                <th className="text-left font-medium px-3 py-1.5 w-28">Situação</th>
                <th className="text-left font-medium px-3 py-1.5 w-20">Versão</th>
                <th className="text-left font-medium px-3 py-1.5 w-32">Atualizado</th>
                <th className="text-right font-medium px-3 py-1.5 w-48">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5">
                    <Link href={`/processes/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.description && (
                      <span className="block text-[11px] text-muted-foreground truncate max-w-md">{p.description}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant={STATUS[p.status]?.variant ?? 'secondary'} className="text-[11px]">
                      {STATUS[p.status]?.label ?? p.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">v{p.version}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === 'DRAFT' && (
                        <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => activate(p.id)}>
                          {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                          Ativar
                        </Button>
                      )}
                      {p.status === 'ACTIVE' && (
                        <Button size="sm" onClick={() => router.push(`/processes/${p.id}?iniciar=1`)}>
                          <Play className="h-3.5 w-3.5" />
                          Iniciar
                        </Button>
                      )}
                      <Link
                        href={`/processes/${p.id}`}
                        className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                      >
                        Abrir
                      </Link>
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
