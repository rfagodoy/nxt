'use client'

/* ─── Formas do desenho BPMN na identidade Nxt ─────────────────────────────────
   Cada forma é um nó do React Flow: tarefa, losango (escolha / ao mesmo tempo /
   reencontro), evento (início e fim) e a raia, que é fundo (só o rótulo e a alça de
   baixo recebem o ponteiro, para editá-la). A seta é ortogonal,
   com o rótulo do caminho numa pílula. As cores seguem o mockup aprovado: o tema
   claro é o padrão e o escuro vem pelas variantes `dark:`. */
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getSmoothStepPath, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { MoreHorizontal, Plus, Settings, UserSquare } from 'lucide-react'
import { GRADE, RAIA_ALTURA_MAXIMA, RAIA_ALTURA_MINIMA, RAIA_ROTULO_W } from '@/lib/desenho-bpmn'

/* ─── Medidas ─────────────────────────────────────────────────────────────── */
/* A caixa de cada forma é a que o layout (`nodeSize` de flow-layout) reserva: a tarefa
   tem 190 de largura e altura pelas linhas do nome; evento e losango, `SYMBOL` (56). */
/** Caixa dos símbolos (evento e losango). */
export const SIMBOLO = 56
/** Largura da faixa vertical da piscina, com o nome do processo. */
export const FAIXA_PISCINA = 28
/** Lado do quadrado do losango; girado 45°, a diagonal (~56) preenche a caixa. */
const LOSANGO_LADO = 40
const EVENTO_D = 32
/** Folga entre a borda da caixa e a do círculo: é onde a seta encosta. */
export const EVENTO_RECUO = (SIMBOLO - EVENTO_D) / 2

/* ─── Dados de cada forma ─────────────────────────────────────────────────── */
export type DadosTarefa = { nome: string; automatica: boolean; meta: string; problemas: string[]; largura: number; altura: number }
export type TipoLosango = 'escolha' | 'paralelo' | 'inclusivo'
export type DadosLosango = { tipo: TipoLosango; nome?: string; reencontro: boolean; problemas: string[] }
export type DadosEvento = { tipo: 'inicio' | 'fim'; problemas: string[] }
export type DadosRaia = { id: string; nome: string; largura: number; altura: number; indice: number; primeira: boolean; ultima: boolean }
export type DadosPiscina = { nome: string; altura: number }
export type DadosSeta = { rotulo?: string; senao: boolean; /** Seta sob o ponteiro durante um arrasto: a forma entra aqui. */ destacada?: boolean }

export type NoTarefa = Node<DadosTarefa, 'tarefa'>
export type NoLosango = Node<DadosLosango, 'losango'>
export type NoEvento = Node<DadosEvento, 'evento'>
export type NoRaia = Node<DadosRaia, 'raia'>
export type NoPiscina = Node<DadosPiscina, 'piscina'>
export type NoBpmn = NoTarefa | NoLosango | NoEvento | NoRaia | NoPiscina
export type SetaBpmn = Edge<DadosSeta, 'seta'>

/** Nome que o leitor de tela anuncia para a forma. */
export function rotuloDaForma(n: NoBpmn): string {
  const comProblemas = (txt: string, p: string[]) => (p.length ? `${txt}. ${p.length === 1 ? '1 pendência' : `${p.length} pendências`}: ${p.join(' ')}` : txt)
  switch (n.type) {
    case 'tarefa': return comProblemas(`${n.data.automatica ? 'Ação automática' : 'Tarefa'}: ${n.data.nome}${n.data.meta ? ` (${n.data.meta})` : ''}`, n.data.problemas)
    case 'losango': {
      const d = n.data
      const base = d.reencontro
        ? (d.tipo === 'paralelo' ? 'Fim do “ao mesmo tempo”: segue quando todas as frentes terminarem' : 'Reencontro dos caminhos')
        : d.tipo === 'paralelo' ? `Ao mesmo tempo${d.nome ? `: ${d.nome}` : ''}` : `Escolha${d.nome ? `: ${d.nome}` : ''}`
      return comProblemas(base, d.problemas)
    }
    case 'evento': return comProblemas(n.data.tipo === 'inicio' ? 'Início do processo' : 'Fim do processo', n.data.problemas)
    case 'raia': return `Raia ${n.data.nome || 'sem nome'}`
    case 'piscina': return `Processo ${n.data.nome || 'sem nome'}`
  }
}

