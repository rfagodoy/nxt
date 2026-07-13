'use client'

import { useState, useEffect, useMemo, type ElementType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Search, FileDown } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { exportExcel } from '@/lib/export-excel'

interface CatalogEntry {
  code: string
  descricao: string
}

interface Props {
  title: string
  description: string
  icon: ElementType
  /** Endpoint da API (via BFF), ex.: '/api/cnae' ou '/api/natureza-juridica'. */
  endpoint: string
  /** true = busca no servidor (catálogos grandes, ex. CNAE); false = filtra localmente. */
  serverSearch?: boolean
  codeLabel?: string
}

/**
 * Página de CONSULTA (somente leitura) de um catálogo de referência nacional.
 * Segue o MESMO visual das Tabelas auxiliares (LookupTablePage), mas sem os
 * controles de edição — o dado é oficial (IBGE/Receita) e não se edita, só se
 * busca. Catálogos grandes (CNAE) buscam no servidor; pequenos filtram local.
 */
export function CatalogViewPage({ title, description, icon: Icon, endpoint, serverSearch, codeLabel = 'Código' }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const pathname = usePathname()
  const backHref = pathname.split('/').slice(0, -1).join('/') || '/settings'

  const [all, setAll]         = useState<CatalogEntry[]>([])
  const [rows, setRows]       = useState<CatalogEntry[]>([])
  const [search, setSearch]   = useState('')
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
      setRows(q ? all.filter(r => r.code.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q)) : all)
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

  const capped = serverSearch && rows.length >= 100

  const handleExport = async () => {
    const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    await exportExcel({
      fileName: slug || 'catalogo',
      sheet: title.slice(0, 28),
      title,
      columns: [
        { header: '#', width: 6, align: 'center' },
        { header: codeLabel, width: 16 },
        { header: 'Descrição' },
      ],
      rows: rows.map((r, i) => [i + 1, r.code, r.descricao]),
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-3">

      {/* cabeçalho — igual ao das Tabelas auxiliares */}
      <div className="flex items-center gap-2.5">
        <Link href={backHref} title="Voltar para o hub"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="p-2 rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* toolbar: buscar · exportar */}
      {mounted && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={serverSearch ? 'Buscar por código ou descrição...' : 'Buscar...'}
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
          </div>
          <button type="button" onClick={() => { void handleExport() }} disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto">
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>
        </div>
      )}

      {!mounted ? (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-pulse">
          <div className="h-9 bg-muted/40 border-b" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 border-b last:border-0 flex items-center px-4 gap-4">
              <div className="h-3 w-4 bg-muted rounded" /><div className="h-3 w-24 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-12rem)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 [&_th]:bg-muted">
                <tr className="border-b">
                  <th className="text-left px-4 py-1.5 font-medium text-muted-foreground w-8">#</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-32">{codeLabel}</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Nenhum resultado para a busca.</td></tr>
                ) : rows.map((r, idx) => (
                  <tr key={r.code} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-1 text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-1 font-mono text-muted-foreground whitespace-nowrap">{r.code}</td>
                    <td className="px-3 py-1 font-medium">{r.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mounted && (
        <p className="text-[11px] text-muted-foreground text-center">
          {loading ? 'carregando…' : <>{rows.length}{capped ? '+' : ''} registro{rows.length !== 1 ? 's' : ''}{capped && ' — refine a busca para ver itens específicos'}</>}
        </p>
      )}
    </div>
  )
}
