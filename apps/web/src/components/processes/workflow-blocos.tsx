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
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowDown, ArrowUp, Building2, Clock, GripVertical, Info, Play, Plus, SlidersHorizontal, Trash2, User, UserSquare, X, Zap } from 'lucide-react'
import {
  acharItem, adicionarCaminho, atualizarCaminho, atualizarItem, destinosDeVolta, moverCaminho, moverItem, removerCaminho,
  type BlocoEscolha, type BlocoParalelo, type CaminhoCondicional, type FimCaminho, type FluxoBlocos,
  type ItemAtividade, type ItemFluxo, type ProblemaAtivacao,
} from '@nxt/workflow-core'
import type { EdgeConditionSpec, StepFormSchema } from '@nxt/types'
import { camposDisponiveis, decidirSaida, montarVarsSimulacao } from '@/lib/flow-conditions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { useScreens } from '@/hooks/use-screens'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { CondBuilder } from './condition-builder'
import { GatewayGlyph, PendenciasPill, ZoomBar, ZOOM_MAX, ZOOM_MIN } from './flow-shared'
import { cn } from '@/lib/utils'

/* ─── modelo ─────────────────────────────────────────────────────────────────── */

const novoId = (prefixo: string) => `${prefixo}_${Math.random().toString(36).slice(2, 9)}`

export type NovoItem = 'userTask' | 'serviceTask' | 'escolha' | 'paralelo'

/** Item recém-criado. A escolha nasce com um caminho condicional + o caso contrário; o
 *  "ao mesmo tempo", com dois caminhos — um bloco com menos não faria sentido. */
