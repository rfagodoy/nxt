'use client'

import { cn } from '@/lib/utils'

/** Um indicador da lista. `filtro`: chave que a tela entende (situação, status…);
 *  `null` = o "Total" (limpa o filtro); ausente = só conta, não filtra. */
export interface Indicador {
  label: string
  valor: number
  cls: string
  filtro?: string | null
  /** destaque de alerta (ex.: "Com erro" > 0) — borda, além da cor do número */
  alerta?: boolean
}

/** Indicadores da lista = filtros de um clique (padrão planilha, PO 18/10/2026). O card
 *  responde "quantos?" e o clique responde "quais?". Selecionado = fundo escuro e
 *  "✓ filtrando" ESCRITO — cor nunca carrega sozinha (o PO é daltônico). */
export function Indicadores({ itens, ativo, onSelect, className }: {
  itens: Indicador[]
  ativo: string | null
  onSelect: (filtro: string | null) => void
  className?: string
}) {
  return (
    <div role="group" aria-label="Filtrar pelos indicadores" className={cn('grid gap-2', className)}>
      {itens.map(({ label, valor, cls, filtro, alerta }) => {
        const filtra = filtro !== undefined
        const on = filtra && filtro === ativo
        const base = 'rounded-xl px-3 flex items-center justify-between gap-2 text-left transition-colors min-h-[var(--lista-indicador)]'
        const conteudo = (
          <>
            <span className={cn('text-[11px]', on ? 'text-background/80' : 'text-muted-foreground')}>
              {label}{on && filtro && <span className="ml-1.5 font-semibold text-background">✓ filtrando</span>}
            </span>
            <span className={cn('text-sm font-bold tabular-nums', on ? 'text-background' : cls)}>{valor}</span>
          </>
        )
        if (!filtra) {
          return <div key={label} className={cn(base, 'vidro bg-[var(--vidro-cartao)]', alerta && 'border-red-300 dark:border-red-900')}>{conteudo}</div>
        }
        return (
          <button key={label} type="button" aria-pressed={on}
            onClick={() => onSelect(filtro === ativo ? null : filtro ?? null)}
            className={cn(base, on ? 'bg-foreground text-background' : 'vidro bg-[var(--vidro-cartao)] hover:bg-card',
              !on && alerta && 'border-red-300 dark:border-red-900')}>
            {conteudo}
          </button>
        )
      })}
    </div>
  )
}