/* ─── Peças comuns ────────────────────────────────────────────────────────── */
const ALCA = '!h-2 !w-2 !min-h-0 !min-w-0 !rounded-full !border-2 !border-[#11804F] !bg-white opacity-0 transition-opacity dark:!border-spark dark:!bg-[#0A110D]'

/** Pontos de ligação nas 4 laterais: em cada uma há uma chegada (`e-*`) e, por cima dela,
 *  uma saída (`s-*`) — puxar de qualquer lado começa uma seta; soltar perto de um lado a
 *  termina. Ficam invisíveis; aparecem ao passar o mouse quando o desenho aceita ligar. */
function Alcas({ conectavel, recuo = 0 }: { conectavel: boolean; recuo?: number }) {
  const cls = `${ALCA} ${conectavel ? 'group-hover:opacity-100' : ''}`
  return (
    <>
      <Handle id="e-l" type="target" position={Position.Left} isConnectable={conectavel} className={cls} style={{ left: recuo }} />
      <Handle id="e-t" type="target" position={Position.Top} isConnectable={conectavel} className={cls} style={{ top: recuo }} />
      <Handle id="e-b" type="target" position={Position.Bottom} isConnectable={conectavel} className={cls} style={{ bottom: recuo }} />
      <Handle id="e-r" type="target" position={Position.Right} isConnectable={conectavel} className={cls} style={{ right: recuo }} />
      <Handle id="s-l" type="source" position={Position.Left} isConnectable={conectavel} className={cls} style={{ left: recuo }} />
      <Handle id="s-r" type="source" position={Position.Right} isConnectable={conectavel} className={cls} style={{ right: recuo }} />
      <Handle id="s-t" type="source" position={Position.Top} isConnectable={conectavel} className={cls} style={{ top: recuo }} />
      <Handle id="s-b" type="source" position={Position.Bottom} isConnectable={conectavel} className={cls} style={{ bottom: recuo }} />
    </>
  )
}

/** Ponto âmbar de pendência; o texto completo vai no `title`. */
function MarcaDeProblema({ problemas, className = '' }: { problemas: string[]; className?: string }) {
  if (!problemas.length) return null
  return (
    <span title={problemas.join('\n')} aria-hidden
      className={`absolute h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:bg-amber-400 dark:ring-[#0F1914] ${className}`} />
  )
}

/** Nome de evento/losango, FORA da forma, embaixo (como no Bizagi). */
function RotuloExterno({ texto }: { texto?: string }) {
  if (!texto) return null
  return (
    <span className="pointer-events-none absolute left-1/2 top-full mt-1 w-[120px] -translate-x-1/2 text-center text-[10.5px] font-bold leading-tight text-[#2E3E36] line-clamp-2 dark:text-[#C9D6CE]">
      {texto}
    </span>
  )
}

/* ─── Tarefa ──────────────────────────────────────────────────────────────── */
export function FormaTarefa({ data, selected, isConnectable }: NodeProps<NoTarefa>) {
  return (
    <div className="group relative" style={{ width: data.largura, height: data.altura }}>
      <div className={`flex h-full w-full flex-col justify-between gap-1 rounded-[10px] px-[9px] py-[7px] font-sans
        bg-white dark:bg-[linear-gradient(180deg,#16251E,#111C17)]
        ${selected
          ? 'shadow-[0_0_0_2px_#11804F,0_0_0_6px_rgba(198,242,78,0.55)] dark:shadow-[0_0_0_2px_#C6F24E,0_0_24px_-6px_rgba(198,242,78,0.55)]'
          : 'shadow-[0_0_0_1px_#9DB0A5,0_8px_16px_-12px_rgba(12,20,16,0.45)] dark:shadow-[0_0_0_1px_#2E4238,0_8px_18px_-12px_rgba(0,0,0,0.6)]'}`}>
        <span className="flex items-start gap-1.5">
          {data.automatica
            ? <Settings aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#075985] dark:text-[#7DD3FC]" />
            : <UserSquare aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#075985] dark:text-[#7DD3FC]" />}
          <span className="line-clamp-3 text-[11.5px] font-extrabold leading-[1.25] text-[#142420] dark:text-white">{data.nome}</span>
        </span>
        <span className="truncate text-[10px] text-[#4F5F57] dark:text-[#9DB0A5]">{data.meta}</span>
      </div>
      <MarcaDeProblema problemas={data.problemas} className="-right-1 -top-1" />
      <Alcas conectavel={isConnectable} />
    </div>
  )
}

/* ─── Losango ─────────────────────────────────────────────────────────────── */
const COR_LOSANGO: Record<'escolha' | 'paralelo', string> = {
  escolha: 'bg-[#F7F5FE] border-[#6D28D9] text-[#5B21B6] dark:bg-[#17142A] dark:border-[#C4B5FD] dark:text-[#C4B5FD]',
  paralelo: 'bg-[#FFF6F8] border-[#BE123C] text-[#9F1239] dark:bg-[#1E1418] dark:border-[#FDA4B8] dark:text-[#FDA4B8]',
}
const LOSANGO_SEL = '!border-[#11804F] shadow-[0_0_0_5px_rgba(198,242,78,0.6)] dark:!border-spark dark:shadow-[0_0_22px_-4px_rgba(198,242,78,0.55)]'

function MarcaDoLosango({ tipo }: { tipo: TipoLosango }) {
  if (tipo === 'paralelo') return <span className="text-[20px] font-bold leading-none">+</span>
  if (tipo === 'inclusivo') return <span className="block h-3.5 w-3.5 rounded-full border-2 border-current" />
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" />
    </svg>
  )
}

