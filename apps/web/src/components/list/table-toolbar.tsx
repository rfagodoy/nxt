'use client'

/* Barra ENXUTA de busca+filtros para tabelas dentro de um documento (ex.: seções de
   uma consulta de processo). Reusa o mesmo motor de filtro do sistema (FilterRow/
   OPERATORS), mas SEM Visões/Salvar visão/Exportar — que só fazem sentido em página. */

import { useState } from 'react'
import { Search, SlidersHorizontal, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type FilterRow, OPERATORS } from '@/lib/list-filter'

export function TableToolbar({
  search, onSearch, columns, filters, onFiltersChange, logic, onLogicChange, filteredCount, totalCount,
}: {
  search: string; onSearch: (v: string) => void
  columns: { key: string; label: string }[]
  filters: FilterRow[]; onFiltersChange: (f: FilterRow[]) => void
  logic: 'AND' | 'OR'; onLogicChange: (l: 'AND' | 'OR') => void
  filteredCount: number; totalCount: number
}) {
  const [showFilters, setShowFilters] = useState(false)
  const activeCount = filters.filter((f) => f.value.trim()).length
  const firstCol = columns[0]?.key ?? ''

  const add = () => onFiltersChange([...filters, { id: `f${Date.now()}`, col: firstCol, op: 'contains', value: '' }])
  const upd = (id: string, key: keyof FilterRow, val: string) => onFiltersChange(filters.map((f) => f.id === id ? { ...f, [key]: val } : f))
  const rm = (id: string) => onFiltersChange(filters.filter((f) => f.id !== id))
  const clear = () => onFiltersChange([])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => onSearch(e.target.value)}
            className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Buscar em todas as colunas..." />
        </div>
        <button onClick={() => { setShowFilters((v) => !v); if (!filters.length) add() }}
          className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
            showFilters || activeCount > 0 ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
          {activeCount > 0 && <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{activeCount}</span>}
        </button>
        <p className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {filteredCount === totalCount ? `${totalCount} registro${totalCount !== 1 ? 's' : ''}` : `${filteredCount} de ${totalCount}`}
        </p>
      </div>

      {showFilters && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">Combinar condições com:</span>
            <div className="flex rounded-md border overflow-hidden">
              {(['AND', 'OR'] as const).map((l) => (
                <button key={l} onClick={() => onLogicChange(l)} className={cn('px-3 py-1 text-xs font-semibold transition-colors', logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>{l === 'AND' ? 'E' : 'OU'}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {filters.map((f, idx) => (
              <div key={f.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{idx === 0 ? 'Se' : logic === 'AND' ? 'E' : 'OU'}</span>
                <select value={f.col} onChange={(e) => upd(f.id, 'col', e.target.value)} className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={f.op} onChange={(e) => upd(f.id, 'op', e.target.value)} className="h-7 w-36 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={f.value} onChange={(e) => upd(f.id, 'value', e.target.value)} placeholder="Valor..."
                  className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <button onClick={() => rm(f.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button onClick={add} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar condição</button>
            {activeCount > 0 && <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar filtros</button>}
          </div>
        </div>
      )}
    </div>
  )
}
