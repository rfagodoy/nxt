'use client'

import type { JSX } from 'react'
import { AlertTriangle, Clock, Link2, Loader2, Monitor, Undo2, User, Zap } from 'lucide-react'
import type { Etiqueta } from '@/lib/roteiro'
import { cn } from '@/lib/utils'

const ICONE = { quem: User, prazo: Clock, tela: Monitor, devolve: Undo2, acao: Zap, vinculo: Link2 } as const

/** Etiquetas de uma etapa no Roteiro: o que está respondido (neutras), o que falta
 *  (tracejadas âmbar), a resposta que não vale mais (âmbar cheia, com alerta) e o nome do
 *  papel que ainda não chegou ("carregando…"). */
export function Etiquetas({ etiquetas }: { etiquetas: Etiqueta[] }): JSX.Element | null {
  if (!etiquetas.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {etiquetas.map((e, i) => {
        if (e.tipo === 'falta') {
          return (
            <span key={i} className="inline-flex items-center rounded-full border border-dashed border-amber-500/70 px-2 py-px text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              {e.texto}
            </span>
          )
        }
        if (e.tipo === 'aviso') {
          return (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-amber-500/70 bg-amber-500/10 px-2 py-px text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3 shrink-0" />{e.texto}
            </span>
          )
        }
        if (e.tipo === 'carregando') {
          return (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />{e.texto}
            </span>
          )
        }
        const Icone = ICONE[e.tipo]
        return (
          <span key={i} title={e.texto}
            className={cn('inline-flex min-w-0 max-w-[260px] items-center gap-1 rounded-full border bg-card px-2 py-px text-[11px] font-medium',
              e.tipo === 'vinculo' ? 'border-primary/30 text-primary' : 'text-foreground/80')}>
            <Icone className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="truncate">{e.texto}</span>
          </span>
        )
      })}
    </div>
  )
}
