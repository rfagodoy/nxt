'use client'

/* ─── Formas do desenho BPMN na identidade Nxt ─────────────────────────────────
   Cada forma é um nó do React Flow: tarefa (e subprocesso), losango (escolha / ao mesmo
   tempo / reencontro / baseado em evento), evento (início, intermediário e fim, com o
   ícone da variante) e as faixas, que são fundo: piscina, raia, fase e piscina externa (só
   os rótulos e as alças recebem o ponteiro, para editá-las). A seta é ortogonal, com o
   rótulo do caminho numa pílula; o fluxo de mensagem é tracejado, com círculo na saída e
   ponta vazada. Na vertical, as faixas são o retângulo lógico transposto: os nomes das
   raias e da piscina ficam no topo, os das fases à esquerda. As cores seguem o mockup aprovado: o tema
   claro é o padrão e o escuro vem pelas variantes `dark:`. */
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizeControl, Position, getSmoothStepPath, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps, type ResizeParams } from '@xyflow/react'
import { MoreHorizontal, Plus, Settings, UserSquare } from 'lucide-react'
import type { VarianteForma } from '@nxt/types'
import { GRADE, RAIA_ALTURA_MAXIMA, RAIA_ALTURA_MINIMA, RAIA_ROTULO_W, pontoDoRotuloNaPolilinha } from '@/lib/desenho-bpmn'
import { FASE_LARGURA_MINIMA, FORMA_MINIMA, PISCINA_LARGURA_MINIMA } from '@/lib/editor-bizagi/layout'
import { FASE_ALTURA, FAIXA_DO_NOME } from '@/lib/editor-bizagi/faixas'
import { iconeDaTarefa, iconeDoEvento, nomeDoEvento, tipoDaTarefa, type IconeDoEvento, type TipoDoEvento } from '@/lib/editor-bizagi/formas-do-canvas'

/* ─── Medidas ─────────────────────────────────────────────────────────────── */
/* A caixa de cada forma é a que o layout (`nodeSize` de flow-layout) reserva: a tarefa
   tem 190 de largura e altura pelas linhas do nome; evento e losango, `SYMBOL` (56). */
/** Caixa dos símbolos (evento e losango). */
export const SIMBOLO = 56
/** Largura da faixa vertical da piscina, com o nome do processo. */
export const FAIXA_PISCINA = FAIXA_DO_NOME
/** Lado do quadrado do losango; girado 45°, a diagonal (~56) preenche a caixa. */
const LOSANGO_LADO = 40
const EVENTO_D = 32
/** Folga entre a borda da caixa e a do círculo: é onde a seta encosta. */
export const EVENTO_RECUO = (SIMBOLO - EVENTO_D) / 2

/* ─── Dados de cada forma ─────────────────────────────────────────────────── */
export type DadosTarefa = { nome: string; automatica: boolean; meta: string; problemas: string[]; largura: number; altura: number
  /** Variante da tarefa (usuário, envio, recebimento; a do subprocesso). Sem ela, a de sempre. */
  variante?: VarianteForma
  /** Presente = é um subprocesso: sem ícone, com o quadrinho "+" embaixo; `chamada` tem a borda grossa. */
  subprocesso?: 'chamada' | 'embutido' }
export type TipoLosango = 'escolha' | 'paralelo' | 'inclusivo' | 'evento'
export type DadosLosango = { tipo: TipoLosango; nome?: string; reencontro: boolean; problemas: string[] }
export type DadosEvento = { tipo: TipoDoEvento; variante: VarianteForma; nome?: string; problemas: string[] }
export type DadosRaia = { id: string; nome: string; largura: number; altura: number; indice: number; primeira: boolean; ultima: boolean
  /** A primeira raia SEM cabeçalho de fases fecha o contorno da piscina por cima. */ bordaDeCima: boolean }
/** Piscina do processo: o retângulo inteiro (faixa do nome + cabeçalho das fases + raias).
 *  `largura` = a da raia (lógica), que a alça do fim muda; `cabecalho` = há fases. */
export type DadosPiscina = { nome: string; largura: number; cabecalho: boolean }
/** Fase: a coluna inteira (cabeçalho + raias); `largura` lógica, que a alça muda. */
export type DadosFase = { id: string; nome: string; largura: number; primeira: boolean; ultima: boolean }
export type DadosPiscinaExterna = { id: string; nome: string }
export type DadosSeta = { rotulo?: string; senao: boolean; /** Seta sob o ponteiro durante um arrasto: a forma entra aqui. */ destacada?: boolean
  /** Culpada da pendência escolhida na pílula: vermelho tracejado, como a seta recusada. */ problema?: boolean }

export type NoTarefa = Node<DadosTarefa, 'tarefa'>
export type NoLosango = Node<DadosLosango, 'losango'>
export type NoEvento = Node<DadosEvento, 'evento'>
export type NoRaia = Node<DadosRaia, 'raia'>
export type NoPiscina = Node<DadosPiscina, 'piscina'>
export type NoFase = Node<DadosFase, 'fase'>
export type NoPiscinaExterna = Node<DadosPiscinaExterna, 'externa'>
export type NoBpmn = NoTarefa | NoLosango | NoEvento | NoRaia | NoPiscina | NoFase | NoPiscinaExterna
/** Fluxo de mensagem: `pontos` = o traço já na TELA (o canvas roteia; as alças só ancoram). */
export type DadosMensagem = { pontos: Array<{ x: number; y: number }>; rotulo?: string }
export type SetaDeSequencia = Edge<DadosSeta, 'seta'>
export type SetaDeMensagem = Edge<DadosMensagem, 'mensagem'>
export type SetaBpmn = SetaDeSequencia | SetaDeMensagem

