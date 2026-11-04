'use client'

/* ─── Paleta de formas do desenho BPMN (estilo Bizagi) ─────────────────────────
   Coluna à esquerda do canvas, recolhível (112 px ↔ 30 px; a preferência fica no
   navegador). Em cima, a grade de 2 colunas com os seis grupos do catálogo (Início, Tarefa,
   Subprocesso, Losango, Intermediário, Fim): cada botão mostra só o desenho da variação
   escolhida, e o ▾ ao lado abre a lista de variações com a etiqueta de cada uma ("Executa
   hoje" / "Próxima rodada"). O botão é arrastado para o desenho (`{ grupo, indice }` no
   `dataTransfer`, em `TIPO_ARRASTO_FORMA`) ou escolhido por clique/Enter (`onEscolher`;
   a página põe a forma depois da selecionada). Embaixo, os conectores (Sequência / Fluxo
   de mensagem: o ativo vale para as setas novas) e Piscina, Raia e Fase. */
import { useEffect, useRef, useState, type DragEvent, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { CATALOGO, ROTULO_ETIQUETA, type GrupoPaleta, type ItemCatalogo } from '@/lib/editor-bizagi/catalogo'

/** Tipo do `dataTransfer` com a forma arrastada da paleta: `JSON.stringify({ grupo, indice })`. */
export const TIPO_ARRASTO_FORMA = 'application/nxt-forma'

export type Conector = 'sequencia' | 'mensagem'

const GRUPOS: GrupoPaleta[] = ['inicio', 'tarefa', 'subprocesso', 'losango', 'intermediario', 'fim']
const CHAVE_PREFERENCIA = 'nxt:desenho-bpmn:paleta'
const NOME_DO_GRUPO: Record<GrupoPaleta, string> = {
  inicio: 'Início', tarefa: 'Tarefa', subprocesso: 'Subprocesso', losango: 'Losango', intermediario: 'Intermediário', fim: 'Fim',
}

/* ─── desenhos (viewBox 32 × 32, centrados em 16,16) ───────────────────────── */

const EVENTO = 'fill-white stroke-[var(--e-11804F)] dark:fill-[var(--e-0F1914)] dark:stroke-spark'
const MARCA_EVENTO = 'text-[var(--e-11804F)] dark:text-spark'
const TAREFA = 'fill-[#E0F2FE] stroke-[#0369A1] dark:fill-[rgba(56,189,248,0.12)] dark:stroke-[#7DD3FC]'
const MARCA_TAREFA = 'text-[#075985] dark:text-[#7DD3FC]'
const VIOLETA = 'fill-[#EDE9FE] stroke-[#6D28D9] dark:fill-[rgba(167,139,250,0.14)] dark:stroke-[#C4B5FD]'
const MARCA_VIOLETA = 'text-[#5B21B6] dark:text-[#C4B5FD]'
const ROSA = 'fill-[#FFE4E9] stroke-[#BE123C] dark:fill-[rgba(244,63,94,0.12)] dark:stroke-[#FDA4B8]'
const MARCA_ROSA = 'text-[#9F1239] dark:text-[#FDA4B8]'
/** Traço "vazado" sobre um envelope cheio. */
const VAZADO = 'stroke-white dark:stroke-[var(--e-0F1914)]'

const Envelope = ({ x, y, cheio }: { x: number; y: number; cheio?: boolean }) => (
  <g>
    <rect x={x - 6} y={y - 4} width={12} height={8.5} rx={1} fill={cheio ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.4} />
    <path d={`M${x - 6} ${y - 3.6}L${x} ${y + 0.8}L${x + 6} ${y - 3.6}`} fill="none" stroke={cheio ? undefined : 'currentColor'} className={cheio ? VAZADO : undefined} strokeWidth={1.3} />
  </g>
)
const Relogio = ({ x, y }: { x: number; y: number }) => (
  <g fill="none" stroke="currentColor" strokeWidth={1.5}>
    <circle cx={x} cy={y} r={7.5} />
    <path d={`M${x} ${y - 4.5}V${y}l3 2`} />
  </g>
)
const Pessoa = ({ x, y }: { x: number; y: number }) => (
  <g fill="none" stroke="currentColor" strokeWidth={1.6}>
    <circle cx={x} cy={y - 3} r={2.8} />
    <path d={`M${x - 5} ${y + 5}c0-3 2.2-4.6 5-4.6s5 1.6 5 4.6`} />
  </g>
)
const Engrenagem = ({ x, y }: { x: number; y: number }) => (
  <g fill="none" stroke="currentColor" strokeWidth={1.6}>
    <circle cx={x} cy={y} r={2.6} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = (a * Math.PI) / 180
      return <path key={a} d={`M${x + Math.cos(r) * 4.4} ${y + Math.sin(r) * 4.4}L${x + Math.cos(r) * 6.4} ${y + Math.sin(r) * 6.4}`} />
    })}
  </g>
)

