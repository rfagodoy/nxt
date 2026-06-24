'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Building2, Plus, Pencil, Trash2, X, ChevronRight, ChevronDown,
  Network, CornerDownRight, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLookupTable, type LookupEntry } from '@/hooks/use-lookup-table'
import { TIPOS_UNIDADE_KEY, INIT_TIPOS_UNIDADE, CLASS_COLOR } from '@/lib/unit-types'

/* ─── config ─────────────────────────────────────────────── */

const API = () => process.env.NEXT_PUBLIC_API_URL ?? ''
const ORG = () => process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev'

/** Aparência (cor + rótulos) de uma unidade a partir do seu tipo configurável. */
function unitTypeView(typeMap: Record<string, LookupEntry>, natureza: string) {
  const type = typeMap[natureza]
  const cls  = CLASS_COLOR[type?.classificacao ?? 'NEUTRO'] ?? CLASS_COLOR.NEUTRO
  return { nome: type?.label ?? natureza, dot: cls.dot, classLabel: cls.label }
}

/** Código manual: alfanumérico, até 15 posições. */
const alnum15 = (v: string) => v.replace(/[^A-Za-z0-9]/g, '').slice(0, 15)

const STATUS = [
  { value: 'ATIVA',   label: 'Ativa'   },
  { value: 'INATIVA', label: 'Inativa' },
]

/* ─── tipos ──────────────────────────────────────────────── */

interface Company {
  id: string; codigo?: string | null; razaoSocial: string; nomeFantasia?: string | null
  cnpj?: string | null; status: string; unidades?: number
}
interface Unit {
  id: string; groupCompanyId: string; parentId?: string | null
  natureza: string; codigo?: string | null; nome: string
  responsavel?: string | null; status: string; childrenCount?: number
}
interface FlatRow { unit: Unit; depth: number; expanded: boolean }

/* ─── helper de API ──────────────────────────────────────── */

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API()}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

/* ─── estilos comuns ─────────────────────────────────────── */

const inputCls  = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
const labelCls  = 'block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'
const ROW_GRID  = 'grid grid-cols-[6.5rem_1fr_6rem_8.5rem] items-center gap-2'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

/* ─── modal de empresa ───────────────────────────────────── */