/** Nome que o leitor de tela anuncia para a forma. */
export function rotuloDaForma(n: NoBpmn): string {
  const comProblemas = (txt: string, p: string[]) => (p.length ? `${txt}. ${p.length === 1 ? '1 pendência' : `${p.length} pendências`}: ${p.join(' ')}` : txt)
  switch (n.type) {
    case 'tarefa': {
      const d = n.data
      return comProblemas(`${tipoDaTarefa(d.automatica, d.variante, d.subprocesso)}: ${d.nome}${d.meta ? ` (${d.meta})` : ''}`, d.problemas)
    }
    case 'losango': {
      const d = n.data
      const base = d.reencontro
        ? (d.tipo === 'paralelo' ? 'Fim do “ao mesmo tempo”: segue quando todas as frentes terminarem' : 'Reencontro dos caminhos')
        : `${d.tipo === 'paralelo' ? 'Ao mesmo tempo' : d.tipo === 'evento' ? 'Baseado em evento' : 'Escolha'}${d.nome ? `: ${d.nome}` : ''}`
      return comProblemas(base, d.problemas)
    }
    case 'evento': return comProblemas(nomeDoEvento(n.data.tipo, n.data.variante, n.data.nome), n.data.problemas)
    case 'raia': return `Raia ${n.data.nome || 'sem nome'}`
    case 'piscina': return `Processo ${n.data.nome || 'sem nome'}`
    case 'fase': return `Fase ${n.data.nome || 'sem nome'}`
    case 'externa': return `Participante externo ${n.data.nome || 'sem nome'}`
  }
}

/* ─── Peças comuns ────────────────────────────────────────────────────────── */
const ALCA = '!h-2 !w-2 !min-h-0 !min-w-0 !rounded-full !border-2 !border-[var(--e-11804F)] !bg-white opacity-0 transition-opacity dark:!border-spark dark:!bg-[var(--e-0A110D)]'

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

/** Distância da bolinha de ligar até a borda da forma. */
const BOLINHA_DIST = 14

/** Bolinha de ligar (estilo Bizagi): embaixo da forma selecionada (à direita, na vertical);
 *  arrastá-la até outra forma cria a seta. Fica SEMPRE montada (invisível sem seleção): o
 *  React Flow só conhece as alças medidas com a forma, e uma que aparece depois não liga. */
function BolinhaDeLigar({ visivel }: { visivel: boolean }) {
  const { ladoDaBolinha } = useContext(ContextoFormas)
  const lado = ladoDaBolinha === Position.Right ? { right: -BOLINHA_DIST } : { bottom: -BOLINHA_DIST }
  return (
    <Handle id="ligar" type="source" position={ladoDaBolinha} isConnectable={visivel} title="Arraste até outra forma para ligar"
      style={lado}
      className={`!h-3 !w-3 !min-h-0 !min-w-0 !rounded-full !border-2 !border-[var(--e-11804F)] !bg-[rgba(198,242,78,0.9)] !cursor-crosshair dark:!border-spark dark:!bg-[var(--e-0A110D)]
        ${visivel ? '' : '!pointer-events-none opacity-0'}`} />
  )
}

/** Ponto âmbar de pendência; o texto completo vai no `title`. */
function MarcaDeProblema({ problemas, className = '' }: { problemas: string[]; className?: string }) {
  if (!problemas.length) return null
  return (
    <span title={problemas.join('\n')} aria-hidden
      className={`absolute h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:bg-amber-400 dark:ring-[var(--e-0F1914)] ${className}`} />
  )
}

/** Nome de evento/losango, FORA da forma, embaixo (como no Bizagi). */
function RotuloExterno({ texto }: { texto?: string }) {
  if (!texto) return null
  return (
    <span className="pointer-events-none absolute left-1/2 top-full mt-1 w-[120px] -translate-x-1/2 text-center text-[10.5px] font-bold leading-tight text-[var(--e-2E3E36)] line-clamp-2 dark:text-[var(--e-C9D6CE)]">
      {texto}
    </span>
  )
}

/* ─── Ícones das variantes (traços do mockup aprovado, numa caixa 20 × 20) ── */
/** Envelope: vazado (recebe) ou cheio (envia). No cheio, a dobra é traçada na cor do fundo. */
function Envelope({ cheio, className, dobra }: { cheio: boolean; className: string; dobra: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={className}>
      <rect x="4" y="6" width="12" height="8.5" rx="1" fill={cheio ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.4} />
      <path d="M4 6.4L10 10.8L16 6.4" fill="none" stroke={cheio ? undefined : 'currentColor'} className={cheio ? dobra : undefined} strokeWidth={1.3} />
    </svg>
  )
}

/** Marca dentro do círculo do evento. */
function IconeEvento({ icone }: { icone: IconeDoEvento }) {
  const cls = 'h-4 w-4'
  switch (icone) {
    case 'relogio':
      return <svg aria-hidden viewBox="0 0 20 20" className={cls} fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="10" cy="10" r="7.5" /><path d="M10 5.5V10l3 2" /></svg>
    case 'envelope':
    case 'envelopeCheio':
      return <Envelope cheio={icone === 'envelopeCheio'} className={cls} dobra="stroke-white dark:stroke-[var(--e-0F1914)]" />
    case 'raio':
      return <svg aria-hidden viewBox="0 0 20 20" className={cls}><path fill="currentColor" d="M12 2L5 11h4l-2 7 7-9h-4z" /></svg>
    case 'xis':
      return <svg aria-hidden viewBox="0 0 20 20" className={cls} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round"><path d="M5 5L15 15M15 5L5 15" /></svg>
    case 'disco':
      return <svg aria-hidden viewBox="0 0 20 20" className={cls}><circle cx="10" cy="10" r="8" fill="currentColor" /></svg>
  }
}