/** A marca dentro do círculo do evento (início, intermediário, fim), já reduzida. */
function MarcaDoEvento({ item }: { item: ItemCatalogo }): JSX.Element | null {
  let marca: ReactNode = null
  switch (item.variante) {
    case 'agendado': case 'temporizador': marca = <Relogio x={16} y={16} />; break
    case 'evento': case 'recebe': marca = <Envelope x={16} y={16} />; break
    case 'envia': marca = <Envelope x={16} y={16} cheio />; break
    case 'erro': marca = <path fill="currentColor" d="M18 8L11 17h4l-2 7 7-9h-4z" />; break
    case 'cancela': marca = <path stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" d="M11 11L21 21M21 11L11 21" />; break
    case 'terminar': marca = <circle fill="currentColor" cx={16} cy={16} r={8} />; break
  }
  return marca ? <g transform="translate(16 16) scale(.75) translate(-16 -16)" className={MARCA_EVENTO}>{marca}</g> : null
}

function MarcaDoLosango({ item }: { item: ItemCatalogo }): JSX.Element {
  if (item.tipo === 'parallelGateway') {
    return <path className={MARCA_ROSA} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" d="M16 8V24M8 16H24" />
  }
  if (item.tipo === 'eventGateway') {
    const pts = [0, 1, 2, 3, 4].map((i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      return `${16 + Math.cos(a) * 4.6},${16 + Math.sin(a) * 4.6}`
    }).join(' ')
    return (
      <g className={MARCA_VIOLETA} fill="none" stroke="currentColor" strokeWidth={1.3}>
        <circle cx={16} cy={16} r={9} /><circle cx={16} cy={16} r={7} /><polygon points={pts} />
      </g>
    )
  }
  if (item.modo === 'todos') return <circle className={MARCA_VIOLETA} cx={16} cy={16} r={7} fill="none" stroke="currentColor" strokeWidth={2.4} />
  return <path className={MARCA_VIOLETA} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" d="M10 10L22 22M22 10L10 22" />
}

/** O desenho da forma que o item cria, em miniatura. */
export function IconeDoItem({ item, tamanho = 32 }: { item: ItemCatalogo; tamanho?: number }): JSX.Element {
  let corpo: ReactNode
  switch (item.grupo) {
    case 'inicio': case 'intermediario': case 'fim':
      corpo = (
        <>
          <circle className={EVENTO} cx={16} cy={16} r={13} strokeWidth={item.grupo === 'fim' ? 3.4 : 1.8} />
          {item.grupo === 'intermediario' && <circle className="stroke-[var(--e-11804F)] dark:stroke-spark" cx={16} cy={16} r={10.5} fill="none" strokeWidth={1.2} />}
          <MarcaDoEvento item={item} />
        </>
      )
      break
    case 'losango':
      corpo = (
        <>
          <polygon className={item.tipo === 'parallelGateway' ? ROSA : VIOLETA} points="16,2 30,16 16,30 2,16" strokeWidth={1.8} />
          <g transform="translate(16 16) scale(.85) translate(-16 -16)"><MarcaDoLosango item={item} /></g>
        </>
      )
      break
    case 'tarefa':
      corpo = (
        <>
          <rect className={TAREFA} x={1} y={5} width={30} height={24} rx={5} strokeWidth={1.3} />
          <g className={MARCA_TAREFA}>
            {item.tipo === 'serviceTask' ? <Engrenagem x={9} y={12} />
              : item.variante === 'envio' ? <Envelope x={9} y={12} cheio />
                : item.variante === 'recebimento' ? <Envelope x={9} y={12} /> : <Pessoa x={9} y={12} />}
          </g>
        </>
      )
      break
    case 'subprocesso':
      corpo = (
        <>
          <rect className={TAREFA} x={1} y={5} width={30} height={24} rx={5} strokeWidth={item.variante === 'chamada' ? 2.6 : 1.3} />
          <g className={MARCA_TAREFA}>
            <rect x={11.5} y={19} width={9} height={9} fill="none" stroke="currentColor" strokeWidth={1} />
            <path d="M16 20.5v6M13 23.5h6" stroke="currentColor" strokeWidth={1.2} />
          </g>
        </>
      )
      break
  }
  return <svg aria-hidden width={tamanho} height={tamanho} viewBox="0 0 32 32" overflow="visible">{corpo}</svg>
}

