'use client'

/* ─── Formas do desenho BPMN na identidade Nxt ─────────────────────────────────
   Cada forma é um nó do React Flow: tarefa, losango (escolha / ao mesmo tempo /
   reencontro), evento (início e fim) e a raia, que é só fundo. A seta é ortogonal,
   com o rótulo do caminho numa pílula. As cores seguem o mockup aprovado: o tema
   claro é o padrão e o escuro vem pelas variantes `dark:`. */
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getSmoothStepPath, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { Settings, UserSquare } from 'lucide-react'
import { RAIA_ROTULO_W } from '@/lib/desenho-bpmn'

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
export type DadosRaia = { nome: string; largura: number; altura: number; indice: number; primeira: boolean; ultima: boolean }
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

/* ─── Raia (fundo) ────────────────────────────────────────────────────────── */
export function FormaRaia({ data }: NodeProps<NoRaia>) {
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
  return (
    <div className={`pointer-events-none relative box-border overflow-hidden ${faixa} ${contorno}`} style={{ width: data.largura, height: data.altura }}>
      <span className="absolute inset-y-0 left-0 box-border border-r border-r-[#D2DCD5] px-2.5 py-2 font-sans text-xs font-extrabold text-[#3E4E46] dark:border-r-[#22332A] dark:text-[#9DB0A5]"
        style={{ width: RAIA_ROTULO_W }}>
        {data.nome || <span className="font-semibold italic opacity-70">Sem nome</span>}
      </span>
    </div>
  )
}

/* ─── Piscina: faixa vertical com o nome do processo (fundo) ─────────────── */
export function FormaPiscina({ data }: NodeProps<NoPiscina>) {
  return (
    <div className="pointer-events-none box-border flex items-center justify-center overflow-hidden rounded-l-[10px] border border-[#B8C6BE] bg-[#E6EDE8] text-[#2E3E36] dark:border-[#2A3B32] dark:bg-[#13211A] dark:text-[#C9D6CE]"
      style={{ width: FAIXA_PISCINA, height: data.altura }}>
      <span className="-rotate-90 whitespace-nowrap font-sans text-[11.5px] font-extrabold uppercase tracking-[0.04em]">{data.nome}</span>
    </div>
  )
}

/* ─── Seta ────────────────────────────────────────────────────────────────── */
/** Id do marcador da ponta, desenhado uma vez pelo canvas. */
export const MARCADOR_SETA = 'nxt-bpmn-seta'

export function SetaComRotulo({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<SetaBpmn>) {
  const [caminho, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0, offset: 20 })
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
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
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
