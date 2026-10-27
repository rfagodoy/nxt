'use client'

/* ─── Gaveta lateral do desenho BPMN ───────────────────────────────────────────
   Painel de 440 px encostado à direita do editor, POR CIMA da coluna lateral, sem
   fundo escuro: o desenho continua visível (e clicável) ao lado. Hospeda as perguntas
   da etapa e a configuração de uma escolha / "ao mesmo tempo".
   Cabeçalho: rótulo (o tipo — em chip colorido quando vem `rotuloTom`), título e o botão
   Fechar. O corpo rola; o rodapé (opcional) fica fixo embaixo.
   O Esc é de quem está DENTRO (as perguntas cancelam no Esc): a gaveta não escuta
   teclado — `ehEscDaGaveta` diz a quem escuta se o Esc é mesmo para ela.
   Foco: ao abrir vai para o título; ao fechar volta para quem estava focado antes (se
   ainda existir na página).
   Quem monta precisa de um pai com `position: relative` — a gaveta é `absolute`. */
import type { JSX, ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Marca o `<aside>` da gaveta: o editor ignora atalhos (Delete, Esc) vindos de dentro dela. */
export const ATRIBUTO_GAVETA = 'data-gaveta-lateral'

/** O Esc é para a gaveta: o alvo está DENTRO dela e nenhuma camada por cima está aberta
 *  (lista de Select, popover do Radix, diálogo, balão `FloatingMenu`) — essas fecham
 *  sozinhas com o próprio Esc, e a gaveta não pode fechar junto. */
export function ehEscDaGaveta(e: KeyboardEvent): boolean {
  if (e.key !== 'Escape') return false
  const alvo = e.target as Element | null
  if (!alvo?.closest?.(`[${ATRIBUTO_GAVETA}]`)) return false
  return !document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper], [data-floating-menu]')
}

export function GavetaLateral({ titulo, rotulo, onFechar, rodape, children, rotuloTom, rotuloIcone, rotuloFechar = 'Fechar' }: {
  titulo: string; rotulo: string; onFechar: () => void; rodape?: ReactNode; children: ReactNode
  /** classes de cor do chip do rótulo (ex.: 'bg-sky-500/10 text-sky-600'); sem elas, rótulo simples */
  rotuloTom?: string
  rotuloIcone?: ReactNode
  /** nome acessível do X (ex.: "Fechar sem aplicar", quando fechar cancela) */
  rotuloFechar?: string
}): JSX.Element {
  const idTitulo = useId()
  const tituloRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    tituloRef.current?.focus({ preventScroll: true })
    return () => {
      // devolve o foco a quem abriu — mas não rouba de quem já o pegou (outra gaveta, um campo)
      const agora = document.activeElement
      const perdido = !agora || agora === document.body || !agora.isConnected
      if (perdido && antes && antes !== document.body && antes.isConnected) antes.focus({ preventScroll: true })
    }
  }, [])
  return (
    <aside aria-labelledby={idTitulo} {...{ [ATRIBUTO_GAVETA]: '' }}
      className="absolute inset-y-0 right-0 z-30 flex w-[440px] max-w-full flex-col border-l border-border bg-card text-card-foreground shadow-[-12px_0_32px_-18px_rgba(12,20,16,0.45)] dark:shadow-[-12px_0_32px_-18px_rgba(0,0,0,0.8)]">
      <header className="flex shrink-0 items-start gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 flex-1">
          {rotuloTom
            ? <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', rotuloTom)}>{rotuloIcone}{rotulo}</span>
            : <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{rotuloIcone}{rotulo}</p>}
          <h2 id={idTitulo} ref={tituloRef} tabIndex={-1} title={titulo}
            className="mt-1 truncate text-[15px] font-bold leading-snug outline-none focus-visible:underline focus-visible:decoration-dotted">{titulo}</h2>
        </div>
        <button type="button" onClick={onFechar} aria-label={rotuloFechar} title={rotuloFechar}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto rolagem-visivel">{children}</div>
      {rodape && <footer className="shrink-0 border-t bg-muted/20 px-4 py-3">{rodape}</footer>}
    </aside>
  )
}
