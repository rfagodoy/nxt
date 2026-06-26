'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, Search, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { ModuleColumn } from '@nxt/types'

const STATUS_CLS: Record<string, { label: string; cls: string }> = {
  RUNNING:   { label: 'Em andamento', cls: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Concluído',    cls: 'bg-green-100 text-green-800'   },
  CANCELLED: { label: 'Cancelado',    cls: 'bg-red-100 text-red-700'       },
  ERROR:     { label: 'Erro',         cls: 'bg-red-100 text-red-700'       },
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'currency') {
    const num = Number(value)
    return isNaN(num) ? String(value) : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (type === 'date') {
    try { return new Date(String(value)).toLocaleDateString('pt-BR') } catch { return String(value) }
  }
  if (type === 'checkbox') return value ? 'Sim' : 'Não'
  return String(value)
}

export interface TableRecord {
  id: string
  data: Record<string, unknown>
  processInstance?: { status: string; currentStep: string }
  createdAt: string
}

interface DynamicTableProps {
  columns: ModuleColumn[]
  records: TableRecord[]
  total: number
  page: number
  pageSize: number
  baseHref: string
  onSearch: (q: string) => void
  onPageChange: (page: number) => void
  onSort: (col: string, dir: 'asc' | 'desc') => void
  sortCol?: string
  sortDir?: 'asc' | 'desc'
}

export function DynamicTable({
  columns, records, total, page, pageSize, baseHref,
  onSearch, onPageChange, onSort, sortCol, sortDir,
}: DynamicTableProps) {
  const [search, setSearch] = useState('')
  const visibleCols = columns.filter((c) => c.showInList)
  const totalPages  = Math.ceil(total / pageSize)

  const handleSearch = (val: string) => { setSearch(val); onSearch(val) }

  const handleSort = (col: ModuleColumn) => {
    if (!col.sortable) return
    onSort(col.name, sortCol === col.name && sortDir === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Buscar registros..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground ml-auto">{total} registro{total !== 1 ? 's' : ''}</p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  className={`text-left px-3 py-2 font-medium text-muted-foreground ${col.sortable ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="flex flex-col">
                        <ChevronUp   className={`h-3 w-3 -mb-1 ${sortCol === col.name && sortDir === 'asc'  ? 'text-primary' : 'text-muted-foreground/40'}`} />
                        <ChevronDown className={`h-3 w-3       ${sortCol === col.name && sortDir === 'desc' ? 'text-primary' : 'text-muted-foreground/40'}`} />
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Criado em</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 4} className="text-center py-10 text-xs text-muted-foreground">
                  Nenhum registro encontrado
                </td>
              </tr>
            ) : records.map((record, idx) => {
              const status = record.processInstance?.status
              const badge  = status ? STATUS_CLS[status] : null
              return (
                <tr key={record.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                  <td className="px-3 py-1.5 text-muted-foreground">{(page - 1) * pageSize + idx + 1}</td>
                  {visibleCols.map((col) => (
                    <td key={col.id} className="px-3 py-1.5">
                      {formatValue(record.data[col.name], col.type)}
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    {badge && (
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                    {new Date(record.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      href={`${baseHref}/records/${record.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="h-6 px-2 rounded border text-xs disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="h-6 px-2 rounded border text-xs disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
