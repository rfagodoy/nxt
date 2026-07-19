'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/http'

/** Tipo de entidade-anfitriã de um papel de pessoa. */
export type EntityKind = 'EMPRESA' | 'PARCEIRO' | 'UNIDADE' | 'CONTRATO'

interface Entity { id: string; label: string }
type Raw = Record<string, unknown>

// Achata unidades (podem vir em árvore com `children`).
function flatten(list: Raw[]): Raw[] {
  const out: Raw[] = []
  const walk = (items: Raw[]) => { for (const it of items) { out.push(it); const ch = it.children; if (Array.isArray(ch)) walk(ch as Raw[]) } }
  walk(list)
  return out
}
const s = (v: unknown) => (v == null ? '' : String(v))

const CFG: Record<EntityKind, { path: string; rows: (d: unknown) => Raw[]; label: (e: Raw) => string }> = {
  EMPRESA:  { path: '/api/group-companies', rows: (d) => (Array.isArray(d) ? (d as Raw[]) : []), label: (e) => s(e.nomeFantasia) || s(e.razaoSocial) || s(e.codigo) || s(e.id) },
  PARCEIRO: { path: '/api/partners',        rows: (d) => (Array.isArray(d) ? (d as Raw[]) : []), label: (e) => s(e.razaoSocial) || s(e.nomeFantasia) || s(e.documento) || s(e.id) },
  UNIDADE:  { path: '/api/org-units',       rows: (d) => (Array.isArray(d) ? flatten(d as Raw[]) : []), label: (e) => s(e.nome) || s(e.codigo) || s(e.id) },
  CONTRATO: { path: '/api/contracts',       rows: (d) => ((d as { rows?: Raw[] })?.rows ?? []), label: (e) => [s(e.numero), s(e.titulo)].filter(Boolean).join(' — ') || s(e.id) },
}

// cache por tipo (as listas mudam pouco durante o desenho de um processo)
const cache: Partial<Record<EntityKind, Entity[]>> = {}
const inflight: Partial<Record<EntityKind, Promise<Entity[]>>> = {}

async function fetchEntities(kind: EntityKind): Promise<Entity[]> {
  if (cache[kind]) return cache[kind]!
  if (!inflight[kind]) {
    const cfg = CFG[kind]
    inflight[kind] = apiJson<unknown>(cfg.path)
      .then((d) => { const list = cfg.rows(d).map((e) => ({ id: s(e.id), label: cfg.label(e) })); cache[kind] = list; delete inflight[kind]; return list })
      .catch(() => { delete inflight[kind]; return [] })
  }
  return inflight[kind]!
}

/** Seletor buscável de uma entidade (empresa/parceiro/unidade/contrato) por tipo. */
export function EntitySelect({ entityType, value, onChange, placeholder = 'Selecionar…', disabled }: {
  entityType: EntityKind
  value?: string
  onChange: (id: string | undefined) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [items, setItems] = useState<Entity[]>(cache[entityType] ?? [])
  const [loading, setLoading] = useState(!cache[entityType])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [up, setUp] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cache[entityType]) { setItems(cache[entityType]!); setLoading(false); return }
    let alive = true
    setLoading(true)
    void fetchEntities(entityType).then((l) => { if (alive) { setItems(l); setLoading(false) } })
    return () => { alive = false }
  }, [entityType])

  const selected = items.find((e) => e.id === value)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? items.filter((e) => e.label.toLowerCase().includes(term)) : items
  }, [items, q])

  const reveal = () => {
    if (disabled) return
    setOpen(true); setQ('')
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setUp(window.innerHeight - r.bottom < 280)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : reveal())}
        className={cn('flex h-7 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/40')}>
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : (value ? '(não encontrado)' : placeholder)}
        </span>
        <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className={cn('absolute z-30 w-full min-w-[16rem] rounded-md border bg-popover text-popover-foreground shadow-lg', up ? 'bottom-full mb-1' : 'mt-1')}>
            <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
                className="w-full bg-transparent text-xs focus-visible:outline-none placeholder:text-muted-foreground" />
            </div>
            <div className="max-h-56 overflow-auto py-1">
              {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Carregando…</div>}
              {!loading && filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nada encontrado.</div>}
              {filtered.map((e) => (
                <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                  <Check className={cn('h-3.5 w-3.5 shrink-0', e.id === value ? 'text-primary' : 'opacity-0')} />
                  <span className="truncate">{e.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
