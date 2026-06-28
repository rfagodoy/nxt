'use client'

import { useState } from 'react'
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { apiFetch } from '@/lib/http'
import { logout } from '@/lib/session-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Troca da própria senha. Como o backend revoga as sessões ao trocar a senha,
 * em caso de sucesso encerramos a sessão e mandamos para o login (entra com a
 * nova senha) — comportamento seguro e previsível.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (next !== confirm) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    setSaving(true)
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    if (res.ok) {
      setDone(true)
      setTimeout(() => void logout(), 1500) // revoga sessões → re-login com a nova senha
      return
    }
    const data = (await res.json().catch(() => null)) as { message?: string | string[] } | null
    setError(Array.isArray(data?.message) ? data!.message[0] : (data?.message ?? 'Não foi possível alterar a senha.'))
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Alterar minha senha</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">Senha alterada!</p>
            <p className="text-xs text-muted-foreground">Por segurança, encerramos sua sessão. Entre novamente…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 p-4">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cp-cur">Senha atual</Label>
              <Input id="cp-cur" type="password" autoComplete="current-password" required autoFocus
                value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-new">Nova senha</Label>
              <Input id="cp-new" type="password" autoComplete="new-password" required minLength={10}
                placeholder="mínimo 10 caracteres" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-cf">Confirmar nova senha</Label>
              <Input id="cp-cf" type="password" autoComplete="new-password" required minLength={10}
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Alterar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