export function FormaLosango({ data, selected, isConnectable }: NodeProps<NoLosango>) {
  const cor = COR_LOSANGO[data.tipo === 'paralelo' ? 'paralelo' : 'escolha']
  return (
    <div className="group relative flex items-center justify-center" style={{ width: SIMBOLO, height: SIMBOLO }}>
      <div className={`flex rotate-45 items-center justify-center border-2 ${cor} ${selected ? LOSANGO_SEL : ''}`}
        style={{ width: LOSANGO_LADO, height: LOSANGO_LADO }}>
        <span className="-rotate-45" aria-hidden><MarcaDoLosango tipo={data.tipo} /></span>
      </div>
      <MarcaDeProblema problemas={data.problemas} className="right-1 top-1" />
      <RotuloExterno texto={data.reencontro ? undefined : data.nome} />
      <Alcas conectavel={isConnectable} />
    </div>
  )
}

/* ─── Início e fim ────────────────────────────────────────────────────────── */
export function FormaEvento({ data, selected, isConnectable }: NodeProps<NoEvento>) {
  const borda = data.tipo === 'inicio' ? 'border-2' : 'border-4'
  return (
    <div className="group relative flex items-center justify-center" style={{ width: SIMBOLO, height: SIMBOLO }}>
      <div className={`rounded-full ${borda} border-[#11804F] bg-white dark:border-spark dark:bg-[#0F1914]
        ${selected ? 'shadow-[0_0_0_4px_rgba(198,242,78,0.6)] dark:shadow-[0_0_20px_-4px_rgba(198,242,78,0.6)]' : ''}`}
        style={{ width: EVENTO_D, height: EVENTO_D }} />
      <MarcaDeProblema problemas={data.problemas} className="right-2.5 top-2.5" />
      <RotuloExterno texto={data.tipo === 'inicio' ? 'Início' : 'Fim'} />
      <Alcas conectavel={isConnectable} recuo={EVENTO_RECUO} />
    </div>
  )
}

/* ─── Edição das raias ────────────────────────────────────────────────────── */
/** O que o canvas oferece às raias. Fica num contexto (e não nos dados do nó) para a
 *  projeção não refazer a cada render só porque uma função trocou de identidade. */
export type AcoesDeRaia = {
  editavel: boolean
  renomear: (id: string, nome: string) => void
  /** Grava a altura (a função pura prende ao mínimo e à grade). */
  redimensionar: (id: string, altura: number) => void
  /** Altura provisória durante o arrasto da alça; `null` encerra a prévia. */
  previa: (id: string, altura: number | null) => void
  mover: (id: string, direcao: -1 | 1) => void
  remover: (id: string) => void
  adicionar: () => void
}
const nada = () => {}
export const ContextoRaias = createContext<AcoesDeRaia>({
  editavel: false, renomear: nada, redimensionar: nada, previa: nada, mover: nada, remover: nada, adicionar: nada,
})