/* ─── Tamanho da tarefa ───────────────────────────────────────────────────── */
/** O que o canvas oferece às caixas redimensionáveis (tarefa e subprocesso). Fica num
 *  contexto (como as raias) para a projeção não refazer só porque uma função trocou. */
export type AcoesDeForma = {
  editavel: boolean
  /** Começo do arrasto da alça: o canvas segura a projeção (como no arrasto de uma forma). */
  comecarTamanho: () => void
  /** Fim do arrasto da alça de tamanho: a página grava (na grade, com o mínimo). `canto` =
   *  o canto superior esquerdo NA TELA (na vertical, a posição lógica acompanha). */
  redimensionar: (id: string, tam: { largura: number; altura: number }, canto: { x: number; y: number }) => void
  /** Onde fica a bolinha de ligar: embaixo na horizontal, à direita na vertical. */
  ladoDaBolinha: Position
}
export const ContextoFormas = createContext<AcoesDeForma>({ editavel: false, comecarTamanho: () => {}, redimensionar: () => {}, ladoDaBolinha: Position.Bottom })

/* ─── Tarefa e subprocesso ────────────────────────────────────────────────── */
const ICONE_TAREFA = 'mt-[1px] h-3.5 w-3.5 shrink-0 text-[#075985] dark:text-[#7DD3FC]'

function IconeDaTarefa({ data }: { data: DadosTarefa }) {
  const icone = iconeDaTarefa(data.subprocesso ? 'subProcess' : data.automatica ? 'serviceTask' : 'userTask', data.variante)
  switch (icone) {
    case 'engrenagem': return <Settings aria-hidden className={ICONE_TAREFA} />
    case 'usuario': return <UserSquare aria-hidden className={ICONE_TAREFA} />
    case 'envelope':
    case 'envelopeCheio':
      return <Envelope cheio={icone === 'envelopeCheio'} className={`${ICONE_TAREFA} scale-[1.35]`} dobra="stroke-white dark:stroke-[var(--e-16251E)]" />
    default: return null
  }
}

const CONTORNO_TAREFA = {
  normal: 'shadow-[0_0_0_1px_var(--e-9DB0A5),0_8px_16px_-12px_rgba(12,20,16,0.45)] dark:shadow-[0_0_0_1px_var(--e-2E4238),0_8px_18px_-12px_rgba(0,0,0,0.6)]',
  selecionada: 'shadow-[0_0_0_2px_var(--e-11804F),0_0_0_6px_rgba(198,242,78,0.55)] dark:shadow-[0_0_0_2px_var(--e-C6F24E),0_0_24px_-6px_rgba(198,242,78,0.55)]',
  /* subprocesso que chama outro workflow: borda grossa */
  chamada: 'shadow-[0_0_0_3px_var(--e-9DB0A5),0_8px_16px_-12px_rgba(12,20,16,0.45)] dark:shadow-[0_0_0_3px_var(--e-2E4238),0_8px_18px_-12px_rgba(0,0,0,0.6)]',
  chamadaSelecionada: 'shadow-[0_0_0_3.5px_var(--e-11804F),0_0_0_7px_rgba(198,242,78,0.55)] dark:shadow-[0_0_0_3.5px_var(--e-C6F24E),0_0_24px_-6px_rgba(198,242,78,0.55)]',
}

export function FormaTarefa({ id, data, selected, isConnectable }: NodeProps<NoTarefa>) {
  const { editavel, comecarTamanho, redimensionar } = useContext(ContextoFormas)
  const chamada = data.subprocesso === 'chamada'
  const contorno = chamada
    ? (selected ? CONTORNO_TAREFA.chamadaSelecionada : CONTORNO_TAREFA.chamada)
    : (selected ? CONTORNO_TAREFA.selecionada : CONTORNO_TAREFA.normal)
  /* a caixa ocupa o nó inteiro: ao arrastar a alça de tamanho, ela acompanha */
  return (
    <div className="group relative h-full w-full">
      <div className={`flex h-full w-full flex-col justify-between gap-1 overflow-hidden rounded-[10px] px-[9px] py-[7px] font-sans
        bg-white dark:bg-[linear-gradient(180deg,var(--e-16251E),var(--e-111C17))] ${contorno}`}>
        <span className="flex items-start gap-1.5">
          <IconeDaTarefa data={data} />
          <span className="line-clamp-3 text-[11.5px] font-extrabold leading-[1.25] text-[var(--e-142420)] dark:text-white">{data.nome}</span>
        </span>
        {data.subprocesso
          ? (
            <span aria-hidden className="mx-auto flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-[var(--e-9DB0A5)] text-[var(--e-142420)] dark:border-[var(--e-2E4238)] dark:text-white">
              <Plus className="h-2.5 w-2.5" strokeWidth={2.4} />
            </span>
          )
          : <span className="truncate text-[10px] text-[var(--e-4F5F57)] dark:text-[var(--e-9DB0A5)]">{data.meta}</span>}
      </div>
      <MarcaDeProblema problemas={data.problemas} className="-right-1 -top-1" />
      <Alcas conectavel={isConnectable} />
      <BolinhaDeLigar visivel={selected && isConnectable} />
      {/* alça de tamanho no canto de baixo (como no mockup): só com a forma selecionada e o desenho editável */}
      {editavel && selected && (
        <NodeResizeControl position="bottom-right" minWidth={FORMA_MINIMA.largura} minHeight={FORMA_MINIMA.altura}
          onResizeStart={comecarTamanho}
          onResizeEnd={(_e, p: ResizeParams) => redimensionar(id, { largura: p.width, altura: p.height }, { x: p.x, y: p.y })}
          className="!h-2.5 !w-2.5 !rounded-[2px] !border-[1.5px] !border-[var(--e-11804F)] !bg-white dark:!border-spark dark:!bg-[var(--e-0F1914)]" />
      )}
    </div>
  )
}