const TRACO = 'stroke-[var(--e-2E3E36)] dark:stroke-[var(--e-C9D6CE)]'
const PREENCHE = 'fill-[var(--e-2E3E36)] dark:fill-[var(--e-C9D6CE)]'
const FUNDO = 'fill-white dark:fill-[var(--e-0F1914)]'
const ICONE_FERRAMENTA: Record<'sequencia' | 'mensagem' | 'piscina' | 'raia' | 'fase', ReactNode> = {
  sequencia: <><path className={TRACO} d="M4 6v12h22" fill="none" strokeWidth={1.6} /><path className={PREENCHE} d="M24 15l4 3-4 3z" /></>,
  mensagem: (
    <>
      <circle className={`${FUNDO} ${TRACO}`} cx={5} cy={7} r={2.6} strokeWidth={1.3} />
      <path className={TRACO} d="M5 10v8h19" fill="none" strokeWidth={1.5} strokeDasharray="3 2.5" />
      <path className={`${FUNDO} ${TRACO}`} d="M24 15l4 3-4 3z" strokeWidth={1.2} />
    </>
  ),
  piscina: <><rect className={TRACO} x={2} y={6} width={28} height={20} fill="none" strokeWidth={1.4} /><path className={TRACO} d="M8 6v20" strokeWidth={1.4} /></>,
  raia: <><rect className={TRACO} x={2} y={6} width={28} height={20} fill="none" strokeWidth={1.4} /><path className={TRACO} d="M8 6v20M8 16h22" strokeWidth={1.4} /></>,
  fase: <><rect className={TRACO} x={2} y={6} width={28} height={20} fill="none" strokeWidth={1.4} /><path className={TRACO} d="M2 11h28M16 6v20" strokeWidth={1.4} /></>,
}

/* ─── botões ───────────────────────────────────────────────────────────────── */

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--e-11804F)] dark:focus-visible:outline-spark'
const BOTAO = `grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-transparent bg-transparent p-0 hover:bg-[rgba(17,128,79,0.08)] dark:hover:bg-[rgba(198,242,78,0.12)]
  aria-pressed:border-[var(--e-11804F)] aria-pressed:bg-[rgba(17,128,79,0.08)] dark:aria-pressed:border-spark dark:aria-pressed:bg-[rgba(198,242,78,0.12)]
  disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCO}`
/* O ▾ tem 8 px de largura (dois pares botão + ▾ cabem nos 100 px da paleta sem invadir o
   vizinho), mas a área de clique é a altura inteira da linha: o `after` invisível estica
   para cima e para baixo, sem cobrir botão nenhum. */
const SETA = `relative h-6 w-2 shrink-0 rounded-[3px] border-0 bg-transparent p-0 text-[9px] leading-none text-[var(--e-5B6B63)] hover:bg-[rgba(17,128,79,0.08)] hover:text-[var(--e-142420)]
  after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']
  dark:text-[var(--e-9DB0A5)] dark:hover:bg-[rgba(198,242,78,0.12)] dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${FOCO}`
const GRADE_CLS = 'grid grid-cols-2 gap-0.5 border-b border-b-[var(--e-DCE4DE)] px-1.5 py-2 dark:border-b-[var(--e-22332A)]'
/** As formas: cada célula é botão + ▾ (48 px); as colunas se ajustam ao conteúdo e se afastam. */
const GRADE_FORMAS = 'grid grid-cols-[repeat(2,auto)] justify-between gap-y-0.5 border-b border-b-[var(--e-DCE4DE)] px-1.5 py-2 dark:border-b-[var(--e-22332A)]'
/** Cores da etiqueta nas variações da paleta. */
export const CHIP: Record<ItemCatalogo['etiqueta'], string> = {
  hoje: 'bg-[#E3F3EA] text-[var(--e-11804F)] dark:bg-[rgba(198,242,78,0.12)] dark:text-spark',
  proxima: 'bg-[#EEF0EE] text-[var(--e-5B6B63)] dark:bg-white/[0.06] dark:text-[var(--e-9DB0A5)]',
}
const ITEM_MENU = `grid w-full grid-cols-[30px_1fr_auto] items-center gap-2 rounded-[7px] border-0 bg-transparent px-2 py-[5px] text-left font-sans text-xs font-semibold
  text-[var(--e-142420)] hover:bg-[rgba(17,128,79,0.08)] aria-checked:bg-[rgba(17,128,79,0.08)] dark:text-[var(--e-E3ECE6)] dark:hover:bg-[rgba(198,242,78,0.12)]
  dark:aria-checked:bg-[rgba(198,242,78,0.12)] ${FOCO}`

