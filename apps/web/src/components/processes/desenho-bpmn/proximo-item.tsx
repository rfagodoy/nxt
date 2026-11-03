'use client'

/* ─── Próximo item (estilo Bizagi) ─────────────────────────────────────────────
   Coluna ao lado da forma selecionada: Tarefa de usuário, Escolha, Temporizador │
   Subprocesso, Fim. Clique põe a forma ao lado, já ligada; arrastar põe onde soltar, também
   ligada. Quem cria e liga é a página (o canvas só repassa). `nodrag nopan`: o ponteiro aqui
   não move a vista (o arrasto de pan cancelaria o arrasto do botão). */
import type { DragEvent, JSX } from 'react'
import type { ItemCatalogo } from '@/lib/editor-bizagi/catalogo'
import { PROXIMOS } from '@/lib/editor-bizagi/proximo'
import { IconeDoItem } from './paleta'

export interface ProximoItemProps {
  onEscolher: (item: ItemCatalogo) => void
  onArrastar: (item: ItemCatalogo, e: DragEvent) => void
}

const BOTAO = `grid h-8 w-8 cursor-grab place-items-center rounded-[7px] border-0 bg-transparent p-0
  hover:bg-[rgba(17,128,79,0.08)] dark:hover:bg-[rgba(198,242,78,0.12)]
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:focus-visible:outline-spark`

export function ProximoItem({ onEscolher, onArrastar }: ProximoItemProps): JSX.Element {
  return (
    <div role="toolbar" aria-label="Próximo item" aria-orientation="vertical"
      className="nodrag nopan flex flex-col items-center gap-0.5 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:shadow-[0_0_0_1px_var(--e-2A3B32),0_12px_24px_-12px_rgba(0,0,0,0.7)]">
      {PROXIMOS.map((grupo, g) => (
        <div key={g} className="contents">
          {g > 0 && <span aria-hidden className="my-0.5 h-px w-5 bg-[var(--e-D2DCD5)] dark:bg-[var(--e-2A3B32)]" />}
          {grupo.map((item) => (
            <button key={`${item.grupo}-${item.nome}`} type="button" draggable className={BOTAO}
              aria-label={`Próximo: ${item.nome}`}
              title={`Próximo: ${item.nome}. Clique para pôr ao lado e ligar, ou arraste para onde quiser.`}
              onClick={() => onEscolher(item)} onDragStart={(e) => onArrastar(item, e)}>
              <IconeDoItem item={item} tamanho={26} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
