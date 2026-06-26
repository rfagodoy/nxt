'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, LayoutDashboard, List, TrendingUp, AlertTriangle } from 'lucide-react'
import { DynamicTable, type TableRecord } from '@/components/modules/dynamic-table'
import { apiFetch } from '@/lib/http'
import type { ModuleSchema } from '@nxt/types'

interface Module {
  id: string
  name: string
  slug: string
  schema: ModuleSchema
}

interface DashboardData {
  total: number
  byStatus: Array<{ status: string; count: number }>
}

const STATUS_LABEL: Record<string, string> = {
  RUNNING:   'Em andamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  ERROR:     'Erro',
}

const STATUS_COLOR: Record<string, string> = {
  RUNNING:   'text-yellow-600',
  COMPLETED: 'text-green-600',
  CANCELLED: 'text-red-500',
  ERROR:     'text-red-700',
}

export function ModuleDetail({
  module,
  dashboard,
}: {
  module: Module
  dashboard: DashboardData | null
}) {
  const [tab, setTab]       = useState<'dashboard' | 'records'>('dashboard')
  const [records, setRecords] = useState<TableRecord[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [sortCol, setSortCol] = useState<string | undefined>()
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [loading, setLoading] = useState(false)

  const fetchRecords = useCallback(
    async (p: number, search?: string, col?: string, dir?: 'asc' | 'desc') => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: '20' })
        if (search) params.set('search', search)
        const res  = await apiFetch(`/api/modules/${module.slug}/records?${params}`)
        const data = await res.json()
        setRecords(data.data)
        setTotal(data.total)
        setPage(p)
        if (col) { setSortCol(col); setSortDir(dir || 'asc') }
      } finally {
        setLoading(false)
      }
    },
    [module.slug],
  )

  const handleTabChange = (t: 'dashboard' | 'records') => {
    setTab(t)
    if (t === 'records' && records.length === 0) fetchRecords(1)
  }

  const completedCount = dashboard?.byStatus.find((s) => s.status === 'COMPLETED')?.count ?? 0
  const runningCount   = dashboard?.byStatus.find((s) => s.status === 'RUNNING')?.count   ?? 0
  const cancelledCount = dashboard?.byStatus.find((s) => s.status === 'CANCELLED')?.count ?? 0

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Link href="/modules" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Módulos
            </Link>
            <span className="text-[11px] text-muted-foreground">/</span>
            <span className="text-[11px] font-medium">{module.name}</span>
          </div>
          <h1 className="text-base font-semibold tracking-tight">{module.name}</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {module.schema.columns.length} campos configurados
          </p>
        </div>
        <Link
          href={`/modules/${module.slug}/records/new`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo registro
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b">
        {([
          { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { key: 'records',   label: 'Registros', icon: List            },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            {[
              { label: 'Total',        value: dashboard?.total ?? 0, cls: 'text-foreground'  },
              { label: 'Concluídos',   value: completedCount,        cls: 'text-green-600'   },
              { label: 'Em andamento', value: runningCount,           cls: 'text-yellow-600'  },
              { label: 'Cancelados',   value: cancelledCount,         cls: 'text-red-500'     },
            ].map(({ label, value, cls }) => (
              <div key={label} className="rounded-lg border bg-card px-3 py-2 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {dashboard && dashboard.byStatus.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold">Distribuição por status</h3>
              </div>
              <div className="space-y-2">
                {dashboard.byStatus.map(({ status, count }) => {
                  const pct = dashboard.total > 0 ? (count / dashboard.total) * 100 : 0
                  return (
                    <div key={status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={STATUS_COLOR[status] || ''}>{STATUS_LABEL[status] || status}</span>
                        <span className="text-muted-foreground font-medium">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {dashboard?.total === 0 && (
            <div className="rounded-lg border bg-card p-8 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">Nenhum registro ainda</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Crie o primeiro registro para ver os dados aqui
                </p>
              </div>
              <Link
                href={`/modules/${module.slug}/records/new`}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Criar primeiro registro
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Records Tab */}
      {tab === 'records' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
              Carregando registros...
            </div>
          ) : (
            <DynamicTable
              columns={module.schema.columns}
              records={records}
              total={total}
              page={page}
              pageSize={20}
              baseHref={`/modules/${module.slug}`}
              onSearch={(q) => fetchRecords(1, q)}
              onPageChange={(p) => fetchRecords(p)}
              onSort={(col, dir) => fetchRecords(page, undefined, col, dir)}
              sortCol={sortCol}
              sortDir={sortDir}
            />
          )}
        </div>
      )}
    </div>
  )
}
