'use client'

import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FloatingMenu } from '@/components/ui/floating-menu'

/** Ação do menu "⋯" de uma linha. `perigo`: vermelho e separado das demais.
 *  `confirmar`: o primeiro clique troca o texto por esta pergunta; só o segundo executa. */
export interface AcaoDaLinha {
  rotulo: string
  onClick: () => void
  perigo?: boolean
  desabilitada?: boolean
  /** por que está desabilitada (aparece no lugar da ação) */
  motivo?: string
  confirmar?: string
}

/** Menu "⋯" das listas (auditoria de UX, 22/11/2026): as ações secundárias ficam com
 *  nome, num lugar só, em vez de ícones soltos que só aparecem ao passar o mouse. As
 *  ações de perigo (Excluir) vêm por último, separadas e com confirmação. */
export function MenuDeAcoes({ acoes, rotulo = 'Mais ações', className }: { acoes: AcaoDaLinha[]; rotulo?: string; className?: string }) {
  const [aberto, setAberto] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const fechar = () => { setAberto(false); setConfirmando(null) }
  const comuns = acoes.filter((a) => !a.perigo)
  const perigo = acoes.filter((a) => a.perigo)

  const item = (a: AcaoDaLinha) => {
    const pedindo = confirmando === a.rotulo
    return (
      <button key={a.rotulo} type="button" role="menuitem" disabled={a.desabilitada} title={a.desabilitada ? a.motivo : undefined}
        onClick={() => {
          if (a.confirmar && !pedindo) { setConfirmando(a.rotulo); return }
          fechar(); a.onClick()
        }}
        className={cn('flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50',
          a.perigo ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40' : 'hover:bg-muted',
          pedindo && 'bg-red-50 font-semibold dark:bg-red-950/40')}>
        {pedindo ? a.confirmar : a.rotulo}
        {a.desabilitada && a.motivo && <span className="ml-auto pl-3 text-[10px] text-muted-foreground">{a.motivo}</span>}
      </button>
    )
  }

  return (
    <>
      <button ref={ref} type="button" onClick={() => (aberto ? fechar() : setAberto(true))} aria-haspopup="menu" aria-expanded={aberto} aria-label={rotulo} title={rotulo}
        className={cn('inline-flex h-[var(--lista-acao)] min-w-[var(--lista-acao)] items-center justify-center rounded-md border px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors', className)}>
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
      </button>
      {aberto && (
        <FloatingMenu anchor={ref} onClose={fechar} align="end" role="menu" aria-label={rotulo}
          className="glass z-50 min-w-[12rem] rounded-xl p-1 text-popover-foreground">
          {comuns.map(item)}
          {comuns.length > 0 && perigo.length > 0 && <div className="my-1 border-t" role="separator" />}
          {perigo.map(item)}
        </FloatingMenu>
      )}
    </>
  )
}
