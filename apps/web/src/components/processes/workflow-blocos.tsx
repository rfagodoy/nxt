'use client'

/* ─── Editor em BLOCOS ─────────────────────────────────────────────────────────
 *
 * O fluxo é uma SEQUÊNCIA que corre da esquerda para a direita: Início → itens → Fim.
 * Cada item é uma atividade ou um bloco que já nasce completo — "Escolher um caminho"
 * (caminhos com condição + caso contrário) ou "Fazer ao mesmo tempo". Não há seta para
 * ligar à mão: o `+` entre dois itens insere, e os caminhos se reencontram sozinhos na
 * saída do bloco. O grafo que o motor executa é gerado disso (@nxt/workflow-core/blocos).
 */

import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Building2, ChevronDown, ChevronsDownUp, ChevronsUpDown, Clock, CornerDownRight, GripVertical, Info, Link2, Play, Plus, SlidersHorizontal, Trash2, User, UserSquare, X, Zap } from 'lucide-react'
import {
  acharItem, adicionarCaminho, atualizarCaminho, atualizarItem, destinosDeVolta, gruposDeVinculo, listarAtividades, modoDaEscolha, moverCaminho, moverItem, removerCaminho, senaoParaCaminho, temSenaoAntigo,
  type BlocoEscolha, type ModoEscolha, type BlocoParalelo, type CaminhoCondicional, type FimCaminho, type FluxoBlocos,
  type ItemAtividade, type ItemFluxo, type ProblemaAtivacao,
} from '@nxt/workflow-core'
import type { EdgeConditionSpec, StepFormSchema } from '@nxt/types'
import { camposDasTelasDasAtividades, decidirSaidas, montarVarsSimulacao, type CampoDisponivel } from '@/lib/flow-conditions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { useScreens } from '@/hooks/use-screens'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { CondBuilder } from './condition-builder'
import { GatewayGlyph, PendenciasPill, ZoomBar, ZOOM_MAX, ZOOM_MIN } from './flow-shared'
import { cn } from '@/lib/utils'

/* ─── modelo ─────────────────────────────────────────────────────────────────── */

const PREF_EXPANDIR = 'nxt:workflow:expandir-tudo'

const novoId = (prefixo: string) => `${prefixo}_${Math.random().toString(36).slice(2, 9)}`

export type NovoItem = 'userTask' | 'serviceTask' | 'escolha' | 'paralelo'

/** Item recém-criado. A escolha nasce com um caminho condicional + o caso contrário; o
 *  "ao mesmo tempo", com dois caminhos — um bloco com menos não faria sentido. */
export function novoItem(tipo: NovoItem): ItemFluxo {
  if (tipo === 'escolha') {
    /* nasce "todos os que servirem" e sem Senão (vazio = segue adiante) — PO, 04/10/2026 */
    return {
      kind: 'escolha', id: novoId('Escolha'), pergunta: '', modo: 'todos',
      caminhos: [{ id: novoId('Caminho'), itens: [], fim: { tipo: 'segue' } }],
      casoContrario: { id: novoId('Caminho'), itens: [], fim: { tipo: 'segue' } },
    }
  }
  if (tipo === 'paralelo') {
    return { kind: 'paralelo', id: novoId('Paralelo'), nome: '', caminhos: [{ id: novoId('Caminho'), itens: [] }, { id: novoId('Caminho'), itens: [] }] }
  }
  return { kind: 'atividade', id: novoId('Node'), tipo }
}

/** Cópia do fluxo com o nome de cada atividade tirado do passo, onde a pessoa o edita. */
export function comNomes(f: FluxoBlocos, steps: Record<string, StepFormSchema>): FluxoBlocos {
  const mapa = (itens: ItemFluxo[]): ItemFluxo[] => itens.map((it) => {
    if (it.kind === 'atividade') return { ...it, nome: steps[it.id]?.stepName || undefined }
    if (it.kind === 'escolha') {
      return { ...it, caminhos: it.caminhos.map((c) => ({ ...c, itens: mapa(c.itens) })), casoContrario: { ...it.casoContrario, itens: mapa(it.casoContrario.itens) } }
    }
    return { ...it, caminhos: it.caminhos.map((c) => ({ ...c, itens: mapa(c.itens) })) }
  })
  return { ...f, itens: mapa(f.itens) }
}

/** Escolhas que moram dentro de um "ao mesmo tempo": ali todo caminho só pode seguir. */
function escolhasEmParalelo(f: FluxoBlocos): Set<string> {
  const out = new Set<string>()
  const visitar = (itens: ItemFluxo[], dentro: boolean) => {
    for (const it of itens) {
      if (it.kind === 'escolha') {
        if (dentro) out.add(it.id)
        for (const c of [...it.caminhos, it.casoContrario]) visitar(c.itens, dentro)
      } else if (it.kind === 'paralelo') {
        for (const c of it.caminhos) visitar(c.itens, true)
      }
    }
  }
  visitar(f.itens, false)
  return out
}

/** Atividades de uma lista de itens, inclusive as de blocos aninhados nela. */
function atividadesDentro(itens: ItemFluxo[]): ItemAtividade[] {
  return itens.flatMap((it) => (it.kind === 'atividade' ? [it]
    : it.kind === 'escolha' ? [...it.caminhos, it.casoContrario].flatMap((c) => atividadesDentro(c.itens))
      : it.caminhos.flatMap((c) => atividadesDentro(c.itens))))
}

function resumoItens(itens: ItemFluxo[], nomeDe: (id: string) => string): string {
  if (!itens.length) return 'nenhuma atividade'
  return itens.map((it) => (it.kind === 'atividade' ? nomeDe(it.id)
    : it.kind === 'escolha' ? `escolha “${it.pergunta?.trim() || 'sem pergunta'}”`
      : `ao mesmo tempo “${it.nome?.trim() || 'sem nome'}”`)).join(' → ')
}
function textoFim(fim: FimCaminho, nomeDe: (id: string) => string): string {
  if (fim.tipo === 'encerra') return 'encerra o processo'
  if (fim.tipo === 'volta') return `volta para ${nomeDe(fim.alvoId)}`
  return 'segue'
}

/* ─── trilho ─────────────────────────────────────────────────────────────────── */

export type MetaAtividade = { kind: 'exec' | 'entidade' | 'prazo'; text: string }
/** "Testar": quais caminhos da escolha serviriam com os valores de exemplo (vários no "todos"). */
export type Simulacao = { blocoId: string; caminhoIds: string[] }
type Screens = ReturnType<typeof useScreens>['screens']

interface TrilhoProps {
  fluxo: FluxoBlocos
  steps: Record<string, StepFormSchema>
  selectedId: string | null
  simulacao: Simulacao | null
  metaDe: (id: string) => MetaAtividade[]
  onAbrir: (id: string | null) => void
  onInserir: (ref: string, indice: number, tipo: NovoItem) => void
  /** insere uma atividade VINCULADA a outra já configurada (mesma configuração) */
  onInserirVinculada: (ref: string, indice: number, origemId: string) => void
  onRemover: (id: string) => void
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
  /** telas — de onde saem os campos que o filtro de cada caminho pode usar */
  screens: Screens
  onSimulacao: (s: Simulacao | null) => void
  /** abre a configuração de uma atividade (o conserto de "caminho sem campos") */
  onConfigurarAtividade?: (atividadeId: string) => void
}
interface TrilhoCtx extends TrilhoProps {
  /** blocos abertos em gaveta, de fora para dentro */
  abertos: string[]
  alternarBloco: (id: string) => void
  /** tudo aberto no próprio trilho (o desenho antigo) */
  expandirTudo: boolean
  /** raiz → atividades vinculadas a ela */
  vinculos: Map<string, string[]>
  arrastando: string | null
  setArrastando: (id: string | null) => void
  problemas: Map<string, ProblemaAtivacao[]>
  emParalelo: Set<string>
  nomeDe: (id: string) => string
}
const Ctx = createContext<TrilhoCtx | null>(null)
function useTrilho(): TrilhoCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTrilho fora do BlocosTrilho')
  return c
}

