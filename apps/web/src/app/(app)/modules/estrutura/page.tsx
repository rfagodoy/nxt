'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Building2, Plus, Pencil, Trash2, X, ChevronRight, ChevronDown,
  Network, Search, Phone, MapPin, CreditCard, Users, UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { ResponsaveisSection } from '@/components/responsaveis/responsaveis-section'
import { useLookupTable, type LookupEntry } from '@/hooks/use-lookup-table'
import { TIPOS_UNIDADE_KEY, INIT_TIPOS_UNIDADE, CLASS_COLOR } from '@/lib/unit-types'
import { useWorkspace } from '@/contexts/workspace-context'
import {
  usePartnerForm, emptyPartnerForm, Field, maskCNPJ,
  ContatoFields, EnderecoFields, BancarioFields, SociosFields,
  validateSociosParticipacao,
  type PCon, type PEnd, type PBan, type PSoc,
} from '@/components/partners/partner-fields'

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
/** Registro completo da empresa (GET /:id) — inclui os blocos PJ reaproveitados de Parceiros. */
interface CompanyFull extends Company {
  ie?: string | null; im?: string | null
  contatos?: PCon[]; enderecos?: PEnd[]; bancos?: PBan[]; socios?: PSoc[]
}
/** Payload de gravação (POST/PATCH). */
interface CompanyPayload {
  codigo?: string; razaoSocial: string; nomeFantasia?: string; cnpj?: string
  ie?: string; im?: string; status: string
  contatos: PCon[]; enderecos: PEnd[]; bancos: PBan[]; socios: PSoc[]
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
    const res = await apiFetch(path, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

/* ─── estilos comuns ─────────────────────────────────────── */

const inputCls  = 'flex h-7 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const ROW_GRID  = 'grid grid-cols-[6.5rem_1fr_9rem] items-center gap-2'

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('bg-card rounded-xl border shadow-xl w-full overflow-hidden flex flex-col max-h-[90vh]', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

/* ─── seção accordion (mesmo chrome do cadastro de Parceiros) ─── */
function Section({ icon: Icon, title, isOpen, onToggle, hasError, children }: {
  icon: React.ElementType; title: string; isOpen: boolean; onToggle: () => void
  hasError?: boolean; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle}
        className={cn('w-full px-4 py-2 flex items-center gap-2 transition-colors hover:bg-muted/40 bg-muted/30', isOpen && 'border-b')}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : 'text-muted-foreground')} />
        <h3 className={cn('text-xs font-semibold flex-1 text-left', hasError && 'text-red-500')}>{title}</h3>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

/* ─── modal de empresa ───────────────────────────────────── */

function CompanyModal({ editId, initial, onSave, onClose }: {
  editId?: string                       // id quando editando (dispara fetch do registro completo)
  initial?: Company                     // projeção da lista (defaults imediatos de código/status)
  onSave: (d: CompanyPayload) => Promise<boolean>
  onClose: () => void
}) {
  const form = usePartnerForm(emptyPartnerForm('PJ_BR'))
  const v    = form.values

  const [codigo, setCodigo] = useState(initial?.codigo ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'ATIVA')
  const [open,   setOpen]   = useState<Set<string>>(new Set(['identificacao']))
  const [err,    setErr]    = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)

  const toggle = (k: string) => setOpen(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })

  /* edição: hidrata o formulário com o registro completo (blocos PJ inclusos) */
  useEffect(() => {
    if (!editId) return
    let cancel = false
    void api<CompanyFull>(`/api/group-companies/${editId}`).then(c => {
      if (cancel || !c) { setLoading(false); return }
      const base = emptyPartnerForm('PJ_BR')
      setCodigo(c.codigo ?? '')
      setStatus(c.status ?? 'ATIVA')
      form.setValues({
        ...base,
        documento:    c.cnpj ?? '',
        razaoSocial:  c.razaoSocial ?? '',
        nomeFantasia: c.nomeFantasia ?? '',
        ie:           c.ie ?? '',
        im:           c.im ?? '',
        contatos:  c.contatos?.length  ? c.contatos  : base.contatos,
        enderecos: c.enderecos?.length ? c.enderecos : base.enderecos,
        bancos:    c.bancos?.length    ? c.bancos    : base.bancos,
        socios:    c.socios ?? [],
      })
      setLoading(false)
    })
    return () => { cancel = true }
  }, [editId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const razao = v.razaoSocial.trim()
    if (!razao) { setErr('Informe a razão social.'); setOpen(p => new Set(p).add('identificacao')); return }
    const socErr = validateSociosParticipacao(v.socios)
    if (socErr) { setErr(socErr); setOpen(p => new Set(p).add('socios')); return }
    const opt = (s: string) => s.trim() || undefined
    setSaving(true); setErr(null)
    const ok = await onSave({
      codigo: codigo.trim() || undefined,
      razaoSocial: razao,
      nomeFantasia: opt(v.nomeFantasia),
      cnpj: opt(v.documento),
      ie: opt(v.ie),
      im: opt(v.im),
      status,
      contatos: v.contatos, enderecos: v.enderecos, bancos: v.bancos, socios: v.socios,
    })
    if (!ok) { setSaving(false); setErr('Não foi possível salvar a empresa. Tente novamente.') }
    // sucesso: o componente pai fecha o modal
  }

  return (
    <Modal wide title={editId ? 'Editar empresa do grupo' : 'Nova empresa do grupo'} onClose={onClose}>
      {loading ? (
        <p className="text-xs text-muted-foreground py-10 text-center">Carregando dados da empresa...</p>
      ) : (
        <>
          <div className="space-y-2">
            <Section icon={Building2} title="Identificação" isOpen={open.has('identificacao')} onToggle={() => toggle('identificacao')} hasError={!!err && !v.razaoSocial.trim()}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Código">
                  <input value={codigo} onChange={e => setCodigo(alnum15(e.target.value))} maxLength={15}
                    placeholder="Até 15 (alfanumérico)" className={cn(inputCls, 'h-8 font-mono uppercase')} />
                </Field>
                <Field label="Status">
                  <select value={status} onChange={e => setStatus(e.target.value)} className={cn(inputCls, 'h-8')}>
                    {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Razão social" required span2>
                  <input value={v.razaoSocial} onChange={e => form.set('razaoSocial', e.target.value)} className={cn(inputCls, 'h-8')} autoFocus placeholder="Razão social da empresa" />
                </Field>
                <Field label="Nome fantasia" span2>
                  <input value={v.nomeFantasia} onChange={e => form.set('nomeFantasia', e.target.value)} className={cn(inputCls, 'h-8')} placeholder="Nome fantasia (se houver)" />
                </Field>
                <Field label="CNPJ">
                  <input value={v.documento} onChange={e => form.set('documento', maskCNPJ(e.target.value))} maxLength={18} placeholder="00.000.000/0000-00" className={cn(inputCls, 'h-8')} />
                </Field>
                <div />
                <Field label="Inscrição Estadual">
                  <input value={v.ie} onChange={e => form.set('ie', e.target.value)} placeholder="Inscrição estadual" className={cn(inputCls, 'h-8')} />
                </Field>
                <Field label="Inscrição Municipal">
                  <input value={v.im} onChange={e => form.set('im', e.target.value)} placeholder="Inscrição municipal" className={cn(inputCls, 'h-8')} />
                </Field>
              </div>
            </Section>
            <Section icon={Phone} title="Contato" isOpen={open.has('contato')} onToggle={() => toggle('contato')}>
              <ContatoFields form={form} />
            </Section>
            <Section icon={MapPin} title="Endereço" isOpen={open.has('endereco')} onToggle={() => toggle('endereco')}>
              <EnderecoFields form={form} />
            </Section>
            <Section icon={CreditCard} title="Dados Bancários" isOpen={open.has('bancario')} onToggle={() => toggle('bancario')}>
              <BancarioFields form={form} />
            </Section>
            <Section icon={Users} title="Quadro de Sócios" isOpen={open.has('socios')} onToggle={() => toggle('socios')} hasError={!!err && !!validateSociosParticipacao(v.socios)}>
              <SociosFields form={form} />
            </Section>
            <Section icon={UserCog} title="Partes envolvidas" isOpen={open.has('responsaveis')} onToggle={() => toggle('responsaveis')}>
              <ResponsaveisSection entityType="EMPRESA" entityId={editId} />
            </Section>
          </div>

          {err && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">{err}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" disabled={saving || !v.razaoSocial.trim()} onClick={() => { void save() }}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </>
      )}
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
  const ws = useWorkspace()
  /* abrir unidade (editar) ou nova unidade como ABA na área de trabalho */
  const openEditUnit = (u: Unit) => ws.open({ id: `unit:${u.id}`, kind: 'unit', mode: 'detail', label: u.nome, data: u })
  const openNewUnit  = (parent?: Unit) => ws.open({
    id: `unit:new:${companyId}:${parent?.id ?? 'root'}`, kind: 'unit', mode: 'new', label: 'Nova unidade',
    data: { companyId, parentId: parent?.id ?? null, parentName: parent?.nome ?? null },
  })
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

  /* recarrega a árvore quando uma unidade é salva/criada na área de trabalho */
  useEffect(() => {
    const h = () => { void refresh() }
    window.addEventListener('nxt:workspace:refresh', h)
    return () => window.removeEventListener('nxt:workspace:refresh', h)
  }, [refresh])

  const removeUnit = async (u: Unit) => {
    if (!confirm(`Remover a unidade "${u.nome}" e todas as subunidades?`)) return
    const ok = await api(`/api/org-units/${u.id}`, { method: 'DELETE' })
    if (!ok) { alert('Não foi possível remover a unidade.'); return }
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
          <button type="button" onClick={() => openNewUnit()} className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"><Plus className="h-3.5 w-3.5" />Unidade raiz</button>
        </div>
      </div>

      {/* cabeçalho da tabela */}
      <div className={cn('px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/40 rounded-t-md', ROW_GRID)}>
        <span>Código</span><span>Unidade</span><span>Tipo de unidade</span>
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
                  onAddChild={u => openNewUnit(u)} onEdit={u => openEditUnit(u)} onRemove={removeUnit} />
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
    const data = await api<{ rows: Company[] }>(`/api/group-companies`)
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

  const saveCompany = async (data: CompanyPayload): Promise<boolean> => {
    const editing = companyModal?.initial
    const result = editing
      ? await api<Company>(`/api/group-companies/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) })
      : await api<Company>(`/api/group-companies`, { method: 'POST', body: JSON.stringify(data) })
    if (!result) return false // o modal mostra o erro e permanece aberto
    if (!editing && result.id) setSelectedId(result.id)
    setCompanyModal(null)
    await loadCompanies()
    return true
  }
  const removeCompany = async (c: Company) => {
    if (!confirm(`Remover a empresa "${c.razaoSocial}" e todas as suas unidades?`)) return
    const ok = await api(`/api/group-companies/${c.id}`, { method: 'DELETE' })
    if (!ok) { alert('Não foi possível remover a empresa.'); return }
    await loadCompanies()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Estrutura organizacional</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Cadastre as empresas do grupo e o organograma de cada uma (centros de custo e de lucro).</p>
        </div>
        <button type="button" onClick={() => setCompanyModal({})} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"><Plus className="h-3.5 w-3.5" />Nova empresa</button>
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
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-4 text-center">{companies.length === 0 ? 'Nenhuma empresa cadastrada.' : 'Nenhuma empresa encontrada.'}</p>
            )}
            {filteredCompanies.map(c => (
              <button key={c.id} type="button" onClick={() => setSelectedId(c.id)}
                className={cn('group flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-all hover:border-primary/30',
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
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold truncate">{selected.razaoSocial}</h2>
                  <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', selected.status === 'ATIVA' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{selected.status === 'ATIVA' ? 'Ativa' : 'Inativa'}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{selected.codigo && <span className="font-mono text-foreground/70">{selected.codigo} · </span>}{selected.nomeFantasia && <span>{selected.nomeFantasia} · </span>}{selected.cnpj || 'sem CNPJ'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setCompanyModal({ initial: selected })} className="inline-flex items-center gap-1 h-7 rounded-md border px-2.5 text-xs hover:bg-muted transition-colors"><Pencil className="h-3 w-3" />Editar</button>
                <button type="button" onClick={() => removeCompany(selected)} className="inline-flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <OrgChart companyId={selected.id} onChanged={loadCompanies} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card flex items-center justify-center p-10"><p className="text-xs text-muted-foreground">Selecione ou crie uma empresa para gerenciar o organograma.</p></div>
        )}
      </div>

      {companyModal && <CompanyModal editId={companyModal.initial?.id} initial={companyModal.initial} onSave={saveCompany} onClose={() => setCompanyModal(null)} />}
    </div>
  )
}
