'use client'

import type { JSX, ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CircleStop, Undo2 } from 'lucide-react'
import { contagem, type CaminhoRoteiro, type EscolhaRoteiro, type NoRoteiro, type ParaleloRoteiro } from '@/lib/roteiro'
import { cn } from '@/lib/utils'
import { GatewayGlyph } from '../flow-shared'

/** Desenha uma lista de itens do Roteiro (recursão: os caminhos chamam de volta). */
export type RenderLista = (itens: NoRoteiro[], ref: string) => ReactNode

function Cabecalho({ id, selecionado, onSelecionar, tom, glifo, titulo, detalhe, acoes, alca }: {
  id: string; selecionado: boolean; onSelecionar: (id: string) => void
  tom: 'escolha' | 'paralelo'; glifo: ReactNode; titulo: string; detalhe: string
  acoes?: ReactNode; alca?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-1 pb-1.5">
      {alca}
      <button type="button" onClick={() => onSelecionar(id)} aria-expanded={selecionado}
        className={cn('flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] font-extrabold outline-none focus-visible:underline',
          tom === 'escolha' ? 'text-violet-700 dark:text-violet-300' : 'text-rose-700 dark:text-rose-300')}>
        {glifo}
        <span className="truncate">{titulo}</span>
        <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground">{detalhe}</span>
      </button>
      {acoes}
    </div>
  )
}

/** Pendências do bloco (as mesmas da pílula do topo), logo abaixo do cabeçalho. */
function Problemas({ problemas }: { problemas: string[] }): JSX.Element | null {
  if (!problemas.length) return null
  return (
    <ul className="mb-1.5 flex flex-col gap-1 px-1">
      {problemas.map((p, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11.5px] font-medium leading-snug text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{p}
        </li>
      ))}
    </ul>
  )
}

function FimPadrao({ c }: { c: CaminhoRoteiro }): JSX.Element {
  const Icone = c.fim.tipo === 'encerra' ? CircleStop : c.fim.tipo === 'volta' ? Undo2 : ArrowRight
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground">
      <Icone className="h-3 w-3" />{c.fimTexto}
    </p>
  )
}

/** Escolha: cartão lilás; cada caminho = condição em frase + etapas recuadas + o fim. */
export function GrupoEscolha({ no, selecionado, onSelecionar, aberto, renderLista, fimDoCaminho, aposCaminhos, acoesDoCaminho, acoes, alca }: {
  no: EscolhaRoteiro; selecionado: boolean; onSelecionar: (id: string) => void
  aberto?: ReactNode; renderLista: RenderLista
  /** seletor do fim do caminho (estrutura); sem ele, só o texto */
  fimDoCaminho?: (c: CaminhoRoteiro) => ReactNode
  /** "+ outra condição" */
  aposCaminhos?: ReactNode
  /** ✕ do caminho, ao lado da condição */
  acoesDoCaminho?: (c: CaminhoRoteiro) => ReactNode
  acoes?: ReactNode; alca?: ReactNode
}): JSX.Element {
  return (
    <div data-roteiro-id={no.id}
      className={cn('rounded-xl border bg-violet-500/[0.06] p-2', selecionado ? 'border-violet-500/60 shadow-[0_0_0_3px_rgb(139_92_246/0.15)]' : 'border-violet-500/20')}>
      <Cabecalho id={no.id} selecionado={selecionado} onSelecionar={onSelecionar} tom="escolha" acoes={acoes} alca={alca}
        glifo={<GatewayGlyph kind="exclusive" className="h-3.5 w-3.5 shrink-0" />}
        titulo={no.nome || 'Escolha sem pergunta'}
        detalhe={no.modo === 'todos' ? 'todos os que servirem' : 'o primeiro que servir'} />
      <Problemas problemas={no.problemas} />
      {selecionado && aberto && <div className="mb-2 overflow-hidden rounded-lg border bg-card">{aberto}</div>}
      <div className="flex flex-col gap-2">
        {no.caminhos.map((c) => (
          <div key={c.id}>
            <div className="flex items-center gap-1 px-1">
              <p className="min-w-0 flex-1 text-[12px] font-bold text-violet-700 dark:text-violet-300">
                {c.senao ? 'Senão'
                  : c.semCondicao ? <>Se <span className="font-semibold text-amber-700 dark:text-amber-300">… (falta a condição)</span></>
                    : <>Se <span className="font-semibold">{c.condicao}</span></>}
              </p>
              {acoesDoCaminho?.(c)}
            </div>
            <div className="ml-2 border-l-2 border-violet-500/25 pl-3 pt-1">
              {renderLista(c.itens, c.id)}
              {fimDoCaminho ? fimDoCaminho(c) : <FimPadrao c={c} />}
            </div>
          </div>
        ))}
        {aposCaminhos}
      </div>
    </div>
  )
}

/** Ao mesmo tempo: cartão rosado, ramos recuados, espera todos para seguir. */
export function GrupoParalelo({ no, selecionado, onSelecionar, aberto, renderLista, acoes, alca }: {
  no: ParaleloRoteiro; selecionado: boolean; onSelecionar: (id: string) => void
  aberto?: ReactNode; renderLista: RenderLista; acoes?: ReactNode; alca?: ReactNode
}): JSX.Element {
  return (
    <div data-roteiro-id={no.id}
      className={cn('rounded-xl border bg-rose-500/[0.06] p-2', selecionado ? 'border-rose-500/60 shadow-[0_0_0_3px_rgb(244_63_94/0.15)]' : 'border-rose-500/20')}>
      <Cabecalho id={no.id} selecionado={selecionado} onSelecionar={onSelecionar} tom="paralelo" acoes={acoes} alca={alca}
        glifo={<GatewayGlyph kind="parallel" className="h-3.5 w-3.5 shrink-0" />}
        titulo={no.nome || 'Ao mesmo tempo'} detalhe={contagem(no.ramos.length, 'ramo', 'ramos')} />
      <Problemas problemas={no.problemas} />
      {selecionado && aberto && <div className="mb-2 overflow-hidden rounded-lg border bg-card">{aberto}</div>}
      <div className="flex flex-col gap-2">
        {no.ramos.map((r, i) => (
          <div key={r.id}>
            <p className="px-1 text-[12px] font-bold text-rose-700 dark:text-rose-300">Ramo {i + 1}</p>
            <div className="ml-2 border-l-2 border-rose-500/25 pl-3 pt-1">{renderLista(r.itens, r.id)}</div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-[11.5px] font-medium text-muted-foreground">espera todos os ramos para seguir</p>
    </div>
  )
}