function CompanyModal({ initial, onSave, onClose }: { initial?: Company; onSave: (d: Partial<Company>) => void; onClose: () => void }) {
  const [codigo,       setCodigo]  = useState(initial?.codigo ?? '')
  const [razaoSocial,  setRazao]   = useState(initial?.razaoSocial ?? '')
  const [nomeFantasia, setFantasia] = useState(initial?.nomeFantasia ?? '')
  const [cnpj,         setCnpj]    = useState(initial?.cnpj ?? '')
  const [status,       setStatus]  = useState(initial?.status ?? 'ATIVA')

  return (
    <Modal title={initial ? 'Editar empresa do grupo' : 'Nova empresa do grupo'} onClose={onClose}>
      <div>
        <label className={labelCls}>Código</label>
        <input value={codigo ?? ''} onChange={e => setCodigo(alnum15(e.target.value))} maxLength={15}
          placeholder="Até 15 caracteres alfanuméricos" className={cn(inputCls, 'font-mono uppercase')} />
      </div>
      <div>
        <label className={labelCls}>Razão social <span className="text-red-500">*</span></label>
        <input value={razaoSocial} onChange={e => setRazao(e.target.value)} className={inputCls} autoFocus />
      </div>
      <div>
        <label className={labelCls}>Nome fantasia</label>
        <input value={nomeFantasia ?? ''} onChange={e => setFantasia(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>CNPJ</label>
          <input value={cnpj ?? ''} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
            {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
        <button type="button" disabled={!razaoSocial.trim()}
          onClick={() => onSave({ codigo: codigo.trim() || undefined, razaoSocial: razaoSocial.trim(), nomeFantasia: nomeFantasia?.trim() || undefined, cnpj: cnpj?.trim() || undefined, status })}
          className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Salvar</button>
      </div>
    </Modal>
  )
}

/* ─── modal de unidade ───────────────────────────────────── */

function UnitModal({ initial, parentName, tipos, onSave, onClose }: { initial?: Unit; parentName?: string; tipos: LookupEntry[]; onSave: (d: Partial<Unit>) => void; onClose: () => void }) {
  const [nome,        setNome]   = useState(initial?.nome ?? '')
  const [codigo,      setCodigo] = useState(initial?.codigo ?? '')
  const [natureza,    setNat]    = useState(initial?.natureza ?? tipos[0]?.id ?? 'ADMINISTRATIVA')
  const [responsavel, setResp]   = useState(initial?.responsavel ?? '')
  const [status,      setStatus] = useState(initial?.status ?? 'ATIVA')

  return (
    <Modal title={initial ? 'Editar unidade' : 'Nova unidade'} onClose={onClose}>
      {parentName && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><CornerDownRight className="h-3 w-3" /> subordinada a <span className="font-medium text-foreground">{parentName}</span></p>
      )}
      <div className="grid grid-cols-[9rem_1fr] gap-3">
        <div>
          <label className={labelCls}>Código</label>
          <input value={codigo ?? ''} onChange={e => setCodigo(alnum15(e.target.value))} maxLength={15} placeholder="Alfanum. 15" className={cn(inputCls, 'font-mono uppercase')} />
        </div>
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} autoFocus />
        </div>
      </div>
      <div>
        <label className={labelCls}>Tipo de unidade</label>
        <select value={natureza} onChange={e => setNat(e.target.value)} className={inputCls}>
          {initial?.natureza && !tipos.some(t => t.id === initial.natureza) && <option value={initial.natureza}>{initial.natureza}</option>}
          {tipos.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Responsável</label>
          <input value={responsavel ?? ''} onChange={e => setResp(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
            {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
        <button type="button" disabled={!nome.trim()}
          onClick={() => onSave({ nome: nome.trim(), codigo: codigo?.trim() || undefined, natureza, responsavel: responsavel?.trim() || undefined, status })}
          className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Salvar</button>
      </div>
    </Modal>
  )
}

/* ─── linha da tabela do organograma ─────────────────────── */

function UnitRow({ row, flatMode, typeMap, onToggle, onAddChild, onEdit, onRemove }: {
  row: FlatRow; flatMode?: boolean; typeMap: Record<string, LookupEntry>
  onToggle: (u: Unit) => void; onAddChild: (u: Unit) => void; onEdit: (u: Unit) => void; onRemove: (u: Unit) => void
}) {
  const { unit: u, depth, expanded } = row
  const view = unitTypeView(typeMap, u.natureza)
  const hasKids = (u.childrenCount ?? 0) > 0
  return (
    <div className={cn('group relative h-[30px] px-3 text-xs hover:bg-muted/60 border-b border-border/40', ROW_GRID)}>
      <span className="font-mono text-[10px] text-muted-foreground truncate">{u.codigo || '—'}</span>
      <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: flatMode ? 0 : depth * 16 }}>
        {flatMode ? (
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', view.dot)} />
        ) : (
          <button type="button" onClick={() => onToggle(u)}
            className={cn('flex h-4 w-4 items-center justify-center text-muted-foreground shrink-0 hover:text-foreground', !hasKids && 'invisible')}>
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}
        <span className={cn('truncate font-medium', u.status === 'INATIVA' && 'line-through text-muted-foreground')}>{u.nome}</span>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', view.dot)} /><span className="truncate">{view.nome}</span>
      </span>
      <span className="text-[11px] text-muted-foreground truncate">{u.responsavel || '—'}</span>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 rounded-md bg-card/95 px-1 shadow-sm ring-1 ring-border">
        <button type="button" title="Adicionar subunidade" onClick={() => onAddChild(u)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"><Plus className="h-3.5 w-3.5" /></button>
        <button type="button" title="Editar" onClick={() => onEdit(u)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
        <button type="button" title="Remover" onClick={() => onRemove(u)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
  )
}

/* ─── organograma (tabela hierárquica, lazy + virtualizada + busca) ─── */

const ROW_H = 30
const VIEWPORT = 460

function OrgChart({ companyId, onChanged }: { companyId: string; onChanged: () => void }) {
  const [cache,    setCache]    = useState<Record<string, Unit[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState<Unit[] | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [unitModal, setUnitModal] = useState<{ initial?: Unit; parent?: Unit } | null>(null)
  const tipos = useLookupTable(TIPOS_UNIDADE_KEY, INIT_TIPOS_UNIDADE)
  const typeMap = useMemo(() => Object.fromEntries(tipos.entries.map(t => [t.id, t])) as Record<string, LookupEntry>, [tipos.entries])

  const fetchLevel = useCallback(async (parentKey: string): Promise<Unit[]> => {
    const qs = parentKey === '__root__' ? '' : `&parentId=${parentKey}`
    return (await api<Unit[]>(`/api/org-units?groupCompanyId=${companyId}${qs}`)) ?? []
  }, [companyId])

  /* carga inicial / troca de empresa */
  useEffect(() => {
    let cancel = false
    setLoading(true); setCache({}); setExpanded(new Set()); setSearch(''); setResults(null); setScrollTop(0)
    void fetchLevel('__root__').then(roots => { if (!cancel) { setCache({ __root__: roots }); setLoading(false) } })
    return () => { cancel = true }
  }, [companyId, fetchLevel])

  /* busca server-side (debounce) */
  useEffect(() => {
    const term = search.trim()
    if (!term) { setResults(null); return }
    const t = setTimeout(async () => {
      const r = await api<Unit[]>(`/api/org-units?groupCompanyId=${companyId}&search=${encodeURIComponent(term)}`)
      setResults(r ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [search, companyId])

  const toggle = (u: Unit) => {
    if ((u.childrenCount ?? 0) === 0) return
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(u.id)) n.delete(u.id)
      else { n.add(u.id); if (!(u.id in cache)) void fetchLevel(u.id).then(kids => setCache(c => ({ ...c, [u.id]: kids }))) }
      return n
    })
  }

  /* recarrega raízes + níveis expandidos (preserva expansão); após mutações */
  const refresh = useCallback(async () => {
    const keys = ['__root__', ...Array.from(expanded)]
    const entries = await Promise.all(keys.map(async k => [k, await fetchLevel(k)] as const))
    setCache(Object.fromEntries(entries))
    onChanged()
  }, [expanded, fetchLevel, onChanged])

  const flat = useMemo(() => {
    const out: FlatRow[] = []
    const walk = (parentKey: string, depth: number) => {
      const kids = cache[parentKey]
      if (!kids) return
      for (const u of kids) {
        const isExp = expanded.has(u.id)
        out.push({ unit: u, depth, expanded: isExp })
        if (isExp) walk(u.id, depth + 1)
      }
    }
    walk('__root__', 0)
    return out
  }, [cache, expanded])

  const saveUnit = async (data: Partial<Unit>) => {
    const editing = unitModal?.initial
    if (editing) await api(`/api/org-units/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) })
    else {
      const parent = unitModal?.parent
      await api(`/api/org-units`, { method: 'POST', body: JSON.stringify({ organizationId: ORG(), groupCompanyId: companyId, parentId: parent?.id, ...data }) })
      if (parent) setExpanded(prev => new Set(prev).add(parent.id))
    }
    setUnitModal(null)
    await refresh()
  }
  const removeUnit = async (u: Unit) => {
    if (!confirm(`Remover a unidade "${u.nome}" e todas as subunidades?`)) return
    await api(`/api/org-units/${u.id}`, { method: 'DELETE' })
    await refresh()
  }

  const inSearch = results !== null
  const rows: FlatRow[] = inSearch ? results.map(u => ({ unit: u, depth: 0, expanded: false })) : flat

  /* virtualização */
  const total = rows.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 6)
  const end   = Math.min(total, Math.ceil((scrollTop + VIEWPORT) / ROW_H) + 6)
  const slice = rows.slice(start, end)

  return (
    <div className="px-4 py-3">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Network className="h-3.5 w-3.5" />Organograma</div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar unidade..."
              className="h-7 w-48 rounded-md border border-input bg-background pl-7 pr-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <button type="button" onClick={() => setUnitModal({})} className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"><Plus className="h-3.5 w-3.5" />Unidade raiz</button>
        </div>
      </div>

      {/* cabeçalho da tabela */}
      <div className={cn('px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/40 rounded-t-md', ROW_GRID)}>
        <span>Código</span><span>Unidade</span><span>Tipo de unidade</span><span>Responsável</span>
      </div>

      {/* corpo */}
      {loading ? (
        <p className="text-xs text-muted-foreground py-8 text-center border-x border-b rounded-b-md">Carregando...</p>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 px-6 text-center border-x border-b rounded-b-md">
          {inSearch ? 'Nenhuma unidade encontrada para a busca.' : 'Nenhuma unidade. Adicione uma unidade raiz (ex.: Diretoria) e crie centros de custo e de lucro abaixo dela.'}
        </p>
      ) : (
        <div className="border-x border-b rounded-b-md overflow-auto" style={{ maxHeight: VIEWPORT }}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: total * ROW_H, position: 'relative' }}>
            {slice.map((row, i) => (
              <div key={row.unit.id} style={{ position: 'absolute', top: (start + i) * ROW_H, left: 0, right: 0 }}>
                <UnitRow row={row} flatMode={inSearch} typeMap={typeMap} onToggle={toggle}
                  onAddChild={u => setUnitModal({ parent: u })} onEdit={u => setUnitModal({ initial: u })} onRemove={removeUnit} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* rodapé: contagem + legenda */}
      <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(CLASS_COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className={cn('h-2 w-2 rounded-full', c.dot)} />{c.label}</span>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">{inSearch ? `${total} resultado(s)` : `${total} unidade(s) visível(is)`}</span>
      </div>

      {unitModal && <UnitModal initial={unitModal.initial} parentName={unitModal.parent?.nome} tipos={tipos.active} onSave={saveUnit} onClose={() => setUnitModal(null)} />}
    </div>
  )
}

/* ─── página ─────────────────────────────────────────────── */

export default function EmpresasPage() {
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [companySearch, setCompanySearch] = useState('')
  const [companyModal, setCompanyModal] = useState<{ initial?: Company } | null>(null)

  const loadCompanies = useCallback(async () => {
    const data = await api<{ rows: Company[] }>(`/api/group-companies?organizationId=${ORG()}`)
    const rows = data?.rows ?? []
    setCompanies(rows)
    setSelectedId(prev => prev && rows.some(c => c.id === prev) ? prev : (rows[0]?.id ?? null))
  }, [])

  useEffect(() => { void loadCompanies() }, [loadCompanies])

  const selected = companies.find(c => c.id === selectedId) ?? null
  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(c =>
      c.razaoSocial.toLowerCase().includes(q) ||
      (c.nomeFantasia ?? '').toLowerCase().includes(q) ||
      (c.codigo ?? '').toLowerCase().includes(q) ||
      (c.cnpj ?? '').toLowerCase().includes(q))
  }, [companies, companySearch])

  const saveCompany = async (data: Partial<Company>) => {
    const editing = companyModal?.initial
    if (editing) await api(`/api/group-companies/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) })
    else {
      const created = await api<Company>(`/api/group-companies`, { method: 'POST', body: JSON.stringify({ organizationId: ORG(), ...data }) })
      if (created?.id) setSelectedId(created.id)
    }
    setCompanyModal(null)
    await loadCompanies()
  }
  const removeCompany = async (c: Company) => {
    if (!confirm(`Remover a empresa "${c.razaoSocial}" e todas as suas unidades?`)) return
    await api(`/api/group-companies/${c.id}`, { method: 'DELETE' })
    await loadCompanies()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Estrutura organizacional</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Cadastre as empresas do grupo e o organograma de cada uma (centros de custo e de lucro).</p>
        </div>
        <button type="button" onClick={() => setCompanyModal({})} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" />Nova empresa</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[17rem_1fr] gap-4">

        {/* lista de empresas */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input value={companySearch} onChange={e => setCompanySearch(e.target.value)} placeholder="Buscar empresa..." className={cn(inputCls, 'pl-8')} />
          </div>
          <div className="space-y-1">
            {filteredCompanies.length === 0 && (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-4 text-center">{companies.length === 0 ? 'Nenhuma empresa cadastrada.' : 'Nenhuma empresa encontrada.'}</p>
            )}
            {filteredCompanies.map(c => (
              <button key={c.id} type="button" onClick={() => setSelectedId(c.id)}
                className={cn('group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all hover:border-primary/30',
                  selectedId === c.id ? 'border-primary/40 bg-primary/5' : 'bg-card')}>
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', selectedId === c.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><Building2 className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{c.nomeFantasia || c.razaoSocial}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.codigo && <span className="font-mono text-foreground/70">{c.codigo} · </span>}{c.cnpj || c.razaoSocial}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{c.unidades ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* detalhe + organograma */}
        {selected ? (
          <div className="rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold truncate">{selected.razaoSocial}</h2>
                  <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', selected.status === 'ATIVA' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800')}>{selected.status === 'ATIVA' ? 'Ativa' : 'Inativa'}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{selected.codigo && <span className="font-mono text-foreground/70">{selected.codigo} · </span>}{selected.nomeFantasia && <span>{selected.nomeFantasia} · </span>}{selected.cnpj || 'sem CNPJ'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setCompanyModal({ initial: selected })} className="inline-flex items-center gap-1 h-7 rounded-md border px-2.5 text-xs hover:bg-muted"><Pencil className="h-3 w-3" />Editar</button>
                <button type="button" onClick={() => removeCompany(selected)} className="inline-flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:text-destructive hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <OrgChart companyId={selected.id} onChanged={loadCompanies} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-card flex items-center justify-center p-10"><p className="text-xs text-muted-foreground">Selecione ou crie uma empresa para gerenciar o organograma.</p></div>
        )}
      </div>

      {companyModal && <CompanyModal initial={companyModal.initial} onSave={saveCompany} onClose={() => setCompanyModal(null)} />}
    </div>
  )
}
