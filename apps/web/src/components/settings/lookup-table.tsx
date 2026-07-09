'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  ChevronLeft, Search, ArrowUp, ArrowDown, ChevronsUpDown, FileDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLookupTable, type LookupEntry } from '@/hooks/use-lookup-table'

const inputCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

interface SelectFieldConfig {
  field: 'origem' | 'classificacao' | 'efeito'
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
  /** Limite de caracteres do Código (ex.: 15). Sem limite quando ausente. */
  codeMaxLength?: number
  /** Restringe o Código a caracteres alfanuméricos (A-Z, a-z, 0-9). */
  codeAlnum?: boolean
  /** Coluna de seleção opcional gravada em `entry.origem` (ex.: origem do papel). */
  selectField?: SelectFieldConfig
}

type SortCol = 'code' | 'label' | 'origem'
interface SortState { col: SortCol; dir: 'asc' | 'desc' }
type StatusFilter = 'all' | 'active' | 'inactive'

export function LookupTablePage({
  title, description, icon: Icon, storageKey, initialData,
  withCode = false, codeLabel = 'Código', codePlaceholder = 'Ex: BRL',
  codeMaxLength, codeAlnum = false,
  selectField,
}: LookupTablePageProps) {
  /** Normaliza o Código conforme as regras da tabela (alfanumérico e/ou limite de tamanho). */
  const sanitizeCode = (v: string) => {
    let s = v
    if (codeAlnum) s = s.replace(/[^A-Za-z0-9]/g, '')
    if (codeMaxLength) s = s.slice(0, codeMaxLength)
    return s
  }
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const pathname = usePathname()
  // Destino do "voltar" = hub pai (um nível acima na URL). Ex.: /settings/tabelas/paises → /settings/tabelas
  const backHref = pathname.split('/').slice(0, -1).join('/') || '/settings'

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

  // toolbar: busca, ordenação, filtro de status
  // Padrão: ordem alfabética por Nome (asc). O usuário ainda pode reordenar/limpar clicando nos cabeçalhos.
  const [search, setSearch] = useState('')
  const [sort,   setSort]   = useState<SortState | null>({ col: 'label', dir: 'asc' })
  const [status, setStatus] = useState<StatusFilter>('all')

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

  const handleSort = (col: SortCol) =>
    setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const sortVal = (e: LookupEntry, col: SortCol): string => {
    if (col === 'code')   return e.code ?? ''
    if (col === 'origem') return origemLabel(selectField ? (e[selectField.field] as string | undefined) : undefined)
    return e.label
  }

  /** Linhas exibidas: busca + filtro de status + ordenação (sobre os dados completos). */
  const displayed = useMemo(() => {
    let rows = [...entries]
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(e =>
      e.label.toLowerCase().includes(q) ||
      (e.code ?? '').toLowerCase().includes(q) ||
      (selectField ? origemLabel(e[selectField.field] as string | undefined).toLowerCase().includes(q) : false),
    )
    if (status === 'active')   rows = rows.filter(e => e.active)
    if (status === 'inactive') rows = rows.filter(e => !e.active)
    if (sort) rows.sort((a, b) => {
      const cmp = sortVal(a, sort.col).localeCompare(sortVal(b, sort.col), 'pt-BR', { sensitivity: 'base', numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [entries, search, status, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    const ExcelJS = (await import('exceljs')).default
    const headers = ['#', ...(withCode ? [codeLabel] : []), 'Nome', ...(selectField ? [selectField.label] : []), 'Ativo']
    const wb = new ExcelJS.Workbook(); wb.creator = 'Nxt'
    const ws = wb.addWorksheet(title.slice(0, 31))

    ws.addRow([title]); ws.mergeCells(1, 1, 1, headers.length)
    const t = ws.getCell('A1'); t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; t.alignment = { vertical: 'middle', horizontal: 'center' }; ws.getRow(1).height = 26

    const hr = ws.addRow(headers)
    hr.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: 'FF4338CA' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFA5B4FC' } } } })
    ws.getRow(2).height = 18

    displayed.forEach((e, i) => {
      const row = ws.addRow([
        i + 1,
        ...(withCode ? [e.code ?? ''] : []),
        e.label,
        ...(selectField ? [origemLabel(e[selectField.field] as string | undefined)] : []),
        e.active ? 'Sim' : 'Não',
      ])
      row.eachCell(c => { c.font = { size: 10 } }); row.height = 16
    })
    ws.columns.forEach((col, i) => { col.width = Math.min((headers[i]?.length ?? 10) + 10, 50) })

    const buf = await wb.xlsx.writeBuffer()
    const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `${slug || 'tabela'}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
  }

  const colCount = 4 + (withCode ? 1 : 0) + (selectField ? 1 : 0)
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
        {mounted && !adding && (
          <button type="button" onClick={() => { setAdding(true); setLabelErr('') }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />Adicionar
          </button>
        )}
      </div>

      {/* toolbar: buscar · filtro de status · exportar */}
      {mounted && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
          </div>

          <div className="flex rounded-md border overflow-hidden">
            {([['all', 'Todos'], ['active', 'Ativos'], ['inactive', 'Inativos']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setStatus(v)}
                className={cn('px-2.5 h-7 text-xs font-medium transition-colors', status === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                {l}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => { void handleExport() }} disabled={displayed.length === 0}
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
              <div className="h-3 w-4 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /><div className="h-5 w-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-12rem)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 [&_th]:bg-muted">
              <tr className="border-b">
                <th className="text-left px-4 py-1.5 font-medium text-muted-foreground w-8">#</th>
                {withCode && <ThSort col="code" label={codeLabel} className="w-28" />}
                <ThSort col="label" label="Nome" />
                {selectField && <ThSort col="origem" label={selectField.label} className="w-56" />}
                <th className="text-center px-3 py-1.5 font-medium text-muted-foreground w-20">Ativo</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>

              {/* linha de adição */}
              {adding && (
                <tr className="border-b bg-primary/5">
                  <td className="px-4 py-1 text-muted-foreground">—</td>
                  {withCode && (
                    <td className="px-3 py-1">
                      <input value={newCode} onChange={e => setNewCode(sanitizeCode(e.target.value))} maxLength={codeMaxLength}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                        placeholder={codePlaceholder} className={inputCls} autoFocus={withCode} />
                    </td>
                  )}
                  <td className="px-3 py-1">
                    <div className="space-y-1">
                      <input value={newLabel} onChange={e => { setNewLabel(e.target.value); setLabelErr('') }}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                        placeholder="Nome do registro..." className={cn(inputCls, labelErr && 'border-red-400')} autoFocus={!withCode} />
                      {labelErr && <p className="text-[11px] text-red-500">{labelErr}</p>}
                    </div>
                  </td>
                  {selectField && (
                    <td className="px-3 py-1">
                      <select value={newOrigem} onChange={e => setNewOrigem(e.target.value)} className={inputCls}>
                        {selectField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  )}
                  <td />
                  <td className="px-3 py-1">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={handleAdd} title="Confirmar" className="flex h-6 w-6 items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={cancelAdd} title="Cancelar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}

              {entries.length === 0 && !adding ? (
                <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">Nenhum registro. Clique em &ldquo;Adicionar&rdquo; para criar o primeiro.</td></tr>
              ) : displayed.length === 0 && !adding ? (
                <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">Nenhum resultado para a busca/filtro.</td></tr>
              ) : displayed.map((entry, idx) => (
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-b last:border-0 bg-primary/5">
                    <td className="px-4 py-1 text-muted-foreground">{idx + 1}</td>
                    {withCode && (
                      <td className="px-3 py-1">
                        <input value={editCode} onChange={e => setEditCode(sanitizeCode(e.target.value))} maxLength={codeMaxLength}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                          placeholder={codePlaceholder} className={inputCls} autoFocus={withCode} />
                      </td>
                    )}
                    <td className="px-3 py-1">
                      <div className="space-y-1">
                        <input value={editLabel} onChange={e => { setEditLabel(e.target.value); setEditErr('') }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                          placeholder="Nome..." className={cn(inputCls, editErr && 'border-red-400')} autoFocus={!withCode} />
                        {editErr && <p className="text-[11px] text-red-500">{editErr}</p>}
                      </div>
                    </td>
                    {selectField && (
                      <td className="px-3 py-1">
                        <select value={editOrigem} onChange={e => setEditOrigem(e.target.value)} className={inputCls}>
                          {selectField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                    )}
                    <td />
                    <td className="px-3 py-1">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={saveEdit} title="Salvar" className="flex h-6 w-6 items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingId(null)} title="Cancelar" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors group/row', !entry.active && 'opacity-50')}>
                    <td className="px-4 py-1 text-muted-foreground tabular-nums">{idx + 1}</td>
                    {withCode && <td className="px-3 py-1 font-mono text-muted-foreground">{entry.code ?? '—'}</td>}
                    <td className="px-3 py-1 font-medium">{entry.label}</td>
                    {selectField && <td className="px-3 py-1 text-muted-foreground">{origemLabel(selectField ? (entry[selectField.field] as string | undefined) : undefined)}</td>}
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
          </table>
          </div>
        </div>
      )}

      {mounted && (
        <p className="text-[11px] text-muted-foreground text-center">
          {displayed.length === entries.length
            ? <>{entries.length} registro{entries.length !== 1 ? 's' : ''} · {activeCount} ativo{activeCount !== 1 ? 's' : ''}</>
            : <>{displayed.length} de {entries.length} registro{entries.length !== 1 ? 's' : ''}</>}
        </p>
      )}
    </div>
  )
}