/** `nodrag nopan`: o ponteiro aqui edita a raia, não arrasta nem move a vista. */
const INTERATIVO = 'nodrag nopan pointer-events-auto'
const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#11804F] dark:focus-visible:outline-spark'
const ITEM_MENU = `block w-full rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left font-sans text-xs font-semibold text-[#2E3E36]
  hover:bg-[rgba(20,36,32,0.06)] disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#C9D6CE] dark:hover:bg-white/5 ${FOCO}`

/* ─── Foco depois de uma ação: o canvas redesenha e o elemento focado pode sumir ── */
const seletorDoMenu = (id: string) => `[data-raia-menu="${CSS.escape(id)}"]`
const SELETOR_ADICIONAR = '[data-raia-adicionar]'
/** Foca `seletor` dentro de `raiz` no quadro seguinte, quando a nova projeção já está na tela. */
const focarDepois = (raiz: ParentNode | null | undefined, seletor: string) =>
  requestAnimationFrame(() => raiz?.querySelector<HTMLElement>(seletor)?.focus())
/** O canvas que contém o elemento (vários canvas na página não se misturam). */
const canvasDe = (el: Element | null | undefined): ParentNode => el?.closest('.react-flow') ?? document
/** Altura de linha do `text-xs` (1rem). */
const LINHA_ROTULO = 16

/** Rótulo em edição: Enter grava, Esc cancela, sair do campo grava; nome em branco não grava.
 *  `onFim(true)` = saiu pelo teclado: o foco volta ao botão de opções da raia. */
function NomeDaRaia({ id, nome, onFim }: { id: string; nome: string; onFim: (devolverFoco: boolean) => void }) {
  const { renomear } = useContext(ContextoRaias)
  const [texto, setTexto] = useState(nome)
  const encerrado = useRef(false)
  const fim = (gravar: boolean, devolverFoco: boolean) => {
    if (encerrado.current) return // o blur que vem depois do Enter/Esc não conta de novo
    encerrado.current = true
    if (gravar) renomear(id, texto)
    onFim(devolverFoco)
  }
  return (
    <input aria-label="Nome da raia" value={texto} autoFocus onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); fim(true, true) }
        else if (e.key === 'Escape') { e.preventDefault(); fim(false, true) }
      }}
      onBlur={() => fim(true, false)}
      className={`${INTERATIVO} w-full rounded-md border border-[#11804F] bg-white px-1.5 py-0.5 font-sans text-xs font-extrabold text-[#142420] outline-none dark:border-spark dark:bg-[#0F1914] dark:text-white`} />
  )
}

