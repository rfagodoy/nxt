'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Zap, Play, Pencil, Loader2, GitBranch, User, Cog, Circle, Diamond } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiFetch, apiJson } from '@/lib/http'
import { InstanceRunner } from '@/components/processes/instance-runner'
import type { ProcessFormSchema } from '@nxt/types'

interface GraphNode { id: string; type: string; name?: string; role?: string }
interface Process {
  id: string
  name: string
  description?: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  version: number
  formSchema: ProcessFormSchema
  compiledGraph?: { nodes: Record<string, GraphNode>; startId: string } | null
}

const NODE_META: Record<string, { label: string; icon: typeof Circle }> = {
  start: { label: 'Início', icon: Circle },
  end: { label: 'Fim', icon: Circle },
  userTask: { label: 'Atividade', icon: User },
  serviceTask: { label: 'Serviço', icon: Cog },
  exclusiveGateway: { label: 'Decisão', icon: Diamond },
  parallelGateway: { label: 'Paralelo', icon: Diamond },
}

export default function ProcessDetailPage() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const id = params.id

  const [proc, setProc] = useState<Process | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    const data = await apiJson<Process>(`/api/processes/${id}`)
    setProc(data)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // auto-iniciar quando vier da lista com ?iniciar=1 e o processo estiver ativo
  useEffect(() => {
    if (proc?.status === 'ACTIVE' && search.get('iniciar') === '1') setRunning(true)
  }, [proc?.status, search])

  const activate = async () => {
    setBusy(true)
    try {
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        alert(e?.message || 'Não foi possível ativar o processo.')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (proc === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
      </div>
    )
  }
  if (proc === null) {
    return (
      <div className="space-y-3">
        <Link href="/processes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Processos
        </Link>
        <p className="text-sm">Processo não encontrado.</p>
      </div>
    )
  }

  const nodes = proc.compiledGraph?.nodes ? Object.values(proc.compiledGraph.nodes) : []
  const activities = nodes.filter((n) => n.type === 'userTask' || n.type === 'serviceTask')

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/processes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Processos
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight truncate">{proc.name}</h1>
            <Badge variant={proc.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[11px]">
              {proc.status === 'ACTIVE' ? 'Ativo' : proc.status === 'DRAFT' ? 'Rascunho' : 'Arquivado'}
            </Badge>
            <span className="text-[11px] text-muted-foreground">v{proc.version}</span>
          </div>
          {proc.description && <p className="text-xs text-muted-foreground mt-1">{proc.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {proc.status === 'DRAFT' && (
            <Button size="sm" onClick={activate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Ativar
            </Button>
          )}
          {!running && (
            <Link
              href={`/processes/${id}/edit`}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Link>
          )}
          {proc.status === 'ACTIVE' && !running && (
            <Button size="sm" onClick={() => setRunning(true)}>
              <Play className="h-4 w-4" /> Iniciar
            </Button>
          )}
        </div>
      </div>

      {running && (
        <InstanceRunner
          processDefinitionId={proc.id}
          processName={proc.name}
          formSchema={proc.formSchema}
          onClose={() => {
            setRunning(false)
            router.replace(`/processes/${id}`)
          }}
        />
      )}

      {/* Mapa das atividades (grafo compilado) */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Atividades</span>
          {proc.status === 'DRAFT' && (
            <span className="ml-auto text-[11px] text-muted-foreground">ative o processo para executar</span>
          )}
        </div>
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground px-4 py-6 text-center">
            {proc.compiledGraph ? 'Sem atividades no diagrama.' : 'Diagrama ainda não compilado (ative o processo).'}
          </p>
        ) : (
          <ul className="divide-y">
            {activities.map((n) => {
              const meta = NODE_META[n.type] ?? { label: n.type, icon: Circle }
              const Icon = meta.icon
              const fields = proc.formSchema.steps?.find((s) => s.stepId === n.id)?.fields.length ?? 0
              return (
                <li key={n.id} className="flex items-center gap-2.5 px-4 py-2">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{n.name || n.id}</span>
                  <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                  {n.role && <span className="text-[11px] text-muted-foreground">executor: {n.role}</span>}
                  {n.type === 'userTask' && (
                    <span className="ml-auto text-[11px] text-muted-foreground">{fields} campo{fields !== 1 ? 's' : ''}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
