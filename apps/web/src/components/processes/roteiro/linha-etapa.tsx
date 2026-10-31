'use client'

import type { JSX, ReactNode } from 'react'
import { Check, UserSquare, Zap } from 'lucide-react'
import type { EtapaRoteiro } from '@/lib/roteiro'
import { cn } from '@/lib/utils'
import { Etiquetas } from './etiquetas'

/** Uma etapa do Roteiro. Fechada: nome + etiquetas. Aberta: a configuração logo abaixo
 *  (`aberto`, montada pelo editor — as mesmas perguntas do painel do Desenho). */
export function LinhaEtapa({ no, selecionada, onSelecionar, aberto, acoes, alca }: {
  no: EtapaRoteiro
  selecionada: boolean
  onSelecionar: (id: string) => void
  aberto?: ReactNode
  /** menu ⋯ da linha (estrutura) */
  acoes?: ReactNode
  /** alça de arrastar */
  alca?: ReactNode
}): JSX.Element {
  const Icone = no.tipo === 'serviceTask' ? Zap : UserSquare
  return (
    <div data-roteiro-id={no.id}
      className={cn('rounded-xl border bg-card transition-shadow',
        selecionada ? 'border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]' : 'hover:border-foreground/20')}>
      <div className="flex items-start gap-2 px-2.5 py-2">
        {alca}
        <button type="button" onClick={() => onSelecionar(no.id)} aria-expanded={selecionada}
          className="flex min-w-0 flex-1 items-start gap-2 text-left outline-none focus-visible:underline">
          <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
            no.tipo === 'serviceTask' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400')}>
            <Icone className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[13px] font-bold leading-snug', !no.nome && 'italic font-normal text-muted-foreground')}>
              {no.nome || (no.tipo === 'serviceTask' ? 'Ação automática sem nome' : 'Etapa sem nome')}
            </span>
            <Etiquetas etiquetas={no.etiquetas} />
          </span>
        </button>
        {no.completa && (
          <span title="Tudo respondido" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
        {acoes}
      </div>
      {selecionada && aberto && <div className="border-t">{aberto}</div>}
    </div>
  )
}