function MenuDaRaia({ id, nome, primeira, ultima, onRenomear }: { id: string; nome: string; primeira: boolean; ultima: boolean; onRenomear: () => void }) {
  const { mover, remover } = useContext(ContextoRaias)
  /* O menu vai para o <body> (posição fixa, na escala da tela): dentro da raia, que fica
     atrás de tudo, as formas e a raia de baixo o cobririam. Fecha ao clicar fora, ao girar
     a roda (zoom/rolagem) e ao redimensionar a janela, porque a posição foi tirada na abertura. */
  const [aberto, setAberto] = useState<{ left: number; top: number } | null>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const fora = (e: globalThis.PointerEvent) => {
      const alvo = e.target as globalThis.Node
      if (!menu.current?.contains(alvo) && !botao.current?.contains(alvo)) setAberto(null)
    }
    const sumir = () => setAberto(null)
    document.addEventListener('pointerdown', fora)
    window.addEventListener('wheel', sumir, { capture: true, passive: true })
    window.addEventListener('resize', sumir)
    return () => {
      document.removeEventListener('pointerdown', fora)
      window.removeEventListener('wheel', sumir, { capture: true })
      window.removeEventListener('resize', sumir)
    }
  }, [aberto])
  const abrir = () => {
    const r = botao.current?.getBoundingClientRect()
    setAberto((x) => (x || !r ? null : { left: r.left, top: r.bottom + 4 }))
  }
  const fechar = () => { setAberto(null); botao.current?.focus() }
  /** Fecha, faz a ação e põe o foco em `depois` (o item do menu some com ele). */
  const escolher = (acao: () => void, depois?: string) => {
    const raiz = canvasDe(botao.current)
    setAberto(null)
    acao()
    if (depois) focarDepois(raiz, depois)
  }
  /** Removida a raia, o foco vai para as opções da raia de baixo; sem ela, para "+ raia". */
  const depoisDeRemover = () => {
    const menus = [...canvasDe(botao.current).querySelectorAll<HTMLElement>('[data-raia-menu]')]
    const proxima = botao.current ? menus[menus.indexOf(botao.current) + 1]?.dataset.raiaMenu : undefined
    return proxima ? seletorDoMenu(proxima) : SELETOR_ADICIONAR
  }
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    // Tab sairia do menu deixando-o aberto numa posição velha: fecha e volta ao botão
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); fechar() }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const itens = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const i = itens.indexOf(document.activeElement as HTMLButtonElement)
      itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus()
    }
  }
  const rotulo = `Opções da raia ${nome || 'sem nome'}`
  return (
    <span>
      <button ref={botao} type="button" data-raia-menu={id} aria-label={rotulo} title="Opções da raia" aria-haspopup="menu" aria-expanded={!!aberto}
        onClick={abrir}
        className={`${INTERATIVO} flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent text-[#4F5F57] hover:bg-[rgba(20,36,32,0.08)] dark:text-[#9DB0A5] dark:hover:bg-white/5 ${FOCO}`}>
        <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
      </button>
      {aberto && createPortal(
        <div ref={menu} role="menu" aria-label={rotulo} onKeyDown={teclas} style={{ left: aberto.left, top: aberto.top }}
          onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setAberto(null) }}
          className={`${INTERATIVO} fixed z-50 w-[136px] rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[#0F1914] dark:shadow-[0_0_0_1px_#2A3B32,0_12px_24px_-12px_rgba(0,0,0,0.7)]`}>
          <button type="button" role="menuitem" className={ITEM_MENU} onClick={() => escolher(onRenomear)}>Renomear</button>
          <button type="button" role="menuitem" className={ITEM_MENU} disabled={primeira} onClick={() => escolher(() => mover(id, -1), seletorDoMenu(id))}>Subir</button>
          <button type="button" role="menuitem" className={ITEM_MENU} disabled={ultima} onClick={() => escolher(() => mover(id, 1), seletorDoMenu(id))}>Descer</button>
          <button type="button" role="menuitem" className={`${ITEM_MENU} !text-[#B42318] dark:!text-[#FDA29B]`} onClick={() => escolher(() => remover(id), depoisDeRemover())}>Remover raia</button>
        </div>,
        document.body,
      )}
    </span>
  )
}

/** Alça da borda de baixo: arrastar muda a altura (na grade, entre o mínimo e o máximo); com foco, ↑/↓ também. */
function AlcaDaRaia({ id, nome, altura }: { id: string; nome: string; altura: number }) {
  const { redimensionar, previa } = useContext(ContextoRaias)
  const { getZoom } = useReactFlow()
  const inicio = useRef<{ y: number; altura: number; zoom: number } | null>(null)
  // o deslocamento na tela vira unidades do fluxo pelo zoom do começo do arrasto
  const alturaNoPonto = (e: PointerEvent, i: NonNullable<typeof inicio.current>) => i.altura + (e.clientY - i.y) / i.zoom
  // desmontada no meio do arrasto (raia removida, desenho virou só leitura): a prévia não fica presa
  const encerrarPrevia = useRef<() => void>(() => {})
  encerrarPrevia.current = () => { if (inicio.current) { inicio.current = null; previa(id, null) } }
  useEffect(() => {
    const encerrar = encerrarPrevia
    return () => encerrar.current()
  }, [])
  return (
    <div role="separator" aria-orientation="horizontal" tabIndex={0}
      aria-label={`Altura da raia ${nome || 'sem nome'}`} aria-valuenow={altura} aria-valuemin={RAIA_ALTURA_MINIMA} aria-valuemax={RAIA_ALTURA_MAXIMA} aria-valuetext={`${altura} px`}
      title="Arraste para mudar a altura (↑/↓ com o teclado)"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        inicio.current = { y: e.clientY, altura, zoom: getZoom() || 1 }
      }}
      onPointerMove={(e) => { if (inicio.current) previa(id, alturaNoPonto(e, inicio.current)) }}
      onPointerUp={(e) => {
        const i = inicio.current
        if (!i) return
        inicio.current = null
        previa(id, null)
        redimensionar(id, alturaNoPonto(e, i))
      }}
      onPointerCancel={() => { inicio.current = null; previa(id, null) }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault(); e.stopPropagation()
        redimensionar(id, altura + (e.key === 'ArrowDown' ? GRADE : -GRADE))
      }}
      className={`${INTERATIVO} group/alca absolute inset-x-0 -bottom-1 z-[1] flex h-2 cursor-ns-resize items-center justify-center outline-none`}>
      <span aria-hidden className="h-[3px] w-10 rounded-full bg-[#11804F] opacity-0 transition-opacity group-hover/alca:opacity-60 group-focus-visible/alca:opacity-100 dark:bg-spark" />
    </div>
  )
}

