'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  UserPlus, KeyRound, Pencil, Loader2, AlertCircle, ShieldCheck, X, RefreshCw,
  Settings2, ChevronsUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import { apiFetch } from '@/lib/http'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useViews } from '@/hooks/use-views'
import { exportExcel } from '@/lib/export-excel'
import { TablePagination } from '@/components/ui/table-pagination'
import { ListToolbar } from '@/components/list/list-toolbar'
import { type FilterRow, matchOp, norm } from '@/lib/list-filter'

interface UserRow {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  status: 'ATIVO' | 'INATIVO'
  lastLoginAt: string | null
  createdAt: string
}

type ModalMode = 'create' | 'edit' | 'password' | null
interface SortState { col: string; dir: 'asc' | 'desc' }

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', user: 'Usuário' }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface Col { key: string; label: string; align?: 'right'; text: (u: UserRow) => string; sortVal?: (u: UserRow) => string | number; node: (u: UserRow) => ReactNode }
const COLS: Col[] = [
  { key: 'nome', label: 'Nome', text: (u) => u.name, sortVal: (u) => norm(u.name), node: (u) => <span className="font-medium">{u.name}</span> },
  { key: 'email', label: 'E-mail', text: (u) => u.email, node: (u) => <span className="text-muted-foreground">{u.email}</span> },
  {
    key: 'papel', label: 'Papel', text: (u) => ROLE_LABEL[u.role] ?? u.role,
    node: (u) => <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{ROLE_LABEL[u.role] ?? u.role}</Badge>,
  },
  {
    key: 'situacao', label: 'Situação', text: (u) => (u.status === 'ATIVO' ? 'Ativo' : 'Inativo'),
    node: (u) => <Badge variant={u.status === 'ATIVO' ? 'success' : 'outline'}>{u.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge>,
  },
  { key: 'ultimoAcesso', label: 'Último acesso', text: (u) => fmtDate(u.lastLoginAt), sortVal: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0), node: (u) => <span className="text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(u.lastLoginAt)}</span> },
  { key: 'criadoEm', label: 'Criado em', text: (u) => fmtDate(u.createdAt), sortVal: (u) => new Date(u.createdAt).getTime(), node: (u) => <span className="text-muted-foreground whitespace-nowrap tabular-nums">{fmtDate(u.createdAt)}</span> },
]
const HIDDEN_KEY = 'nxt:cols:usuarios:hidden'

export default function UsuariosPage() {
  const { views, saveView, deleteView } = useViews('usuarios')
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [modal, setModal] = useState<ModalMode>(null)
  const [target, setTarget] = useState<UserRow | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>({ col: 'nome', dir: 'asc' })
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showConfig, setShowConfig] = useState(false)
  const configRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  const load = useCallback(async () => {
    const res = await apiFetch('/api/users')
    if (res.status === 403) { setForbidden(true); setUsers([]); return }
    if (res.ok) setUsers((await res.json()) as UserRow[])
    else setUsers([])
  }, [])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    mounted.current = true
    try { const raw = localStorage.getItem(HIDDEN_KEY); if (raw) setHidden(new Set(JSON.parse(raw))) } catch {}
  }, [])
  useEffect(() => { if (mounted.current) try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])) } catch {} }, [hidden])
  useEffect(() => { setPage(1) }, [search, filters, sort, logic, pageSize])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (configRef.current && !configRef.current.contains(e.target as Node)) setShowConfig(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  function openCreate() { setTarget(null); setModal('create') }
  function openEdit(u: UserRow) { setTarget(u); setModal('edit') }
  function openPassword(u: UserRow) { setTarget(u); setModal('password') }
  function close(reload?: boolean) { setModal(null); setTarget(null); if (reload) void load() }

  const visibleCols = useMemo(() => COLS.filter((c) => !hidden.has(c.key)), [hidden])
  const all = useMemo(() => users ?? [], [users])
  const stats = useMemo(() => ({
    total: all.length,
    admins: all.filter((u) => u.role === 'admin').length,
    ativos: all.filter((u) => u.status === 'ATIVO').length,
    inativos: all.filter((u) => u.status === 'INATIVO').length,
  }), [all])

  const filtered = useMemo(() => {
    const q = norm(search)
    const active = filters.filter((f) => f.value.trim())
    return all.filter((u) => {
      if (q && !COLS.some((c) => norm(c.text(u)).includes(q))) return false
      if (!active.length) return true
      const res = active.map((f) => { const col = COLS.find((c) => c.key === f.col); return col ? matchOp(col.text(u), f.op, f.value) : true })
      return logic === 'AND' ? res.every(Boolean) : res.some(Boolean)
    })
  }, [all, search, filters, logic])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = COLS.find((c) => c.key === sort.col)
    if (!col) return filtered
    const val = (u: UserRow) => col.sortVal ? col.sortVal(u) : norm(col.text(u))
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize)
  const handleSort = (col: string) => setSort((p) => !p || p.col !== col ? { col, dir: 'asc' } : p.dir === 'asc' ? { col, dir: 'desc' } : null)

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    if (!id) { setSort({ col: 'nome', dir: 'asc' }); setFilters([]); setLogic('AND') }
    else { const v = views.find((v) => v.id === id); if (!v) return; setSort(v.sort); setFilters(v.filters); setLogic(v.logic) }
  }
  const onSaveView = (name: string) => { const v = saveView(name, { sort, filters: filters.filter((f) => f.value.trim()), logic }); setActiveViewId(v.id) }
  const onDeleteView = (e: React.MouseEvent, id: string) => { e.stopPropagation(); deleteView(id); if (activeViewId === id) selectView(null) }

  const handleExport = async () => {
    await exportExcel({
      fileName: 'usuarios', sheet: 'Usuários',
      title: `Usuários — ${views.find((v) => v.id === activeViewId)?.name ?? 'Todos'}`,
      columns: visibleCols.map((c) => ({ header: c.label, align: c.align })),
      rows: sorted.map((u) => visibleCols.map((c) => c.text(u))),
    })
  }

  const configSlot = (
    <div ref={configRef} className="relative">
      <button onClick={() => setShowConfig((v) => !v)} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <Settings2 className="h-3.5 w-3.5" />Configurações
      </button>
      {showConfig && (
        <div className="glass absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl p-1.5">
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Colunas visíveis</p>
          {COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={(e) => setHidden((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(c.key); else n.add(c.key); return n })} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs">{c.label}</span>
            </label>
          ))}
          {hidden.size > 0 && <button onClick={() => setHidden(new Set())} className="mt-1 w-full text-left px-2 py-1.5 text-[11px] text-primary hover:bg-muted rounded-md">Mostrar todas</button>}
        </div>
      )}
    </div>
  )

  if (forbidden) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <h2 className="text-base font-semibold">Acesso restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">A gestão de usuários é exclusiva de administradores.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Usuários</h1>
          <p className="text-[11px] text-muted-foreground">Gerencie quem acessa o Nxt na sua organização</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreate}><UserPlus className="h-4 w-4" />Novo usuário</Button>
          <Button variant="outline" size="sm" onClick={() => void load()} title="Recarregar"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, cls: 'text-foreground' },
          { label: 'Administradores', value: stats.admins, cls: 'text-primary' },
          { label: 'Ativos', value: stats.ativos, cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Inativos', value: stats.inativos, cls: 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('text-sm font-bold tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      <ListToolbar
        search={search} onSearch={setSearch}
        columns={COLS.map((c) => ({ key: c.key, label: c.label }))}
        filters={filters} onFiltersChange={setFilters} logic={logic} onLogicChange={setLogic}
        views={views} activeViewId={activeViewId} onSelectView={selectView} onSaveView={onSaveView} onDeleteView={onDeleteView}
        onExport={() => { void handleExport() }} exportDisabled={sorted.length === 0}
        configSlot={configSlot}
        filteredCount={sorted.length} totalCount={all.length}
      />

      <div className="rounded-xl border bg-card shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="border-b">
                {visibleCols.map((col) => (
                  <th key={col.key} className={cn('text-left px-3 py-1.5 font-medium text-muted-foreground select-none whitespace-nowrap bg-muted', col.align === 'right' && 'text-right')}>
                    <button onClick={() => handleSort(col.key)} className="group inline-flex items-center hover:text-foreground transition-colors">
                      {col.label}
                      {!sort || sort.col !== col.key
                        ? <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />
                        : sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-1.5 font-medium text-muted-foreground text-right bg-muted whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users === null ? (
                <tr><td colSpan={visibleCols.length + 1} className="px-3 py-10 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 1} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {all.length === 0 ? 'Nenhum usuário ainda.' : 'Nenhum usuário encontrado com os filtros aplicados.'}
                </td></tr>
              ) : pageRows.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(u)}>
                  {visibleCols.map((col) => (
                    <td key={col.key} className={cn('px-3 py-2 align-middle', col.align === 'right' && 'text-right')}>{col.node(u)}</td>
                  ))}
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => openPassword(u)} title="Resetar senha"><KeyRound className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} pageSize={pageSize} total={sorted.length} onPage={setPage} onPageSize={setPageSize} />
      </div>

      {modal === 'create' && <UserFormModal onClose={close} />}
      {modal === 'edit' && target && <UserFormModal user={target} onClose={close} />}
      {modal === 'password' && target && <PasswordModal user={target} onClose={close} />}
    </div>
  )
}