const rotulo = (item: ItemCatalogo) => `${item.nome} · ${ROTULO_ETIQUETA[item.etiqueta]}`

export function PaletaBpmn({
  escolhidas, onTrocarVariante, onEscolher, conector, onConector, onAdicionarRaia, onAdicionarFase, onAdicionarPiscina, desabilitada = false,
}: {
  /** Variação mostrada em cada grupo (índice em `CATALOGO[grupo]`). */
  escolhidas: Record<GrupoPaleta, number>
  onTrocarVariante: (g: GrupoPaleta, indice: number) => void
  /** Forma escolhida por clique, Enter ou espaço (sem arrastar). */
  onEscolher: (item: ItemCatalogo) => void
  /** Conector ativo: o tipo das setas novas. */
  conector: Conector
  onConector: (c: Conector) => void
  onAdicionarRaia: () => void
  onAdicionarFase: () => void
  onAdicionarPiscina: () => void
  /** Só leitura: nada se arrasta nem se cria. */
  desabilitada?: boolean
}): JSX.Element {
  /* aberta por padrão; a preferência é lida depois de montar (o servidor não a conhece) */
  const [aberta, setAberta] = useState(true)
  useEffect(() => {
    try { if (window.localStorage.getItem(CHAVE_PREFERENCIA) === 'recolhida') setAberta(false) } catch { /* sem armazenamento: fica aberta */ }
  }, [])
  const alternar = () => {
    const nova = !aberta
    setAberta(nova)
    try { window.localStorage.setItem(CHAVE_PREFERENCIA, nova ? 'aberta' : 'recolhida') } catch { /* só não lembra */ }
  }

  const [menu, setMenu] = useState<GrupoPaleta | null>(null)
  const ancora = useRef<HTMLButtonElement | null>(null)
  const lista = useRef<HTMLDivElement>(null)
  const fecharMenu = (devolverFoco: boolean) => {
    setMenu(null)
    if (devolverFoco) ancora.current?.focus()
  }
  const teclasDoMenu = (e: KeyboardEvent<HTMLDivElement>) => {
    // o Esc quem fecha é o FloatingMenu; aqui o foco volta para o ▾
    if (e.key === 'Escape') { ancora.current?.focus(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const itens = Array.from(lista.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])
    const i = itens.indexOf(document.activeElement as HTMLElement)
    const alvo = e.key === 'Home' ? 0 : e.key === 'End' ? itens.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length
    itens[alvo]?.focus()
  }

  const aoArrastar = (grupo: GrupoPaleta, indice: number) => (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(TIPO_ARRASTO_FORMA, JSON.stringify({ grupo, indice }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <nav aria-label="Paleta de formas"
      className={`flex shrink-0 flex-col overflow-y-auto border-r border-r-[rgba(20,36,32,0.08)] bg-[var(--e-F7FAF7)] transition-[width] duration-150 dark:border-r-[var(--e-1C2A23)] dark:bg-white/[0.02] ${aberta ? 'w-[112px]' : 'w-[30px]'}`}>
      <div className="flex justify-end border-b border-b-[var(--e-DCE4DE)] p-1 dark:border-b-[var(--e-22332A)]">
        <button type="button" onClick={alternar} aria-expanded={aberta} aria-label={aberta ? 'Recolher a paleta' : 'Abrir a paleta'} title={aberta ? 'Recolher a paleta' : 'Abrir a paleta'}
          className={`rounded-[5px] border-0 bg-transparent px-1.5 py-0.5 text-[var(--e-5B6B63)] hover:bg-[rgba(17,128,79,0.08)] dark:text-[var(--e-9DB0A5)] dark:hover:bg-[rgba(198,242,78,0.12)] ${FOCO}`}>
          {aberta ? '‹' : '›'}
        </button>
      </div>
      {aberta && (
        <>
          <div role="group" aria-label="Formas" className={GRADE_FORMAS}>
            {GRUPOS.map((g) => {
              const indice = Math.min(escolhidas[g] ?? 0, CATALOGO[g].length - 1)
              const item = CATALOGO[g][indice]
              return (
                <div key={g} className="flex items-center">
                  <button type="button" disabled={desabilitada} draggable={!desabilitada} onDragStart={aoArrastar(g, indice)} onClick={() => onEscolher(item)}
                    aria-label={rotulo(item)} title={`${rotulo(item)}. Arraste para o desenho ou pressione Enter.`} className={`${BOTAO} cursor-grab`}>
                    <IconeDoItem item={item} />
                  </button>
                  <button type="button" disabled={desabilitada} aria-label={`Variações de ${item.nome}`} aria-haspopup="menu" aria-expanded={menu === g}
                    title={`Variações de ${item.nome}`} className={SETA}
                    onClick={(e) => { ancora.current = e.currentTarget; setMenu((m) => (m === g ? null : g)) }}>
                    ▾
                  </button>
                </div>
              )
            })}
          </div>
          <div role="group" aria-label="Conectores" className={GRADE_CLS}>
            <button type="button" aria-pressed={conector === 'sequencia'} disabled={desabilitada} onClick={() => onConector('sequencia')} className={BOTAO}
              aria-label="Sequência" title="Sequência · Executa hoje. Arraste a bolinha de uma forma até outra para ligar.">
              <svg aria-hidden width={32} height={32} viewBox="0 0 32 32" overflow="visible">{ICONE_FERRAMENTA.sequencia}</svg>
            </button>
            <button type="button" aria-pressed={conector === 'mensagem'} disabled={desabilitada} onClick={() => onConector('mensagem')} className={BOTAO}
              aria-label="Fluxo de mensagem" title="Fluxo de mensagem · Só documenta. Liga uma forma a outra piscina.">
              <svg aria-hidden width={32} height={32} viewBox="0 0 32 32" overflow="visible">{ICONE_FERRAMENTA.mensagem}</svg>
            </button>
          </div>
          <div role="group" aria-label="Piscina, raia e fase" className={GRADE_CLS}>
            <button type="button" disabled={desabilitada} onClick={onAdicionarPiscina} className={BOTAO}
              aria-label="Nova piscina" title="Nova piscina (participante externo) · Só documenta. Entra embaixo do desenho.">
              <svg aria-hidden width={32} height={32} viewBox="0 0 32 32" overflow="visible">{ICONE_FERRAMENTA.piscina}</svg>
            </button>
            <button type="button" disabled={desabilitada} onClick={onAdicionarRaia} className={BOTAO}
              aria-label="Nova raia" title="Nova raia · Executa hoje. Entra no fim da piscina.">
              <svg aria-hidden width={32} height={32} viewBox="0 0 32 32" overflow="visible">{ICONE_FERRAMENTA.raia}</svg>
            </button>
            <button type="button" disabled={desabilitada} onClick={onAdicionarFase} className={BOTAO}
              aria-label="Nova fase" title="Nova fase · Só documenta. Entra no fim e alonga a piscina.">
              <svg aria-hidden width={32} height={32} viewBox="0 0 32 32" overflow="visible">{ICONE_FERRAMENTA.fase}</svg>
            </button>
          </div>
        </>
      )}
      {menu && aberta && (
        <FloatingMenu anchor={ancora} onClose={() => fecharMenu(false)} role="menu" aria-label={`Variações: ${NOME_DO_GRUPO[menu]}`}
          onKeyDown={teclasDoMenu}
          className="grid min-w-[270px] gap-0.5 rounded-[10px] border border-[var(--e-DCE4DE)] bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] dark:border-[var(--e-22332A)] dark:bg-[var(--e-0F1914)]">
          <div ref={lista} className="contents">
            {CATALOGO[menu].map((item, i) => {
              const atual = i === (escolhidas[menu] ?? 0)
              return (
                <button key={item.nome} type="button" role="menuitemradio" aria-checked={atual} data-autofocus={atual ? '' : undefined}
                  className={ITEM_MENU} onClick={() => { onTrocarVariante(menu, i); fecharMenu(true) }}>
                  <IconeDoItem item={item} tamanho={26} />
                  <span>{item.nome}</span>
                  <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.01em] ${CHIP[item.etiqueta]}`}>{ROTULO_ETIQUETA[item.etiqueta]}</span>
                </button>
              )
            })}
          </div>
        </FloatingMenu>
      )}
    </nav>
  )
}
