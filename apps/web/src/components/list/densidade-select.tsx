'use client'

import { useRef, useState } from 'react'
import { Check, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { DENSIDADES, useDensidade, type Densidade } from '@/lib/densidade'

/* Ícone = espaçamento entre as linhas (mais linhas = mais compacta). Forma, não cor. */
const TRACOS: Record<Densidade, string> = {
  compacta: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  media:    'M4 7h16M4 12h16M4 17h16',
  alta:     'M4 8h16M4 16h16',
}

function Icone({ d, className }: { d: Densidade; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden className={className}>
      <path d={TRACOS[d]} />
    </svg>
  )
}

/** Caixa de seleção da densidade, no rodapé das listas (como na referência do PO).
 *  A escolha é do USUÁRIO e vale para o sistema inteiro. */
export function DensidadeSelect() {
  const { densidade, setDensidade } = useDensidade()
  const [aberto, setAberto] = useState(false)
  const ancora = useRef<HTMLButtonElement>(null)
  const atual = DENSIDADES.find((o) => o.valor === densidade) ?? DENSIDADES[0]

  return (
    <>
      <button ref={ancora} type="button" onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox" aria-expanded={aberto} aria-label={`Densidade da tela: ${atual.rotulo}`}
        title="Densidade da tela"
        className="inline-flex h-6 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted transition-colors">
        <Icone d={atual.valor} className="h-3.5 w-3.5 text-muted-foreground" />
        {atual.rotulo}
        <ChevronUp className="h-3 w-3 text-muted-foreground" aria-hidden />
      </button>
      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => setAberto(false)} role="listbox" aria-label="Densidade da tela"
          className="w-72 rounded-xl border bg-popover p-1.5 shadow-xl">
          {DENSIDADES.map((o) => {
            const on = o.valor === densidade
            return (
              <button key={o.valor} type="button" role="option" aria-selected={on}
                onClick={() => { setDensidade(o.valor); setAberto(false) }}
                className={cn('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  on ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:bg-muted')}>
                <Icone d={o.valor} className="h-4 w-4 shrink-0 text-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs font-semibold">{o.rotulo}</span>
                  <span className="text-[11px] text-muted-foreground">{o.descricao}</span>
                </span>
                {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="em uso" />}
              </button>
            )
          })}
          <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] leading-snug text-muted-foreground">Vale para você em todas as telas; fica salva no seu usuário.</p>
        </FloatingMenu>
      )}
    </>
  )
}
