'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Check, Loader2, Info } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { UserSelect } from '@/components/ui/user-select'
import { useSelectableUsers } from '@/hooks/use-users'
import { PAPEIS_KEY, INIT_PAPEIS, REFERENCIA, referenciaDoPapelEntry } from '@/lib/contract-roles'

export type ResponsavelEntityType = 'EMPRESA' | 'PARCEIRO' | 'UNIDADE' | 'CONTRATO'

interface Assignment { papelId: string; userId: string; userName?: string }
interface ApiAssignment { id: string; papelId: string; userId: string; userName: string; userEmail: string }

const selCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

/**
 * Seção "Responsáveis": atribui PESSOAS (usuários) a papéis dentro de uma entidade.
 * Auto-carrega e SALVA sozinha (PUT em bloco) — persistência separada do cadastro
 * (tabela role_assignments). Só funciona com a entidade já salva (precisa de id).
 * Mostra apenas papéis de referência PESSOA cuja origem casa com o tipo da entidade.
 */
export function ResponsaveisSection({ entityType, entityId, readOnly }: {
  entityType: ResponsavelEntityType
  entityId?: string
  readOnly?: boolean
}) {
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { users } = useSelectableUsers()
  const papeisPessoa = useMemo(
    () => papeis.active.filter(p => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA && p.origem === entityType),
    [papeis.active, entityType],
  )
  const papelLabel = (id: string) => papeis.entries.find(p => p.id === id)?.label ?? id
  const userName = (a: Assignment) => a.userName ?? users.find(u => u.id === a.userId)?.name ?? '(usuário removido)'

  const [rows, setRows] = useState<Assignment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')

  // (re)carrega os responsáveis quando a entidade muda
  useEffect(() => {
    if (!entityId) { setRows([]); setLoaded(true); return }
    let alive = true
    setLoaded(false)
    void apiJson<ApiAssignment[]>(`/api/role-assignments?entityType=${entityType}&entityId=${entityId}`)
      .then(list => { if (alive) { setRows((list ?? []).map(a => ({ papelId: a.papelId, userId: a.userId, userName: a.userName }))); setLoaded(true) } })
    return () => { alive = false }
  }, [entityType, entityId])

  /** Aplica a mudança local e persiste em bloco as linhas COMPLETAS (papel + usuário). */
  const persist = (next: Assignment[]) => {
    setRows(next)
    if (!entityId) return
    const items = next.filter(r => r.papelId && r.userId).map(r => ({ papelId: r.papelId, userId: r.userId }))
    setSaving('saving')
    void apiFetch('/api/role-assignments', { method: 'PUT', body: JSON.stringify({ entityType, entityId, items }) })
      .then(res => { setSaving(res.ok ? 'saved' : 'idle') })
      .catch(() => setSaving('idle'))
  }

  const addRow = () => setRows(r => [...r, { papelId: papeisPessoa[0]?.id ?? '', userId: '' }])
  const setRow = (i: number, patch: Partial<Assignment>) => persist(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remRow = (i: number) => persist(rows.filter((_, idx) => idx !== i))

  // ── estados especiais ──
  if (!entityId) {
    return <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />Salve o cadastro primeiro para atribuir responsáveis.</p>
  }
  if (papeisPessoa.length === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Nenhum papel de pessoa para este cadastro. Cadastre em{' '}
        <Link href="/settings/contratos/papeis" className="text-primary hover:underline">Configurações → Papéis</Link>.
      </p>
    )
  }

  // ── leitura ──
  if (readOnly) {
    if (!loaded) return <p className="text-xs text-muted-foreground">Carregando…</p>
    if (rows.length === 0) return <p className="text-xs text-muted-foreground">Nenhum responsável.</p>
    return (
      <div className="rounded-md border divide-y divide-border/50">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[12rem_1fr] items-center gap-2 px-3 py-1.5">
            <span className="text-xs text-muted-foreground truncate">{papelLabel(r.papelId)}</span>
            <span className="text-xs font-medium truncate">{userName(r)}</span>
          </div>
        ))}
      </div>
    )
  }

  // ── edição ──
  const COLS = 'grid grid-cols-[12rem_1fr_1.25rem] items-center gap-2'
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className={cn(COLS, 'px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Papel</span><span>Responsável</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {rows.map((r, i) => (
              <div key={i} className="group grid grid-cols-[12rem_1fr_1.25rem] items-center gap-2 px-3 py-1.5 hover:bg-muted/30">
                <select value={r.papelId} onChange={e => setRow(i, { papelId: e.target.value })} className={selCls}>
                  <option value="">Selecione o papel...</option>
                  {r.papelId && !papeisPessoa.some(p => p.id === r.papelId) && <option value={r.papelId}>{papelLabel(r.papelId)}</option>}
                  {papeisPessoa.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <UserSelect value={r.userId || undefined} onChange={id => setRow(i, { userId: id ?? '', userName: undefined })} placeholder="Selecionar responsável..." />
                <button type="button" onClick={() => remRow(i)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar responsável</button>
        {saving === 'saving' && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />salvando…</span>}
        {saving === 'saved' && <span className="inline-flex items-center gap-1 text-[11px] text-primary"><Check className="h-3 w-3" />salvo</span>}
      </div>
    </div>
  )
}
