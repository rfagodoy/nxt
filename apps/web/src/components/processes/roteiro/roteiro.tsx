'use client'

/* ─── Roteiro: o workflow em lista, ao lado do desenho ────────────────────────
   Spec: docs/superpowers/specs/2026-10-30-roteiro-design.md. A lista mostra os blocos na
   ordem em que acontecem (o que mostrar vem de `montarRoteiro`); a configuração abre na
   própria linha; a prévia do desenho fica ao lado, só para olhar e selecionar. Não guarda
   estado do workflow: tudo vem do editor por props. */
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { CircleDot, CircleStop, Plus, Workflow, X } from 'lucide-react'
import { adicionarCaminho, type FluxoBlocos } from '@nxt/workflow-core'
import { descreverLugar, destinoVizinho, lugaresParaMover, rotuloDoFimDaLista, type NoRoteiro } from '@/lib/roteiro'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, NoticeDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { FimSelect, escolhasEmParalelo, novoIdDeCaminho } from '../workflow-blocos'
import { LinhaEtapa } from './linha-etapa'
import { GrupoEscolha, GrupoParalelo } from './grupos'
import { Inserir, MenuDaLinha, type EstruturaDoRoteiro } from './estrutura'
import { Alca, LinhaDeSoltar, useArrastar, type Destino } from './arrastar'

/** Quantas etapas moram dentro de um item (inclusive em blocos aninhados). */
function contarEtapas(no: NoRoteiro): number {
  if (no.kind === 'etapa') return 1
  const listas = no.kind === 'escolha' ? no.caminhos.map((c) => c.itens) : no.ramos.map((r) => r.itens)
  return listas.flat().reduce((n, x) => n + contarEtapas(x), 0)
}

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
  /** para o fim de caminho (destinos de volta) e o "só segue" dentro de ao mesmo tempo */
  fluxo: FluxoBlocos
  nomeDe: (id: string) => string
  /** sem ela, a lista só mostra e configura (sem +, ⋯, fim editável) */
  estrutura?: EstruturaDoRoteiro
  /** reservado para o desenho livre (spec §4): aviso no topo da lista */
  avisoDoDesenho?: ReactNode
}

function EventoNaLista({ icone, texto, onClick }: { icone: ReactNode; texto: string; onClick?: () => void }): JSX.Element {
  const conteudo = <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{icone}{texto}</span>
  return onClick
    ? <button type="button" onClick={onClick} className="rounded px-1 py-1 text-left outline-none hover:bg-muted focus-visible:underline">{conteudo}</button>
    : <div className="px-1 py-1">{conteudo}</div>
}

