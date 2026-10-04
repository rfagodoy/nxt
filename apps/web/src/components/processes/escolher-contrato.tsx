'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileText, Loader2, Search } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { SIT_LABEL } from '@/lib/contract-situacao'

export interface ContratoEscolhido { id: string; numero: string; titulo: string }

interface Linha extends ContratoEscolhido { situacao: string; parte_principal?: string | null }

/**
 * "Qual contrato?" — Aditivo e Encerramento nascem DE um contrato existente (decisão do PO,
 * 04/10/2026). O contrato escolhido vira a variável `contratoId` desde a partida: é sobre
 * ele que as atividades trabalham e é nele que o executor "Da variável" procura as partes.
 * Contrato já encerrado, rescindido ou cancelado não aparece — não se adita nem se encerra.
 * A lista vem da API por workflow: com "Quem inicia" por parte do contrato, só os contratos em
 * que a pessoa ocupa o papel (PO, 04/10/2026).
 */
export function EscolherContrato({ processoId, processo, onEscolher, onVoltar, iniciando }: {
  processoId: string
  /** nome do workflow, para o título dizer o que vai começar */
  processo: string
  onEscolher: (c: ContratoEscolhido) => void
  onVoltar?: () => void
  /** id do contrato cujo início está em andamento (mostra o giro na linha) */
  iniciando?: string | null
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [busca, setBusca] = useState('')
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    apiJson<Linha[]>(`/api/processes/${processoId}/contratos-para-iniciar`)
      .then((r) => { if (!vivo) return; if (r) setLinhas(r); else setFalhou(true) })
    return () => { vivo = false }
  }, [processoId])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!linhas) return null
    return q ? linhas.filter((c) => `${c.numero} ${c.titulo} ${c.parte_principal ?? ''}`.toLowerCase().includes(q)) : linhas
  }, [linhas, busca])

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        {onVoltar && (
          <button type="button" onClick={onVoltar} title="Voltar à lista de processos" aria-label="Voltar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-bold tracking-tight">Qual contrato?</p>
          <p className="truncate text-[11px] text-muted-foreground">“{processo}” trabalha sobre um contrato existente.</p>
        </div>
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, título ou parte…"
          aria-label="Buscar contrato"
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs" />
      </label>
      <div className="max-h-[50vh] overflow-y-auto rolagem-visivel">
        {falhou ? (
          <p className="px-2 py-6 text-center text-xs text-destructive">Não foi possível carregar os contratos. Tente de novo.</p>
        ) : visiveis === null ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Carregando contratos…</p>
        ) : visiveis.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {linhas?.length ? 'Nenhum contrato com esse termo.' : 'Nenhum contrato em andamento em que você possa iniciar este processo.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visiveis.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onEscolher(c)} disabled={!!iniciando}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-primary/[0.07] focus-visible:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60">
                  {iniciando === c.id
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{c.numero} · {c.titulo}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[c.parte_principal, SIT_LABEL[c.situacao] ?? c.situacao].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