/* ─── Losango ─────────────────────────────────────────────────────────────── */
const COR_LOSANGO: Record<'escolha' | 'paralelo', string> = {
  escolha: 'bg-[#F7F5FE] border-[#6D28D9] text-[#5B21B6] dark:bg-[#17142A] dark:border-[#C4B5FD] dark:text-[#C4B5FD]',
  paralelo: 'bg-[#FFF6F8] border-[#BE123C] text-[#9F1239] dark:bg-[#1E1418] dark:border-[#FDA4B8] dark:text-[#FDA4B8]',
}
const LOSANGO_SEL = '!border-[var(--e-11804F)] shadow-[0_0_0_5px_rgba(198,242,78,0.6)] dark:!border-spark dark:shadow-[0_0_22px_-4px_rgba(198,242,78,0.55)]'

/** Pentágono no círculo duplo do losango baseado em evento. */
const PENTAGONO = [0, 1, 2, 3, 4].map((i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
  return `${(10 + Math.cos(a) * 4.6).toFixed(2)},${(10 + Math.sin(a) * 4.6).toFixed(2)}`
}).join(' ')

function MarcaDoLosango({ tipo }: { tipo: TipoLosango }) {
  if (tipo === 'paralelo') return <span className="text-[20px] font-bold leading-none">+</span>
  if (tipo === 'evento') {
    return (
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.3}>
        <circle cx="10" cy="10" r="9" /><circle cx="10" cy="10" r="7" /><polygon points={PENTAGONO} />
      </svg>
    )
  }
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
      <BolinhaDeLigar visivel={selected && isConnectable} />
    </div>
  )
}

/* ─── Eventos: início, intermediário e fim ────────────────────────────────── */
/** Sem nome, o início e o fim mostram o rótulo de sempre; o intermediário, nada. */
const ROTULO_PADRAO_DO_EVENTO: Record<TipoDoEvento, string | undefined> = { inicio: 'Início', intermediario: undefined, fim: 'Fim' }

export function FormaEvento({ data, selected, isConnectable }: NodeProps<NoEvento>) {
  const borda = data.tipo === 'fim' ? 'border-4' : 'border-2'
  const icone = iconeDoEvento(data.variante)
  return (
    <div className="group relative flex items-center justify-center" style={{ width: SIMBOLO, height: SIMBOLO }}>
      <div className={`relative flex items-center justify-center rounded-full ${borda} border-[var(--e-11804F)] bg-white text-[var(--e-11804F)] dark:border-spark dark:bg-[var(--e-0F1914)] dark:text-spark
        ${selected ? 'shadow-[0_0_0_4px_rgba(198,242,78,0.6)] dark:shadow-[0_0_20px_-4px_rgba(198,242,78,0.6)]' : ''}`}
        style={{ width: EVENTO_D, height: EVENTO_D }}>
        {/* intermediário: anel duplo */}
        {data.tipo === 'intermediario' && <span aria-hidden className="absolute inset-[1.5px] rounded-full border border-current" />}
        {icone && <IconeEvento icone={icone} />}
      </div>
      <MarcaDeProblema problemas={data.problemas} className="right-2.5 top-2.5" />
      <RotuloExterno texto={data.nome || ROTULO_PADRAO_DO_EVENTO[data.tipo]} />
      <Alcas conectavel={isConnectable} recuo={EVENTO_RECUO} />
      {/* do Fim não sai seta */}
      {data.tipo !== 'fim' && <BolinhaDeLigar visivel={selected && isConnectable} />}
    </div>
  )
}

/* ─── Edição das raias ────────────────────────────────────────────────────── */
/** O que o duplo clique (ou Enter) abre na gaveta de parametrização. */
export type AlvoDaGaveta = { k: 'forma' | 'seta' | 'raia' | 'fase' | 'piscina' | 'mensagem'; id: string }
/** Id da piscina principal (a do processo) no alvo da gaveta. */
export const PISCINA_PRINCIPAL = 'principal'

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
  /** Duplo clique na faixa do nome (raia, fase ou piscina): abre a parametrização. */
  abrir: (alvo: AlvoDaGaveta) => void
  /** Desenho na vertical: as faixas estão transpostas (nomes no topo, fases à esquerda). */
  vertical: boolean
  /** Conector ativo na paleta: com "mensagem", o corpo da piscina externa aceita a ponta. */
  conector: 'sequencia' | 'mensagem'
  /** Largura da fase ou da piscina principal: grava (a função pura prende ao mínimo e à grade). */
  largura: (alvo: AlvoDeLargura, largura: number) => void
  /** Largura provisória durante o arrasto da alça; `null` encerra a prévia. */
  previaLargura: (alvo: AlvoDeLargura, largura: number | null) => void
}
/** A fase (pelo id) ou a piscina principal, que mudam de largura pela alça. */
export type AlvoDeLargura = { k: 'fase'; id: string } | { k: 'piscina' }
const nada = () => {}
export const ContextoRaias = createContext<AcoesDeRaia>({
  editavel: false, renomear: nada, redimensionar: nada, previa: nada, mover: nada, remover: nada, adicionar: nada, abrir: nada,
  vertical: false, conector: 'sequencia', largura: nada, previaLargura: nada,
})