export function novoItem(tipo: NovoItem): ItemFluxo {
  if (tipo === 'escolha') {
    return {
      kind: 'escolha', id: novoId('Escolha'), pergunta: '',
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
/** "Testar decisão": qual caminho da escolha venceria com os valores de exemplo. */
export type Simulacao = { blocoId: string; caminhoId: string | null }

interface TrilhoProps {
  fluxo: FluxoBlocos
  steps: Record<string, StepFormSchema>
  selectedId: string | null
  simulacao: Simulacao | null
  metaDe: (id: string) => MetaAtividade[]
  onAbrir: (id: string | null) => void
  onInserir: (ref: string, indice: number, tipo: NovoItem) => void
  onRemover: (id: string) => void
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
}
interface TrilhoCtx extends TrilhoProps {
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
  const problemas = useMemo(() => {
    const m = new Map<string, ProblemaAtivacao[]>()
    for (const p of pendencias) if (p.nodeId) m.set(p.nodeId, [...(m.get(p.nodeId) ?? []), p])
    return m
  }, [pendencias])
  const emParalelo = useMemo(() => escolhasEmParalelo(props.fluxo), [props.fluxo])
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
    scrollRef.current?.querySelector(`[data-item-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }

  return (
    <Ctx.Provider value={{ ...props, arrastando, setArrastando, problemas, emParalelo, nomeDe }}>
      <div className="flex-1 min-w-0 min-h-0 relative">
        <ZoomBar scale={scale} autoFit={ajustado} onZoom={zoom} onFit={ajustar} />
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
          <div className="min-h-full min-w-full w-max flex items-center">
            <div ref={medidaRef} className="w-max">
              <div className="flex items-center px-8 pt-12 pb-20" style={{ zoom: scale }}>
                <Evento fim={false} />
                <Sequencia refId="raiz" itens={props.fluxo.itens} />
                <Evento fim />
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
          {it.kind === 'atividade' ? <CartaoAtividade item={it} />
            : it.kind === 'escolha' ? <BlocoEscolhaView bloco={it} />
              : <BlocoParaleloView bloco={it} />}
          <Vaga refId={refId} indice={i + 1} />
        </Fragment>
      ))}
    </div>
  )
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
    <MenuInserir ancora={ancora} onClose={() => setMenu(false)} onPick={(tipo) => { setMenu(false); t.onInserir(refId, indice, tipo) }} />
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
function MenuInserir({ ancora, onPick, onClose }: { ancora: React.RefObject<HTMLElement | null>; onPick: (t: NovoItem) => void; onClose: () => void }) {
  const opcoes: Array<{ tipo: NovoItem; rotulo: string; dica: string; icone: React.ReactNode }> = [
    { tipo: 'userTask', rotulo: 'Tarefa', dica: 'Uma pessoa executa', icone: <UserSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" /> },
    { tipo: 'serviceTask', rotulo: 'Ação automática', dica: 'O sistema executa sozinho', icone: <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" /> },
    { tipo: 'escolha', rotulo: 'Escolher um caminho', dica: 'Segue por um caminho só, conforme uma condição', icone: <GatewayGlyph kind="exclusive" className="h-4 w-4 text-violet-600 dark:text-violet-400" /> },
    { tipo: 'paralelo', rotulo: 'Fazer ao mesmo tempo', dica: 'Vários caminhos juntos; segue quando todos terminarem', icone: <GatewayGlyph kind="parallel" className="h-4 w-4 text-rose-600 dark:text-rose-400" /> },
  ]
  return (
    <FloatingMenu anchor={ancora} onClose={onClose} align="center" data-trilho-menu role="menu"
      className="glass w-64 rounded-xl p-1 shadow-lg">
      {opcoes.map((o) => (
        <button key={o.tipo} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); onPick(o.tipo) }}
          className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
          <span className="mt-0.5 shrink-0">{o.icone}</span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium">{o.rotulo}</span>
            <span className="block text-[10.5px] leading-snug text-muted-foreground">{o.dica}</span>
          </span>
        </button>
      ))}
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

function BlocoEscolhaView({ bloco }: { bloco: BlocoEscolha }) {
  const t = useTrilho()
  const { alca, bloco: arrasto } = useArrastoPelaAlca(bloco.id)
  const dentroParalelo = t.emParalelo.has(bloco.id)
  const sim = t.simulacao?.blocoId === bloco.id ? t.simulacao : null
  const faixas: Array<{ c: CaminhoCondicional | BlocoEscolha['casoContrario']; padrao: boolean }> = [
    ...bloco.caminhos.map((c) => ({ c, padrao: false })),
    { c: bloco.casoContrario, padrao: true },
  ]
  return (
    <section data-item-id={bloco.id} aria-label="Escolher um caminho" {...arrasto}
      className={cn('shrink-0 flex flex-col rounded-2xl border-[1.5px] border-violet-500/55 bg-card shadow-sm',
        t.selectedId === bloco.id && 'ring-2 ring-primary', t.arrastando === bloco.id && 'opacity-40')}>
      <header onClick={() => t.onAbrir(bloco.id)}
        className="flex cursor-pointer items-center gap-2 rounded-t-2xl border-b bg-violet-500/[0.07] px-2 py-1.5">
        <span {...alca} className="cursor-grab text-muted-foreground/70 hover:text-foreground"><GripVertical className="h-3.5 w-3.5" /></span>
        <GatewayGlyph kind="exclusive" className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0">
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Escolher um caminho</span>
          <span className="block max-w-[360px] truncate text-[12.5px] font-semibold leading-tight">
            {bloco.pergunta?.trim() || <span className="font-normal italic text-muted-foreground">Sem pergunta</span>}
          </span>
        </div>
        <span className="ml-auto flex items-center gap-0.5 pl-3">
          <MarcaProblema id={bloco.id} />
          <BotaoIcone title="Configurar condições" onClick={() => t.onAbrir(bloco.id)}><SlidersHorizontal className="h-3.5 w-3.5" /></BotaoIcone>
          <BotaoIcone title="Remover a escolha e o que há dentro dela" perigo onClick={() => t.onRemover(bloco.id)}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-2">
        {faixas.map(({ c, padrao }) => {
          const cond = padrao ? null : (c as CaminhoCondicional)
          const temCond = !!cond?.condition?.trim()
          const acesa = !!sim && sim.caminhoId === c.id
          const apagada = !!sim && sim.caminhoId !== null && !acesa
          return (
            <div key={c.id}
              className={cn('flex items-center gap-1 rounded-lg px-2 py-1 transition-opacity',
                padrao ? 'border border-dashed border-foreground/20' : 'bg-muted/45',
                acesa && 'bg-primary/5 ring-2 ring-primary', apagada && 'opacity-40')}>
              <button type="button" onClick={() => t.onAbrir(bloco.id)} title={padrao ? 'Quando nenhuma condição acima for verdadeira' : 'Configurar a condição'}
                className="w-[150px] shrink-0 text-left text-[11.5px] leading-snug">
                {padrao ? (
                  <span className="font-semibold text-muted-foreground">Caso contrário</span>
                ) : temCond ? (
                  <><span className="font-bold text-violet-700 dark:text-violet-300">Se </span><span className="font-semibold">{cond!.rotulo?.trim() || cond!.condition}</span></>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />Sem condição</span>
                )}
                {acesa && <span className="block text-[10.5px] font-bold text-primary">✓ é por aqui</span>}
              </button>
              <div className="flex min-w-0 flex-1 items-center"><Sequencia refId={c.id} itens={c.itens} /></div>
              <div className="flex shrink-0 items-center gap-0.5 pl-1">
                {!dentroParalelo && (
                  <FimSelect fluxo={t.fluxo} escolhaId={bloco.id} caminhoId={c.id} fim={c.fim} nomeDe={t.nomeDe} onFluxo={t.onFluxo} />
                )}
                {!padrao && bloco.caminhos.length > 1 && (
                  <BotaoIcone title="Remover este caminho" perigo onClick={() => t.onFluxo((f) => removerCaminho(f, bloco.id, c.id))}><X className="h-3.5 w-3.5" /></BotaoIcone>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <footer className="flex items-center gap-3 border-t px-2.5 py-1.5">
        <button type="button" onClick={() => { const id = novoId('Caminho'); t.onFluxo((f) => adicionarCaminho(f, bloco.id, id)) }}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
          <Plus className="h-3 w-3" />caminho
        </button>
        <span className="text-[10.5px] text-muted-foreground">Segue um caminho só; os que seguem se reencontram na saída.</span>
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
          <input value={bloco.nome ?? ''} placeholder="Sem nome" aria-label="Nome do bloco"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const nome = e.target.value; t.onFluxo((f) => atualizarItem(f, bloco.id, { nome })) }}
            className="block w-[200px] bg-transparent text-[12.5px] font-semibold leading-tight outline-none placeholder:font-normal placeholder:italic placeholder:text-muted-foreground focus:underline focus:decoration-dotted" />
        </div>
        <span className="ml-auto flex items-center gap-0.5 pl-3">
          <MarcaProblema id={bloco.id} />
          <BotaoIcone title="Remover o bloco e o que há dentro dele" perigo onClick={() => t.onRemover(bloco.id)}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-2">
        {bloco.caminhos.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1 rounded-lg bg-muted/45 px-2 py-1">
            <span className="w-[68px] shrink-0 text-[11px] font-semibold text-muted-foreground">Caminho {i + 1}</span>
            <div className="flex min-w-0 flex-1 items-center"><Sequencia refId={c.id} itens={c.itens} /></div>
            {bloco.caminhos.length > 1 && (
              <BotaoIcone title="Remover este caminho" perigo onClick={() => t.onFluxo((f) => removerCaminho(f, bloco.id, c.id))}><X className="h-3.5 w-3.5" /></BotaoIcone>
            )}
          </div>
        ))}
      </div>

      <footer className="flex items-center gap-3 border-t px-2.5 py-1.5">
        <button type="button" onClick={() => { const id = novoId('Caminho'); t.onFluxo((f) => adicionarCaminho(f, bloco.id, id)) }}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-700 hover:underline dark:text-rose-300">
          <Plus className="h-3 w-3" />caminho
        </button>
        <span className="text-[10.5px] text-muted-foreground">Todos começam juntos; o processo segue quando todos terminarem.</span>
      </footer>
    </section>
  )
}

/** Como um caminho da escolha termina. "Voltar" só lista atividades que vêm ANTES da
 *  escolha e fora de um "ao mesmo tempo" — as outras travariam o motor. */
function FimSelect({ fluxo, escolhaId, caminhoId, fim, nomeDe, onFluxo }: {
  fluxo: FluxoBlocos; escolhaId: string; caminhoId: string; fim: FimCaminho
  nomeDe: (id: string) => string
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
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
        <SelectItem value="encerra" className="text-xs">Encerra o processo</SelectItem>
        {destinos.map((d) => <SelectItem key={d.id} value={`volta:${d.id}`} className="text-xs">Volta para: {nomeDe(d.id)}</SelectItem>)}
        {alvoInvalido && <SelectItem value={valor} className="text-xs">Volta para: {nomeDe(alvoInvalido)} (não vale mais)</SelectItem>}
      </SelectContent>
    </Select>
  )
}

/* ─── painel lateral de um bloco ─────────────────────────────────────────────── */

export function BlocoInspector({ bloco, nomeDe, onConfigure, onRenomear, onRemove }: {
  bloco: BlocoEscolha | BlocoParalelo
  nomeDe: (id: string) => string
  onConfigure: () => void
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
                <dt className="text-[10.5px] text-muted-foreground">Caso contrário</dt>
                <dd className="truncate text-[11px] font-medium">{resumoItens(bloco.casoContrario.itens, nomeDe)} · {textoFim(bloco.casoContrario.fim, nomeDe)}</dd>
              </div>
            </dl>
            <Button size="sm" className="w-full" onClick={onConfigure}><SlidersHorizontal className="h-3.5 w-3.5" />Configurar escolha</Button>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="paralelo-nome" className="mb-1.5 block text-xs font-medium">Nome do bloco</label>
              <Input id="paralelo-nome" className="h-8 text-sm" placeholder="Ex.: Pareceres" value={bloco.nome ?? ''} onChange={(e) => onRenomear(e.target.value)} />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Os {bloco.caminhos.length} caminhos começam juntos, e o processo só segue quando todos terminarem.
              Use o <span className="font-medium">+</span> dentro de cada caminho para inserir atividades.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── modal da escolha ───────────────────────────────────────────────────────── */

type Screens = ReturnType<typeof useScreens>['screens']

/** Mesma anatomia do modal de atividade: edição ao vivo com RETRATO na abertura —
 *  Cancelar/Esc devolve o fluxo como estava, Aplicar só fecha. */
export function EscolhaConfigModal({ fluxo, blocoId, nodes, edges, screens, onFluxo, onSimulacao, onRemove, onClose }: {
  fluxo: FluxoBlocos
  blocoId: string
  /** grafo GERADO dos blocos — é nele que se descobre o que vem antes da escolha */
  nodes: Array<{ id: string; type: string; name?: string; step?: StepFormSchema }>
  edges: Array<{ from: string; to: string }>
  screens: Screens
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
  onSimulacao?: (s: Simulacao | null) => void
  onRemove: () => void
  onClose: () => void
}) {
  const achado = acharItem(fluxo, blocoId)
  const bloco = achado?.kind === 'escolha' ? achado : null
  const campos = useMemo(() => camposDisponiveis(nodes, edges, blocoId, screens), [nodes, edges, blocoId, screens])
  const dentroParalelo = useMemo(() => escolhasEmParalelo(fluxo).has(blocoId), [fluxo, blocoId])
  const nomeDe = (id: string) => nodes.find((n) => n.id === id)?.step?.stepName?.trim() || 'Atividade sem nome'

  const original = useRef(fluxo)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const cancelar = () => { const antes = original.current; onFluxo(() => antes); onClose() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cancelar() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /* ── Testar decisão: o mesmo avaliador da execução, com valores de exemplo ── */
  const [simAberto, setSimAberto] = useState(false)
  const [simValores, setSimValores] = useState<Record<string, string>>({})
  const campoDe = (k: string) => campos.find((c) => c.key === k)
  const camposDoTeste = useMemo(() => {
    const usados = new Set<string>()
    for (const c of bloco?.caminhos ?? []) for (const r of c.conditionSpec?.rules ?? []) if (r.campo) usados.add(r.campo)
    return campos.filter((c) => usados.has(c.key))
  }, [bloco, campos])
  const vencedora = useMemo(() => {
    if (!simAberto || !bloco) return null
    const saidas = [...bloco.caminhos.map((c) => ({ id: c.id, condition: c.condition })), { id: bloco.casoContrario.id, isDefault: true }]
    return decidirSaida(saidas, montarVarsSimulacao(simValores, (k) => campoDe(k)?.tipo ?? 'texto'))
  }, [simAberto, simValores, bloco, campos]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onSimulacao?.(simAberto ? { blocoId, caminhoId: vencedora } : null)
  }, [simAberto, vencedora, blocoId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onSimulacao?.(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || !bloco) return null

  const marcaSim = (id: string) => {
    const acesa = simAberto && vencedora === id
    return { acesa, apagada: simAberto && vencedora !== null && !acesa }
  }

  return createPortal(
    <>
      {/* o scrim clareia durante o teste: o caminho aceso no trilho é parte da resposta */}
      <div className={cn('fixed inset-0 z-[60] transition-colors', simAberto ? 'bg-black/10' : 'bg-black/40')} onClick={cancelar} />
      <div role="dialog" aria-modal="true" aria-label="Configurar escolha"
        className="glass-panel fixed left-1/2 top-1/2 z-[70] flex max-h-[min(720px,90vh)] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl">

        <div className="flex shrink-0 items-start justify-between gap-4 border-b bg-muted/20 px-5 py-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
              <GatewayGlyph kind="exclusive" className="h-3 w-3" />Escolher um caminho
            </span>
            <h2 className="mt-1 truncate text-sm font-semibold">{bloco.pergunta?.trim() || 'Escolha sem pergunta'}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={onRemove} title="Remover a escolha" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={cancelar} title="Fechar sem aplicar" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="rolagem-visivel min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="escolha-pergunta" className="mb-1.5 block text-xs font-medium">Pergunta</label>
            <Input id="escolha-pergunta" className="h-8 text-sm" placeholder="Ex.: O valor do contrato passa de R$ 100 mil?"
              value={bloco.pergunta ?? ''} onChange={(e) => { const pergunta = e.target.value; onFluxo((f) => atualizarItem(f, blocoId, { pergunta })) }} />
          </div>

          <p className="text-[11.5px] leading-snug text-muted-foreground">
            O processo testa os caminhos <span className="font-medium text-foreground">de cima para baixo</span> e segue pelo primeiro cuja
            condição for verdadeira. Se nenhuma for, segue pelo <span className="font-medium text-foreground">caso contrário</span>.
          </p>
          {dentroParalelo && (
            <p className="rounded-md border border-dashed px-2.5 py-1.5 text-[11.5px] leading-snug text-muted-foreground">
              Esta escolha está dentro de um bloco “ao mesmo tempo”: ali todo caminho segue — encerrar o processo ou voltar não é permitido.
            </p>
          )}

          {/* Testar decisão */}
          <div className={cn('rounded-md border', simAberto ? 'border-primary/40 bg-primary/5' : 'bg-muted/20')}>
            <button type="button" className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold" onClick={() => setSimAberto((v) => !v)}>
              <Play className={cn('h-3.5 w-3.5', simAberto ? 'text-primary' : 'text-muted-foreground')} />
              <span className={simAberto ? 'text-primary' : 'text-muted-foreground'}>Testar decisão</span>
              <span className="ml-auto text-[11px] font-normal text-muted-foreground">{simAberto ? 'fechar' : 'valores de exemplo — o caminho acende no desenho'}</span>
            </button>
            {simAberto && (
              <div className="space-y-1.5 px-3 pb-2.5">
                {camposDoTeste.length === 0 ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">Monte ao menos uma condição abaixo — os campos usados aparecem aqui para você experimentar.</p>
                ) : camposDoTeste.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={c.label}>{c.label}</span>
                    {c.tipo === 'selecao' && c.options?.length ? (
                      <Select value={simValores[c.key] || undefined} onValueChange={(v) => setSimValores((sv) => ({ ...sv, [c.key]: v }))}>
                        <SelectTrigger className="h-7 w-[160px] shrink-0 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{c.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : c.tipo === 'booleano' ? (
                      <Select value={simValores[c.key] || undefined} onValueChange={(v) => setSimValores((sv) => ({ ...sv, [c.key]: v }))}>
                        <SelectTrigger className="h-7 w-[160px] shrink-0 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="true" className="text-xs">Sim</SelectItem><SelectItem value="false" className="text-xs">Não</SelectItem></SelectContent>
                      </Select>
                    ) : (
                      <Input className="h-7 w-[160px] shrink-0 text-xs" type={c.tipo === 'data' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                        value={simValores[c.key] ?? ''} onChange={(ev) => setSimValores((sv) => ({ ...sv, [c.key]: ev.target.value }))} />
                    )}
                  </div>
                ))}
                {camposDoTeste.length > 0 && vencedora && (
                  <p className="text-xs font-semibold text-primary">
                    → segue pelo {vencedora === bloco.casoContrario.id ? 'caso contrário' : `${bloco.caminhos.findIndex((c) => c.id === vencedora) + 1}º caminho`}
                  </p>
                )}
              </div>
            )}
          </div>

          {bloco.caminhos.map((c, i) => {
            const { acesa, apagada } = marcaSim(c.id)
            return (
              <div key={c.id} className={cn('space-y-2 rounded-lg border bg-muted/20 p-3 transition-all', acesa && 'border-primary bg-primary/5 ring-1 ring-primary/40', apagada && 'opacity-40')}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold tracking-widest text-violet-600 dark:text-violet-400">SE</span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">{i + 1}º caminho · {resumoItens(c.itens, nomeDe)}</span>
                  {acesa && <span className="shrink-0 text-[11px] font-bold text-primary">✓ é por aqui</span>}
                  {bloco.caminhos.length > 1 && (
                    /* A ordem decide: vence o primeiro caminho cuja condição for verdadeira. */
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      <button type="button" title="Testar este caminho antes do anterior" aria-label="Subir caminho" disabled={i === 0}
                        onClick={() => onFluxo((f) => moverCaminho(f, blocoId, c.id, -1))}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Testar este caminho depois do seguinte" aria-label="Descer caminho" disabled={i === bloco.caminhos.length - 1}
                        onClick={() => onFluxo((f) => moverCaminho(f, blocoId, c.id, 1))}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Remover este caminho" aria-label="Remover caminho" onClick={() => onFluxo((f) => removerCaminho(f, blocoId, c.id))}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                <CondBuilder edge={{ condition: c.condition, conditionSpec: c.conditionSpec as EdgeConditionSpec | undefined, label: c.rotulo }} campos={campos}
                  onSet={(p) => onFluxo((f) => atualizarCaminho(f, c.id, {
                    ...('condition' in p ? { condition: p.condition } : {}),
                    ...('conditionSpec' in p ? { conditionSpec: p.conditionSpec } : {}),
                    ...('label' in p ? { rotulo: p.label } : {}),
                  }))} />
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="h-7 min-w-[220px] flex-1 px-2.5 text-xs" value={c.rotulo ?? ''} placeholder="Rótulo do caminho (preenchido sozinho pela condição)"
                    onChange={(e) => { const rotulo = e.target.value; onFluxo((f) => atualizarCaminho(f, c.id, { rotulo })) }} />
                  {!dentroParalelo && <FimSelect fluxo={fluxo} escolhaId={blocoId} caminhoId={c.id} fim={c.fim} nomeDe={nomeDe} onFluxo={onFluxo} />}
                </div>
              </div>
            )
          })}

          <button type="button" onClick={() => { const id = novoId('Caminho'); onFluxo((f) => adicionarCaminho(f, blocoId, id)) }}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-violet-500/50 px-2.5 py-1 text-[11.5px] font-semibold text-violet-700 hover:bg-violet-500/5 dark:text-violet-300">
            <Plus className="h-3 w-3" />caminho com condição
          </button>

          {(() => {
            const c = bloco.casoContrario
            const { acesa, apagada } = marcaSim(c.id)
            return (
              <div className={cn('space-y-2 rounded-lg border border-dashed p-3 transition-all', acesa && 'border-primary bg-primary/5 ring-1 ring-primary/40', apagada && 'opacity-40')}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold tracking-widest text-muted-foreground">SENÃO</span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">caso contrário · {resumoItens(c.itens, nomeDe)}</span>
                  {acesa && <span className="shrink-0 text-[11px] font-bold text-primary">✓ é por aqui</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-[220px] flex-1 text-[11px] leading-snug text-muted-foreground">Quando nenhuma condição acima for verdadeira. Este caminho sempre existe — é ele que impede o processo de ficar sem saída.</p>
                  {!dentroParalelo && <FimSelect fluxo={fluxo} escolhaId={blocoId} caminhoId={c.id} fim={c.fim} nomeDe={nomeDe} onFluxo={onFluxo} />}
                </div>
              </div>
            )
          })()}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
          <p className="text-[11px] text-muted-foreground">As atividades de cada caminho são inseridas no desenho, pelo <span className="font-medium">+</span>.</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancelar}>Cancelar</Button>
            <Button size="sm" onClick={onClose}>Aplicar</Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
