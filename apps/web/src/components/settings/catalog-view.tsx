'use client'

import { useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'
import { apiJson } from '@/lib/http'

interface CatalogEntry {
  code: string
  descricao: string
}

interface Props {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  /** Endpoint da API (via BFF), ex.: '/api/cnae' ou '/api/natureza-juridica'. */
  endpoint: string
  /** true = busca no servidor (catálogos grandes, ex. CNAE); false = filtra localmente. */
  serverSearch?: boolean
  codeLabel?: string
}

/**
 * Página de CONSULTA (somente leitura) de um catálogo de referência nacional.
 * Diferente da LookupTablePage (editável), aqui o dado é oficial e não se edita —
 * só se busca. Catálogos grandes (CNAE) buscam no servidor; pequenos filtram local.
 */
export function CatalogViewPage({ title, description, icon: Icon, endpoint, serverSearch, codeLabel = 'Código' }: Props) {
  const [all, setAll] = useState<CatalogEntry[]>([])
  const [rows, setRows] = useState<CatalogEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Carga inicial.
  useEffect(() => {
    let alive = true
    setLoading(true)
    void (async () => {
      const data = await apiJson<CatalogEntry[]>(serverSearch ? `${endpoint}?limit=100` : endpoint)
      if (!alive) return
      setAll(data ?? [])
      setRows(data ?? [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [endpoint, serverSearch])

  // Busca: local (filtro) ou servidor (debounced).
  useEffect(() => {
    if (!serverSearch) {
      const q = search.trim().toLowerCase()
      setRows(q ? all.filter((r) => r.code.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q)) : all)
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      void (async () => {
        const data = await apiJson<CatalogEntry[]>(`${endpoint}?limit=100&search=${encodeURIComponent(search.trim())}`)
        setRows(data ?? [])
        setLoading(false)
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [search, serverSearch, all, endpoint])

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Link href="/settings/tabelas" className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={serverSearch ? 'Buscar por código ou descrição…' : 'Filtrar…'}
              className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary/50"
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {loading ? 'carregando…' : `${rows.length}${serverSearch && rows.length >= 100 ? '+' : ''} registro(s)`}
          </span>
        </div>

        <div className="max-h-[calc(100vh-16rem)] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-36 px-3 py-1.5 font-medium">{codeLabel}</th>
                <th className="px-3 py-1.5 font-medium">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-1 font-mono tabular-nums">{r.code}</td>
                  <td className="px-3 py-1">{r.descricao}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {serverSearch && (
        <p className="text-[11px] text-muted-foreground">
          Mostrando até 100 resultados por busca — refine o termo para encontrar itens específicos.
        </p>
      )}
    </div>
  )
}