/** `nodrag nopan`: o ponteiro aqui edita a raia, não arrasta nem move a vista. */
const INTERATIVO = 'nodrag nopan pointer-events-auto'
const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:focus-visible:outline-spark'
const ITEM_MENU = `block w-full rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left font-sans text-xs font-semibold text-[var(--e-2E3E36)]
  hover:bg-[rgba(20,36,32,0.06)] disabled:opacity-40 disabled:hover:bg-transparent dark:text-[var(--e-C9D6CE)] dark:hover:bg-white/5 ${FOCO}`

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
      className={`${INTERATIVO} w-full rounded-md border border-[var(--e-11804F)] bg-white px-1.5 py-0.5 font-sans text-xs font-extrabold text-[var(--e-142420)] outline-none dark:border-spark dark:bg-[var(--e-0F1914)] dark:text-white`} />
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
        className={`${INTERATIVO} flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent text-[var(--e-4F5F57)] hover:bg-[rgba(20,36,32,0.08)] dark:text-[var(--e-9DB0A5)] dark:hover:bg-white/5 ${FOCO}`}>
        <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
      </button>
      {aberto && createPortal(
        <div ref={menu} role="menu" aria-label={rotulo} onKeyDown={teclas} style={{ left: aberto.left, top: aberto.top }}
          onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setAberto(null) }}
          className={`${INTERATIVO} fixed z-50 w-[136px] rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:shadow-[0_0_0_1px_var(--e-2A3B32),0_12px_24px_-12px_rgba(0,0,0,0.7)]`}>
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

/** Alça de tamanho de uma faixa, no fim do eixo LÓGICO que ela muda (`y` = altura da raia,
 *  `x` = largura da fase/piscina). Na tela o eixo troca com a orientação: a altura da raia
 *  vira a borda direita na vertical. Arrastar mostra a prévia; soltar grava; com foco, as
 *  setas do teclado andam uma grade. */
function AlcaDeTamanho({ eixo, valor, min, max, rotulo, titulo, onPrevia, onFim }: {
  eixo: 'x' | 'y'; valor: number; min: number; max: number; rotulo: string; titulo: string
  onPrevia: (v: number | null) => void; onFim: (v: number) => void
}) {
  const { vertical } = useContext(ContextoRaias)
  const { getZoom } = useReactFlow()
  /** O eixo lógico corre no x da tela? (x na horizontal; y na vertical) */
  const telaX = (eixo === 'x') !== vertical
  const inicio = useRef<{ c: number; valor: number; zoom: number } | null>(null)
  // o deslocamento na tela vira unidades do fluxo pelo zoom do começo do arrasto
  const noPonto = (e: PointerEvent, i: NonNullable<typeof inicio.current>) => i.valor + ((telaX ? e.clientX : e.clientY) - i.c) / i.zoom
  // desmontada no meio do arrasto (faixa removida, desenho virou só leitura): a prévia não fica presa
  const encerrarPrevia = useRef<() => void>(() => {})
  encerrarPrevia.current = () => { if (inicio.current) { inicio.current = null; onPrevia(null) } }
  useEffect(() => {
    const encerrar = encerrarPrevia
    return () => encerrar.current()
  }, [])
  const [menos, mais] = telaX ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
  return (
    <div role="separator" aria-orientation={telaX ? 'vertical' : 'horizontal'} tabIndex={0}
      aria-label={rotulo} aria-valuenow={valor} aria-valuemin={min} aria-valuemax={max} aria-valuetext={`${valor} px`}
      title={`${titulo} (${telaX ? '←/→' : '↑/↓'} com o teclado)`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault(); e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        inicio.current = { c: telaX ? e.clientX : e.clientY, valor, zoom: getZoom() || 1 }
      }}
      onPointerMove={(e) => { if (inicio.current) onPrevia(noPonto(e, inicio.current)) }}
      onPointerUp={(e) => {
        const i = inicio.current
        if (!i) return
        inicio.current = null
        onPrevia(null)
        onFim(noPonto(e, i))
      }}
      onPointerCancel={() => { inicio.current = null; onPrevia(null) }}
      onKeyDown={(e) => {
        if (e.key !== menos && e.key !== mais) return
        e.preventDefault(); e.stopPropagation()
        onFim(valor + (e.key === mais ? GRADE : -GRADE))
      }}
      className={`${INTERATIVO} group/alca absolute z-[1] flex items-center justify-center outline-none
        ${telaX ? 'inset-y-0 -right-1 w-2 cursor-ew-resize' : 'inset-x-0 -bottom-1 h-2 cursor-ns-resize'}`}>
      <span aria-hidden className={`rounded-full bg-[var(--e-11804F)] opacity-0 transition-opacity group-hover/alca:opacity-60 group-focus-visible/alca:opacity-100 dark:bg-spark ${telaX ? 'h-10 w-[3px]' : 'h-[3px] w-10'}`} />
    </div>
  )
}

/** Borda de baixo da raia (a direita, na vertical): muda a altura, entre o mínimo e o máximo. */
function AlcaDaRaia({ id, nome, altura }: { id: string; nome: string; altura: number }) {
  const { redimensionar, previa, vertical } = useContext(ContextoRaias)
  return (
    <AlcaDeTamanho eixo="y" valor={altura} min={RAIA_ALTURA_MINIMA} max={RAIA_ALTURA_MAXIMA}
      rotulo={`${vertical ? 'Largura' : 'Altura'} da raia ${nome || 'sem nome'}`}
      titulo={`Arraste para mudar a ${vertical ? 'largura' : 'altura'}`}
      onPrevia={(v) => previa(id, v)} onFim={(v) => redimensionar(id, v)} />
  )
}

