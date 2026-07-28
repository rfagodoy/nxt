'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSession, logout } from '@/lib/session-context'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard, GitBranch, PanelLeft, Activity,
  Table2, Sun, Moon, LogOut, Users, KeyRound, BellRing, LayoutTemplate, ListChecks, CalendarDays, Mail, Upload, HeartPulse, FileBarChart, FileText, Handshake, Building2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/contexts/sidebar-context'
import { Logo } from './logo'
import { ChangePasswordModal } from './change-password-modal'
import { NotificationBell } from './notification-bell'

interface NavItem    { href: string; label: string; icon?: React.ElementType }
interface NavSection {
  label: string
  items: NavItem[]
  /** Recolhe por padrão. Só para grupos de uso ESPORÁDICO — esconder o que se usa
   *  todo dia troca um clique economizado por um clique cobrado. */
  recolhivel?: boolean
}

const sections: NavSection[] = [
  {
    label: '',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Gestão',
    // "Minhas tarefas" (caixa do workflow) + acompanhamento das execuções +
    // catálogo de módulos (fonte única).
    items: [
      { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
      { href: '/processos', label: 'Processos', icon: Activity },
      { href: '/modules/contratos',  label: 'Contratos',  icon: FileText },
      { href: '/modules/parceiros',  label: 'Parceiros',  icon: Handshake },
      { href: '/modules/estrutura',  label: 'Estrutura organizacional', icon: Building2 },
      { href: '/modules/relatorios', label: 'Relatórios', icon: FileBarChart },
    ],
  },
  /* Dois grupos por FREQUÊNCIA de uso, não por assunto. A lista tinha nove itens em
     ordem de chegada, com "Calendário" (uma vez por ano) pesando o mesmo que
     "Usuários" (toda semana). Nada foi removido nem renomeado. */
  {
    label: 'Configurações',
    recolhivel: true,
    items: [
      { href: '/settings/usuarios',   label: 'Usuários',     icon: Users     },
      { href: '/processes',           label: 'Workflows',    icon: GitBranch },
      { href: '/settings/telas',      label: 'Telas',        icon: LayoutTemplate },
      { href: '/settings/tabelas',    label: 'Tabelas',      icon: Table2    },
    ],
  },
  {
    label: 'Instalação',
    recolhivel: true,
    items: [
      { href: '/settings/calendario', label: 'Calendário',   icon: CalendarDays },
      { href: '/settings/email',      label: 'E-mail',       icon: Mail      },
      { href: '/settings/notificacoes', label: 'Notificações', icon: BellRing },
      { href: '/settings/importacao', label: 'Importação',   icon: Upload    },
      { href: '/settings/diagnostico', label: 'Diagnóstico',  icon: HeartPulse },
    ],
  },
]

const ABERTAS_KEY = 'nxt:sidebar:secoes-abertas'

/** Aparência ÚNICA do título de seção — recolhível ou não. */
const TITULO_SECAO = 'px-2.5 mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-sidebar-muted leading-5'

export function Sidebar() {
  const pathname              = usePathname()
  const { collapsed, toggle } = useSidebar()

  const isActive = (href: string) => pathname.startsWith(href)

  /* Quais seções recolhíveis estão abertas. Começa vazio e a preferência é lida no
     efeito (padrão `mounted` da casa: ler localStorage na renderização quebraria a
     hidratação). */
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ABERTAS_KEY)
      if (raw) setAbertas(new Set(JSON.parse(raw) as string[]))
    } catch { /* preferência corrompida não pode derrubar o menu */ }
  }, [])

  const alternarSecao = (label: string) => {
    setAbertas((atual) => {
      const proxima = new Set(atual)
      if (proxima.has(label)) proxima.delete(label)
      else proxima.add(label)
      try { localStorage.setItem(ABERTAS_KEY, JSON.stringify([...proxima])) } catch { /* modo privado */ }
      return proxima
    })
  }

  /* Uma seção recolhida que CONTÉM a tela atual abre sozinha: esconder onde a pessoa
     está a faria perder a referência de lugar — e é justamente quando ela precisa dos
     itens vizinhos. */
  const secaoAberta = (sec: NavSection) =>
    !sec.recolhivel || abertas.has(sec.label) || sec.items.some((i) => isActive(i.href))

  return (
    <aside className={cn(
      'relative flex flex-col shrink-0 transition-all duration-300 ease-in-out group/sidebar glass-panel border-r border-white/25 dark:border-white/10',
      collapsed ? 'w-16' : 'w-60',
    )}>

      {/* Logo + toggle (PanelLeft) */}
      <div className={cn(
        'flex items-center border-b border-sidebar-border h-14 shrink-0 px-3',
        collapsed ? 'justify-center' : 'justify-between gap-2',
      )}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Logo variant="mark" />
            <span className="text-lg font-bold tracking-tight text-sidebar-foreground">Nxt</span>
          </Link>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-hidden overflow-y-auto space-y-2">
        {sections.map((section) => {
          const aberta = secaoAberta(section)
          return (
          <div key={section.label || '__root'}>
            {section.label && !collapsed && (
              /* Uma classe SÓ para os dois casos: com estilos duplicados, botão e
                 parágrafo divergem na primeira alteração — foi o que aconteceu, e o
                 rótulo recolhível pareceu menor que o fixo. O chevron fica À DIREITA
                 para todos os títulos começarem na mesma coluna. */
              section.recolhivel ? (
                <button
                  type="button"
                  onClick={() => alternarSecao(section.label)}
                  aria-expanded={aberta}
                  className={cn(TITULO_SECAO, 'flex w-full items-center gap-1 rounded-md hover:text-sidebar-foreground transition-colors')}
                >
                  <span className="truncate">{section.label}</span>
                  <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', aberta && 'rotate-90')} />
                </button>
              ) : (
                <p className={cn(TITULO_SECAO, 'select-none')}>{section.label}</p>
              )
            )}
            {/* Com a barra RECOLHIDA (só ícones) não há cabeçalho para clicar — os
                itens aparecem sempre, senão ficariam inalcançáveis. */}
            <div className={cn('space-y-px', !aberta && !collapsed && 'hidden')}>
              {section.items.map((item) => {
                const Icon   = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md text-[12px] font-medium tracking-tight transition-colors',
                      collapsed ? 'h-8 w-8 justify-center mx-auto' : 'px-2.5 py-1',
                      active
                        ? 'bg-sidebar-active text-sidebar-active-fg'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover',
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
          )
        })}
      </nav>

      {/* Rodapé: usuário + tema + sair */}
      <SidebarFooter collapsed={collapsed} />
    </aside>
  )
}

/* ── Rodapé da sidebar: identidade do usuário, alternância de tema e logout ── */
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = theme === 'dark'
  const name   = session?.user?.name || session?.user?.email?.split('@')[0] || 'Usuário'
  const email  = session?.user?.email ?? ''
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'U'

  const iconBtn =
    'flex items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-colors'

  const ThemeBtn = (
    <button onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className={cn(iconBtn, 'h-8 w-8 shrink-0')}>
      {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="h-4 w-4" />}
    </button>
  )
  const PasswordBtn = (
    <button onClick={() => setPwOpen(true)}
      title="Alterar minha senha"
      className={cn(iconBtn, 'h-8 w-8 shrink-0')}>
      <KeyRound className="h-4 w-4" />
    </button>
  )
  const LogoutBtn = (
    <button onClick={() => void logout()}
      title="Sair"
      className={cn(iconBtn, 'h-8 w-8 shrink-0 hover:text-red-400')}>
      <LogOut className="h-4 w-4" />
    </button>
  )
  const Avatar = (
    <span title={name}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground ring-1 ring-black/5">
      {initials}
    </span>
  )

  return (
    <div className="border-t border-sidebar-border p-2">
      {collapsed ? (
        <div className="flex flex-col items-center gap-1">
          {Avatar}<NotificationBell />{ThemeBtn}{PasswordBtn}{LogoutBtn}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {Avatar}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium tracking-tight text-sidebar-foreground">{name}</p>
            {email && <p className="truncate text-[10px] text-sidebar-muted">{email}</p>}
          </div>
          <NotificationBell />
          {ThemeBtn}
          {PasswordBtn}
          {LogoutBtn}
        </div>
      )}
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  )
}
