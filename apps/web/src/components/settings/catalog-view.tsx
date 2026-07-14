'use client'

import { useState, useEffect, useMemo, type ElementType } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/http'
import { exportExcel } from '@/lib/export-excel'
import { useCatalogInactive } from '@/hooks/use-catalogs'
import { SettingsTableShell, type StatusFilter } from './settings-table-shell'

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
  /** Chave do AppSetting com os codes desativados (por org). */
  inativosKey: string
  /** true = catálogo grande (ex. CNAE ~1.332): carrega tudo de `${endpoint}/all`.
   *  false = endpoint já devolve o catálogo inteiro (ex. Natureza Jurídica, 92). */
  largeCatalog?: boolean
  codeLabel?: string
}

/**
 * Página de consulta de um catálogo de referência nacional (CNAE/Natureza Jurídica).
 * É uma tabela de apoio READ-ONLY: renderiza suas linhas dentro do SettingsTableShell
 * (mesma casca das demais /settings/tabelas/*), sem Adicionar/editar/excluir — só o
 * toggle de ATIVAÇÃO por organização (quais aparecem para seleção nos parceiros,
 * guardado num AppSetting admin-only). O catálogo (código+descrição) é global/oficial.
 *
 * Carrega o catálogo por inteiro (CNAE ~1.332 = payload pequeno) e filtra no cliente.
 * O combobox do parceiro segue usando a busca server-side `/api/cnae?search=`.
 */
export function CatalogViewPage({ title, description, icon: Icon, endpoint, inativosKey, largeCatalog, codeLabel = 'Código' }: Props) {
  const { inactive, toggle } = useCatalogInactive(inativosKey)

  const [all, setAll]         = useState<CatalogEntry[]>([])
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)

  // Carga única do catálogo inteiro.
  useEffect(() => {
    let alive = true
    setLoading(true)
    void (async () => {
      const url = largeCatalog ? `${endpoint}/all` : endpoint
      const data = await apiJson<CatalogEntry[]>(url)
      if (!alive) return
      setAll(data ?? [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [endpoint, largeCatalog])

  const isActive = (code: string) => !inactive.has(code)

  // Busca + filtro de status (sobre o catálogo completo).
  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(r => {
      if (q && !r.code.toLowerCase().includes(q) && !r.descricao.toLowerCase().includes(q)) return false
      if (status === 'active')   return isActive(r.code)
      if (status === 'inactive') return !isActive(r.code)
      return true
    })
  }, [all, search, status, inactive]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = all.reduce((n, r) => n + (isActive(r.code) ? 1 : 0), 0)

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
        { header: 'Ativo', width: 10, align: 'center' },
      ],
      rows: displayed.map((r, i) => [i + 1, r.code, r.descricao, isActive(r.code) ? 'Sim' : 'Não']),
    })
  }

  const footer = loading
    ? 'carregando…'
    : displayed.length === all.length
      ? <>{all.length} registro{all.length !== 1 ? 's' : ''} · {activeCount} ativo{activeCount !== 1 ? 's' : ''}</>
      : <>{displayed.length} de {all.length} registro{all.length !== 1 ? 's' : ''}</>

  return (
    <SettingsTableShell
      title={title} description={description} icon={Icon}
      search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por código ou descrição..."
      status={status} onStatusChange={setStatus}
      onExport={handleExport} exportDisabled={displayed.length === 0}
      footer={footer}
    >
      <thead className="sticky top-0 z-10 [&_th]:bg-muted">
        <tr className="border-b">
          <th className="text-left px-4 py-1.5 font-medium text-muted-foreground w-8">#</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-32">{codeLabel}</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Descrição</th>
          <th className="text-center px-3 py-1.5 font-medium text-muted-foreground w-20">Ativo</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
        ) : displayed.length === 0 ? (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhum resultado para a busca/filtro.</td></tr>
        ) : displayed.map((r, idx) => (
          <tr key={r.code} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors', !isActive(r.code) && 'opacity-50')}>
            <td className="px-4 py-1 text-muted-foreground tabular-nums">{idx + 1}</td>
            <td className="px-3 py-1 font-mono text-muted-foreground whitespace-nowrap">{r.code}</td>
            <td className="px-3 py-1 font-medium">{r.descricao}</td>
            <td className="px-3 py-1 text-center">
              <button type="button" onClick={() => toggle(r.code)} title={isActive(r.code) ? 'Desativar' : 'Ativar'}
                className="inline-flex items-center justify-center transition-colors">
                {isActive(r.code) ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </SettingsTableShell>
  )
}
