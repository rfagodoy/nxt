'use client'

import { useCallback, useEffect, useState } from 'react'
import { UserPlus, KeyRound, Pencil, Loader2, AlertCircle, ShieldCheck, X } from 'lucide-react'
import { apiFetch } from '@/lib/http'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

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

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', user: 'Usuário' }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [modal, setModal] = useState<ModalMode>(null)
  const [target, setTarget] = useState<UserRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await apiFetch('/api/users')
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    if (res.ok) {
      const rows = (await res.json()) as UserRow[]
      // Padrão: ordem alfabética por nome.
      rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
      setUsers(rows)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function openCreate() { setTarget(null); setModal('create') }
  function openEdit(u: UserRow) { setTarget(u); setModal('edit') }
  function openPassword(u: UserRow) { setTarget(u); setModal('password') }
  function close(reload?: boolean) { setModal(null); setTarget(null); if (reload) void load() }

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
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gerencie quem acessa o Nxt na sua organização.</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Nome</th>
              <th className="px-3 py-1.5 font-medium">E-mail</th>
              <th className="px-3 py-1.5 font-medium">Papel</th>
              <th className="px-3 py-1.5 font-medium">Situação</th>
              <th className="px-3 py-1.5 font-medium">Último acesso</th>
              <th className="px-3 py-1.5 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Nenhum usuário ainda.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-1.5 font-medium">{u.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{u.email}</td>
                <td className="px-3 py-1.5">
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                </td>
                <td className="px-3 py-1.5">
                  <Badge variant={u.status === 'ATIVO' ? 'success' : 'outline'}>
                    {u.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{fmtDate(u.lastLoginAt)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openPassword(u)} title="Resetar senha">
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
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
