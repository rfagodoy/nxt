'use client'

/* Menu do usuário — canto direito da faixa do topo (PO, 18/10/2026: opção 1 do mockup).
   Junta o que morava solto no rodapé do menu lateral (4 ícones sem texto): a conta
   (Alterar senha, Sair) e as PREFERÊNCIAS pessoais (Tema e Densidade), que valem para
   todas as telas — por isso a densidade saiu dos rodapés das listas e dos cadastros.
   "Sair" fica separado e por último: era a um clique acidental do tema. */

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { ChevronDown, KeyRound, LogOut, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession, logout } from '@/lib/session-context'
import { DENSIDADES, useDensidade, type Densidade } from '@/lib/densidade'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { ChangePasswordModal } from './change-password-modal'

/* Ícone = espaçamento entre as linhas (mais linhas = mais compacta). Forma, não cor. */
const TRACOS: Record<Densidade, string> = {
  compacta: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  media:    'M4 7h16M4 12h16M4 17h16',
  alta:     'M4 8h16M4 16h16',
}

function Segmentado<T extends string>({ rotulo, opcoes, valor, onChange }: {
  rotulo: string
  opcoes: ReadonlyArray<{ valor: T; texto: string; dica?: string }>
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <span role="radiogroup" aria-label={rotulo} className="flex gap-0.5 rounded-lg bg-muted p-0.5">
      {opcoes.map((o) => {
        const on = o.valor === valor
        return (
          <button key={o.valor} type="button" role="radio" aria-checked={on} title={o.dica} onClick={() => onChange(o.valor)}
            className={cn('h-6 rounded-md px-2 text-[11px] transition-colors',
              on ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground')}>
            {o.texto}
          </button>
        )
      })}
    </span>
  )
}

export function UserMenu() {
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const { densidade, setDensidade } = useDensidade()
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ancora = useRef<HTMLButtonElement>(null)
  useEffect(() => setMounted(true), [])

  const nome = session?.user?.name || session?.user?.email?.split('@')[0] || 'Usuário'
  const email = session?.user?.email ?? ''
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'U'
  const tema = mounted && theme === 'dark' ? 'escuro' : 'claro'

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted'

  return (
    <>
      <button ref={ancora} type="button" onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu" aria-expanded={aberto} aria-label={`Menu do usuário: ${nome}`} title={nome}
        className={cn('flex h-[30px] items-center gap-1.5 rounded-full pl-[3px] pr-1.5 transition-colors',
          aberto ? 'bg-muted' : 'hover:bg-white/50 dark:hover:bg-white/[0.07]')}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10.5px] font-semibold text-primary-foreground">{iniciais}</span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', aberto && 'rotate-180')} aria-hidden />
      </button>

      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => setAberto(false)} align="end" role="menu" aria-label="Menu do usuário"
          className="w-[300px] rounded-xl border bg-popover p-1.5 shadow-xl">
          {/* quem está logado */}
          <div className="mb-1 flex items-center gap-2.5 border-b px-2.5 pb-2.5 pt-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{iniciais}</span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{nome}</span>
              {email && <span className="block truncate text-[11px] text-muted-foreground">{email}</span>}
            </span>
          </div>

          <button type="button" role="menuitem" className={item} onClick={() => { setAberto(false); setSenha(true) }}>
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />Alterar senha
          </button>

          {/* preferências pessoais: valem para o usuário em todas as telas */}
          <p className="px-2.5 pb-0.5 pt-2 text-[10.5px] text-muted-foreground">Preferências — valem para você em todas as telas</p>
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs">
            <Sun className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">Tema</span>
            <Segmentado rotulo="Tema" valor={tema} onChange={(v) => setTheme(v === 'escuro' ? 'dark' : 'light')}
              opcoes={[{ valor: 'claro', texto: 'Claro' }, { valor: 'escuro', texto: 'Escuro' }]} />
          </div>
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground"><path d={TRACOS[densidade]} /></svg>
            <span className="flex-1">Densidade</span>
            <Segmentado rotulo="Densidade" valor={densidade} onChange={setDensidade}
              opcoes={DENSIDADES.map((d) => ({ valor: d.valor, texto: d.rotulo, dica: d.descricao }))} />
          </div>

          <div className="my-1 h-px bg-border" />
          <button type="button" role="menuitem" className={cn(item, 'text-red-700 dark:text-red-400')} onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5 shrink-0" />Sair
          </button>
        </FloatingMenu>
      )}

      {senha && <ChangePasswordModal onClose={() => setSenha(false)} />}
    </>
  )
}
