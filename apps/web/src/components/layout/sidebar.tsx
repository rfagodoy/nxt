'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, GitBranch, Zap, ChevronLeft, ChevronRight,
  FileText, Handshake, Table2, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/contexts/sidebar-context'

interface NavItem    { href: string; label: string; icon?: React.ElementType }
interface NavSection { label: string; items: NavItem[] }

const sections: NavSection[] = [
  {
    label: '',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/modules/contratos', label: 'Contratos', icon: FileText  },
      { href: '/modules/parceiros', label: 'Parceiros', icon: Handshake },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { href: '/settings/empresas',  label: 'Estrutura organizacional', icon: Building2 },
      { href: '/processes',          label: 'Processos', icon: GitBranch },
      { href: '/settings/tabelas',   label: 'Tabelas',   icon: Table2   },
    ],
  },
]

export function Sidebar() {
  const pathname              = usePathname()
  const { collapsed, toggle } = useSidebar()

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <aside className={cn(
      'relative flex flex-col shrink-0 transition-all duration-300 ease-in-out group/sidebar bg-sidebar border-r border-sidebar-border',
      collapsed ? 'w-16' : 'w-60',
    )}>

      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-sidebar-border h-14 shrink-0 overflow-hidden',
        collapsed ? 'justify-center px-0' : 'px-5',
      )}>
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-primary shrink-0">
            <Zap className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-bold text-base tracking-tight truncate text-sidebar-foreground">
              primeApps
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-hidden overflow-y-auto space-y-4">
        {sections.map((section) => (
          <div key={section.label || '__root'}>
            {section.label && !collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted select-none">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon   = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md text-sm font-medium transition-colors',
                      collapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-3 py-2',
                      active
                        ? 'bg-sidebar-active text-sidebar-active-fg'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover',
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0" />}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Toggle flutuante */}
      <button
        onClick={toggle}
        title={collapsed ? 'Expandir' : 'Recolher'}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-muted shadow-sm opacity-0 group-hover/sidebar:opacity-100 hover:text-sidebar-foreground transition-all duration-200"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
