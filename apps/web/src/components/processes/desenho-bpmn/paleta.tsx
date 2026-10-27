'use client'

/* ─── Paleta de formas do desenho BPMN ─────────────────────────────────────────
   Barra vertical à esquerda do canvas. Tarefa, Automática, Escolha e Ao mesmo tempo
   são arrastadas para o desenho (o tipo vai no `dataTransfer` em `TIPO_ARRASTO_FORMA`);
   o canvas decide onde a forma entra. "Raia" é clique. A página monta a paleta ao lado
   do canvas, como no mockup. */
import type { DragEvent, JSX, ReactNode } from 'react'
import type { NovoItem } from '@/components/processes/workflow-blocos'

/** Tipo do `dataTransfer` com a forma arrastada da paleta. */
export const TIPO_ARRASTO_FORMA = 'application/nxt-forma'

const BOTAO = 'flex w-[62px] flex-col items-center rounded-[10px] border-0 pb-[5px] pt-[7px] font-sans text-[10px] font-bold leading-[1.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#11804F] dark:focus-visible:outline-spark'
const ITEM = `${BOTAO} bg-transparent text-[#2E3E36] hover:bg-[rgba(20,36,32,0.06)] dark:text-[#C9D6CE] dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40`

const ICONE_TAREFA = 'border-[1.5px] border-[#0369A1] bg-[#E0F2FE] text-[#075985] dark:border-[#7DD3FC] dark:bg-[rgba(56,189,248,0.12)] dark:text-[#7DD3FC]'
const ICONE_ESCOLHA = 'border-[1.5px] border-[#6D28D9] bg-[#EDE9FE] text-[#5B21B6] dark:border-[#C4B5FD] dark:bg-[rgba(167,139,250,0.14)] dark:text-[#C4B5FD]'
const ICONE_PARALELO = 'border-[1.5px] border-[#BE123C] bg-[#FFE4E9] text-[#9F1239] dark:border-[#FDA4B8] dark:bg-[rgba(244,63,94,0.12)] dark:text-[#FDA4B8]'
const ICONE_RAIA = 'border-[1.5px] border-l-[6px] border-[#8FA196] dark:border-[#6F8378]'

const Tarefa = ({ automatica }: { automatica?: boolean }) => (
  <span aria-hidden className={`box-border flex h-5 w-[30px] items-center justify-center rounded-[5px] text-[11px] ${ICONE_TAREFA}`}>
    {automatica ? '⚙' : null}
  </span>
)
const Losango = ({ cor, marca }: { cor: string; marca: string }) => (
  <span aria-hidden className={`mt-0.5 box-border flex h-4 w-4 rotate-45 items-center justify-center ${cor}`}>
    <span className="-rotate-45 text-[10px] font-extrabold leading-none">{marca}</span>
  </span>
)

const FORMAS: Array<{ tipo: NovoItem; rotulo: string; icone: ReactNode; gap: string }> = [
  { tipo: 'userTask', rotulo: 'Tarefa', icone: <Tarefa />, gap: 'gap-1' },
  { tipo: 'serviceTask', rotulo: 'Automática', icone: <Tarefa automatica />, gap: 'gap-1' },
  { tipo: 'escolha', rotulo: 'Escolha', icone: <Losango cor={ICONE_ESCOLHA} marca="✕" />, gap: 'gap-1.5' },
  { tipo: 'paralelo', rotulo: 'Ao mesmo tempo', icone: <Losango cor={ICONE_PARALELO} marca="+" />, gap: 'gap-1.5' },
]

const Divisoria = () => <span aria-hidden className="my-1 h-px w-10 bg-[#DCE4DE] dark:bg-[#22332A]" />

export function PaletaBpmn({ onAdicionarRaia, desabilitada = false }: {
  onAdicionarRaia: () => void
  /** Só leitura: nada se arrasta nem se cria. */
  desabilitada?: boolean
}): JSX.Element {
  const aoArrastar = (tipo: NovoItem) => (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(TIPO_ARRASTO_FORMA, tipo)
    e.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <div role="toolbar" aria-label="Formas" aria-orientation="vertical"
      className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-r-[rgba(20,36,32,0.08)] bg-[#F7FAF7] px-1.5 py-2.5 dark:border-r-[#1C2A23] dark:bg-white/[0.02]">
      <button type="button" aria-pressed="true" className={`${BOTAO} gap-1 bg-[#0C1410] text-spark dark:bg-[rgba(198,242,78,0.14)]`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
          <path d="M5 3l14 8-6 2-3 6z" />
        </svg>
        Selecionar
      </button>
      <Divisoria />
      {FORMAS.map((f) => (
        <button key={f.tipo} type="button" title="Arraste para o desenho" disabled={desabilitada}
          draggable={!desabilitada} onDragStart={aoArrastar(f.tipo)} className={`${ITEM} ${f.gap}`}>
          {f.icone}
          {f.rotulo}
        </button>
      ))}
      <Divisoria />
      <button type="button" title="Cria uma raia no fim da piscina" disabled={desabilitada} onClick={onAdicionarRaia} className={`${ITEM} gap-1`}>
        <span aria-hidden className={`box-border h-[18px] w-[30px] rounded-[3px] ${ICONE_RAIA}`} />
        Raia
      </button>
    </div>
  )
}
