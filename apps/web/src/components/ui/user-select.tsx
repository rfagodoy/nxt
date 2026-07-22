'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, Check, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSelectableUsers } from '@/hooks/use-users'

interface UserSelectProps {
  value?: string
  onChange: (userId: string | undefined) => void
  placeholder?: string
  disabled?: boolean
  /** Ids a esconder da lista (ex.: usuários já escolhidos noutra linha). */
  exclude?: string[]
  className?: string
  /** Permite limpar a seleção (botão ×). */
  clearable?: boolean
}

/** Seletor de Usuário do sistema (buscável). Reutilizável em Responsáveis, executor
 *  de workflow, etc. Lista via GET /api/users/selectable (usuários ATIVOS). */
export function UserSelect({
  value, onChange, placeholder = 'Selecionar usuário...', disabled, exclude = [], className, clearable,
}: UserSelectProps) {
  const { users, loading } = useSelectableUsers()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [up, setUp] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = users.find((u) => u.id === value)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return users
      .filter((u) => u.id === value || !exclude.includes(u.id))
      .filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
  }, [users, q, exclude, value])

  const reveal = () => {
    if (disabled) return
    setOpen(true); setQ('')
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setUp(window.innerHeight - rect.bottom < 280)
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : reveal())}
        className={cn(
          'flex h-7 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-2.5 text-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/40',
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.name : (value ? '(usuário removido)' : placeholder)}
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          {clearable && value && !disabled && (
            <span role="button" tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
              className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></span>
          )}
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <>
          {/* clique fora fecha */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className={cn('glass absolute z-30 w-full min-w-[14rem] rounded-xl text-popover-foreground', up ? 'bottom-full mb-1' : 'mt-1')}>
            <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full bg-transparent text-xs focus-visible:outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-56 overflow-auto py-1">
              {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Carregando…</div>}
              {!loading && filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum usuário encontrado.</div>}
              {filtered.map((u) => (
                <button
                  key={u.id} type="button"
                  onClick={() => { onChange(u.id); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', u.id === value ? 'text-primary' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{u.email}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