/* ─── Raia (fundo) ────────────────────────────────────────────────────────── */
export function FormaRaia({ data }: NodeProps<NoRaia>) {
  const { editavel, abrir, vertical } = useContext(ContextoRaias)
  const [editando, setEditando] = useState(false)
  const abrirRaia = () => abrir({ k: 'raia', id: data.id })
  const coluna = useRef<HTMLDivElement>(null)
  // o nome corta nas linhas que cabem na raia (sem invadir a de baixo); na vertical, no rótulo do topo
  const linhas = vertical ? 4 : Math.max(1, Math.floor((data.altura - LINHA_ROTULO) / LINHA_ROTULO))
  const faixa = data.indice % 2 === 0
    ? 'bg-[rgba(255,255,255,0.75)] dark:bg-[rgba(255,255,255,0.02)]'
    : 'bg-[rgba(242,246,241,0.85)] dark:bg-[rgba(255,255,255,0.045)]'
  /* contorno da piscina por fora (a faixa do nome fecha à esquerda); entre raias, só a linha
     fina. Na vertical é o mesmo contorno transposto (o fim da piscina fica embaixo). */
  const contorno = (vertical ? [
    'border-b border-b-[var(--e-B8C6BE)] dark:border-b-[var(--e-2A3B32)]',
    data.bordaDeCima ? 'rounded-bl-[10px] border-l border-l-[var(--e-B8C6BE)] dark:border-l-[var(--e-2A3B32)]' : '',
    data.ultima
      ? 'rounded-br-[10px] border-r border-r-[var(--e-B8C6BE)] dark:border-r-[var(--e-2A3B32)]'
      : 'border-r border-r-[var(--e-D2DCD5)] dark:border-r-[var(--e-22332A)]',
  ] : [
    'border-r border-r-[var(--e-B8C6BE)] dark:border-r-[var(--e-2A3B32)]',
    data.bordaDeCima ? 'rounded-tr-[10px] border-t border-t-[var(--e-B8C6BE)] dark:border-t-[var(--e-2A3B32)]' : '',
    data.ultima
      ? 'rounded-br-[10px] border-b border-b-[var(--e-B8C6BE)] dark:border-b-[var(--e-2A3B32)]'
      : 'border-b border-b-[var(--e-D2DCD5)] dark:border-b-[var(--e-22332A)]',
  ]).join(' ')
  const nome = data.nome || <span className="font-semibold italic opacity-70">Sem nome</span>
  const cortado = 'line-clamp-4 min-w-0 flex-1 [overflow-wrap:normal] [word-break:normal] hyphens-auto leading-[1.25]'
  /* o corpo deixa o ponteiro passar (formas por cima, clique no fundo tira a seleção);
     só o rótulo e a alça de baixo o recebem, e só quando o desenho é editável */
  return (
    <div className={`pointer-events-none relative box-border h-full w-full ${faixa} ${contorno}`}>
      <div ref={coluna} lang="pt-BR" className={`absolute box-border overflow-hidden px-2.5 py-2 font-sans text-xs font-extrabold text-[var(--e-3E4E46)] dark:text-[var(--e-9DB0A5)]
        ${vertical ? 'inset-x-0 top-0 border-b border-b-[var(--e-D2DCD5)] dark:border-b-[var(--e-22332A)]' : 'inset-y-0 left-0 border-r border-r-[var(--e-D2DCD5)] dark:border-r-[var(--e-22332A)]'}`}
        style={vertical ? { height: RAIA_ROTULO_W } : { width: RAIA_ROTULO_W }}>
        {!editavel ? <span className={`${INTERATIVO} ${cortado}`} style={{ WebkitLineClamp: linhas }} onDoubleClick={abrirRaia}>{nome}</span> : editando ? (
          <NomeDaRaia id={data.id} nome={data.nome} onFim={(devolverFoco) => {
            setEditando(false)
            if (devolverFoco) focarDepois(coluna.current, seletorDoMenu(data.id))
          }} />
        ) : (
          <div className="flex items-start gap-1">
            <span className={`${INTERATIVO} ${cortado}`} style={{ WebkitLineClamp: linhas }} title="Duplo clique para parametrizar a raia (renomear fica nas opções)"
              onDoubleClick={abrirRaia}>{nome}</span>
            <MenuDaRaia id={data.id} nome={data.nome} primeira={data.primeira} ultima={data.ultima} onRenomear={() => setEditando(true)} />
          </div>
        )}
      </div>
      {editavel && <AlcaDaRaia id={data.id} nome={data.nome} altura={data.altura} />}
    </div>
  )
}

/* ─── Piscina do processo (fundo) ───────────────────────────────────────── */
const COR_FAIXA = 'border-[var(--e-B8C6BE)] bg-[var(--e-E6EDE8)] text-[var(--e-2E3E36)] dark:border-[var(--e-2A3B32)] dark:bg-[var(--e-13211A)] dark:text-[var(--e-C9D6CE)]'

/** O retângulo inteiro da piscina: a faixa com o nome do processo (à esquerda; no topo, na
 *  vertical), o canto do cabeçalho das fases e a alça do fim (largura da piscina). O resto é
 *  das raias e das fases, desenhadas por cima. */
