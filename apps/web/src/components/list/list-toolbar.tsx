'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Search, SlidersHorizontal, LayoutList, ChevronDown, Check, Bookmark, FileDown, Plus, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { type FilterRow, OPERATORS } from '@/lib/list-filter'
import type { SavedView } from '@/hooks/use-views'

/** Barra de ferramentas PADRÃO de listagem (Parceiros/Contratos): busca + filtros (E/OU) +
 *  visões + salvar visão + [config da tela] + exportar + contador. Fonte única — a tela só
 *  liga os dados/estado; a UI e o comportamento vivem aqui. */
export function ListToolbar({
  search, onSearch,
  columns, operators = OPERATORS,
  filters, onFiltersChange, logic, onLogicChange,
  views, activeViewId, onSelectView, onSaveView, onDeleteView,
  onExport, exportDisabled,
  configSlot,
  filteredCount, totalCount, busy,
}: {
  search: string; onSearch: (v: string) => void
  columns: { key: string; label: string }[]
  operators?: { value: string; label: string }[]
  filters: FilterRow[]; onFiltersChange: (f: FilterRow[]) => void
  logic: 'AND' | 'OR'; onLogicChange: (l: 'AND' | 'OR') => void
  views: SavedView[]; activeViewId: string | null
  onSelectView: (id: string | null) => void
  onSaveView: (name: string) => void
  onDeleteView: (e: React.MouseEvent, id: string) => void
  onExport: () => void; exportDisabled?: boolean
  configSlot?: ReactNode
  filteredCount: number; totalCount: number; busy?: boolean
}) {
  const [showFilters, setShowFilters] = useState(false)
  const [showViews, setShowViews] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState('')
  const viewsRef = useRef<HTMLDivElement>(null)
  const saveInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (saving) saveInputRef.current?.focus() }, [saving])
  useEffect(() => {
    if (!showViews) return
    const h = (e: MouseEvent) => { if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) setShowViews(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showViews])

  const activeViewName = views.find((v) => v.id === activeViewId)?.name
  const activeFiltersCount = filters.filter((f) => f.value.trim()).length
  const firstCol = columns[0]?.key ?? ''

  const addFilter = () => onFiltersChange([...filters, { id: `f${Date.now()}`, col: firstCol, op: 'contains', value: '' }])
  const updateFilter = (id: string, key: keyof FilterRow, val: string) => onFiltersChange(filters.map((f) => f.id === id ? { ...f, [key]: val } : f))
  const removeFilter = (id: string) => onFiltersChange(filters.filter((f) => f.id !== id))
  const clearFilters = () => onFiltersChange([])
  const saveNow = () => { if (!viewName.trim()) return; onSaveView(viewName.trim()); setSaving(false); setViewName('') }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => onSearch(e.target.value)}
            className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Buscar em todas as colunas..." />
        </div>

        <button onClick={() => { setShowFilters((v) => !v); setShowViews(false); if (!filters.length) addFilter() }}
          className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
            showFilters || activeFiltersCount > 0 ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
          {activeFiltersCount > 0 && <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{activeFiltersCount}</span>}
        </button>

        <div ref={viewsRef} className="relative">
          <button onClick={() => { setShowViews((v) => !v); setShowFilters(false) }}
            className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
              activeViewId ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
            <LayoutList className="h-3.5 w-3.5" />{activeViewId ? activeViewName : 'Visões'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', showViews && 'rotate-180')} />
          </button>
          {showViews && (
            <div className="glass absolute left-0 top-full mt-1.5 z-50 w-56 rounded-xl py-1">
              <button onClick={() => { onSelectView(null); setShowViews(false) }} className={cn('flex w-full items-center gap-3 px-3 py-2 text-xs transition-colors', !activeViewId ? 'text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                <Check className={cn('h-3.5 w-3.5 shrink-0', !activeViewId ? 'opacity-100' : 'opacity-0')} /><span>Todos</span>
              </button>
              {views.length > 0 && <div className="my-1 h-px bg-border" />}
              {views.map((v) => (
                <div key={v.id} className="group/item flex items-center">
                  <button onClick={() => { onSelectView(v.id); setShowViews(false) }} className={cn('flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-xs transition-colors', activeViewId === v.id ? 'text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                    <Check className={cn('h-3.5 w-3.5 shrink-0', activeViewId === v.id ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{v.name}</span>
                  </button>
                  <button onClick={(e) => onDeleteView(e, v.id)} className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-all"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {saving ? (
          <div className="flex items-center gap-1">
            <input ref={saveInputRef} value={viewName} onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveNow(); if (e.key === 'Escape') { setSaving(false); setViewName('') } }}
              placeholder="Nome da visão..."
              className="h-7 w-40 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            <button onClick={saveNow} disabled={!viewName.trim()} className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setSaving(false); setViewName('') }} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => { setSaving(true); setShowViews(false) }}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
            <Bookmark className="h-3.5 w-3.5" />Salvar visão
          </button>
        )}

        {configSlot && <div className="ml-auto">{configSlot}</div>}

        <button onClick={onExport} disabled={exportDisabled}
          className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors', !configSlot && 'ml-auto')}>
          <FileDown className="h-3.5 w-3.5" />Exportar
        </button>

        <p className="text-[11px] text-muted-foreground">
          {busy ? '…' : filteredCount === totalCount ? <>{totalCount} registro{totalCount !== 1 ? 's' : ''}</> : <>{filteredCount} de {totalCount} registro{totalCount !== 1 ? 's' : ''}</>}
        </p>
      </div>

      {showFilters && (
        <div className="rounded-lg border bg-card p-3 space-y-2.5">
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
                <select value={f.col} onChange={(e) => updateFilter(f.id, 'col', e.target.value)} className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={f.op} onChange={(e) => updateFilter(f.id, 'op', e.target.value)} className="h-7 w-36 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {operators.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={f.value} onChange={(e) => updateFilter(f.id, 'value', e.target.value)} placeholder="Valor..."
                  className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button onClick={addFilter} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar condição</button>
            {activeFiltersCount > 0 && <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar filtros</button>}
          </div>
        </div>
      )}
    </div>
  )
}