/* ── Modal base ─────────────────────────────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span>
    </div>
  )
}

/* ── Criar / Editar usuário ─────────────────────────────────────────────────── */
function UserFormModal({ user, onClose }: { user?: UserRow; onClose: (reload?: boolean) => void }) {
  const editing = !!user
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>(user?.role ?? 'user')
  const [status, setStatus] = useState<'ATIVO' | 'INATIVO'>(user?.status ?? 'ATIVO')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    const path = editing ? `/api/users/${user!.id}` : '/api/users'
    const method = editing ? 'PATCH' : 'POST'
    const body = editing
      ? { name, role, status }
      : { name, email, password, role }
    const res = await apiFetch(path, { method, body: JSON.stringify(body) })
    if (res.ok) { onClose(true); return }
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    setError(Array.isArray(data?.message) ? data!.message[0] : data?.message ?? 'Não foi possível salvar.')
    setSaving(false)
  }

  return (
    <Modal title={editing ? 'Editar usuário' : 'Novo usuário'} onClose={() => onClose()}>
      <form onSubmit={save} className="space-y-3">
        {error && <ErrorBox message={error} />}
        <div className="space-y-1.5">
          <Label htmlFor="u-name">Nome</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-email">E-mail</Label>
          <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required disabled={editing} placeholder="voce@empresa.com" />
          {editing && <p className="text-[11px] text-muted-foreground">O e-mail não pode ser alterado.</p>}
        </div>
        {!editing && (
          <div className="space-y-1.5">
            <Label htmlFor="u-pass">Senha inicial</Label>
            <Input id="u-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={8} placeholder="mínimo 8 caracteres" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'user')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editing && (
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'ATIVO' | 'INATIVO')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onClose()}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Resetar senha ──────────────────────────────────────────────────────────── */
function PasswordModal({ user, onClose }: { user: UserRow; onClose: (reload?: boolean) => void }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    const res = await apiFetch(`/api/users/${user.id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) })
    if (res.ok) { onClose(false); return }
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    setError(Array.isArray(data?.message) ? data!.message[0] : data?.message ?? 'Não foi possível alterar a senha.')
    setSaving(false)
  }

  return (
    <Modal title={`Resetar senha — ${user.name}`} onClose={() => onClose()}>
      <form onSubmit={save} className="space-y-3">
        {error && <ErrorBox message={error} />}
        <div className="space-y-1.5">
          <Label htmlFor="p-new">Nova senha</Label>
          <Input id="p-new" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required minLength={8} autoFocus placeholder="mínimo 8 caracteres" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onClose()}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Alterar senha
          </Button>
        </div>
      </form>
    </Modal>
  )
}
