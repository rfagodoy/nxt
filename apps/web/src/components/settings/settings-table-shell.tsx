'use client'

import { useState, useEffect, type ElementType, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Search, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusFilter = 'all' | 'active' | 'inactive'

interface SettingsTableShellProps {
  title: string
  description: string
  icon: ElementType
  /** Ação à direita do cabeçalho (ex.: botão "Adicionar"). Só telas editáveis. */
  headerAction?: ReactNode
  /** Estado da busca (controlado pelo caller). */
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  /** Filtro de status (segmento Todos/Ativos/Inativos). */
  status: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  onExport: () => void
  exportDisabled?: boolean
  /** Linha de rodapé (contagem). Ex.: "N registros · M ativos". */
  footer?: ReactNode
  /** Conteúdo da tabela: <thead>…</thead><tbody>…</tbody>. */
  children: ReactNode
}

/**
 * CASCA ÚNICA das telas de "Tabelas de apoio" (/settings/tabelas/*). É a FONTE DE
 * VERDADE do layout dessas telas — LookupTablePage (editável) e CatalogViewPage
 * (catálogo read-only) renderizam SUAS linhas dentro desta casca, então o visual não
 * pode divergir. Padrão: cabeçalho (voltar + ícone + título) + toolbar (buscar ·
 * filtro de status · exportar) + lista ROLÁVEL com header sticky + rodapé de contagem.
 * ❌ SEM cards de estatística e SEM paginação (isso é padrão de MÓDULO, não de tabela
 * de apoio — ver memória feedback_padrao_por_familia_de_tela).
 */
export function SettingsTableShell({
  title, description, icon: Icon, headerAction,
  search, onSearchChange, searchPlaceholder = 'Buscar...',
  status, onStatusChange, onExport, exportDisabled, footer, children,
}: SettingsTableShellProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const pathname = usePathname()
  // Destino do "voltar" = hub pai (um nível acima na URL).
  const backHref = pathname.split('/').slice(0, -1).join('/') || '/settings'

  return (
    <div className="max-w-4xl mx-auto space-y-3">

      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link href={backHref} title="Voltar para o hub"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="p-2 rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        {mounted && headerAction}
      </div>

      {/* toolbar: buscar · filtro de status · exportar */}
      {mounted && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
          </div>

          <div className="flex rounded-md border overflow-hidden">
            {([['all', 'Todos'], ['active', 'Ativos'], ['inactive', 'Inativos']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => onStatusChange(v)}
                className={cn('px-2.5 h-7 text-xs font-medium transition-colors', status === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                {l}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => { void onExport() }} disabled={exportDisabled}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto">
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>
        </div>
      )}

      {!mounted ? (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-pulse">
          <div className="h-9 bg-muted/40 border-b" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 border-b last:border-0 flex items-center px-4 gap-4">
              <div className="h-3 w-4 bg-muted rounded" /><div className="h-3 w-24 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-12rem)]">
            <table className="w-full text-xs">
              {children}
            </table>
          </div>
        </div>
      )}

      {mounted && footer && (
        <p className="text-[11px] text-muted-foreground text-center">{footer}</p>
      )}
    </div>
  )
}
