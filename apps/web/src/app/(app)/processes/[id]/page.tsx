'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Zap, Play, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiFetch, apiJson } from '@/lib/http'
import { InstanceRunner } from '@/components/processes/instance-runner'
import type { ProcessFormSchema } from '@nxt/types'

interface Process {
  id: string
  name: string
  description?: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  version: number
  formSchema: ProcessFormSchema
}

/** Superfície de EXECUÇÃO do processo. O desenho/configuração vivem no editor
 *  (storyboard) — o clique no nome vai pra lá. Aqui só se INICIA/executa uma
 *  instância (também alvo dos botões "Novo processo" via ?iniciar=1). */
export default function ProcessRunPage() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const id = params.id

  const [proc, setProc] = useState<Process | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setProc(await apiJson<Process>(`/api/processes/${id}`))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // auto-iniciar quando vier de "Iniciar"/"Novo processo" com ?iniciar=1
  useEffect(() => {
    if (proc?.status === 'ACTIVE' && search.get('iniciar') === '1') setRunning(true)
  }, [proc?.status, search])

  const activate = async () => {
    setBusy(true)
    try {
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        alert(e?.message || 'Não foi possível ativar o workflow.')
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
          <ArrowLeft className="h-3.5 w-3.5" /> Workflows
        </Link>
        <p className="text-sm">Workflow não encontrado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/processes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Workflows
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

      {running ? (
        <InstanceRunner
          processDefinitionId={proc.id}
          processName={proc.name}
          formSchema={proc.formSchema}
          onClose={() => {
            setRunning(false)
            router.replace(`/processes/${id}`)
          }}
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm px-6 py-10 text-center">
          {proc.status === 'ACTIVE' ? (
            <>
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold">Pronto para executar</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em “Iniciar” para rodar uma nova instância deste workflow.</p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <Zap className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold">Workflow em rascunho</p>
              <p className="text-xs text-muted-foreground mt-1">Ative o workflow para poder executá-lo, ou abra o editor para ajustá-lo.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
