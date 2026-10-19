'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/lib/session-context'
import { filtrarSecoesPorPapel } from '@/lib/nav-visibility'
import {
  LayoutDashboard, GitBranch, PanelLeft, Activity,
  Table2, Users, BellRing, LayoutTemplate, ListChecks, CalendarDays, Mail, Upload, HeartPulse, FileBarChart, FileText, Handshake, Building2, ChevronRight, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/contexts/sidebar-context'
import { useWorkspace, type WorkspaceKind } from '@/contexts/workspace-context'
import { Logo } from './logo'

interface NavItem    { href: string; label: string; icon?: React.ElementType; adminOnly?: boolean }
interface NavSection {
  label: string
  items: NavItem[]
  /** Recolhe por padrão. Só para grupos de uso ESPORÁDICO — esconder o que se usa
   *  todo dia troca um clique economizado por um clique cobrado. */
  recolhivel?: boolean
  /** Só administradores veem (a barreira real é o RolesGuard na API). */
  adminOnly?: boolean
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
      // Decisão do PO (2026-08-21): Estrutura organizacional é admin-only.
      { href: '/modules/estrutura',  label: 'Estrutura organizacional', icon: Building2, adminOnly: true },
      { href: '/modules/relatorios', label: 'Relatórios', icon: FileBarChart },
    ],
  },
  /* Dois grupos por FREQUÊNCIA de uso, não por assunto. A lista tinha nove itens em
     ordem de chegada, com "Calendário" (uma vez por ano) pesando o mesmo que
     "Usuários" (toda semana). Nada foi removido nem renomeado. */
  {
    label: 'Configurações',
    recolhivel: true,
    adminOnly: true,
    items: [
      { href: '/settings/usuarios',   label: 'Usuários',     icon: Users     },
      { href: '/workflows',           label: 'Workflows',    icon: GitBranch },
      { href: '/settings/telas',      label: 'Telas',        icon: LayoutTemplate },
      { href: '/settings/tabelas',    label: 'Tabelas',      icon: Table2    },
    ],
  },
  {
    label: 'Instalação',
    recolhivel: true,
    adminOnly: true,
    items: [
      { href: '/settings/calendario', label: 'Calendário',   icon: CalendarDays },
      { href: '/settings/email',      label: 'E-mail',       icon: Mail      },
      { href: '/settings/notificacoes', label: 'Notificações', icon: BellRing },
      { href: '/settings/importacao', label: 'Importação',   icon: Upload    },
      { href: '/settings/diagnostico', label: 'Diagnóstico',  icon: HeartPulse },
    ],
  },
]

/* Tela de onde vem cada tipo de documento da área de trabalho: com um documento ATIVO,
   o menu acende o módulo DELE (um parceiro aberto acende "Parceiros", mesmo que a lista
   por trás seja a de Contratos). */
export const ROTA_DO_TIPO: Record<WorkspaceKind, string> = {
  contract: '/modules/contratos', partner: '/modules/parceiros', unit: '/modules/estrutura',
  task: '/tarefas', 'process-instance': '/processos',
}

/** Nome e ícone da tela de uma rota (o item do menu de prefixo mais longo) — a 1ª aba da
 *  faixa do topo usa isto para dizer de que lista se trata ("☰ Contratos"). */
export function itemDaRota(pathname: string): { label: string; icon?: React.ElementType } {
  const todos = sections.flatMap((s) => s.items)
  const casa = todos.filter((i) => pathname.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0]
  if (casa) return { label: casa.label, icon: casa.icon }
  if (pathname.startsWith('/notificacoes')) return { label: 'Notificações', icon: Bell }
  return { label: 'Início', icon: LayoutDashboard }
}

const ABERTAS_KEY = 'nxt:sidebar:secoes-abertas'

/** Aparência ÚNICA do título de seção — recolhível ou não. */
const TITULO_SECAO = 'px-2.5 mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-sidebar-muted leading-5'

/* A ilha é escura nos DOIS temas: hover e ativo são brancos translúcidos (e não os
   tokens --sidebar-hover/--sidebar-active, que eram cor chapada da sidebar antiga).
   O item ativo tem três sinais — pílula, realce e cor —, nunca só a cor. */
const HOVER_ILHA = 'hover:bg-white/10'
const ATIVO_ILHA = 'bg-white/[0.15] text-sidebar-active-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.26),0_1px_4px_rgb(0_0_0/0.16)]'

export function Sidebar() {
  const pathname              = usePathname()
  const { collapsed, toggle } = useSidebar()
  const { data: session }     = useSession()

  /* Menu filtrado por papel — ver nav-visibility.ts para a regra (e o porquê de a
     sessão carregando cair na visão de usuário comum). */
  const role = session?.user.role
  const secoesVisiveis = useMemo(() => filtrarSecoesPorPapel(sections, role), [role])

  const { tabs, activeId } = useWorkspace()
  const abaAtiva = activeId ? tabs.find((t) => t.id === activeId) : undefined
  const rotaAtual = abaAtiva ? ROTA_DO_TIPO[abaAtiva.kind] : pathname
  const isActive = (href: string) => rotaAtual.startsWith(href)

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
    /* O p-2 descola a ilha 8px das bordas da tela; a largura inclui esse respiro, então
       a ilha mantém os 240px (aberta) e 64px (recolhida) de antes. */
    <div className={cn(
      'shrink-0 p-2 transition-all duration-300 ease-in-out',
      collapsed ? 'w-20' : 'w-64',
    )}>
    <aside className={cn(
      'vidro group/sidebar relative flex h-full flex-col rounded-2xl text-sidebar-foreground',
      'bg-[var(--vidro-lateral)] [--vidro-solido:hsl(var(--sidebar-bg))]',
    )}>

      {/* Logo + toggle (PanelLeft) */}
      <div className={cn(
        'flex items-center border-b border-white/[0.08] h-14 shrink-0 px-3',
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
          className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:text-sidebar-foreground transition-colors', HOVER_ILHA)}
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-hidden overflow-y-auto space-y-2">
        {secoesVisiveis.map((section) => {
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
                  className={cn(TITULO_SECAO, 'group/sec flex w-full items-center gap-1 rounded-md hover:text-sidebar-foreground transition-colors')}
                >
                  <span className="truncate">{section.label}</span>
                  {/* Chevron INVISÍVEL no repouso, aberta ou recolhida: no repouso todo
                      título de seção tem exatamente a mesma aparência — era ele o único
                      elemento que distinguia um grupo recolhível de um fixo como "Gestão".
                      Reaparece no hover/foco, que é quando a pessoa cogita clicar.
                      Decisão do PO (28/07), ciente de que numa seção recolhida ele era o
                      único sinal de que há itens embaixo. */}
                  <ChevronRight className={cn(
                    'h-3 w-3 shrink-0 opacity-0 transition-all group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100',
                    aberta && 'rotate-90',
                  )} />
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
                        ? ATIVO_ILHA
                        : cn('text-sidebar-foreground/70 hover:text-sidebar-foreground', HOVER_ILHA),
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

      {/* Sem rodapé: usuário, notificações, tema, densidade, senha e sair foram para a
          faixa do topo (sino + menu do usuário) — PO, 18/10/2026. */}
    </aside>
    </div>
  )
}
