'use client'

import { useRef, useState } from 'react'
import { ChevronDown, Loader2, Workflow } from 'lucide-react'
import { KINDS_QUE_NASCEM_DE_CONTRATO } from '@nxt/types'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { NoticeDialog } from '@/components/ui/confirm-dialog'
import { apiJson } from '@/lib/http'
import { useIniciarProcesso, type DesfechoInicio } from '@/lib/iniciar-processo'
import { WorkflowKindIcon } from './workflow-kind-icon'

interface Proc { id: string; name: string; status: string; kind?: string | null }

/**
 * "Iniciar processo" DENTRO do contrato: lista os workflows ativos de Aditivo e Encerramento
 * e inicia já com este contrato como `contratoId` — sem perguntar "qual contrato?", porque a
 * pessoa já está nele (decisão do PO, 04/10/2026). Mesmo caminho de início do "Novo processo".
 */
export function IniciarDoContrato({ contratoId }: { contratoId: string }) {
  const botao = useRef<HTMLButtonElement>(null)
  const iniciarProcesso = useIniciarProcesso()
  const [aberto, setAberto] = useState(false)
  const [procs, setProcs] = useState<Proc[] | null>(null)
  const [iniciando, setIniciando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<DesfechoInicio>(null)

  const abrir = async () => {
    setAberto((v) => !v)
    if (procs === null) {
      /* só o que esta pessoa pode iniciar; com regra por parte do contrato, só se ela ocupa o
         papel NESTE contrato (PO, 04/10/2026) */
      const todos = await apiJson<Array<Proc & { porContrato?: boolean }>>('/api/processes/iniciaveis')
      const daqui = (todos ?? []).filter((p) => (KINDS_QUE_NASCEM_DE_CONTRATO as readonly string[]).includes(p.kind ?? ''))
      const servem = await Promise.all(daqui.map(async (p) => !p.porContrato ||
        (await apiJson<Array<{ id: string }>>(`/api/processes/${p.id}/contratos-para-iniciar`).catch(() => []) ?? []).some((c) => c.id === contratoId)))
      setProcs(daqui.filter((_, i) => servem[i]))
    }
  }
  const iniciar = async (p: Proc) => {
    setIniciando(p.id)
    const desfecho = await iniciarProcesso(p, { contratoId })
    setIniciando(null)
    setAberto(false)
    if (desfecho) setAviso(desfecho)
  }

  return (
    <>
      <button ref={botao} type="button" onClick={() => void abrir()} aria-haspopup="menu" aria-expanded={aberto}
        className="inline-flex items-center gap-1 h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
        <Workflow className="h-3.5 w-3.5" />Iniciar processo<ChevronDown className="h-3 w-3" />
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} align="end" role="menu"
          className="glass min-w-[240px] rounded-xl p-1 text-popover-foreground">
          {procs === null ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Carregando…</p>
          ) : procs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum workflow ativo de aditivo ou encerramento.</p>
          ) : procs.map((p) => (
            <button key={p.id} type="button" role="menuitem" onClick={() => void iniciar(p)} disabled={!!iniciando}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-60">
              {iniciando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WorkflowKindIcon kind={p.kind} className="h-3.5 w-3.5" />}
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </FloatingMenu>
      )}
      <NoticeDialog open={!!aviso} message={aviso?.msg ?? ''} tone={aviso?.tom === 'ok' ? 'info' : 'error'} onClose={() => setAviso(null)} />
    </>
  )
}