/* ─── Raia (fundo) ────────────────────────────────────────────────────────── */
export function FormaRaia({ data }: NodeProps<NoRaia>) {
  const { editavel } = useContext(ContextoRaias)
  const [editando, setEditando] = useState(false)
  const coluna = useRef<HTMLDivElement>(null)
  // o nome corta nas linhas que cabem na raia (sem invadir a de baixo)
  const linhas = Math.max(1, Math.floor((data.altura - LINHA_ROTULO) / LINHA_ROTULO))
  const faixa = data.indice % 2 === 0
    ? 'bg-[rgba(255,255,255,0.75)] dark:bg-[rgba(255,255,255,0.02)]'
    : 'bg-[rgba(242,246,241,0.85)] dark:bg-[rgba(255,255,255,0.045)]'
  /* contorno da piscina por fora (a faixa do nome fecha à esquerda); entre raias, só a linha fina */
  const contorno = [
    'border-r border-r-[#B8C6BE] dark:border-r-[#2A3B32]',
    data.primeira ? 'rounded-tr-[10px] border-t border-t-[#B8C6BE] dark:border-t-[#2A3B32]' : '',
    data.ultima
      ? 'rounded-br-[10px] border-b border-b-[#B8C6BE] dark:border-b-[#2A3B32]'
      : 'border-b border-b-[#D2DCD5] dark:border-b-[#22332A]',
  ].join(' ')
  const nome = data.nome || <span className="font-semibold italic opacity-70">Sem nome</span>
  const cortado = 'line-clamp-4 min-w-0 flex-1 [overflow-wrap:normal] [word-break:normal] hyphens-auto leading-[1.25]'
  /* o corpo deixa o ponteiro passar (formas por cima, clique no fundo tira a seleção);
     só o rótulo e a alça de baixo o recebem, e só quando o desenho é editável */
  return (
    <div className={`pointer-events-none relative box-border ${faixa} ${contorno}`} style={{ width: data.largura, height: data.altura }}>
      <div ref={coluna} lang="pt-BR" className="absolute inset-y-0 left-0 box-border overflow-hidden border-r border-r-[#D2DCD5] px-2.5 py-2 font-sans text-xs font-extrabold text-[#3E4E46] dark:border-r-[#22332A] dark:text-[#9DB0A5]"
        style={{ width: RAIA_ROTULO_W }}>
        {!editavel ? <span className={cortado} style={{ WebkitLineClamp: linhas }}>{nome}</span> : editando ? (
          <NomeDaRaia id={data.id} nome={data.nome} onFim={(devolverFoco) => {
            setEditando(false)
            if (devolverFoco) focarDepois(coluna.current, seletorDoMenu(data.id))
          }} />
        ) : (
          <div className="flex items-start gap-1">
            <span className={`${INTERATIVO} ${cortado} cursor-text`} style={{ WebkitLineClamp: linhas }} title="Duplo clique para renomear"
              onDoubleClick={() => setEditando(true)}>{nome}</span>
            <MenuDaRaia id={data.id} nome={data.nome} primeira={data.primeira} ultima={data.ultima} onRenomear={() => setEditando(true)} />
          </div>
        )}
      </div>
      {editavel && <AlcaDaRaia id={data.id} nome={data.nome} altura={data.altura} />}
    </div>
  )
}