export function FormaPiscina({ data }: NodeProps<NoPiscina>) {
  const { editavel, adicionar, abrir, vertical, largura, previaLargura } = useContext(ContextoRaias)
  return (
    <div className="pointer-events-none relative h-full w-full">
      <div title="Duplo clique para parametrizar a piscina" onDoubleClick={() => abrir({ k: 'piscina', id: PISCINA_PRINCIPAL })}
        className={`${INTERATIVO} absolute box-border flex items-center justify-center overflow-hidden border ${COR_FAIXA}
          ${vertical ? 'inset-x-0 top-0 rounded-t-[10px]' : 'inset-y-0 left-0 rounded-l-[10px]'}`}
        style={vertical ? { height: FAIXA_PISCINA } : { width: FAIXA_PISCINA }}>
        <span className={`${vertical ? '' : '-rotate-90'} whitespace-nowrap font-sans text-[11.5px] font-extrabold uppercase tracking-[0.04em]`}>{data.nome}</span>
      </div>
      {/* canto do cabeçalho das fases, acima (à esquerda, na vertical) da coluna dos rótulos das raias */}
      {data.cabecalho && (
        <div aria-hidden className={`absolute box-border border ${COR_FAIXA}`}
          style={vertical
            ? { left: 0, top: FAIXA_PISCINA, width: FASE_ALTURA, height: RAIA_ROTULO_W }
            : { top: 0, left: FAIXA_PISCINA, height: FASE_ALTURA, width: RAIA_ROTULO_W }} />
      )}
      {/* "+ raia" ao pé da piscina (à direita da faixa do nome, na vertical) */}
      {editavel && (
        <button type="button" data-raia-adicionar onClick={adicionar} title="Cria uma raia no fim da piscina"
          className={`${INTERATIVO} absolute flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-[var(--e-9DB0A5)] bg-white/80 px-2 py-1 font-sans text-[11px] font-bold text-[var(--e-2E3E36)] hover:border-[var(--e-11804F)] hover:text-[var(--e-11804F)] dark:border-[var(--e-2E4238)] dark:bg-[color-mix(in_srgb,var(--e-0F1914)_80%,transparent)] dark:text-[var(--e-C9D6CE)] dark:hover:border-spark dark:hover:text-spark ${FOCO}
            ${vertical ? 'left-full top-0 ml-2' : 'left-0 top-full mt-2'}`}>
          <Plus aria-hidden className="h-3 w-3" /> raia
        </button>
      )}
      {editavel && (
        <AlcaDeTamanho eixo="x" valor={data.largura} min={PISCINA_LARGURA_MINIMA} max={20000}
          rotulo={`${vertical ? 'Altura' : 'Largura'} da piscina ${data.nome || 'sem nome'}`}
          titulo={`Arraste para mudar a ${vertical ? 'altura' : 'largura'} da piscina`}
          onPrevia={(v) => previaLargura({ k: 'piscina' }, v)} onFim={(v) => largura({ k: 'piscina' }, v)} />
      )}
    </div>
  )
}

/* ─── Fase (fundo) ───────────────────────────────────────────────────────── */
/** A coluna da fase: o cabeçalho com o nome (no topo; à esquerda e de lado, na vertical), a
 *  divisória tracejada no começo (menos na primeira) e a alça no fim (menos na última, que se
 *  estica até o fim da piscina — quem a muda é a alça da piscina). */
export function FormaFase({ data }: NodeProps<NoFase>) {
  const { editavel, abrir, vertical, largura, previaLargura } = useContext(ContextoRaias)
  const alvo = { k: 'fase' as const, id: data.id }
  const divisoria = data.primeira ? '' : vertical
    ? 'border-t border-dashed border-t-[var(--e-9DB0A5)] dark:border-t-[var(--e-2E4238)]'
    : 'border-l border-dashed border-l-[var(--e-9DB0A5)] dark:border-l-[var(--e-2E4238)]'
  return (
    <div className={`pointer-events-none relative box-border h-full w-full ${divisoria}`}>
      <div title="Duplo clique para parametrizar a fase" onDoubleClick={() => abrir({ k: 'fase', id: data.id })}
        className={`${INTERATIVO} absolute box-border flex items-center justify-center overflow-hidden border ${COR_FAIXA}
          ${vertical ? 'inset-y-0 left-0' : 'inset-x-0 top-0'}`}
        style={vertical ? { width: FASE_ALTURA } : { height: FASE_ALTURA }}>
        <span className={`${vertical ? '-rotate-90' : ''} truncate whitespace-nowrap px-2 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--e-4F5F57)] dark:text-[var(--e-9DB0A5)]`}>{data.nome}</span>
      </div>
      {editavel && !data.ultima && (
        <AlcaDeTamanho eixo="x" valor={data.largura} min={FASE_LARGURA_MINIMA} max={20000}
          rotulo={`${vertical ? 'Altura' : 'Largura'} da fase ${data.nome || 'sem nome'}`}
          titulo={`Arraste para mudar a ${vertical ? 'altura' : 'largura'} da fase`}
          onPrevia={(v) => previaLargura(alvo, v)} onFim={(v) => largura(alvo, v)} />
      )}
    </div>
  )
}

/* ─── Piscina externa (participante caixa-preta) ──────────────────────────── */
/** Faixa com o nome (duplo clique parametriza) e o corpo vazio: o participante é uma
 *  caixa-preta. Com o conector "Fluxo de mensagem", o corpo inteiro aceita a ponta da seta
 *  (alça invisível) e uma bolinha na borda que encara o processo começa uma mensagem daqui. */
export function FormaPiscinaExterna({ data }: NodeProps<NoPiscinaExterna>) {
  const { abrir, vertical, conector, editavel } = useContext(ContextoRaias)
  const mensagem = editavel && conector === 'mensagem'
  const lado = vertical ? Position.Left : Position.Top
  return (
    <div className="group pointer-events-none relative h-full w-full">
      <div className={`absolute box-border flex items-center justify-center border border-[var(--e-B8C6BE)] bg-[rgba(230,237,232,0.4)] dark:border-[var(--e-2A3B32)] dark:bg-[rgba(19,33,26,0.4)]
        ${vertical ? 'inset-x-0 bottom-0 rounded-b-[10px]' : 'inset-y-0 right-0 rounded-r-[10px]'}`}
        style={vertical ? { top: FAIXA_PISCINA } : { left: FAIXA_PISCINA }}>
        <span className="font-sans text-xs font-medium text-[var(--e-5E6F66)] dark:text-[var(--e-9DB0A5)]">Participante externo · caixa-preta</span>
        {/* o corpo todo recebe a ponta do fluxo de mensagem; não começa seta (só chega) */}
        <Handle id="msg-e" type="target" position={lado} isConnectable={mensagem} isConnectableStart={false}
          className={`!absolute !inset-0 !h-full !w-full !min-h-0 !min-w-0 !translate-x-0 !translate-y-0 !rounded-none !border-0 !bg-transparent !opacity-0 ${mensagem ? '!pointer-events-auto' : '!pointer-events-none'}`} />
        <Handle id="msg-s" type="source" position={lado} isConnectable={mensagem} title="Arraste até uma forma do processo para mandar uma mensagem a ela"
          className={`!h-3 !w-3 !min-h-0 !min-w-0 !rounded-full !border-2 !border-[var(--e-11804F)] !bg-white !cursor-crosshair dark:!border-spark dark:!bg-[var(--e-0A110D)]
            ${mensagem ? '!pointer-events-auto opacity-0 group-hover:opacity-100' : '!pointer-events-none opacity-0'}`} />
      </div>
      <div title="Duplo clique para parametrizar a piscina" onDoubleClick={() => abrir({ k: 'piscina', id: data.id })}
        className={`${INTERATIVO} absolute box-border flex items-center justify-center overflow-hidden border ${COR_FAIXA}
          ${vertical ? 'inset-x-0 top-0 rounded-t-[10px]' : 'inset-y-0 left-0 rounded-l-[10px]'}`}
        style={vertical ? { height: FAIXA_PISCINA } : { width: FAIXA_PISCINA }}>
        <span className={`${vertical ? '' : '-rotate-90'} whitespace-nowrap font-sans text-[11.5px] font-extrabold uppercase tracking-[0.04em]`}>{data.nome}</span>
      </div>
    </div>
  )
}

