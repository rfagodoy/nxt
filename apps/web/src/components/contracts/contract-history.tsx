'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, CheckCircle2, RotateCcw, RotateCw, Lock, XCircle,
  FilePlus2, Banknote, Paperclip, RefreshCw, Loader2, Clock,
  SlidersHorizontal, X, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'

/* espelha o ContractAuditLog do backend */
interface AuditChange { field: string; label: string; before: string; after: string }
interface AuditEntry  { id: string; createdAt: string; user: string; event: string; motivo: string | null; changes: AuditChange[] }

const EVENT_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  CRIADO:     { label: 'Contrato criado',       color: 'emerald', icon: Plus },
  ATUALIZADO: { label: 'Atualização',           color: 'blue',    icon: Pencil },
  ATIVADO:    { label: 'Contrato ativado',      color: 'emerald', icon: CheckCircle2 },
  RENOVADO:   { label: 'Renovado automaticamente', color: 'teal', icon: RotateCw },
  EM_REVISAO: { label: 'Aberto para revisão',   color: 'amber',   icon: RotateCcw },
  ENCERRADO:  { label: 'Contrato encerrado',    color: 'gray',    icon: Lock },
  RESCINDIDO: { label: 'Contrato rescindido',   color: 'red',     icon: XCircle },
  ADITIVO:    { label: 'Termo aditivo',         color: 'purple',  icon: FilePlus2 },
  REAJUSTE:   { label: 'Reajuste aplicado',     color: 'amber',   icon: RefreshCw },
  LANCAMENTO: { label: 'Lançamento financeiro', color: 'teal',    icon: Banknote },
  DOCUMENTO:  { label: 'Documento',             color: 'slate',   icon: Paperclip },
}
const FALLBACK = { label: 'Alteração', color: 'blue', icon: Pencil }
const DOT_CLS: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red:     'bg-red-500/10 text-red-600 dark:text-red-500',
  purple:  'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  teal:    'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  slate:   'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  gray:    'bg-gray-500/10 text-gray-600 dark:text-gray-400',
}

