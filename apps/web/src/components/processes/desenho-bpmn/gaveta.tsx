'use client'

/* ─── Gaveta lateral do desenho BPMN ───────────────────────────────────────────
   Painel de 440 px encostado à direita do editor, POR CIMA da coluna lateral, sem
   fundo escuro: o desenho continua visível (e clicável) ao lado. Hospeda as perguntas
   da etapa e a configuração de uma escolha / "ao mesmo tempo".
   Cabeçalho: rótulo (o tipo, em caixa alta), título e o botão Fechar. O corpo rola; o
   rodapé (opcional) fica fixo embaixo. O Esc é de quem está DENTRO (as perguntas
   cancelam no Esc): a gaveta não escuta teclado.
   Quem monta precisa de um pai com `position: relative` — a gaveta é `absolute`. */
import type { JSX, ReactNode } from 'react'
import { useId } from 'react'
import { X } from 'lucide-react'

export function GavetaLateral({ titulo, rotulo, onFechar, rodape, children }: {
  titulo: string; rotulo: string; onFechar: () => void; rodape?: ReactNode; children: ReactNode
}): JSX.Element {
  const idTitulo = useId()
  return (
    <aside aria-labelledby={idTitulo}
      className="absolute inset-y-0 right-0 z-30 flex w-[440px] max-w-full flex-col border-l border-border bg-card text-card-foreground shadow-[-12px_0_32px_-18px_rgba(12,20,16,0.45)] dark:shadow-[-12px_0_32px_-18px_rgba(0,0,0,0.8)]">
      <header className="flex shrink-0 items-start gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{rotulo}</p>
          <h2 id={idTitulo} className="mt-0.5 truncate text-[15px] font-bold leading-snug" title={titulo}>{titulo}</h2>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" title="Fechar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto rolagem-visivel">{children}</div>
      {rodape && <footer className="shrink-0 border-t bg-muted/20 px-4 py-3">{rodape}</footer>}
    </aside>
  )
}