/* ─── Seta ────────────────────────────────────────────────────────────────── */
/** Acima das formas (o React Flow eleva a selecionada a 1000). */
const Z_ROTULO = 1100
/** Id do marcador da ponta, desenhado uma vez pelo canvas. */
export const MARCADOR_SETA = 'nxt-bpmn-seta'

/** Onde a pílula do caminho fica, lido do `d` do SVG (a regra é `pontoDoRotuloNaPolilinha`,
 *  a mesma do arquivo exportado). */
export function pontoDoRotulo(caminho: string): { x: number; y: number } | null {
  const nums = (caminho.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
  return pontoDoRotuloNaPolilinha(pts)
}

export function SetaComRotulo({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<SetaDeSequencia>) {
  const [caminho, mx, my] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0, offset: 20 })
  const perto = pontoDoRotulo(caminho)
  const lx = perto?.x ?? mx, ly = perto?.y ?? my
  // a pílula mostra o rótulo do caminho; o "Senão" é sempre "senão" (nunca a expressão do motor)
  const rotulo = data?.senao ? 'senão' : data?.rotulo
  return (
    <>
      <BaseEdge path={caminho} markerEnd={markerEnd}
        style={data?.problema
          ? { stroke: '#D64535', strokeWidth: 2.4, strokeDasharray: '6 5', strokeLinejoin: 'round' }
          : data?.destacada || selected
          ? { stroke: 'var(--bpmn-seta-destaque)', strokeWidth: 3, strokeLinejoin: 'round' }
          : { stroke: 'var(--bpmn-seta)', strokeWidth: 1.6, strokeLinejoin: 'round' }} />
      {rotulo && (
        <EdgeLabelRenderer>
          <span
            className={`nodrag nopan pointer-events-none absolute whitespace-nowrap rounded-md px-1.5 py-px font-sans text-[10.5px] font-bold
              ${data?.senao
                ? 'bg-white text-[var(--e-3E4E46)] shadow-[0_0_0_1px_var(--e-D2DCD5)] dark:bg-[var(--e-13211A)] dark:text-[var(--e-B5C5BB)] dark:shadow-[0_0_0_1px_var(--e-2A3B32)]'
                : 'bg-[#F5F2FF] text-[#5B21B6] shadow-[0_0_0_1px_#DDD3FB] dark:bg-[#1A1530] dark:text-[#DDD6FE] dark:shadow-[0_0_0_1px_rgba(167,139,250,0.35)]'}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, zIndex: Z_ROTULO }}>
            {rotulo}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/** Fluxo de mensagem: tracejado, círculo vazado na saída e ponta vazada na chegada (os
 *  marcadores vêm do canvas). O traço é o roteado pelo canvas, já na tela. */
export function SetaMensagem({ data, markerStart, markerEnd, selected, sourceX, sourceY, targetX, targetY }: EdgeProps<SetaDeMensagem>) {
  const pontos = data?.pontos?.length ? data.pontos : [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }]
  const caminho = 'M' + pontos.map((p) => `${p.x} ${p.y}`).join(' L')
  const perto = pontoDoRotuloNaPolilinha(pontos)
  return (
    <>
      <BaseEdge path={caminho} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={14}
        style={selected
          ? { stroke: 'var(--bpmn-seta-destaque)', strokeWidth: 2.4, strokeDasharray: '6 4' }
          : { stroke: 'var(--bpmn-seta)', strokeWidth: 1.5, strokeDasharray: '6 4' }} />
      {data?.rotulo && perto && (
        <EdgeLabelRenderer>
          <span className="nodrag nopan pointer-events-none absolute whitespace-nowrap rounded-md bg-[var(--e-F4F7F4)] px-1 font-sans text-[11px] font-medium italic text-[var(--e-5E6F66)] dark:bg-[var(--e-0C1511)] dark:text-[var(--e-9DB0A5)]"
            style={{ transform: `translate(-50%, -50%) translate(${perto.x}px, ${perto.y}px)`, zIndex: Z_ROTULO }}>
            {data.rotulo}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/* Fora de qualquer componente: o React Flow pede tipos estáveis entre renders. */
export const tiposDeNo = {
  tarefa: FormaTarefa, losango: FormaLosango, evento: FormaEvento, raia: FormaRaia, piscina: FormaPiscina,
  fase: FormaFase, externa: FormaPiscinaExterna,
}
export const tiposDeSeta = { seta: SetaComRotulo, mensagem: SetaMensagem }