/* filtros por-coluna (client-side, mesma mecânica da tabela de Parceiros) */
const HIST_COLUMNS = [
  { key: 'eventLabel', label: 'Evento'         },
  { key: 'ts',         label: 'Data / Hora'    },
  { key: 'user',       label: 'Usuário'        },
  { key: 'label',      label: 'Campo'          },
  { key: 'before',     label: 'Valor anterior' },
  { key: 'after',      label: 'Novo valor'     },
]
const OPERATORS = [
  { value: 'contains', label: 'Contém' }, { value: 'notContains', label: 'Não contém' },
  { value: 'eq', label: 'Igual a' }, { value: 'neq', label: 'Diferente de' },
  { value: 'startsWith', label: 'Começa com' }, { value: 'endsWith', label: 'Termina com' },
  { value: 'gt', label: 'Maior que' }, { value: 'lt', label: 'Menor que' },
]
function matchAudit(cell: string, op: string, raw: string): boolean {
  const c = cell.toLowerCase(), v = raw.toLowerCase()
  const nc = Number(cell.replace(/\./g, '').replace(',', '.')), nv = Number(raw.replace('.', '').replace(',', '.'))
  const bothNum = cell.trim() !== '' && raw.trim() !== '' && !Number.isNaN(nc) && !Number.isNaN(nv)
  switch (op) {
    case 'eq':          return c === v
    case 'neq':         return c !== v
    case 'startsWith':  return c.startsWith(v)
    case 'endsWith':    return c.endsWith(v)
    case 'notContains': return !c.includes(v)
    case 'gt':          return bothNum ? nc > nv : c > v
    case 'lt':          return bothNum ? nc < nv : c < v
    default:            return c.includes(v)
  }
}
const fmtTs = (ts: string) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const selCls = 'h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** Histórico de auditoria do contrato — tabela filtrável (padrão Parceiros) com ícone de evento por linha. */
export function ContractHistory({ contractId }: { contractId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/contracts/${contractId}/audit`)
      if (res.ok) setEntries(await res.json() as AuditEntry[])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [contractId])
  useEffect(() => { void load() }, [load])

  /* cada alteração vira uma linha (evento/data/usuário repetidos, como em Parceiros) */
  const rows = entries.flatMap(e => {
    const meta = EVENT_META[e.event] ?? FALLBACK
    return (e.changes ?? []).map((c, i) => ({
      key: `${e.id}_${i}`, ts: e.createdAt, user: e.user,
      eventLabel: meta.label, color: meta.color, Icon: meta.icon,
      motivo: c.field === 'situacao' ? e.motivo : null,
      label: c.label, before: c.before, after: c.after,
    }))
  })

  const [showFilters, setShowFilters] = useState(false)
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [filters, setFilters] = useState<{ id: string; col: string; op: string; value: string }[]>([])
  const addFilter    = () => setFilters(p => [...p, { id: `hf${p.length}_${rows.length}`, col: 'label', op: 'contains', value: '' }])
  const removeFilter = (id: string) => setFilters(p => p.filter(f => f.id !== id))
  const updateFilter = (id: string, k: 'col' | 'op' | 'value', val: string) => setFilters(p => p.map(f => f.id === id ? { ...f, [k]: val } : f))

  const active = filters.filter(f => f.value.trim())
  const filtered = rows.filter(r => {
    if (!active.length) return true
    const cellOf = (col: string) => col === 'ts' ? fmtTs(r.ts) : String((r as Record<string, unknown>)[col] ?? '')
    const res = active.map(f => matchAudit(cellOf(f.col), f.op, f.value.trim()))
    return logic === 'AND' ? res.every(Boolean) : res.some(Boolean)
  })

  if (loading && entries.length === 0) return <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando histórico...</div>
  if (entries.length === 0) return (
    <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
      <Clock className="h-8 w-8 opacity-40" /><p className="text-xs">Nenhuma alteração registrada ainda.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setShowFilters(v => !v); if (!filters.length) addFilter() }}
          className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
            showFilters || active.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
          {active.length > 0 && <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{active.length}</span>}
        </button>
        {active.length > 0 && <button type="button" onClick={() => setFilters([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar</button>}
        <button type="button" onClick={() => void load()} title="Atualizar" className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />Atualizar
        </button>
        <p className="ml-auto text-[11px] text-muted-foreground tabular-nums">{filtered.length} de {rows.length}</p>
      </div>

      {/* painel de filtros */}
      {showFilters && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Combinar condições com:</span>
            <div className="flex overflow-hidden rounded-md border">
              {(['AND', 'OR'] as const).map(l => (
                <button key={l} type="button" onClick={() => setLogic(l)}
                  className={cn('px-3 py-1 text-xs font-semibold transition-colors', logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>{l === 'AND' ? 'E' : 'OU'}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {filters.map((f, idx) => (
              <div key={f.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{idx === 0 ? 'Se' : logic === 'AND' ? 'E' : 'OU'}</span>
                <select value={f.col} onChange={e => updateFilter(f.id, 'col', e.target.value)} className={cn(selCls, 'w-36')}>{HIST_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                <select value={f.op} onChange={e => updateFilter(f.id, 'op', e.target.value)} className={cn(selCls, 'w-36')}>{OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                <input value={f.value} onChange={e => updateFilter(f.id, 'value', e.target.value)} placeholder="Valor..." className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <button type="button" onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addFilter} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar condição</button>
        </div>
      )}

      {/* tabela */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-[hsl(240_5%_97%)] dark:bg-[hsl(240_21%_15%)]">
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Evento</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Data / Hora</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Usuário</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Campo</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Valor anterior</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Novo valor</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum evento com os filtros aplicados.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.key} className="border-b last:border-0 align-top hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', DOT_CLS[r.color])}><r.Icon className="h-3 w-3" /></span>
                    <span className="font-medium">{r.eventLabel}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">{fmtTs(r.ts)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{r.user}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{r.label}</td>
                <td className="px-3 py-1.5 text-muted-foreground/60 line-through">{r.before}</td>
                <td className="px-3 py-1.5">
                  <span className="font-medium">{r.after}</span>
                  {r.motivo && <span className="mt-0.5 block text-[11px] italic text-muted-foreground">motivo: {r.motivo}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