/* ─── Piscina: faixa vertical com o nome do processo (fundo) ─────────────── */
export function FormaPiscina({ data }: NodeProps<NoPiscina>) {
  const { editavel, adicionar } = useContext(ContextoRaias)
  return (
    <div className="pointer-events-none relative" style={{ width: FAIXA_PISCINA, height: data.altura }}>
      <div className="box-border flex h-full w-full items-center justify-center overflow-hidden rounded-l-[10px] border border-[#B8C6BE] bg-[#E6EDE8] text-[#2E3E36] dark:border-[#2A3B32] dark:bg-[#13211A] dark:text-[#C9D6CE]">
        <span className="-rotate-90 whitespace-nowrap font-sans text-[11.5px] font-extrabold uppercase tracking-[0.04em]">{data.nome}</span>
      </div>
      {/* "+ raia" ao pé da piscina */}
      {editavel && (
        <button type="button" data-raia-adicionar onClick={adicionar} title="Cria uma raia no fim da piscina"
          className={`${INTERATIVO} absolute left-0 top-full mt-2 flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-[#9DB0A5] bg-white/80 px-2 py-1 font-sans text-[11px] font-bold text-[#2E3E36] hover:border-[#11804F] hover:text-[#11804F] dark:border-[#2E4238] dark:bg-[#0F1914]/80 dark:text-[#C9D6CE] dark:hover:border-spark dark:hover:text-spark ${FOCO}`}>
          <Plus aria-hidden className="h-3 w-3" /> raia
        </button>
      )}
    </div>
  )
}

/* ─── Seta ────────────────────────────────────────────────────────────────── */
/** Acima das formas (o React Flow eleva a selecionada a 1000). */
const Z_ROTULO = 1100
/** Id do marcador da ponta, desenhado uma vez pelo canvas. */
export const MARCADOR_SETA = 'nxt-bpmn-seta'

/** Onde a pílula do caminho fica: logo depois de a seta sair do losango — no começo do
 *  trecho que segue a dobra (ali as setas irmãs já se separaram), ou a um passo da saída
 *  quando a seta é reta. No meio da seta ela caía atrás das formas e sobre as vizinhas. */
export function pontoDoRotulo(caminho: string): { x: number; y: number } | null {
  const nums = (caminho.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const pts: Array<{ x: number; y: number }> = []
  // as dobras com raio 0 repetem o ponto do canto (L + Q): fica um ponto por canto
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const q = { x: nums[i], y: nums[i + 1] }, u = pts[pts.length - 1]
    if (!u || Math.abs(u.x - q.x) > 0.5 || Math.abs(u.y - q.y) > 0.5) pts.push(q)
  }
  if (pts.length < 2) return null
  const passo = (a: { x: number; y: number }, b: { x: number; y: number }, d: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = Math.min(1, d / len) * (d > len ? 0.5 : 1)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  // seta reta (ou quase): a 34 px da saída
  if (pts.length === 2) return passo(pts[0], pts[1], 34)
  // depois da 1ª dobra: 30 px adiante (no meio do trecho, se ele for curto)
  return passo(pts[1], pts[2], 30)
}

export function SetaComRotulo({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<SetaBpmn>) {
  const [caminho, mx, my] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0, offset: 20 })
  const perto = pontoDoRotulo(caminho)
  const lx = perto?.x ?? mx, ly = perto?.y ?? my
  // a pílula mostra o rótulo do caminho; o "Senão" é sempre "senão" (nunca a expressão do motor)
  const rotulo = data?.senao ? 'senão' : data?.rotulo
  return (
    <>
      <BaseEdge path={caminho} markerEnd={markerEnd}
        style={data?.destacada
          ? { stroke: 'var(--bpmn-seta-destaque)', strokeWidth: 3, strokeLinejoin: 'round' }
          : { stroke: 'var(--bpmn-seta)', strokeWidth: 1.6, strokeLinejoin: 'round' }} />
      {rotulo && (
        <EdgeLabelRenderer>
          <span
            className={`nodrag nopan pointer-events-none absolute whitespace-nowrap rounded-md px-1.5 py-px font-sans text-[10.5px] font-bold
              ${data?.senao
                ? 'bg-white text-[#3E4E46] shadow-[0_0_0_1px_#D2DCD5] dark:bg-[#13211A] dark:text-[#B5C5BB] dark:shadow-[0_0_0_1px_#2A3B32]'
                : 'bg-[#F5F2FF] text-[#5B21B6] shadow-[0_0_0_1px_#DDD3FB] dark:bg-[#1A1530] dark:text-[#DDD6FE] dark:shadow-[0_0_0_1px_rgba(167,139,250,0.35)]'}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, zIndex: Z_ROTULO }}>
            {rotulo}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/* Fora de qualquer componente: o React Flow pede tipos estáveis entre renders. */
export const tiposDeNo = { tarefa: FormaTarefa, losango: FormaLosango, evento: FormaEvento, raia: FormaRaia, piscina: FormaPiscina }
export const tiposDeSeta = { seta: SetaComRotulo }