export function BlocosTrilho({ pendencias, pendAberto, onTogglePend, onFocar, ...props }: TrilhoProps & {
  pendencias: ProblemaAtivacao[]; pendAberto: boolean; onTogglePend: () => void; onFocar: (p: ProblemaAtivacao) => void
}) {
  const [arrastando, setArrastando] = useState<string | null>(null)
  /* Mapa (opção A): blocos recolhidos em cartões; os abertos viram gavetas embaixo. */
  const [expandirTudo, setExpandirTudoState] = useState(false)
  useEffect(() => { try { setExpandirTudoState(localStorage.getItem(PREF_EXPANDIR) === '1') } catch { /* sem storage */ } }, [])
  const setExpandirTudo = (v: boolean) => { setExpandirTudoState(v); try { localStorage.setItem(PREF_EXPANDIR, v ? '1' : '0') } catch { /* sem storage */ } }
  const [abertosBrutos, setAbertos] = useState<string[]>([])
  const abertos = useMemo(() => abertosBrutos.filter((id) => { const b = acharItem(props.fluxo, id); return !!b && b.kind !== 'atividade' }), [abertosBrutos, props.fluxo])
  const alternarBloco = (id: string) => {
    if (abertos.includes(id)) { setAbertos(abertos.slice(0, abertos.indexOf(id))); return } // recolher não mexe na seleção
    setAbertos([...blocosAcimaDe(props.fluxo, id), id])
    props.onAbrir(id)
  }
  /* Seleção vinda de FORA (bloco recém-inserido, pendência clicada): abre a gaveta dele —
     ou a do bloco onde a atividade mora — para ela não ficar escondida num cartão. */
  useEffect(() => {
    const id = props.selectedId
    if (!id) return
    const it = acharItem(props.fluxo, id)
    if (!it) return
    const cadeia = [...blocosAcimaDe(props.fluxo, id), ...(it.kind !== 'atividade' ? [id] : [])]
    // só ABRE: selecionar algo no trilho principal não fecha as gavetas abertas
    setAbertos((atual) => (!cadeia.length || cadeia.every((x, i) => atual[i] === x) ? atual : cadeia))
  }, [props.selectedId]) // eslint-disable-line react-hooks/exhaustive-deps
  const problemas = useMemo(() => {
    const m = new Map<string, ProblemaAtivacao[]>()
    for (const p of pendencias) if (p.nodeId) m.set(p.nodeId, [...(m.get(p.nodeId) ?? []), p])
    return m
  }, [pendencias])
  const emParalelo = useMemo(() => escolhasEmParalelo(props.fluxo), [props.fluxo])
  const vinculos = useMemo(() => gruposDeVinculo(props.fluxo), [props.fluxo])
  const nomeDe = (id: string) => props.steps[id]?.stepName?.trim() || 'Atividade sem nome'

  /* Zoom por `zoom` do CSS (e não transform): o trilho reflui no tamanho novo, então a
     rolagem continua certa sem espaçador medido à mão. */
  const scrollRef = useRef<HTMLDivElement>(null)
  const medidaRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [ajustado, setAjustado] = useState(false)
  const zoom = (s: number) => { setScale(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s))); setAjustado(false) }
  const ajustar = () => {
    const el = scrollRef.current, m = medidaRef.current
    if (!el || !m) return
    const w = m.offsetWidth / scale, h = m.offsetHeight / scale
    if (!w || !h) return
    setScale(Math.max(ZOOM_MIN, Math.min(1, (el.clientWidth - 16) / w, (el.clientHeight - 16) / h)))
    setAjustado(true)
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setScale((s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s * (e.deltaY < 0 ? 1.12 : 1 / 1.12))))
      setAjustado(false)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const irAte = (id: string) => {
    const it = acharItem(props.fluxo, id)
    if (it) setAbertos([...blocosAcimaDe(props.fluxo, id), ...(it.kind !== 'atividade' ? [id] : [])])
    setTimeout(() => scrollRef.current?.querySelector(`[data-item-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 60)
  }

  return (
    <Ctx.Provider value={{ ...props, abertos, alternarBloco, expandirTudo, vinculos, arrastando, setArrastando, problemas, emParalelo, nomeDe }}>
      <div className="flex-1 min-w-0 min-h-0 relative">
        <ZoomBar scale={scale} autoFit={ajustado} onZoom={zoom} onFit={ajustar} />
        <button type="button" onClick={() => { setExpandirTudo(!expandirTudo); setAbertos([]) }}
          title={expandirTudo ? 'Mostrar os blocos como cartões; cada um abre numa gaveta' : 'Desenhar todos os blocos abertos no trilho'}
          className="absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card/95 px-2.5 text-[11.5px] font-semibold shadow-sm backdrop-blur hover:bg-muted">
          {expandirTudo ? <><ChevronsDownUp className="h-3.5 w-3.5" />Recolher blocos</> : <><ChevronsUpDown className="h-3.5 w-3.5" />Expandir tudo</>}
        </button>
        <Minimapa scrollRef={scrollRef} versao={`${abertos.join(',')}|${expandirTudo}|${scale}|${props.fluxo.itens.length}`} />
        <PendenciasPill pendencias={pendencias} aberto={pendAberto} onToggle={onTogglePend} style={{ left: 12 }}
          onItem={(p) => { if (p.nodeId) irAte(p.nodeId); onFocar(p) }} />
        {props.fluxo.itens.length === 0 && (
          <p className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-full border bg-card px-3 py-1 text-[11.5px] text-muted-foreground shadow-sm pointer-events-none">
            Clique no <span className="font-semibold text-foreground">+</span> para inserir a primeira atividade
          </p>
        )}
        <div ref={scrollRef}
          className="absolute inset-0 overflow-auto bg-muted/20 [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px]"
          onClick={(e) => {
            // o clique de uma opção de Select (portal) também chega aqui pela árvore do React
            if (!e.currentTarget.contains(e.target as Node)) return
            if (!(e.target as HTMLElement).closest('[data-item-id],[data-trilho-menu]')) props.onAbrir(null)
          }}>
          <div className={cn('min-h-full min-w-full w-max flex', abertos.length && !expandirTudo ? 'items-start' : 'items-center')}>
            <div ref={medidaRef} className="w-max">
              <div className="flex flex-col gap-6 px-8 pt-14 pb-24" style={{ zoom: scale }}>
                <div className="flex items-center">
                  <Evento fim={false} />
                  <Sequencia refId="raiz" itens={props.fluxo.itens} />
                  <Evento fim />
                </div>
                {!expandirTudo && abertos.map((id) => <Gaveta key={id} id={id} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  )
}

/** Início e fim: mesma notação da raia — anel fino começa, anel grosso termina. */
function Evento({ fim }: { fim: boolean }) {
  return (
    <div className="relative shrink-0 flex flex-col items-center">
      <span className={cn('block h-8 w-8 rounded-full border-emerald-600 dark:border-emerald-400 bg-emerald-500/10', fim ? 'border-[4px]' : 'border-2')} />
      <span className="absolute top-full mt-1 whitespace-nowrap text-[10.5px] font-semibold">{fim ? 'Fim' : 'Início'}</span>
    </div>
  )
}

function Sequencia({ refId, itens }: { refId: string; itens: ItemFluxo[] }) {
  if (itens.length === 0 && refId !== 'raiz') return <Vaga refId={refId} indice={0} vazia />
  return (
    <div className="flex items-center">
      <Vaga refId={refId} indice={0} />
      {itens.map((it, i) => (
        <Fragment key={it.id}>
          <ItemDoTrilho item={it} />
          <Vaga refId={refId} indice={i + 1} />
        </Fragment>
      ))}
    </div>
  )
}

function ItemDoTrilho({ item }: { item: ItemFluxo }) {
  const t = useTrilho()
  if (item.kind === 'atividade') return <CartaoAtividade item={item} />
  if (!t.expandirTudo) return <BlocoResumo bloco={item} />
  return item.kind === 'escolha' ? <BlocoEscolhaView bloco={item} /> : <BlocoParaleloView bloco={item} />
}

/** Ligação entre dois itens: a seta do fluxo + o `+` que insere ali. Durante um arrasto,
 *  vira o lugar onde soltar. */
function Vaga({ refId, indice, vazia }: { refId: string; indice: number; vazia?: boolean }) {
  const t = useTrilho()
  const [menu, setMenu] = useState(false)
  const [sobre, setSobre] = useState(false)
  const soltavel = t.arrastando !== null
  const alvo = {
    onDragOver: (e: React.DragEvent) => { if (!soltavel) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move' },
    onDragEnter: () => { if (soltavel) setSobre(true) },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false) },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setSobre(false)
      const id = e.dataTransfer.getData('text/plain') || t.arrastando
      t.setArrastando(null)
      if (id) t.onFluxo((f) => moverItem(f, id, refId, indice))
    },
  }
  const ancora = useRef<HTMLButtonElement>(null)
  const abrirMenu = (e: React.MouseEvent) => { e.stopPropagation(); setMenu((v) => !v) }
  const menuEl = menu && (
    <MenuInserir ancora={ancora} onClose={() => setMenu(false)}
      onPick={(tipo) => { setMenu(false); t.onInserir(refId, indice, tipo) }}
      vinculaveis={listarAtividades(t.fluxo).filter((a) => !a.vinculoDe).map((a) => ({ id: a.id, nome: t.nomeDe(a.id), tipo: a.tipo }))}
      onVincular={(origemId) => { setMenu(false); t.onInserirVinculada(refId, indice, origemId) }} />
  )

  if (vazia) {
    return (
      <div className="relative shrink-0" data-trilho-menu {...alvo}>
        <button ref={ancora} type="button" onClick={abrirMenu} aria-expanded={menu}
          className={cn('h-9 px-3 rounded-lg border border-dashed inline-flex items-center gap-1 text-[11.5px] font-medium transition-colors',
            sobre ? 'border-primary bg-primary/10 text-primary' : 'border-foreground/25 bg-card/50 text-muted-foreground hover:text-foreground hover:border-foreground/45')}>
          <Plus className="h-3 w-3" />{soltavel ? 'Soltar aqui' : 'Atividade'}
        </button>
        {menuEl}
      </div>
    )
  }
  return (
    <div data-trilho-menu {...alvo}
      className={cn('group/vaga relative h-10 shrink-0 flex items-center justify-center transition-[width]', soltavel ? 'w-16' : 'w-11')}>
      <span className="absolute left-0 right-1.5 top-1/2 h-[1.5px] -translate-y-1/2 bg-foreground/35" />
      <span className="absolute right-0 top-1/2 -translate-y-1/2 border-y-[4px] border-y-transparent border-l-[6px] border-l-foreground/35" />
      {soltavel ? (
        <span className={cn('relative h-7 w-10 rounded-md border border-dashed', sobre ? 'border-primary bg-primary/15' : 'border-foreground/30 bg-card/70')} />
      ) : (
        <button ref={ancora} type="button" onClick={abrirMenu} aria-expanded={menu} title="Inserir aqui" aria-label="Inserir aqui"
          className={cn('relative h-5 w-5 rounded-full border bg-card flex items-center justify-center text-muted-foreground shadow-sm transition',
            'hover:border-primary hover:text-primary focus-visible:opacity-100', menu ? 'opacity-100 border-primary text-primary' : 'opacity-70 group-hover/vaga:opacity-100')}>
          <Plus className="h-3 w-3" />
        </button>
      )}
      {menuEl}
    </div>
  )
}

/** Menu do `+`. Flutua no <body>: dentro do trilho (rolável e com zoom) ele saía
 *  cortado quando o `+` ficava perto da borda — foi o que o PO viu no primeiro `+`. */
function MenuInserir({ ancora, onPick, onClose, vinculaveis, onVincular }: {
  ancora: React.RefObject<HTMLElement | null>; onPick: (t: NovoItem) => void; onClose: () => void
  /** atividades já configuradas que podem ser repetidas aqui (mesma configuração) */
  vinculaveis: Array<{ id: string; nome: string; tipo: 'userTask' | 'serviceTask' }>
  onVincular: (origemId: string) => void
}) {
  const [repetir, setRepetir] = useState(false)
  const opcoes: Array<{ tipo: NovoItem; rotulo: string; dica: string; icone: React.ReactNode }> = [
    { tipo: 'userTask', rotulo: 'Tarefa', dica: 'Uma pessoa executa', icone: <UserSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" /> },
    { tipo: 'serviceTask', rotulo: 'Ação automática', dica: 'O sistema executa sozinho', icone: <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" /> },
    { tipo: 'escolha', rotulo: 'Escolher um caminho', dica: 'Segue por um caminho só, conforme uma condição', icone: <GatewayGlyph kind="exclusive" className="h-4 w-4 text-violet-600 dark:text-violet-400" /> },
    { tipo: 'paralelo', rotulo: 'Fazer ao mesmo tempo', dica: 'Vários caminhos juntos; segue quando todos terminarem', icone: <GatewayGlyph kind="parallel" className="h-4 w-4 text-rose-600 dark:text-rose-400" /> },
  ]
  return (
    <FloatingMenu anchor={ancora} onClose={onClose} align="center" data-trilho-menu role="menu"
      className="w-72 rounded-xl border bg-card p-1 text-card-foreground shadow-xl">
      {repetir ? (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); setRepetir(false) }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11.5px] font-semibold text-muted-foreground hover:bg-accent">
            <ArrowUp className="h-3 w-3 -rotate-90" />Voltar
          </button>
          <p className="px-2 pb-1 text-[10.5px] leading-snug text-muted-foreground">
            A atividade repetida usa a <span className="font-semibold text-foreground">mesma configuração</span> — mudou numa, muda em todas. Na execução, cada lugar gera a sua tarefa.
          </p>
          <div className="max-h-64 overflow-y-auto">
            {vinculaveis.map((v) => (
              <button key={v.id} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); onVincular(v.id) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                {v.tipo === 'serviceTask' ? <Zap className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /> : <UserSquare className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />}
                <span className="truncate text-[12.5px] font-medium">{v.nome}</span>
              </button>
            ))}
          </div>
        </>
      ) : opcoes.map((o) => (
        <button key={o.tipo} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); onPick(o.tipo) }}
          className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
          <span className="mt-0.5 shrink-0">{o.icone}</span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium">{o.rotulo}</span>
            <span className="block text-[10.5px] leading-snug text-muted-foreground">{o.dica}</span>
          </span>
        </button>
      ))}
      {!repetir && vinculaveis.length > 0 && (
        <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setRepetir(true) }}
          className="mt-0.5 flex w-full items-start gap-2 rounded-md border-t px-2 py-1.5 pt-2 text-left hover:bg-accent">
          <span className="mt-0.5 shrink-0"><Link2 className="h-4 w-4 text-primary" /></span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium">Repetir uma atividade já configurada</span>
            <span className="block text-[10.5px] leading-snug text-muted-foreground">Mesma configuração em outra frente — muda junto</span>
          </span>
        </button>
      )}
    </FloatingMenu>
  )
}

/** Marca de pendência no próprio item. A FORMA diz a gravidade (triângulo impede a
 *  ativação, "i" só informa) — a cor apenas reforça. */
function MarcaProblema({ id }: { id: string }) {
  const ps = useTrilho().problemas.get(id)
  if (!ps?.length) return null
  const texto = ps.map((p) => p.mensagem).join('\n')
  return ps.some((p) => p.severidade !== 'aviso')
    ? <span title={texto} aria-label={texto} className="shrink-0 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /></span>
    : <span title={texto} aria-label={texto} className="shrink-0 text-sky-500"><Info className="h-3.5 w-3.5" /></span>
}

const META_ICONE = { exec: User, entidade: Building2, prazo: Clock }

function CartaoAtividade({ item }: { item: ItemAtividade }) {
  const t = useTrilho()
  const auto = item.tipo === 'serviceTask'
  const Icone = auto ? Zap : UserSquare
  const nome = t.steps[item.id]?.stepName?.trim()
  const raiz = item.vinculoDe ?? item.id
  const grupo = t.vinculos.get(raiz)
  const vinculada = !!grupo?.length
  return (
    <div data-item-id={item.id} draggable title="Clique para configurar · arraste para mudar de lugar"
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; t.setArrastando(item.id) }}
      onDragEnd={() => t.setArrastando(null)}
      onClick={() => t.onAbrir(item.id)}
      className={cn('group/cartao w-[190px] shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md',
        t.selectedId === item.id && 'ring-2 ring-primary', t.arrastando === item.id && 'opacity-40')}>
      <div className={cn('h-1', auto ? 'bg-amber-500/70' : 'bg-sky-500/70')} />
      <div className="p-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
            auto ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400')}>
            <Icone className="h-3 w-3" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{auto ? 'Ação automática' : 'Tarefa'}</span>
          {vinculada && (
            <span title={`Mesma configuração em ${grupo!.length + 1} lugares — mudou numa, muda em todas`}
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[9.5px] font-semibold text-primary">
              <Link2 className="h-2.5 w-2.5" />{grupo!.length + 1}×
            </span>
          )}
          <span className="ml-auto flex items-center gap-0.5">
            <MarcaProblema id={item.id} />
            <button type="button" title="Remover atividade" aria-label="Remover atividade"
              onClick={(e) => { e.stopPropagation(); t.onRemover(item.id) }}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover/cartao:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-tight">
          {nome || <span className="font-normal italic text-muted-foreground">Sem nome</span>}
        </p>
        {(() => {
          const meta = t.metaDe(item.id)
          if (!meta.length) return null
          return (
            <div className="mt-1.5 space-y-0.5">
              {meta.map((m, i) => {
                const I = m.kind === 'exec' && auto ? Zap : META_ICONE[m.kind]
                return (
                  <div key={i} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <I className="h-3 w-3 shrink-0" /><span className="truncate">{m.text}</span>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/** Arrasto de bloco só pela ALÇA: o bloco inteiro arrastável roubaria a seleção de texto
 *  do nome e o clique dos menus que moram dentro dele. */
function useArrastoPelaAlca(id: string) {
  const t = useTrilho()
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const desarmar = () => setArmado(false)
    window.addEventListener('pointerup', desarmar)
    return () => window.removeEventListener('pointerup', desarmar)
  }, [armado])
  return {
    alca: {
      onPointerDown: () => setArmado(true),
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      title: 'Arraste para mudar o bloco de lugar',
    },
    bloco: {
      draggable: armado,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation(); e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; t.setArrastando(id)
      },
      onDragEnd: () => { setArmado(false); t.setArrastando(null) },
    },
  }
}

function BotaoIcone({ title, onClick, perigo, children }: { title: string; onClick: () => void; perigo?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={cn('h-6 w-6 rounded flex items-center justify-center text-muted-foreground transition-colors',
        perigo ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground')}>
      {children}
    </button>
  )
}

/* ─── Escolha em FRASES (opção A do PO, 04/10/2026) ─────────────────────────────
   Sem modal: a escolha se configura no próprio trilho e lê como português —
   "Se [condição] então [atividades] e depois [segue]". A condição abre num balão
   ancorado nela mesma; a pergunta, o modo e o "se nenhum servir" estão no bloco. */

/** Campos que o filtro de um caminho pode usar: os da TELA das atividades dele. */
function useCamposDoCaminho() {
  const t = useTrilho()
  return (c: { itens: ItemFluxo[] }) => camposDasTelasDasAtividades(
    atividadesDentro(c.itens).map((a) => t.steps[a.id]).filter((s): s is StepFormSchema => !!s),
    t.screens,
  )
}

/** Por que ESTE caminho não tem campo para filtrar — e o conserto a um clique. */
function SemCampos({ caminho }: { caminho: CaminhoCondicional }) {
  const t = useTrilho()
  const tarefas = atividadesDentro(caminho.itens).filter((a) => a.tipo === 'userTask')
  const semTela = tarefas.filter((a) => !t.steps[a.id]?.screenRef)
  return (
    <div role="status" className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {tarefas.length === 0
            ? <>O filtro usa os campos da <span className="font-semibold">tela da atividade deste caminho</span>, e ele ainda não tem atividade. Insira uma atividade com tela de contrato neste caminho, pelo <span className="font-semibold">+</span>.</>
            : semTela.length > 0
              ? <>O filtro usa os campos da <span className="font-semibold">tela da atividade deste caminho</span>, e {semTela.length === 1 ? 'ela está' : 'elas estão'} <span className="font-semibold">sem tela</span>.</>
              : <>As atividades deste caminho não usam tela de <span className="font-semibold">contrato</span> — o filtro só testa campos do contrato.</>}
        </span>
      </p>
      {semTela.length > 0 && t.onConfigurarAtividade && (
        <div className="flex flex-wrap gap-1.5 pl-5">
          {semTela.map((a) => (
            <button key={a.id} type="button" onClick={() => t.onConfigurarAtividade?.(a.id)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/70 bg-card px-2 py-1 text-[11.5px] font-semibold text-foreground hover:bg-muted">
              <SlidersHorizontal className="h-3 w-3" />Escolher a tela de “{t.nomeDe(a.id)}”
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A condição de um caminho, como pedaço da frase. Clicou, abre o construtor ancorado. */
function CondicaoNaFrase({ bloco, caminho, indice }: { bloco: BlocoEscolha; caminho: CaminhoCondicional; indice: number }) {
  const t = useTrilho()
  const camposDe = useCamposDoCaminho()
  const ancora = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const temCond = !!caminho.condition?.trim()
  const ordemConta = modoDaEscolha(bloco) === 'primeiro' && bloco.caminhos.length > 1
  return (
    <>
      <button ref={ancora} type="button" onClick={(e) => { e.stopPropagation(); setAberto((v) => !v) }}
        title="Configurar a condição deste caminho" aria-expanded={aberto}
        className={cn('line-clamp-2 max-w-[280px] shrink-0 rounded px-1 py-0.5 text-left text-[11.5px] font-semibold leading-snug underline decoration-dotted decoration-violet-500/70 underline-offset-4 hover:bg-violet-500/10',
          !temCond && 'text-amber-700 dark:text-amber-400')}>
        {temCond ? (caminho.rotulo?.trim() || caminho.condition)
          : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />escolher a condição</span>}
      </button>
      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => setAberto(false)} data-trilho-menu role="dialog" aria-label={`Condição do ${indice + 1}º caminho`}
          className="w-[min(640px,94vw)] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3 border-b bg-violet-500/[0.06] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Condição do {indice + 1}º caminho</p>
              <p className="mt-0.5 truncate text-sm font-semibold">Quando seguir para: {resumoItens(caminho.itens, t.nomeDe)}</p>
            </div>
            {ordemConta && (
              /* no "primeiro que servir" a ORDEM decide: vence o primeiro verdadeiro */
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5" title="Ordem de teste: vence o primeiro caminho verdadeiro">
                <button type="button" aria-label="Testar este caminho antes do anterior" title="Testar antes do anterior" disabled={indice === 0}
                  onClick={() => t.onFluxo((f) => moverCaminho(f, bloco.id, caminho.id, -1))}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Testar este caminho depois do seguinte" title="Testar depois do seguinte" disabled={indice === bloco.caminhos.length - 1}
                  onClick={() => t.onFluxo((f) => moverCaminho(f, bloco.id, caminho.id, 1))}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" title="Fechar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <CondBuilder edge={{ condition: caminho.condition, conditionSpec: caminho.conditionSpec as EdgeConditionSpec | undefined, label: caminho.rotulo }}
              campos={camposDe(caminho)} semCampos={<SemCampos caminho={caminho} />}
              onSet={(p) => t.onFluxo((f) => atualizarCaminho(f, caminho.id, {
                ...('condition' in p ? { condition: p.condition } : {}),
                ...('conditionSpec' in p ? { conditionSpec: p.conditionSpec } : {}),
                ...('label' in p ? { rotulo: p.label } : {}),
              }))} />
            <div className="space-y-1 border-t pt-3">
              <label htmlFor={`rotulo-${caminho.id}`} className="block text-xs font-medium">Como este caminho aparece no desenho</label>
              <Input id={`rotulo-${caminho.id}`} className="h-9 text-sm" value={caminho.rotulo ?? ''} placeholder="Ex.: Precisa do Patrimônio"
                onChange={(e) => { const rotulo = e.target.value; t.onFluxo((f) => atualizarCaminho(f, caminho.id, { rotulo })) }} />
              <p className="text-[11px] text-muted-foreground">Preenchido sozinho a partir das regras. Troque por um nome curto, se preferir.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-4 py-2.5">
            <Button size="sm" onClick={() => setAberto(false)}>Pronto</Button>
          </div>
        </FloatingMenu>
      )}
    </>
  )
}

/** "Testar com valores": os caminhos que serviriam acendem no próprio trilho. */
function TestarEscolha({ bloco }: { bloco: BlocoEscolha }) {
  const t = useTrilho()
  const camposDe = useCamposDoCaminho()
  const ancora = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>({})
  const campos = useMemo(() => {
    const usados = new Set(bloco.caminhos.flatMap((c) => (c.conditionSpec?.rules ?? []).map((r) => r.campo).filter(Boolean)))
    const m = new Map<string, CampoDisponivel>()
    for (const c of bloco.caminhos) for (const cp of camposDe(c)) if (usados.has(cp.key) && !m.has(cp.key)) m.set(cp.key, cp)
    return [...m.values()]
  }, [bloco]) // eslint-disable-line react-hooks/exhaustive-deps
  const todos = modoDaEscolha(bloco) === 'todos'
  const vencedores = useMemo(() => {
    if (!aberto) return null
    const saidas = [...bloco.caminhos.map((c) => ({ id: c.id, condition: c.condition })), ...(temSenaoAntigo(bloco) ? [{ id: bloco.casoContrario.id, isDefault: true }] : [])]
    return decidirSaidas(saidas, montarVarsSimulacao(valores, (k) => campos.find((c) => c.key === k)?.tipo ?? 'texto'), todos)
  }, [aberto, valores, bloco, campos, todos])
  useEffect(() => { t.onSimulacao(aberto && vencedores && campos.length ? { blocoId: bloco.id, caminhoIds: vencedores } : null) }, [aberto, vencedores]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => t.onSimulacao(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const frase = !vencedores ? '' : vencedores.length === 0 || vencedores.includes(bloco.casoContrario.id)
    ? 'nenhum filtro serviu → o processo PARA e avisa quem está executando'
    : `segue por: ${vencedores.map((id) => `${bloco.caminhos.findIndex((c) => c.id === id) + 1}º`).join(' e ')} caminho${vencedores.length > 1 ? 's, ao mesmo tempo' : ''}`
  return (
    <>
      <button ref={ancora} type="button" onClick={(e) => { e.stopPropagation(); setAberto((v) => !v) }} title="Testar com valores de exemplo" aria-label="Testar com valores"
        className={cn('flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-semibold transition-colors hover:bg-muted', aberto ? 'text-primary' : 'text-muted-foreground')}>
        <Play className="h-3 w-3" />Testar
      </button>
      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => setAberto(false)} align="end" data-trilho-menu
          className="w-[360px] space-y-2.5 rounded-xl border bg-card p-4 text-card-foreground shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-semibold">Testar com valores <span className="font-normal text-muted-foreground">— o caminho acende no desenho</span></p>
          {campos.length === 0 ? (
            <p className="text-[11px] leading-snug text-muted-foreground">Monte ao menos uma condição — os campos usados aparecem aqui.</p>
          ) : campos.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={c.label}>{c.label}</span>
              {c.tipo === 'selecao' && c.options?.length ? (
                <Select value={valores[c.key] || undefined} onValueChange={(v) => setValores((sv) => ({ ...sv, [c.key]: v }))}>
                  <SelectTrigger className="h-7 w-[150px] shrink-0 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{c.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : c.tipo === 'booleano' ? (
                <Select value={valores[c.key] || undefined} onValueChange={(v) => setValores((sv) => ({ ...sv, [c.key]: v }))}>
                  <SelectTrigger className="h-7 w-[150px] shrink-0 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="true" className="text-xs">Sim</SelectItem><SelectItem value="false" className="text-xs">Não</SelectItem></SelectContent>
                </Select>
              ) : (
                <Input className="h-7 w-[150px] shrink-0 text-xs" type={c.tipo === 'data' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                  value={valores[c.key] ?? ''} onChange={(ev) => setValores((sv) => ({ ...sv, [c.key]: ev.target.value }))} />
              )}
            </div>
          ))}
          {campos.length > 0 && frase && <p className="text-xs font-semibold text-primary">→ {frase}</p>}
        </FloatingMenu>
      )}
    </>
  )
}

function BlocoEscolhaView({ bloco }: { bloco: BlocoEscolha }) {
  const t = useTrilho()
  const { alca, bloco: arrasto } = useArrastoPelaAlca(bloco.id)
  const dentroParalelo = t.emParalelo.has(bloco.id)
  const todos = modoDaEscolha(bloco) === 'todos'
  const sim = t.simulacao?.blocoId === bloco.id ? t.simulacao : null
  const luz = (id: string) => ({ acesa: !!sim && sim.caminhoIds.includes(id), apagada: !!sim && !sim.caminhoIds.includes(id) })
  const senao = bloco.casoContrario
  const senaoAntigo = temSenaoAntigo(bloco)
  return (
    <section data-item-id={bloco.id} aria-label="Escolher um caminho" {...arrasto}
      className={cn('shrink-0 flex flex-col rounded-2xl border-[1.5px] border-violet-500/55 bg-card shadow-sm',
        t.selectedId === bloco.id && 'ring-2 ring-primary', t.arrastando === bloco.id && 'opacity-40')}>
      <header onClick={() => t.onAbrir(bloco.id)}
        className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-t-2xl border-b bg-violet-500/[0.07] px-2 py-1.5">
        <span {...alca} className="cursor-grab text-muted-foreground/70 hover:text-foreground"><GripVertical className="h-3.5 w-3.5" /></span>
        <GatewayGlyph kind="exclusive" className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0">
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Escolher um caminho</span>
          <input value={bloco.pergunta ?? ''} placeholder="Qual é a pergunta?" aria-label="Pergunta da escolha"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const pergunta = e.target.value; t.onFluxo((f) => atualizarItem(f, bloco.id, { pergunta })) }}
            className="block w-[300px] bg-transparent text-[12.5px] font-semibold leading-tight outline-none placeholder:font-normal placeholder:italic placeholder:text-muted-foreground focus:underline focus:decoration-dotted" />
        </div>
        <div className="flex items-center gap-1.5 pl-2 text-[11px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <span>Se mais de um servir:</span>
          <Select value={todos ? 'todos' : 'primeiro'} onValueChange={(v) => t.onFluxo((f) => atualizarItem(f, bloco.id, { modo: v as ModoEscolha }))}>
            <SelectTrigger className="h-6 w-[150px] text-[11px]" aria-label="Quando mais de um filtro servir"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos" className="text-xs">todos, ao mesmo tempo</SelectItem>
              <SelectItem value="primeiro" className="text-xs">só o primeiro (de cima)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto flex items-center gap-0.5 pl-3">
          <MarcaProblema id={bloco.id} />
          <TestarEscolha bloco={bloco} />
          <BotaoIcone title="Remover a escolha e o que há dentro dela" perigo onClick={() => t.onRemover(bloco.id)}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-2">
        {bloco.caminhos.map((c, i) => {
          const { acesa, apagada } = luz(c.id)
          return (
            <div key={c.id} className={cn('flex items-center gap-1.5 rounded-lg bg-muted/45 px-2 py-1 transition-opacity', acesa && 'bg-primary/5 ring-2 ring-primary', apagada && 'opacity-40')}>
              <span className="shrink-0 text-[11.5px] font-bold text-violet-700 dark:text-violet-300">Se</span>
              <CondicaoNaFrase bloco={bloco} caminho={c} indice={i} />
              <span className="shrink-0 text-[11.5px] font-semibold">então</span>
              {acesa && <span className="shrink-0 text-[10.5px] font-bold text-primary">✓ por aqui</span>}
              <div className="flex min-w-0 flex-1 items-center"><Sequencia refId={c.id} itens={c.itens} /></div>
              <div className="flex shrink-0 items-center gap-1 pl-1">
                <span className="text-[11px] text-muted-foreground">e depois</span>
                {todos || dentroParalelo
                  /* em "todos" (e dentro de um paralelo) um caminho com filtro só segue */
                  ? (c.fim.tipo === 'segue'
                      ? <span className="text-[11px] font-semibold">segue</span>
                      : <FimSelect fluxo={t.fluxo} escolhaId={bloco.id} caminhoId={c.id} fim={c.fim} nomeDe={t.nomeDe} onFluxo={t.onFluxo} soSegue />)
                  : <FimSelect fluxo={t.fluxo} escolhaId={bloco.id} caminhoId={c.id} fim={c.fim} nomeDe={t.nomeDe} onFluxo={t.onFluxo} />}
                {bloco.caminhos.length > 1 && (
                  <BotaoIcone title="Remover este caminho" perigo onClick={() => t.onFluxo((f) => removerCaminho(f, bloco.id, c.id))}><X className="h-3.5 w-3.5" /></BotaoIcone>
                )}
              </div>
            </div>
          )
        })}

        {senaoAntigo && (
          /* "Se nenhum servir" foi EXCLUÍDO (PO, 04/10/2026). Um Senão desenhado antes não
             some em silêncio: fica marcado, com o conserto a um clique, e a ativação recusa. */
          <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">“Senão” antigo (descontinuado)</span> — {resumoItens(senao.itens, t.nomeDe)} · {textoFim(senao.fim, t.nomeDe)}.
              Quando nenhum filtro servir, o processo agora para e avisa.
            </span>
            <button type="button" onClick={(e) => { e.stopPropagation(); const id = novoId('Caminho'); t.onFluxo((f) => senaoParaCaminho(f, bloco.id, id)) }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/70 bg-card px-2 py-1 font-semibold text-foreground hover:bg-muted">
              <CornerDownRight className="h-3 w-3" />Transformar em caminho com filtro
            </button>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t px-2.5 py-1.5">
        <button type="button" onClick={() => { const id = novoId('Caminho'); t.onFluxo((f) => adicionarCaminho(f, bloco.id, id)) }}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
          <Plus className="h-3 w-3" />outra condição
        </button>
        <span className="text-[10.5px] text-muted-foreground">
          {todos ? 'Todos os que servirem acontecem juntos.' : 'Segue só o primeiro que servir, de cima para baixo.'}{' '}
          <span className="font-medium text-foreground">Se nenhum servir, o processo para e avisa.</span>
        </span>
      </footer>
    </section>
  )
}

function BlocoParaleloView({ bloco }: { bloco: BlocoParalelo }) {
  const t = useTrilho()
  const { alca, bloco: arrasto } = useArrastoPelaAlca(bloco.id)
  return (
    <section data-item-id={bloco.id} aria-label="Fazer ao mesmo tempo" {...arrasto}
      className={cn('shrink-0 flex flex-col rounded-2xl border-[1.5px] border-rose-500/55 bg-card shadow-sm',
        t.selectedId === bloco.id && 'ring-2 ring-primary', t.arrastando === bloco.id && 'opacity-40')}>
      <header onClick={() => t.onAbrir(bloco.id)}
        className="flex cursor-pointer items-center gap-2 rounded-t-2xl border-b bg-rose-500/[0.07] px-2 py-1.5">
        <span {...alca} className="cursor-grab text-muted-foreground/70 hover:text-foreground"><GripVertical className="h-3.5 w-3.5" /></span>
        <GatewayGlyph kind="parallel" className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="min-w-0">
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Fazer ao mesmo tempo</span>
          <input value={bloco.nome ?? ''} placeholder="Dê um nome (ex.: Pareceres)" aria-label="Nome do bloco"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const nome = e.target.value; t.onFluxo((f) => atualizarItem(f, bloco.id, { nome })) }}
            className="block w-[220px] bg-transparent text-[12.5px] font-semibold leading-tight outline-none placeholder:font-normal placeholder:italic placeholder:text-muted-foreground focus:underline focus:decoration-dotted" />
        </div>
        <span className="ml-auto flex items-center gap-0.5 pl-3">
          <MarcaProblema id={bloco.id} />
          <BotaoIcone title="Remover o bloco e o que há dentro dele" perigo onClick={() => t.onRemover(bloco.id)}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-2">
        <span className="px-1 text-[11.5px] font-semibold">Ao mesmo tempo:</span>
        {bloco.caminhos.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1.5 rounded-lg bg-muted/45 px-2 py-1">
            <span className="w-[64px] shrink-0 text-[11px] font-semibold text-muted-foreground">{i === 0 ? 'Frente 1' : `e frente ${i + 1}`}</span>
            <div className="flex min-w-0 flex-1 items-center"><Sequencia refId={c.id} itens={c.itens} /></div>
            {bloco.caminhos.length > 1 && (
              <BotaoIcone title="Remover esta frente" perigo onClick={() => t.onFluxo((f) => removerCaminho(f, bloco.id, c.id))}><X className="h-3.5 w-3.5" /></BotaoIcone>
            )}
          </div>
        ))}
      </div>

      <footer className="flex items-center gap-3 border-t px-2.5 py-1.5">
        <button type="button" onClick={() => { const id = novoId('Caminho'); t.onFluxo((f) => adicionarCaminho(f, bloco.id, id)) }}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-700 hover:underline dark:text-rose-300">
          <Plus className="h-3 w-3" />frente
        </button>
        <span className="text-[11px]"><span className="font-semibold">Segue quando</span> todas as frentes terminarem.</span>
      </footer>
    </section>
  )
}

/** Como um caminho da escolha termina. "Voltar" só lista atividades que vêm ANTES da
 *  escolha e fora de um "ao mesmo tempo" — as outras travariam o motor. */
function FimSelect({ fluxo, escolhaId, caminhoId, fim, nomeDe, onFluxo, soSegue }: {
  fluxo: FluxoBlocos; escolhaId: string; caminhoId: string; fim: FimCaminho
  nomeDe: (id: string) => string
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
  /** só "segue" é válido aqui; o valor atual (inválido) aparece para poder ser trocado */
  soSegue?: boolean
}) {
  const destinos = useMemo(() => destinosDeVolta(fluxo, escolhaId), [fluxo, escolhaId])
  const valor = fim.tipo === 'volta' ? `volta:${fim.alvoId}` : fim.tipo
  const alvoInvalido = fim.tipo === 'volta' && !destinos.some((d) => d.id === fim.alvoId) ? fim.alvoId : null
  const mudar = (v: string) => {
    const novo: FimCaminho = v === 'segue' ? { tipo: 'segue' } : v === 'encerra' ? { tipo: 'encerra' } : { tipo: 'volta', alvoId: v.slice('volta:'.length) }
    onFluxo((f) => atualizarCaminho(f, caminhoId, { fim: novo }))
  }
  return (
    <Select value={valor} onValueChange={mudar}>
      <SelectTrigger className="h-7 w-[180px] text-[11px]" aria-label="Ao terminar este caminho" onClick={(e) => e.stopPropagation()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="segue" className="text-xs">Ao terminar: segue</SelectItem>
        <SelectItem value="encerra" disabled={soSegue} className="text-xs">Encerra o processo{soSegue ? ' (não vale aqui)' : ''}</SelectItem>
        {!soSegue && destinos.map((d) => <SelectItem key={d.id} value={`volta:${d.id}`} className="text-xs">Volta para: {nomeDe(d.id)}</SelectItem>)}
        {alvoInvalido && <SelectItem value={valor} className="text-xs">Volta para: {nomeDe(alvoInvalido)} (não vale mais)</SelectItem>}
      </SelectContent>
    </Select>
  )
}

/* ─── painel lateral de um bloco ─────────────────────────────────────────────── */

export function BlocoInspector({ bloco, nomeDe, onRenomear, onRemove }: {
  bloco: BlocoEscolha | BlocoParalelo
  nomeDe: (id: string) => string
  onRenomear: (nome: string) => void
  onRemove: () => void
}) {
  const escolha = bloco.kind === 'escolha'
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
          escolha ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
          <GatewayGlyph kind={escolha ? 'exclusive' : 'parallel'} className="h-3 w-3" />{escolha ? 'Escolher um caminho' : 'Fazer ao mesmo tempo'}
        </span>
        <button onClick={onRemove} title="Remover o bloco" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {bloco.kind === 'escolha' ? (
          <>
            <h3 className="text-sm font-semibold leading-snug">{bloco.pergunta?.trim() || 'Escolha sem pergunta'}</h3>
            <dl className="divide-y rounded-md border bg-muted/20">
              {bloco.caminhos.map((c) => (
                <div key={c.id} className="px-2.5 py-1.5">
                  <dt className="truncate text-[10.5px] text-muted-foreground">{c.rotulo?.trim() || c.condition?.trim() || '— sem condição'}</dt>
                  <dd className="truncate text-[11px] font-medium">{resumoItens(c.itens, nomeDe)} · {textoFim(c.fim, nomeDe)}</dd>
                </div>
              ))}
              <div className="px-2.5 py-1.5">
                <dt className="text-[10.5px] text-muted-foreground">Se nenhum servir</dt>
                <dd className="truncate text-[11px] font-medium">{resumoItens(bloco.casoContrario.itens, nomeDe)} · {textoFim(bloco.casoContrario.fim, nomeDe)}</dd>
              </div>
            </dl>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Configure direto no desenho: clique na <span className="font-medium">condição</span> de um caminho para montar o filtro,
              e use <span className="font-medium">Testar</span> para ver por onde o processo seguiria.
            </p>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="paralelo-nome" className="mb-1.5 block text-xs font-medium">Nome do bloco</label>
              <Input id="paralelo-nome" className="h-8 text-sm" placeholder="Ex.: Pareceres" value={bloco.nome ?? ''} onChange={(e) => onRenomear(e.target.value)} />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              As {bloco.caminhos.length} frentes começam juntas, e o processo só segue quando todas terminarem.
              Use o <span className="font-medium">+</span> dentro de cada caminho para inserir atividades.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── MAPA: blocos que recolhem (opção A do PO, 04/10/2026) ──────────────────────
   Em workflow grande, escolhas e "ao mesmo tempo" dentro de outros viravam uma parede
   horizontal. Agora cada bloco aparece no trilho como um CARTÃO-RESUMO; clicar abre o
   bloco numa GAVETA logo abaixo do trilho (um bloco dentro dele abre a gaveta seguinte),
   sem empurrar o resto para os lados. "Expandir tudo" volta a desenhar tudo aberto. */

/** Blocos que contêm `id`, de fora para dentro (o próprio id não entra). */
function blocosAcimaDe(f: FluxoBlocos, id: string): string[] {
  let achado: string[] | null = null
  const visitar = (itens: ItemFluxo[], acima: string[]) => {
    for (const it of itens) {
      if (achado) return
      if (it.id === id) { achado = acima; return }
      if (it.kind === 'escolha') {
        for (const c of [...it.caminhos, it.casoContrario]) { if (c.id === id) { achado = [...acima, it.id]; return } visitar(c.itens, [...acima, it.id]) }
      } else if (it.kind === 'paralelo') {
        for (const c of it.caminhos) { if (c.id === id) { achado = [...acima, it.id]; return } visitar(c.itens, [...acima, it.id]) }
      }
    }
  }
  visitar(f.itens, [])
  return achado ?? []
}

/** Tudo que mora dentro de um bloco (ids de atividades e blocos), para somar pendências. */
function idsDentro(b: BlocoEscolha | BlocoParalelo): string[] {
  const out: string[] = []
  const visitar = (itens: ItemFluxo[]) => {
    for (const it of itens) {
      out.push(it.id)
      if (it.kind === 'escolha') [...it.caminhos, it.casoContrario].forEach((c) => visitar(c.itens))
      else if (it.kind === 'paralelo') it.caminhos.forEach((c) => visitar(c.itens))
    }
  }
  const caminhos: Array<{ itens: ItemFluxo[] }> = b.kind === 'escolha' ? [...b.caminhos, b.casoContrario] : b.caminhos
  caminhos.forEach((c) => visitar(c.itens))
  return out
}

const nomeDoBloco = (b: BlocoEscolha | BlocoParalelo) =>
  (b.kind === 'escolha' ? b.pergunta?.trim() : b.nome?.trim()) || (b.kind === 'escolha' ? 'Escolha sem pergunta' : 'Bloco sem nome')

/** O bloco recolhido: o que ele é, quanto há dentro e se há pendência — num cartão do
 *  tamanho de uma atividade. Clicar abre (ou fecha) a gaveta dele. */
function BlocoResumo({ bloco }: { bloco: BlocoEscolha | BlocoParalelo }) {
  const t = useTrilho()
  const escolha = bloco.kind === 'escolha'
  const aberto = t.abertos.includes(bloco.id)
  const caminhos = escolha ? bloco.caminhos.length : bloco.caminhos.length
  const dentro = idsDentro(bloco)
  const atividades = atividadesDentro(escolha ? [...bloco.caminhos, bloco.casoContrario].flatMap((c) => c.itens) : bloco.caminhos.flatMap((c) => c.itens)).length
  const blocos = dentro.length - atividades
  const pend = [bloco.id, ...dentro].reduce((n, id) => n + (t.problemas.get(id)?.filter((p) => p.severidade !== 'aviso').length ?? 0), 0)
  const resumo = [
    `${caminhos} ${escolha ? (caminhos === 1 ? 'caminho' : 'caminhos') : (caminhos === 1 ? 'frente' : 'frentes')}`,
    `${atividades} ${atividades === 1 ? 'atividade' : 'atividades'}`,
    ...(blocos > 0 ? [`${blocos} ${blocos === 1 ? 'bloco' : 'blocos'} dentro`] : []),
  ].join(' · ')
  return (
    <button type="button" data-item-id={bloco.id} draggable aria-expanded={aberto}
      title={aberto ? 'Clique para recolher · arraste para mudar de lugar' : 'Clique para abrir · arraste para mudar de lugar'}
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', bloco.id); e.dataTransfer.effectAllowed = 'move'; t.setArrastando(bloco.id) }}
      onDragEnd={() => t.setArrastando(null)}
      onClick={(e) => { e.stopPropagation(); t.alternarBloco(bloco.id) }}
      className={cn('w-[230px] shrink-0 rounded-xl border-[1.5px] bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow-md',
        escolha ? 'border-violet-500/55' : 'border-rose-500/55',
        aberto && (escolha ? 'bg-violet-500/[0.06] ring-2 ring-violet-500/40' : 'bg-rose-500/[0.06] ring-2 ring-rose-500/40'),
        t.selectedId === bloco.id && !aberto && 'ring-2 ring-primary', t.arrastando === bloco.id && 'opacity-40')}>
      <span className="flex items-center gap-1.5">
        <GatewayGlyph kind={escolha ? 'exclusive' : 'parallel'} className={cn('h-3.5 w-3.5 shrink-0', escolha ? 'text-violet-600 dark:text-violet-400' : 'text-rose-600 dark:text-rose-400')} />
        <span className={cn('text-[9.5px] font-bold uppercase tracking-wider', escolha ? 'text-violet-700 dark:text-violet-300' : 'text-rose-700 dark:text-rose-300')}>
          {escolha ? 'Escolher um caminho' : 'Ao mesmo tempo'}
        </span>
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !aberto && '-rotate-90')} aria-hidden />
      </span>
      <span className="mt-1 line-clamp-2 block text-[12.5px] font-semibold leading-tight">{nomeDoBloco(bloco)}</span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{resumo}</span>
      {pend > 0 && (
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" />{pend} {pend === 1 ? 'pendência' : 'pendências'}
        </span>
      )}
    </button>
  )
}

/** Gaveta: o bloco aberto, por inteiro, embaixo do trilho — com a trilha de onde ele mora. */
function Gaveta({ id }: { id: string }) {
  const t = useTrilho()
  const b = acharItem(t.fluxo, id)
  if (!b || b.kind === 'atividade') return null
  const acima = blocosAcimaDe(t.fluxo, id).map((x) => acharItem(t.fluxo, x)).filter((x): x is BlocoEscolha | BlocoParalelo => !!x && x.kind !== 'atividade')
  return (
    <div className="w-max min-w-[640px]">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <span>Fluxo</span>
        {acima.map((a) => <Fragment key={a.id}><span aria-hidden>›</span><span className="max-w-[220px] truncate">{nomeDoBloco(a)}</span></Fragment>)}
        <span aria-hidden>›</span><span className="max-w-[260px] truncate font-semibold text-foreground">{nomeDoBloco(b)}</span>
        <button type="button" onClick={() => t.alternarBloco(id)}
          className="ml-2 inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 font-semibold text-foreground hover:bg-muted">
          <ChevronDown className="h-3 w-3 rotate-180" />Recolher
        </button>
      </div>
      {b.kind === 'escolha' ? <BlocoEscolhaView bloco={b} /> : <BlocoParaleloView bloco={b} />}
    </div>
  )
}

/** Minimapa: o desenho inteiro em miniatura com a janela visível; clicar ou arrastar navega.
 *  Só aparece quando o desenho é maior que a tela. */
function Minimapa({ scrollRef, versao }: { scrollRef: React.RefObject<HTMLDivElement | null>; versao: unknown }) {
  const [m, setM] = useState<{ W: number; H: number; vx: number; vy: number; vw: number; vh: number; itens: Array<{ x: number; y: number; w: number; h: number; tipo: string }> } | null>(null)
  const LARG = 200
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const medir = () => {
      const base = el.getBoundingClientRect()
      const itens = [...el.querySelectorAll<HTMLElement>('[data-item-id]')].map((n) => {
        const r = n.getBoundingClientRect()
        return { x: r.left - base.left + el.scrollLeft, y: r.top - base.top + el.scrollTop, w: r.width, h: r.height, tipo: n.getAttribute('aria-label') ?? (n.tagName === 'BUTTON' ? 'bloco' : 'atividade') }
      })
      setM({ W: el.scrollWidth, H: el.scrollHeight, vx: el.scrollLeft, vy: el.scrollTop, vw: el.clientWidth, vh: el.clientHeight, itens })
    }
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', medir); ro.disconnect() }
  }, [scrollRef, versao])
  if (!m || (m.W <= m.vw * 1.05 && m.H <= m.vh * 1.05)) return null
  const s = LARG / m.W
  const alt = Math.max(40, Math.min(140, m.H * s))
  const sy = alt / m.H
  const irPara = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: (e.clientX - r.left) / s - m.vw / 2, top: (e.clientY - r.top) / sy - m.vh / 2 })
  }
  return (
    <div className="absolute bottom-16 right-3 z-10 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
      <p className="mb-1 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Mapa do fluxo</p>
      <div role="slider" aria-label="Mapa do fluxo — arraste para navegar" aria-valuenow={Math.round(m.vx)} tabIndex={0}
        className="relative cursor-pointer overflow-hidden rounded-md bg-muted/50" style={{ width: LARG, height: alt }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); irPara(e) }}
        onPointerMove={(e) => { if (e.buttons === 1) irPara(e) }}>
        {m.itens.map((it, i) => (
          <span key={i} className={cn('absolute rounded-[2px]',
            it.tipo === 'Escolher um caminho' ? 'bg-violet-500/50' : it.tipo === 'Fazer ao mesmo tempo' ? 'bg-rose-500/40' : 'bg-foreground/30')}
            style={{ left: it.x * s, top: it.y * sy, width: Math.max(2, it.w * s), height: Math.max(2, it.h * sy) }} />
        ))}
        <span className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/10"
          style={{ left: m.vx * s, top: m.vy * sy, width: m.vw * s, height: m.vh * sy }} />
      </div>
    </div>
  )
}
