'use client'

/* ─── Roteiro: o workflow em lista, ao lado do desenho ────────────────────────
   Spec: docs/superpowers/specs/2026-10-30-roteiro-design.md. A lista mostra os blocos na
   ordem em que acontecem (o que mostrar vem de `montarRoteiro`); a configuração abre na
   própria linha; a prévia do desenho fica ao lado, só para olhar e selecionar. Não guarda
   estado do workflow: tudo vem do editor por props. */
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { CircleDot, CircleStop, Workflow } from 'lucide-react'
import type { NoRoteiro } from '@/lib/roteiro'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LinhaEtapa } from './linha-etapa'
import { GrupoEscolha, GrupoParalelo } from './grupos'

/** Abaixo desta largura a prévia some e a lista ocupa tudo. */
const LARGURA_COM_PREVIA = 1100

export interface RoteiroProps {
  nos: NoRoteiro[]
  inicio: { texto: string; onAbrir: () => void }
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  /** o desenho só para olhar, montado pelo editor */
  previa: ReactNode
  /** configuração do item aberto (etapa: as perguntas; escolha / ao mesmo tempo: o bloco) */
  renderAberto: (id: string) => ReactNode
  onVerDesenho: () => void
  /** reservado para o desenho livre (spec §4): aviso no topo da lista */
  avisoDoDesenho?: ReactNode
}

function EventoNaLista({ icone, texto, onClick }: { icone: ReactNode; texto: string; onClick?: () => void }): JSX.Element {
  const conteudo = <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{icone}{texto}</span>
  return onClick
    ? <button type="button" onClick={onClick} className="rounded px-1 py-1 text-left outline-none hover:bg-muted focus-visible:underline">{conteudo}</button>
    : <div className="px-1 py-1">{conteudo}</div>
}

export function Roteiro({ nos, inicio, selecionado, onSelecionar, previa, renderAberto, onVerDesenho, avisoDoDesenho }: RoteiroProps): JSX.Element {
  const raizRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const [comPrevia, setComPrevia] = useState(true)
  useEffect(() => {
    const el = raizRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setComPrevia(e.contentRect.width >= LARGURA_COM_PREVIA))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Selecionou (na lista, na prévia ou por uma pendência): a linha aparece. Rola SÓ a coluna
     da lista — `scrollIntoView` arrastaria os contêineres do editor junto. */
  useEffect(() => {
    const lista = listaRef.current
    if (!selecionado || !lista) return
    const alvo = lista.querySelector<HTMLElement>(`[data-roteiro-id="${CSS.escape(selecionado)}"]`)
    if (!alvo) return
    const a = alvo.getBoundingClientRect(), l = lista.getBoundingClientRect()
    if (a.top < l.top + 8) lista.scrollTop -= l.top + 8 - a.top
    else if (a.top > l.bottom - 80) lista.scrollTop += a.top - l.top - 80
  }, [selecionado])

  const renderLista = (itens: NoRoteiro[], ref: string): ReactNode => {
    if (!itens.length) return <p className="py-1 text-[11.5px] italic text-muted-foreground">nenhuma etapa</p>
    return (
      <div className="flex flex-col gap-1.5" data-roteiro-lista={ref}>
        {itens.map((no) => {
          const sel = selecionado === no.id
          if (no.kind === 'etapa') {
            return <LinhaEtapa key={no.id} no={no} selecionada={sel} onSelecionar={onSelecionar} aberto={sel ? renderAberto(no.id) : undefined} />
          }
          if (no.kind === 'escolha') {
            return <GrupoEscolha key={no.id} no={no} selecionado={sel} onSelecionar={onSelecionar} aberto={sel ? renderAberto(no.id) : undefined} renderLista={renderLista} />
          }
          return <GrupoParalelo key={no.id} no={no} selecionado={sel} onSelecionar={onSelecionar} aberto={sel ? renderAberto(no.id) : undefined} renderLista={renderLista} />
        })}
      </div>
    )
  }

  return (
    <div ref={raizRef} className="flex min-h-0 min-w-0 flex-1">
      <div ref={listaRef} data-rolagem-roteiro
        className={cn('min-h-0 overflow-y-auto rolagem-visivel px-4 py-3', comPrevia ? 'w-[clamp(560px,42%,680px)] shrink-0 border-r' : 'min-w-0 flex-1')}>
        {!comPrevia && (
          <div className="mb-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={onVerDesenho}><Workflow className="h-4 w-4" />Ver desenho</Button>
          </div>
        )}
        {avisoDoDesenho}
        <div className="relative pl-5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border">
          <EventoNaLista icone={<CircleDot className="h-3.5 w-3.5 text-primary" />} texto={`Início · ${inicio.texto}`} onClick={inicio.onAbrir} />
          <div className="py-1.5">{renderLista(nos, 'raiz')}</div>
          <EventoNaLista icone={<CircleStop className="h-3.5 w-3.5 text-primary" />} texto="Fim" />
        </div>
      </div>
      {comPrevia && <div className="relative min-w-0 flex-1">{previa}</div>}
    </div>
  )
}
