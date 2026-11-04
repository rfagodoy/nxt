'use client'

/* Menu do usuário — canto direito da faixa do topo (PO, 18/10/2026: opção 1 do mockup).
   Junta o que morava solto no rodapé do menu lateral (4 ícones sem texto): a conta
   (Alterar senha, Sair) e as PREFERÊNCIAS pessoais (Tema e Densidade), que valem para
   todas as telas — por isso a densidade saiu dos rodapés das listas e dos cadastros.
   "Sair" fica separado e por último: era a um clique acidental do tema.
   Em seções (PO, 01/11/2026: opção B do mockup): o tema é uma linha com a cor e o nome
   atuais, e a lista inteira abre num submenu ao lado — antes eram 8 miniaturas espremidas,
   com nome cortado. */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, KeyRound, LogOut, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession, logout } from '@/lib/session-context'
import { DENSIDADES, useDensidade, type Densidade } from '@/lib/densidade'
import { formatarVersao } from '@/lib/versao'
import { TEMAS, type Tema } from '@/lib/temas'
import { useTema } from '@/lib/temas-provider'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { ChangePasswordModal } from './change-password-modal'

/* Ícone = espaçamento entre as linhas (mais linhas = mais compacta). Forma, não cor. */
const TRACOS: Record<Densidade, string> = {
  compacta: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  media:    'M4 7h16M4 12h16M4 17h16',
  alta:     'M4 8h16M4 16h16',
}

const GRUPOS_DE_TEMA = [
  { titulo: 'Claros', temas: TEMAS.filter((t) => t.base === 'light') },
  { titulo: 'Escuros', temas: TEMAS.filter((t) => t.base === 'dark') },
]

/** Amostra de um tema: menu lateral à esquerda; no fundo, a cor de ação e a de destaque. */
function AmostraDoTema({ tema: t }: { tema: Tema }) {
  return (
    <span aria-hidden className="flex h-[22px] w-[34px] shrink-0 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.14)]">
      <span className="w-[34%]" style={{ background: t.amostra[1] }} />
      <span className="flex flex-1 items-center justify-center gap-0.5" style={{ background: t.amostra[0] }}>
        <span className="h-[7px] w-[7px] rounded-sm" style={{ background: t.amostra[2] }} />
        <span className="h-[5px] w-[5px] rounded-sm" style={{ background: t.amostra[3] }} />
      </span>
    </span>
  )
}

/** Versão gravada no build (next.config: tag do git ou NXT_VERSAO). */
const VERSAO = formatarVersao(process.env.NEXT_PUBLIC_NXT_VERSAO || 'desenvolvimento')

export function UserMenu() {
  const { data: session } = useSession()
  const { tema, setTema } = useTema()
  const { densidade, setDensidade } = useDensidade()
  const [aberto, setAberto] = useState(false)
  const [temas, setTemas] = useState(false)
  const [senha, setSenha] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ancora = useRef<HTMLButtonElement>(null)
  const linhaDoTema = useRef<HTMLButtonElement>(null)
  useEffect(() => setMounted(true), [])
  // fechar o menu fecha também o submenu
  useEffect(() => { if (!aberto) setTemas(false) }, [aberto])

  const nome = session?.user?.name || session?.user?.email?.split('@')[0] || 'Usuário'
  const email = session?.user?.email ?? ''
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'U'
  const atual = mounted ? TEMAS.find((t) => t.id === tema) : undefined

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const icone = 'h-4 w-4 shrink-0 text-muted-foreground'

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
          className="w-[304px] rounded-xl border bg-popover p-1.5 shadow-xl">
          {/* quem está logado */}
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">{iniciais}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{nome}</span>
              {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
            </span>
          </div>

          <button type="button" role="menuitem" className={item} onClick={() => { setAberto(false); setSenha(true) }}>
            <KeyRound className={icone} aria-hidden />Alterar senha
          </button>

          {/* preferências pessoais: valem para o usuário em todas as telas */}
          <div className="mx-1 my-1 h-px bg-border" />
          <p className="px-2.5 pb-0.5 pt-1.5 text-[11.5px] font-medium text-muted-foreground">Suas preferências</p>

          <button ref={linhaDoTema} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={temas}
            onClick={() => setTemas((v) => !v)} className={cn(item, temas && 'bg-muted')}>
            <Palette className={icone} aria-hidden />
            <span className="flex-1">Tema</span>
            {atual && (
              <>
                <span aria-hidden className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.15)]"
                  style={{ background: `linear-gradient(90deg, ${atual.amostra[2]} 50%, ${atual.amostra[3]} 50%)` }} />
                <span className="text-muted-foreground">{atual.nome}</span>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>

          <div className="px-2.5 pb-2.5 pt-2">
            <div className="mb-2 flex items-center gap-2.5 text-[13px]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden className={icone}><path d={TRACOS[densidade]} /></svg>
              Densidade das listas
            </div>
            <div role="radiogroup" aria-label="Densidade das listas" className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-muted p-[3px]">
              {DENSIDADES.map((d) => {
                const on = d.valor === densidade
                return (
                  <button key={d.valor} type="button" role="radio" aria-checked={on} title={d.descricao} onClick={() => setDensidade(d.valor)}
                    className={cn('flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden className="h-4 w-4"><path d={TRACOS[d.valor]} /></svg>
                    {d.rotulo}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sair por último, com a versão ao lado, discreta: é o que o suporte pergunta primeiro */}
          <div className="mx-1 mb-1 h-px bg-border" />
          <div className="flex items-center">
            <button type="button" role="menuitem" className={cn(item, 'flex-1 text-red-700 dark:text-red-400')} onClick={() => void logout()}>
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />Sair
            </button>
            <span className="shrink-0 px-2.5 text-[11px] tabular-nums text-muted-foreground">Nxt {VERSAO}</span>
          </div>
        </FloatingMenu>
      )}

      {aberto && temas && (
        <FloatingMenu anchor={linhaDoTema} onClose={() => setTemas(false)} lado="esquerda" role="menu" aria-label="Tema"
          className="w-[248px] rounded-xl border bg-popover p-1.5 shadow-xl">
          {GRUPOS_DE_TEMA.map((g) => (
            <div key={g.titulo} role="group" aria-label={g.titulo}>
              <p className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-muted-foreground">{g.titulo}</p>
              {g.temas.map((t) => {
                const ativo = t.id === tema
                return (
                  <button key={t.id} type="button" role="menuitemradio" aria-checked={ativo} data-autofocus={ativo || undefined}
                    onClick={() => setTema(t.id)} className={cn(item, 'py-1.5', ativo && 'bg-muted')}>
                    <AmostraDoTema tema={t} />
                    <span className="flex-1">{t.nome}</span>
                    {ativo && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                )
              })}
            </div>
          ))}
        </FloatingMenu>
      )}

      {senha && <ChangePasswordModal onClose={() => setSenha(false)} />}
    </>
  )
}
