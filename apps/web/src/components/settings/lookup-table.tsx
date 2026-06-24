'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLookupTable, type LookupEntry } from '@/hooks/use-lookup-table'

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

interface SelectFieldConfig {
  field: 'origem' | 'classificacao'
  label: string
  options: { value: string; label: string }[]
  default: string
}

interface LookupTablePageProps {
  title: string
  description: string
  icon: React.ElementType
  storageKey: string
  initialData: LookupEntry[]
  withCode?: boolean
  codeLabel?: string
  codePlaceholder?: string
  /** Coluna de seleção opcional gravada em `entry.origem` (ex.: origem do papel). */
  selectField?: SelectFieldConfig
}

export function LookupTablePage({
  title, description, icon: Icon, storageKey, initialData,
  withCode = false, codeLabel = 'Código', codePlaceholder = 'Ex: BRL',
  selectField,
}: LookupTablePageProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { entries, add, remove, update, toggle } = useLookupTable(storageKey, initialData)

  const [adding,    setAdding]    = useState(false)
  const [newLabel,  setNewLabel]  = useState('')
  const [newCode,   setNewCode]   = useState('')
  const [newOrigem, setNewOrigem] = useState(selectField?.default ?? '')
  const [labelErr,  setLabelErr]  = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editCode,  setEditCode]  = useState('')
  const [editOrigem, setEditOrigem] = useState(selectField?.default ?? '')
  const [editErr,   setEditErr]   = useState('')

  const origemLabel = (v?: string) => selectField?.options.find(o => o.value === v)?.label ?? '—'

  const handleAdd = () => {
    if (!newLabel.trim()) { setLabelErr('Obrigatório'); return }
    if (entries.some(e => e.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      setLabelErr('Já existe um registro com este nome'); return
    }
    add({ label: newLabel.trim(), code: newCode.trim() || undefined, active: true, ...(selectField ? ({ [selectField.field]: newOrigem } as Partial<LookupEntry>) : {}) })
    setNewLabel(''); setNewCode(''); setNewOrigem(selectField?.default ?? ''); setAdding(false); setLabelErr('')
  }

  const startEdit = (e: LookupEntry) => {
    setEditingId(e.id); setEditLabel(e.label); setEditCode(e.code ?? ''); setEditOrigem((selectField ? (e[selectField.field] as string | undefined) : undefined) ?? selectField?.default ?? ''); setEditErr('')
  }

  const saveEdit = () => {
    if (!editLabel.trim()) { setEditErr('Obrigatório'); return }
    if (entries.some(e => e.id !== editingId && e.label.toLowerCase() === editLabel.trim().toLowerCase())) {
      setEditErr('Já existe um registro com este nome'); return
    }
    update(editingId!, { label: editLabel.trim(), code: editCode.trim() || undefined, ...(selectField ? ({ [selectField.field]: editOrigem } as Partial<LookupEntry>) : {}) })
    setEditingId(null); setEditErr('')
  }

  const cancelAdd = () => { setAdding(false); setNewLabel(''); setNewCode(''); setNewOrigem(selectField?.default ?? ''); setLabelErr('') }

  const colCount = 4 + (withCode ? 1 : 0) + (selectField ? 1 : 0)

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        {mounted && !adding && (
          <button type="button" onClick={() => { setAdding(true); setLabelErr('') }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />Adicionar
          </button>
        )}
      </div>

      {!mounted ? (
        <div className="rounded-lg border bg-card overflow-hidden animate-pulse">
          <div className="h-9 bg-muted/40 border-b" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 border-b last:border-0 flex items-center px-4 gap-4">
              <div className="h-3 w-4 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /><div className="h-5 w-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-8">#</th>
                {withCode && <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">{codeLabel}</th>}
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                {selectField && <th className="text-left px-3 py-2 font-medium text-muted-foreground w-56">{selectField.label}</th>}
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Ativo</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>

              {/* linha de adição */}
              {adding && (
                <tr className="border-b bg-primary/5">
                  <td className="px-4 py-2 text-muted-foreground">—</td>
                  {withCode && (
                    <td className="px-3 py-2">
                      <input value={newCode} onChange={e => setNewCode(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                        placeholder={codePlaceholder} className={inputCls} autoFocus={withCode} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <input value={newLabel} onChange={e => { setNewLabel(e.target.value); setLabelErr('') }}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                        placeholder="Nome do registro..." className={cn(inputCls, labelErr && 'border-red-400')} autoFocus={!withCode} />
                      {labelErr && <p className="text-[11px] text-red-500">{labelErr}</p>}
                    </div>
                  </td>
                  {selectField && (
                    <td className="px-3 py-2">
                      <select value={newOrigem} onChange={e => setNewOrigem(e.target.value)} className={inputCls}>
                        {selectField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  )}
                  <td />
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={handleAdd} title="Confirmar" className="flex h-6 w-6 items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={cancelAdd} title="Cancelar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}

              {entries.length === 0 && !adding ? (
                <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">Nenhum registro. Clique em &ldquo;Adicionar&rdquo; para criar o primeiro.</td></tr>
              ) : entries.map((entry, idx) => (
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-b last:border-0 bg-primary/5">
                    <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                    {withCode && (
                      <td className="px-3 py-2">
                        <input value={editCode} onChange={e => setEditCode(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                          placeholder={codePlaceholder} className={inputCls} autoFocus={withCode} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <input value={editLabel} onChange={e => { setEditLabel(e.target.value); setEditErr('') }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                          placeholder="Nome..." className={cn(inputCls, editErr && 'border-red-400')} autoFocus={!withCode} />
                        {editErr && <p className="text-[11px] text-red-500">{editErr}</p>}
                      </div>
                    </td>
                    {selectField && (
                      <td className="px-3 py-2">
                        <select value={editOrigem} onChange={e => setEditOrigem(e.target.value)} className={inputCls}>
                          {selectField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                    )}
                    <td />
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={saveEdit} title="Salvar" className="flex h-6 w-6 items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingId(null)} title="Cancelar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors group/row', !entry.active && 'opacity-50')}>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{idx + 1}</td>
                    {withCode && <td className="px-3 py-2.5 font-mono text-muted-foreground">{entry.code ?? '—'}</td>}
                    <td className="px-3 py-2.5 font-medium">{entry.label}</td>
                    {selectField && <td className="px-3 py-2.5 text-muted-foreground">{origemLabel(selectField ? (entry[selectField.field] as string | undefined) : undefined)}</td>}
                    <td className="px-3 py-2.5 text-center">
                      <button type="button" onClick={() => toggle(entry.id)} title={entry.active ? 'Desativar' : 'Ativar'} className="inline-flex items-center justify-center transition-colors">
                        {entry.active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button type="button" onClick={() => startEdit(entry)} title="Editar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => remove(entry.id)} title="Excluir" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mounted && (
        <p className="text-[11px] text-muted-foreground text-center">
          {entries.length} registro{entries.length !== 1 ? 's' : ''} · {entries.filter(e => e.active).length} ativo{entries.filter(e => e.active).length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
