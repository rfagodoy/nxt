'use client'

/* Peças do editor de workflow: limites do zoom do desenho, glifo de gateway e o tipo das
   pendências de ativação (a lista delas mora no "Antes de ativar", desenho-bpmn/checklist-de-ativacao). */

import type { ProblemaAtivacao } from '@nxt/workflow-core'

/* Zoom. O teto acima de 100% existe para LER: com o desenho grande, é o que permite
   conferir prazo e executor sem abrir a atividade. Abaixo do piso o texto vira borrão. */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2

/** Losango do gateway em miniatura, para selos e cabeçalhos. */
export function GatewayGlyph({ kind, className }: { kind: 'exclusive' | 'parallel'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
      {kind === 'exclusive'
        ? <><path d="m8.9 8.9 6.2 6.2" /><path d="m15.1 8.9-6.2 6.2" /></>
        : <><path d="M12 7.7v8.6" /><path d="M7.7 12h8.6" /></>}
    </svg>
  )
}

/** Pendência com o grupo do desenho livre e as setas culpadas (para o destaque). */
export type Pendencia = ProblemaAtivacao & { grupo?: 'desenho' | 'motor'; setas?: string[] }