export function Roteiro({ nos, inicio, selecionado, onSelecionar, previa, renderAberto, onVerDesenho, avisoDoDesenho, fluxo, nomeDe, estrutura }: RoteiroProps): JSX.Element {
  const emParalelo = useMemo(() => escolhasEmParalelo(fluxo), [fluxo])
  const [remocao, setRemocao] = useState<{ id: string; titulo: string; descricao: string; acao: () => void } | null>(null)
  const [recusa, setRecusa] = useState<string | null>(null)
  const listaArrasto = useRef<HTMLDivElement>(null)
  const { arrasto, iniciar } = useArrastar({
    lista: listaArrasto,
    avaliar: (id, d) => estrutura?.avaliar(id, d) ?? { ok: false, motivo: '' },
    mover: (id, d) => estrutura?.mover(id, d),
  })
  /* item recém-movido (para devolver o foco à alça) e o anúncio do lugar novo */
  const [movido, setMovido] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState('')
  /* Mover pelo menu: mesma regra do arrasto; recusado, diz o porquê. */
  const moverPeloMenu = (id: string, d: Destino) => {
    if (!estrutura) return
    const a = estrutura.avaliar(id, d)
    if (a.ok) { estrutura.mover(id, d); setMovido(id) }
    else setRecusa(a.motivo)
  }
  /* Alça pelo teclado: a vaga vizinha onde o arrasto soltaria (`destinoVizinho`). Depois de
     mover, o foco volta à alça do item (a linha pode ter mudado de lista) e o lugar novo
     é anunciado. */
  const moverPeloTeclado = (id: string, direcao: -1 | 1) => {
    if (!estrutura) return
    const d = destinoVizinho(fluxo, nos, id, direcao)
    if (!d) { setAnuncio(direcao < 0 ? 'Não dá para subir mais.' : 'Não dá para descer mais.'); return }
    estrutura.mover(id, d)
    setMovido(id)
  }
  useEffect(() => {
    if (!movido) return
    listaArrasto.current?.querySelector<HTMLElement>(`[data-alca-de="${CSS.escape(movido)}"]`)?.focus()
    const lugar = descreverLugar(nos, movido)
    if (lugar) setAnuncio(`Agora em ${lugar}.`)
    setMovido(null)
  }, [movido, nos])
  /* Remover escolha / ao mesmo tempo com etapas dentro pede confirmação dizendo o que vai junto. */
  const pedirRemocao = (no: NoRoteiro) => {
    if (!estrutura) return
    const n = no.kind === 'etapa' ? 0 : contarEtapas(no)
    if (!n) { estrutura.remover(no.id); return }
    const qual = no.kind === 'escolha' ? 'a escolha' : 'o bloco ao mesmo tempo'
    setRemocao({
      id: no.id, acao: () => estrutura.remover(no.id),
      titulo: no.kind === 'escolha' ? 'Remover a escolha?' : 'Remover o bloco ao mesmo tempo?',
      descricao: `Remove ${qual} e ${n === 1 ? 'a etapa' : `as ${n} etapas`} dos caminhos ${no.kind === 'escolha' ? 'dela' : 'dele'}. Dá para desfazer com Ctrl+Z.`,
    })
  }
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
    const fimDaLista = estrutura
      ? <Inserir estrutura={estrutura} refLista={ref} indice={itens.length} rotulo={rotuloDoFimDaLista(ref, itens.length)} />
      : null
    if (!itens.length) {
      return fimDaLista
        ? <div data-alvo-ref={ref} data-alvo-indice={0} data-alvo-fim>{fimDaLista}</div>
        : <p className="py-1 text-[11.5px] italic text-muted-foreground">nenhuma etapa</p>
    }
    return (
      <div className="flex flex-col" data-roteiro-lista={ref}>
        {itens.map((no, i) => {
          const sel = selecionado === no.id
          const entre = estrutura && <Inserir estrutura={estrutura} refLista={ref} indice={i} />
          const acoes = estrutura && (
            <MenuDaLinha rotulo={no.kind === 'etapa' ? (no.nome || 'Etapa sem nome') : (no.nome || (no.kind === 'escolha' ? 'Escolha' : 'Ao mesmo tempo'))}
              onRemover={() => pedirRemocao(no)}
              onCima={i > 0 ? () => moverPeloMenu(no.id, { ref, indice: i - 1 }) : undefined}
              onBaixo={i < itens.length - 1 ? () => moverPeloMenu(no.id, { ref, indice: i + 2 }) : undefined}
              lugares={() => lugaresParaMover(fluxo, nos, no.id).map((l) => ({ ref: l.destino.ref, rotulo: l.rotulo, onMover: () => moverPeloMenu(no.id, l.destino) }))}
              onDesvincular={no.kind === 'etapa' && no.etiquetas.some((e) => e.tipo === 'vinculo') ? () => estrutura.desvincular(no.id) : undefined} />
          )
          const alca = estrutura && <Alca id={no.id} rotulo={no.kind === 'etapa' ? (no.nome || 'etapa') : (no.nome || 'bloco')} onIniciar={() => iniciar(no.id)} onTecla={(d) => moverPeloTeclado(no.id, d)} />
          let linha: ReactNode
          if (no.kind === 'etapa') {
            linha = <LinhaEtapa no={no} selecionada={sel} onSelecionar={onSelecionar} aberto={sel ? renderAberto(no.id) : undefined} acoes={acoes} alca={alca} />
          } else if (no.kind === 'escolha') {
            const soSegue = no.modo === 'todos' || emParalelo.has(no.id)
            linha = (
              <GrupoEscolha no={no} selecionado={sel} onSelecionar={onSelecionar} aberto={sel ? renderAberto(no.id) : undefined} renderLista={renderLista} acoes={acoes} alca={alca}
                fimDoCaminho={estrutura ? (c) => (
                  <div className="mt-1" title={soSegue ? 'Em "todos os que servirem" ou dentro de um ao mesmo tempo, o caminho só pode seguir.' : undefined}>
                    {soSegue && c.fim.tipo === 'segue'
                      ? <span className="text-[11.5px] font-semibold text-muted-foreground">→ segue</span>
                      : <FimSelect fluxo={fluxo} escolhaId={no.id} caminhoId={c.id} fim={c.fim} nomeDe={nomeDe} onFluxo={estrutura.mudarFluxo} soSegue={soSegue} />}
                  </div>
                ) : undefined}
                acoesDoCaminho={estrutura && no.caminhos.filter((x) => !x.senao).length > 1 ? (c) => (c.senao ? null : (
                  <button type="button" onClick={() => {
                    const n = c.itens.reduce((t, x) => t + contarEtapas(x), 0)
                    if (!n) { estrutura.removerCaminho(no.id, c.id); return }
                    setRemocao({
                      id: c.id, acao: () => estrutura.removerCaminho(no.id, c.id), titulo: 'Remover este caminho?',
                      descricao: `Remove o caminho e ${n === 1 ? 'a etapa' : `as ${n} etapas`} dele. Dá para desfazer com Ctrl+Z.`,
                    })
                  }}
                    title="Remover este caminho" aria-label="Remover este caminho"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )) : undefined}
                aposCaminhos={estrutura && (
                  <button type="button" onClick={() => { const id = novoIdDeCaminho(); estrutura.mudarFluxo((f) => adicionarCaminho(f, no.id, id)) }}
                    className="inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-[12px] font-bold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300">
                    <Plus className="h-3.5 w-3.5" />outra condição
                  </button>
                )} />
            )
          } else {
            linha = <GrupoParalelo no={no} selecionado={sel} onSelecionar={onSelecionar} aberto={sel ? renderAberto(no.id) : undefined} renderLista={renderLista} acoes={acoes} alca={alca} />
          }
          return (
            <div key={no.id} data-alvo-ref={ref} data-alvo-indice={i} className={cn(arrasto?.id === no.id && 'opacity-40')}>
              {entre}{linha}
            </div>
          )
        })}
        {fimDaLista && <div className="pt-1" data-alvo-ref={ref} data-alvo-indice={itens.length} data-alvo-fim>{fimDaLista}</div>}
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
        <div ref={listaArrasto} className="relative pl-5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border">
          <EventoNaLista icone={<CircleDot className="h-3.5 w-3.5 text-primary" />} texto={`Início · ${inicio.texto}`} onClick={inicio.onAbrir} />
          <div className="py-1.5">{renderLista(nos, 'raiz')}</div>
          <EventoNaLista icone={<CircleStop className="h-3.5 w-3.5 text-primary" />} texto="Fim" />
          <LinhaDeSoltar arrasto={arrasto} />
          <p aria-live="polite" className="sr-only">{anuncio}</p>
        </div>
      </div>
      {comPrevia && <div className="relative min-w-0 flex-1">{previa}</div>}
      <NoticeDialog open={!!recusa} title="Não dá para mover para lá" message={recusa ?? ''} onClose={() => setRecusa(null)} />
      <ConfirmDialog open={!!remocao} tone="danger" title={remocao?.titulo ?? ''} description={remocao?.descricao ?? ''} confirmLabel="Remover"
        onConfirm={() => remocao?.acao()} onClose={() => setRemocao(null)} />
    </div>
  )
}
