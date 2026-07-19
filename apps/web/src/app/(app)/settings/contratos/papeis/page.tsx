'use client'

import { useState, useMemo } from 'react'
import {
  UserCheck, Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { useLookupTable, type LookupEntry } from '@/hooks/use-lookup-table'
import { SettingsTableShell, type StatusFilter } from '@/components/settings/settings-table-shell'
import {
  REFERENCIA, ORIGEM_OPTIONS, ORIGEM_OPTIONS_ENTIDADE, ORIGEM_OPTIONS_PESSOA,
  referenciaDoPapelEntry, INIT_PAPEIS, PAPEIS_KEY,
} from '@/lib/contract-roles'

const inputCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

const REF_OPTIONS = [
  { value: REFERENCIA.ENTIDADE, label: 'Entidade' },
  { value: REFERENCIA.PESSOA,   label: 'Pessoa' },
]
const refLabel = (v?: string) => REF_OPTIONS.find(o => o.value === (v ?? REFERENCIA.ENTIDADE))?.label ?? 'Entidade'
const origemLabel = (v?: string) => ORIGEM_OPTIONS.find(o => o.value === v)?.label ?? '—'
/** Opções de origem conforme a referência (rótulo do campo muda de sentido). */
const origemOptionsFor = (ref: string) => ref === REFERENCIA.PESSOA ? ORIGEM_OPTIONS_PESSOA : ORIGEM_OPTIONS_ENTIDADE
const origemFieldLabel = (ref: string) => ref === REFERENCIA.PESSOA ? 'Aparece no cadastro de' : 'Busca a entidade em'

type SortCol = 'label' | 'referencia' | 'origem'
interface SortState { col: SortCol; dir: 'asc' | 'desc' }

/** Rascunho de edição/criação de um papel. */
interface Draft { label: string; referencia: string; origem: string }
const emptyDraft = (): Draft => ({ label: '', referencia: REFERENCIA.ENTIDADE, origem: ORIGEM_OPTIONS_ENTIDADE[0].value })

export default function PapeisPage() {
  const { entries, add, remove, update, toggle } = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [addErr, setAddErr] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())
  const [editErr, setEditErr] = useState('')

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>({ col: 'label', dir: 'asc' })
  const [status, setStatus] = useState<StatusFilter>('all')

  /** Ao trocar a referência, garante que a origem seja válida para o novo contexto. */
  const withRef = (d: Draft, ref: string): Draft => {
    const opts = origemOptionsFor(ref)
    const origem = opts.some(o => o.value === d.origem) ? d.origem : opts[0].value
    return { ...d, referencia: ref, origem }
  }

  const dup = (label: string, exceptId?: string) =>
    entries.some(e => e.id !== exceptId && e.label.toLowerCase() === label.trim().toLowerCase())

  const handleAdd = () => {
    if (!draft.label.trim()) { setAddErr('Obrigatório'); return }
    if (dup(draft.label)) { setAddErr('Já existe um papel com este nome'); return }
    add({ label: draft.label.trim(), referencia: draft.referencia, origem: draft.origem, active: true } as Omit<LookupEntry, 'id'>)
    setDraft(emptyDraft()); setAdding(false); setAddErr('')
  }
  const cancelAdd = () => { setAdding(false); setDraft(emptyDraft()); setAddErr('') }

  const startEdit = (e: LookupEntry) => {
    setEditingId(e.id)
    setEditDraft({ label: e.label, referencia: referenciaDoPapelEntry(e), origem: e.origem ?? ORIGEM_OPTIONS_ENTIDADE[0].value })
    setEditErr('')
  }
  const saveEdit = () => {
    if (!editDraft.label.trim()) { setEditErr('Obrigatório'); return }
    if (dup(editDraft.label, editingId!)) { setEditErr('Já existe um papel com este nome'); return }
    update(editingId!, { label: editDraft.label.trim(), referencia: editDraft.referencia, origem: editDraft.origem })
    setEditingId(null); setEditErr('')
  }

  const handleSort = (col: SortCol) =>
    setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)
  const sortVal = (e: LookupEntry, col: SortCol): string =>
    col === 'referencia' ? refLabel(referenciaDoPapelEntry(e)) : col === 'origem' ? origemLabel(e.origem) : e.label

  const displayed = useMemo(() => {
    let rows = [...entries]
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(e =>
      e.label.toLowerCase().includes(q) ||
      refLabel(referenciaDoPapelEntry(e)).toLowerCase().includes(q) ||
      origemLabel(e.origem).toLowerCase().includes(q))
    if (status === 'active') rows = rows.filter(e => e.active)
    if (status === 'inactive') rows = rows.filter(e => !e.active)
    if (sort) rows.sort((a, b) => {
      const cmp = sortVal(a, sort.col).localeCompare(sortVal(b, sort.col), 'pt-BR', { sensitivity: 'base', numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [entries, search, status, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    await exportExcel({
      fileName: 'papeis', sheet: 'Papéis', title: 'Papéis',
      columns: [
        { header: '#', width: 6, align: 'center' },
        { header: 'Nome' }, { header: 'Referência', width: 16 }, { header: 'Origem', width: 30 },
        { header: 'Ativo', width: 10, align: 'center' },
      ],
      rows: displayed.map((e, i) => [
        i + 1, e.label, refLabel(referenciaDoPapelEntry(e)), origemLabel(e.origem), e.active ? 'Sim' : 'Não',
      ]),
    })
  }

  const activeCount = entries.filter(e => e.active).length

  function SortIcon({ col }: { col: SortCol }) {
    if (!sort || sort.col !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover/h:opacity-70 transition-opacity" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  }
  const ThSort = ({ col, label, className }: { col: SortCol; label: string; className?: string }) => (
    <th className={cn('text-left px-3 py-1.5 font-medium text-muted-foreground', className)}>
      <button type="button" onClick={() => handleSort(col)} className="group/h inline-flex items-center hover:text-foreground transition-colors">
        {label}<SortIcon col={col} />
      </button>
    </th>
  )

  /** Editor de um rascunho (referência + origem condicional), reutilizado em adicionar/editar. */
  const DraftRow = ({ d, set, err, onOk, onCancel, idx }: {
    d: Draft; set: (d: Draft) => void; err: string; onOk: () => void; onCancel: () => void; idx: string
  }) => (
    <tr className="border-b bg-primary/5 align-top">
      <td className="px-4 py-1.5 text-muted-foreground">{idx}</td>
      <td className="px-3 py-1.5">
        <div className="space-y-1">
          <input value={d.label} onChange={e => set({ ...d, label: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel() }}
            placeholder="Nome do papel..." className={cn(inputCls, err && 'border-red-400')} autoFocus />
          {err && <p className="text-[11px] text-red-500">{err}</p>}
        </div>
      </td>
      <td className="px-3 py-1.5">
        <select value={d.referencia} onChange={e => set(withRef(d, e.target.value))} className={inputCls}>
          {REF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <label className="block text-[10px] text-muted-foreground mb-0.5">{origemFieldLabel(d.referencia)}</label>
        <select value={d.origem} onChange={e => set({ ...d, origem: e.target.value })} className={inputCls}>
          {origemOptionsFor(d.referencia).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td />
      <td className="px-3 py-1.5">
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={onOk} title="Confirmar" className="flex h-6 w-6 items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onCancel} title="Cancelar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
        </div>
      </td>
    </tr>
  )

  return (
    <SettingsTableShell
      title="Papéis"
      description="Funções exercidas por entidades (partes do contrato) ou por pessoas (responsáveis) em cada cadastro"
      icon={UserCheck}
      headerAction={!adding ? (
        <button type="button" onClick={() => { setAdding(true); setAddErr('') }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />Adicionar
        </button>
      ) : undefined}
      search={search} onSearchChange={setSearch} searchPlaceholder="Buscar papel..."
      status={status} onStatusChange={setStatus}
      onExport={handleExport} exportDisabled={displayed.length === 0}
      footer={displayed.length === entries.length
        ? <>{entries.length} papel{entries.length !== 1 ? 'is' : ''} · {activeCount} ativo{activeCount !== 1 ? 's' : ''}</>
        : <>{displayed.length} de {entries.length} papéis</>}
    >
      <thead className="sticky top-0 z-10 [&_th]:bg-muted">
        <tr className="border-b">
          <th className="text-left px-4 py-1.5 font-medium text-muted-foreground w-8">#</th>
          <ThSort col="label" label="Nome" />
          <ThSort col="referencia" label="Referência" className="w-32" />
          <ThSort col="origem" label="Origem" className="w-64" />
          <th className="text-center px-3 py-1.5 font-medium text-muted-foreground w-20">Ativo</th>
          <th className="w-20" />
        </tr>
      </thead>
      <tbody>
        {adding && <DraftRow d={draft} set={setDraft} err={addErr} onOk={handleAdd} onCancel={cancelAdd} idx="—" />}

        {entries.length === 0 && !adding ? (
          <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum papel. Clique em &ldquo;Adicionar&rdquo; para criar o primeiro.</td></tr>
        ) : displayed.length === 0 && !adding ? (
          <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum resultado para a busca/filtro.</td></tr>
        ) : displayed.map((entry, idx) => (
          editingId === entry.id ? (
            <DraftRow key={entry.id} d={editDraft} set={setEditDraft} err={editErr} onOk={saveEdit} onCancel={() => setEditingId(null)} idx={String(idx + 1)} />
          ) : (
            <tr key={entry.id} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors group/row', !entry.active && 'opacity-50')}>
              <td className="px-4 py-1 text-muted-foreground tabular-nums">{idx + 1}</td>
              <td className="px-3 py-1 font-medium">{entry.label}</td>
              <td className="px-3 py-1">
                <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
                  referenciaDoPapelEntry(entry) === REFERENCIA.PESSOA
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    : 'bg-violet-500/10 text-violet-600 dark:text-violet-400')}>
                  {refLabel(referenciaDoPapelEntry(entry))}
                </span>
              </td>
              <td className="px-3 py-1 text-muted-foreground">{origemLabel(entry.origem)}</td>
              <td className="px-3 py-1 text-center">
                <button type="button" onClick={() => toggle(entry.id)} title={entry.active ? 'Desativar' : 'Ativar'} className="inline-flex items-center justify-center transition-colors">
                  {entry.active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>
              </td>
              <td className="px-3 py-1">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button type="button" onClick={() => startEdit(entry)} title="Editar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => remove(entry.id)} title="Excluir" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </td>
            </tr>
          )
        ))}
      </tbody>
    </SettingsTableShell>
  )
}
