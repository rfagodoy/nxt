'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { ORIGEM } from '@/lib/contract-roles'

const inputCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

/* Ordem alfabética pt-BR (acento/caixa-insensível) para a lista de partes. */
const byNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })

export interface EntityRef  { ref_tipo: string; ref_id: string; nome: string; documento: string }
export interface EmpresaItem { id: string; nome: string; documento: string }

/**
 * Modal de busca da entidade da parte do contrato, dirigido pela ORIGEM do papel:
 * - EMPRESA_PARCEIRO: empresas do grupo (filtro client) + parceiros (busca server)
 * - UNIDADE: unidades da estrutura (busca server)
 * Busca server-side escala para milhares de registros.
 */
export function EntitySearchModal({ origem, empresas, excludeIds, onSelect, onClose, onNewPartner }: {
  origem: string
  empresas: EmpresaItem[]
  /** ids de entidades já usadas neste papel — não devem aparecer (evita duplicidade) */
  excludeIds?: string[]
  onSelect: (e: EntityRef) => void
  onClose: () => void
  onNewPartner: () => void
}) {
  const isUnidade = origem === ORIGEM.UNIDADE
  const exclude = useMemo(() => new Set(excludeIds ?? []), [excludeIds])
  const [q, setQ] = useState('')
  const [parceiros, setParceiros] = useState<EmpresaItem[]>([])
  const [unidades,  setUnidades]  = useState<{ id: string; nome: string; documento: string; empresa?: string; codigo?: string }[]>([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        if (isUnidade) {
          const res = await apiFetch(`/api/org-units?search=${encodeURIComponent(q.trim())}`)
          const data = res.ok ? (await res.json() as { id: string; nome: string; codigo?: string; empresa?: string }[]) : []
          setUnidades(data.map(u => ({ id: u.id, nome: u.nome, documento: u.codigo ?? '', empresa: u.empresa, codigo: u.codigo })))
        } else {
          const res = await apiFetch(`/api/partners/query`, {
            method: 'POST',
            /* somente parceiros ATIVOS podem ser vinculados a um contrato; ordem alfabética por nome
               (garante que, com >30 parceiros, venham os alfabeticamente primeiros) */
            body: JSON.stringify({ search: q.trim(), page: 1, pageSize: 30, filters: [{ col: 'status', op: 'eq', value: 'ATIVO' }], logic: 'AND', sort: { col: 'nome', dir: 'asc' } }),
          })
          const data = res.ok ? (await res.json() as { rows: { id: string; nome: string; identificador: string }[] }) : { rows: [] }
          setParceiros((data.rows ?? []).map(r => ({ id: r.id, nome: r.nome, documento: r.identificador })))
        }
      } catch { /* ignore */ } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, isUnidade])

  /* empresas do grupo PRIMEIRO, em ordem alfabética */
  const empresasFiltered = useMemo(() => {
    if (isUnidade) return []
    const lq = q.toLowerCase().trim(); const dq = q.replace(/\D/g, '')
    return empresas
      .filter(e => !exclude.has(e.id) && (!q || e.nome.toLowerCase().includes(lq) || (dq.length > 0 && e.documento.replace(/\D/g, '').includes(dq))))
      .sort(byNome)
  }, [q, empresas, isUnidade, exclude])

  /* parceiros DEPOIS, em ordem alfabética (o servidor já ordena; reordena no cliente para a
     exibição ficar consistente em pt-BR). Remove entidades já usadas neste papel. */
  const parceirosShown = useMemo(() => parceiros.filter(p => !exclude.has(p.id)).sort(byNome), [parceiros, exclude])
  const unidadesShown  = useMemo(() => unidades.filter(u => !exclude.has(u.id)), [unidades, exclude])

  const hasResults = isUnidade ? unidadesShown.length > 0 : (empresasFiltered.length + parceirosShown.length) > 0
  const title = isUnidade ? 'Selecionar unidade' : 'Selecionar empresa do grupo ou parceiro'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass rounded-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{title}</h2></div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-3 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder={isUnidade ? 'Buscar por nome ou código...' : 'Buscar por nome ou CPF/CNPJ...'} className={cn(inputCls, 'pl-9')} />
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-border/60 flex-1">
          {loading && <p className="px-4 py-3 text-xs text-muted-foreground">Buscando...</p>}

          {!isUnidade && empresasFiltered.map(e => (
            <button key={`emp_${e.id}`} type="button" onClick={() => onSelect({ ref_tipo: 'EMPRESA', ref_id: e.id, nome: e.nome, documento: e.documento })}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted transition-colors text-left">
              <span className="min-w-0 flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-primary/10 text-primary shrink-0">Empresa do grupo</span>
                <span className="text-xs font-medium truncate">{e.nome}</span>
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">{e.documento}</span>
            </button>
          ))}

          {!isUnidade && parceirosShown.map(p => (
            <button key={`par_${p.id}`} type="button" onClick={() => onSelect({ ref_tipo: 'PARCEIRO', ref_id: p.id, nome: p.nome, documento: p.documento })}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted transition-colors text-left">
              <span className="min-w-0 flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-muted text-muted-foreground shrink-0">Parceiro</span>
                <span className="text-xs font-medium truncate">{p.nome}</span>
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">{p.documento}</span>
            </button>
          ))}

          {isUnidade && unidadesShown.map(u => (
            <button key={`un_${u.id}`} type="button" onClick={() => onSelect({ ref_tipo: 'UNIDADE', ref_id: u.id, nome: u.nome, documento: u.documento })}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted transition-colors text-left">
              <span className="min-w-0 truncate"><span className="text-xs font-medium">{u.nome}</span>{u.empresa && <span className="text-[10px] text-muted-foreground ml-1.5">· {u.empresa}</span>}</span>
              {u.codigo && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{u.codigo}</span>}
            </button>
          ))}

          {!loading && !hasResults && (
            <p className="px-4 py-10 text-center text-xs text-muted-foreground">{q ? `Nenhum resultado para "${q}"` : 'Digite para buscar'}</p>
          )}
        </div>

        {!isUnidade && (
          <div className="px-4 py-2.5 border-t flex items-center justify-between bg-muted/20 shrink-0">
            <button type="button" onClick={onNewPartner} className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"><Plus className="h-3 w-3" />Cadastrar novo parceiro</button>
            <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}
