'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown,
  SlidersHorizontal, X, Check, Bookmark, ChevronDown, LayoutList,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, Settings2,
  Trash2, FileText, Calendar, Users, Banknote, TrendingUp, Paperclip,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useViews, type ViewState } from '@/hooks/use-views'
import ExcelJS from 'exceljs'
import { SettingsDrawer } from '@/components/contracts/field-drawer'
import ContractNewForm from '@/components/contracts/contract-new-form'
import { useContractForm, IdentificacaoFields, VigenciaFields, ValoresFields, ReajustesFields, PartesFields, DocumentosFields } from '@/components/contracts/contract-fields'
import { emptyContractForm, contractFromApi, contractToPayload } from '@/lib/contract-options'
import { EntitySearchModal } from '@/components/contracts/entity-search-modal'
import { getLogUser } from '@/hooks/use-partner-logs'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import { useContractFields, useContractDefaultColumns, useContractFieldVisibility, NATIVE_FIELDS, COLUMN_ORDER_RESET_EVENT } from '@/hooks/use-contract-fields'

/* ── dados mock ── */
const MOCK = [
  { id: '1',  numero: 'CTR-2026-001', titulo: 'Prestação de Serviços de TI',      tipo: 'Prestação de Serviços', parte_principal: 'Tech Solutions Ltda',    inicio: '2026-01-01', termino: '2026-12-31', valor_total: 120000, situacao: 'ATIVO',     documento: '12.345.678/0001-99', papel: 'CONTRATADA', data_assinatura: '2025-12-28', moeda: 'BRL', valor_parcela: 10000,    condicao_pagamento: 'Mensal'     },
  { id: '2',  numero: 'CTR-2026-002', titulo: 'Fornecimento de Equipamentos',      tipo: 'Fornecimento de Bens',  parte_principal: 'Global Imports Inc.',     inicio: '2026-02-01', termino: '2026-07-31', valor_total: 85000,  situacao: 'ATIVO',     documento: 'US-98765432',        papel: 'CONTRATADA', data_assinatura: '2026-01-25', moeda: 'USD', valor_parcela: 14166.67, condicao_pagamento: 'Trimestral' },
  { id: '3',  numero: 'CTR-2026-003', titulo: 'Licença de Software ERP',           tipo: 'Licença de Software',  parte_principal: 'Euro Logistics GmbH',     inicio: '2026-03-01', termino: null,          valor_total: 36000,  situacao: 'ATIVO',     documento: 'DE123456789',        papel: 'CONTRATADA', data_assinatura: '2026-02-20', moeda: 'EUR', valor_parcela: 3000,     condicao_pagamento: 'Mensal'     },
  { id: '4',  numero: 'CTR-2025-018', titulo: 'Locação de Veículos',               tipo: 'Locação',              parte_principal: 'Distribuidora Norte S/A', inicio: '2025-06-01', termino: '2026-05-31', valor_total: 48000,  situacao: 'ENCERRADO', documento: '45.678.901/0001-23', papel: 'CONTRATADA', data_assinatura: '2025-05-20', moeda: 'BRL', valor_parcela: 4000,     condicao_pagamento: 'Mensal'     },
  { id: '5',  numero: 'CTR-2026-004', titulo: 'Parceria Comercial Exportação',     tipo: 'Parceria / Convênio',  parte_principal: 'Pacific Trade Co.',       inicio: '2026-04-01', termino: '2027-03-31', valor_total: 200000, situacao: 'PENDENTE',  documento: 'US-55778899',        papel: 'CONTRATADA', data_assinatura: '2026-03-28', moeda: 'USD', valor_parcela: 16666.67, condicao_pagamento: 'Mensal'     },
  { id: '6',  numero: 'CTR-2026-005', titulo: 'Serviços de Segurança Patrimonial', tipo: 'Prestação de Serviços', parte_principal: 'Serviços Nacionais Ltda', inicio: '2026-01-15', termino: '2027-01-14', valor_total: 72000,  situacao: 'ATIVO',     documento: '11.222.333/0001-44', papel: 'CONTRATADA', data_assinatura: '2026-01-10', moeda: 'BRL', valor_parcela: 6000,     condicao_pagamento: 'Mensal'     },
  { id: '7',  numero: 'CTR-2025-015', titulo: 'Compra de Matéria Prima',           tipo: 'Fornecimento de Bens',  parte_principal: 'Agro Exportações S/A',   inicio: '2025-09-01', termino: '2026-08-31', valor_total: 310000, situacao: 'ATIVO',     documento: '22.333.444/0001-55', papel: 'CONTRATADA', data_assinatura: '2025-08-25', moeda: 'BRL', valor_parcela: 25833.33, condicao_pagamento: 'Mensal'     },
  { id: '8',  numero: 'CTR-2024-030', titulo: 'Contrato de Consultoria Jurídica',  tipo: 'Prestação de Serviços', parte_principal: 'Rafael Monteiro',         inicio: '2024-01-01', termino: '2025-12-31', valor_total: 60000,  situacao: 'ENCERRADO', documento: '123.456.789-00',     papel: 'CONTRATADA', data_assinatura: '2023-12-20', moeda: 'BRL', valor_parcela: 5000,     condicao_pagamento: 'Mensal'     },
]

const SIT_CLS: Record<string, string> = {
  ATIVO:      'bg-green-100 text-green-800',
  PENDENTE:   'bg-yellow-100 text-yellow-800',
  REVISAO:    'bg-blue-100 text-blue-700',
  ENCERRADO:  'bg-gray-100 text-gray-600',
  RESCINDIDO: 'bg-red-100 text-red-700',
  SUSPENSO:   'bg-orange-100 text-orange-700',
}
const SIT_LABEL: Record<string, string> = {
  ATIVO: 'Ativo', PENDENTE: 'Pend. assinatura', REVISAO: 'Em revisão',
  ENCERRADO: 'Encerrado', RESCINDIDO: 'Rescindido', SUSPENSO: 'Suspenso',
}

const COLUMNS = [
  { key: 'numero',          label: 'Número'         },
  { key: 'titulo',          label: 'Título'         },
  { key: 'tipo',            label: 'Tipo'           },
  { key: 'parte_principal', label: 'Partes'         },
  { key: 'inicio',          label: 'Início'         },
  { key: 'termino',         label: 'Término'        },
  { key: 'valor_total',     label: 'Valor total'    },
  { key: 'situacao',        label: 'Situação'       },
]

const OPERATORS = [
  { value: 'contains',    label: 'Contém'        },
  { value: 'notContains', label: 'Não contém'    },
  { value: 'eq',          label: 'Igual a'       },
  { value: 'neq',         label: 'Diferente de'  },
  { value: 'startsWith',  label: 'Começa com'    },
  { value: 'endsWith',    label: 'Termina com'   },
  { value: 'gt',          label: 'Maior que'     },
  { value: 'gte',         label: 'Maior ou igual'},
  { value: 'lt',          label: 'Menor que'     },
  { value: 'lte',         label: 'Menor ou igual'},
]

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500]
const COL_ORDER_KEY     = 'primeapps:columns:contratos'

type Row = (typeof MOCK)[0] & {
  objeto?: string[]
  contratante_nome?: string; contratante_doc?: string
  contratada_nome?: string;  contratada_doc?: string
}
interface SortState { col: string; dir: 'asc' | 'desc' }
interface FilterRow { id: string; col: string; op: string; value: string }

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

function fieldValue(r: Row, key: string): string {
  if (key === 'valor_total') return String(r.valor_total)
  if (key === 'termino')     return r.termino ?? ''
  return String(r[key as keyof Row] ?? '')
}

function applyOp(field: string, op: string, val: string): boolean {
  const f = field.toLowerCase(), v = val.toLowerCase()
  switch (op) {
    case 'eq':         return f === v
    case 'neq':        return f !== v
    case 'contains':   return f.includes(v)
    case 'notContains':return !f.includes(v)
    case 'startsWith': return f.startsWith(v)
    case 'endsWith':   return f.endsWith(v)
    case 'gt':  return f > v; case 'gte': return f >= v
    case 'lt':  return f < v; case 'lte': return f <= v
    default:    return true
  }
}

function stateKey(s: ViewState): string {
  return JSON.stringify({ sort: s.sort, filters: s.filters.filter(f => f.value.trim()), logic: s.logic })
}

function pageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

interface CTab { id: string; label: string; pinned: boolean; row?: Row; type?: 'new' }

const SIT_DOT_CLS: Record<string, string> = {
  ATIVO:      'bg-green-500',
  PENDENTE:   'bg-yellow-500 animate-pulse',
  REVISAO:    'bg-blue-500 animate-pulse',
  ENCERRADO:  'bg-gray-400',
  RESCINDIDO: 'bg-red-500',
  SUSPENSO:   'bg-orange-500',
}

/* painel de aba: só renderiza quando a aba está ativa */
function DSection({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null
  return <div className="rounded-lg border bg-card p-4 space-y-3">{children}</div>
}

/* ══════════════════════════════════════════════════════════════ */
function ContractDetailView({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved?: () => void }) {
  const form = useContractForm({
    ...emptyContractForm(),
    numero: row.numero, titulo: row.titulo, tipo: row.tipo, situacao: row.situacao,
    valorTotal: String(row.valor_total ?? ''), objeto: row.objeto ?? [],
  })
  const v = form.values
  const router  = useRouter()
  const [empresas,    setEmpresas]    = useState<{ id: string; nome: string; documento: string }[]>([])
  const [searchModal, setSearchModal] = useState<{ parteId: string; origem: string } | null>(null)
  useEffect(() => {
    const orgId = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev'
    void (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/group-companies?organizationId=${orgId}`)
        if (res.ok) {
          const data = await res.json() as { rows: { id: string; razaoSocial: string; nomeFantasia?: string | null; cnpj?: string | null }[] }
          setEmpresas((data.rows ?? []).map(c => ({ id: c.id, nome: c.nomeFantasia || c.razaoSocial, documento: c.cnpj ?? '' })))
        }
      } catch {}
    })()
  }, [])

  const [tab,          setTab]          = useState<string>('dados_gerais')
  const [showMotivo,   setShowMotivo]   = useState(false)
  const [motivoAction, setMotivoAction] = useState('')
  const [motivo,       setMotivo]       = useState('')
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)

  /* carrega o registro completo (a Row da listagem é só um resumo) */
  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${row.id}`)
        if (!res.ok || cancel) return
        const c = await res.json() as Record<string, unknown>
        form.setValues(contractFromApi(c))
      } catch { /* mantém o fallback vindo da Row */ }
    })()
    return () => { cancel = true }
  }, [row.id])

  const locked = ['ATIVO', 'ENCERRADO', 'RESCINDIDO', 'SUSPENSO'].includes(v.situacao)

  const sectionTabs = [
    { id: 'dados_gerais', label: 'Dados Gerais',      icon: FileText },
    { id: 'vigencia',     label: 'Vigência',          icon: Calendar },
    { id: 'valor',        label: 'Valor e Pagamento', icon: Banknote },
    { id: 'reajuste',     label: 'Reajuste',          icon: TrendingUp },
    { id: 'partes',       label: 'Partes',            icon: Users },
    { id: 'documentos',   label: 'Documentos',        icon: Paperclip },
  ]

  const confirmAction = () => {
    const map: Record<string, string> = {
      assinar: 'ATIVO', revisao: 'REVISAO', aprovar: 'ATIVO', devolver: 'PENDENTE',
      encerrar: 'ENCERRADO', suspender: 'SUSPENSO', rescindir: 'RESCINDIDO',
      reativar: 'ATIVO', reabrir: 'ATIVO',
    }
    const newStatus = map[motivoAction]
    setShowMotivo(false); setMotivo(''); setMotivoAction('')
    if (newStatus) form.set('situacao', newStatus)
  }

  const handleSave = async () => {
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${row.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(contractToPayload(v, { user: getLogUser() })),
      })
      if (res.ok) { onSaved?.() }
      else setSaveError(`Erro ao salvar contrato (${res.status}).`)
    } catch {
      setSaveError('Não foi possível conectar ao servidor.')
    } finally {
      setSaving(false)
    }
  }

  const motivoLabels: Record<string, string> = {
    assinar: 'Confirmar registro de assinatura',
    revisao: 'Motivo da abertura para revisão',
    aprovar: 'Confirmar aprovação do contrato',
    devolver: 'Motivo da devolução',
    encerrar: 'Motivo do encerramento',
    suspender: 'Motivo da suspensão',
    rescindir: 'Motivo da rescisão',
    reativar: 'Motivo da reativação',
    reabrir: 'Motivo da reabertura',
  }

  return (
    <div className="space-y-3 pb-6">

      {/* cabeçalho de identidade */}
      <div className="rounded-lg border bg-card px-4 py-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate max-w-[460px]">{v.titulo || row.titulo || 'Sem título'}</h2>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', SIT_CLS[v.situacao])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', SIT_DOT_CLS[v.situacao] ?? 'bg-gray-400')} />
              {SIT_LABEL[v.situacao]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-mono">{v.numero}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{v.tipo}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>
          {!showMotivo && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
          {v.situacao === 'PENDENTE' && !showMotivo && (
            <>
              <button type="button" onClick={() => { setMotivoAction('assinar'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Registrar Assinatura
              </button>
            </>
          )}
          {v.situacao === 'REVISAO' && !showMotivo && (
            <>
              <button type="button" onClick={() => { setMotivoAction('devolver'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-yellow-200 text-yellow-700 px-3 text-xs font-medium hover:bg-yellow-50 dark:hover:bg-yellow-950/40 transition-colors">
                Devolver
              </button>
              <button type="button" onClick={() => { setMotivoAction('aprovar'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Aprovar
              </button>
            </>
          )}
          {v.situacao === 'ATIVO' && !showMotivo && (
            <>
              <button type="button" onClick={() => { setMotivoAction('revisao'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
                Abrir para revisão
              </button>
              <button type="button" onClick={() => { setMotivoAction('suspender'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-orange-200 text-orange-600 px-3 text-xs font-medium hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors">
                Suspender
              </button>
              <button type="button" onClick={() => { setMotivoAction('encerrar'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-gray-300 text-gray-600 px-3 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                Encerrar
              </button>
              <button type="button" onClick={() => { setMotivoAction('rescindir'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-red-200 text-red-600 px-3 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                Rescindir
              </button>
            </>
          )}
          {v.situacao === 'SUSPENSO' && !showMotivo && (
            <button type="button" onClick={() => { setMotivoAction('reativar'); setShowMotivo(true) }}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Reativar
            </button>
          )}
          {v.situacao === 'ENCERRADO' && !showMotivo && (
            <button type="button" onClick={() => { setMotivoAction('reabrir'); setShowMotivo(true) }}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Reabrir
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
          {saveError}
        </div>
      )}

      {/* prompt de motivo */}
      {showMotivo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{motivoLabels[motivoAction]}</p>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            placeholder="Descreva o motivo..." autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setShowMotivo(false); setMotivo('') }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={confirmAction} disabled={!motivo.trim()}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Confirmar</button>
          </div>
        </div>
      )}

      {/* sub-abas por seção */}
      <div className="flex items-center gap-1 flex-wrap border-b pb-2">
        {sectionTabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      <form className="space-y-2" onSubmit={e => e.preventDefault()}>
        <DSection active={tab === 'dados_gerais'}><IdentificacaoFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'vigencia'}><VigenciaFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'valor'}><ValoresFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'reajuste'}><ReajustesFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'partes'}>
          <PartesFields form={form} ro={locked}
            onOpenSearch={(parteId, origem) => setSearchModal({ parteId, origem })}
            onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')} />
        </DSection>
        <DSection active={tab === 'documentos'}><DocumentosFields form={form} ro={locked} /></DSection>
      </form>

      {searchModal && (
        <EntitySearchModal
          origem={searchModal.origem}
          empresas={empresas}
          onSelect={(e) => { form.setParteEntity(searchModal.parteId, e); setSearchModal(null) }}
          onClose={() => setSearchModal(null)}
          onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════ */
export default function ContratosPage() {
  const { views, saveView, deleteView } = useViews('contratos')
  const { fields: customFields }        = useContractFields()
  const { isColumnVisible }             = useContractDefaultColumns()
  const { isVisibleInTable }            = useContractFieldVisibility()
  const tableFields = customFields.filter(f => f.visible === 'form_and_table')
  const baseColumns = useMemo(() => COLUMNS.filter(c => isColumnVisible(c.key)), [isColumnVisible])
  const nativeTableCols = NATIVE_FIELDS.filter(f => isVisibleInTable(f.key)).map(f => ({ key: f.key, label: f.label }))

  const [allContratos, setAllContratos] = useState<Row[]>([])
  const loadContratos = useCallback(async (): Promise<Row[]> => {
    const orgId = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev'
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts?organizationId=${orgId}`)
      if (res.ok) {
        const data = await res.json() as { rows: Row[] }
        const rows = data.rows ?? []
        setAllContratos(rows)
        return rows
      }
    } catch {}
    return []
  }, [])
  useEffect(() => { void loadContratos() }, [loadContratos])

  /* ── column order + drag ── */
  const [columnOrder, setColumnOrder] = useState<string[]>(() => COLUMNS.map(c => c.key))
  const [dragFrom,    setDragFrom]    = useState<number | null>(null)
  const [dragOver,    setDragOver]    = useState<number | null>(null)
  const storageLoaded = useRef(false)

  useEffect(() => {
    setColumnOrder(prev => {
      let base = prev
      if (!storageLoaded.current) {
        storageLoaded.current = true
        const s = cacheRead<string[] | null>(COL_ORDER_KEY, null); if (s) base = s
      }
      const allKeys = [...baseColumns.map(c => c.key), ...nativeTableCols.map(c => c.key), ...tableFields.map(f => f.name)]
      const reconciled = [...base.filter((k: string) => allKeys.includes(k)), ...allKeys.filter(k => !base.includes(k))]
      return reconciled.join(',') === prev.join(',') && base === prev ? prev : reconciled
    })
  }, [tableFields, baseColumns, nativeTableCols])

  useEffect(() => {
    if (!storageLoaded.current) return
    pushSetting(COL_ORDER_KEY, columnOrder)
  }, [columnOrder])

  /* hidrata a ordem das colunas a partir do backend no mount */
  useEffect(() => {
    void pullSetting<string[]>(COL_ORDER_KEY).then(remote => { if (remote) setColumnOrder(remote) })
  }, [])

  /* reset da ordem das colunas (disparado por "Restaurar padrão") */
  useEffect(() => {
    const handler = () => setColumnOrder(COLUMNS.map(c => c.key))
    window.addEventListener(COLUMN_ORDER_RESET_EVENT, handler)
    return () => window.removeEventListener(COLUMN_ORDER_RESET_EVENT, handler)
  }, [])

  const allColumns = useMemo(() => [
    ...baseColumns,
    ...nativeTableCols,
    ...tableFields.map(f => ({ key: f.name, label: f.label })),
  ], [baseColumns, nativeTableCols, tableFields])

  const orderedColumns = useMemo(() =>
    columnOrder.map(k => allColumns.find(c => c.key === k)).filter((c): c is typeof COLUMNS[0] => !!c),
    [columnOrder, allColumns],
  )

  const handleDragStart = (idx: number) => setDragFrom(idx)
  const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); if (idx !== dragOver) setDragOver(idx) }
  const handleDrop      = (idx: number) => {
    if (dragFrom === null || dragFrom === idx) return
    const next = [...columnOrder]; const [m] = next.splice(dragFrom, 1); next.splice(idx, 0, m)
    setColumnOrder(next)
  }
  const clearDrag = () => { setDragFrom(null); setDragOver(null) }

  /* ── estado da página ── */
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [sort,         setSort]         = useState<SortState | null>({ col: 'numero', dir: 'desc' })
  const [showFilters,  setShowFilters]  = useState(false)
  const [showViews,    setShowViews]    = useState(false)
  const [logic,        setLogic]        = useState<'AND' | 'OR'>('AND')
  const [filters,      setFilters]      = useState<FilterRow[]>([])
  const [saving,       setSaving]       = useState(false)
  const [viewName,     setViewName]     = useState('')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(10)
  const [showFields,   setShowFields]   = useState(false)

  /* ── abas ── */
  const [tabs,        setTabs]        = useState<CTab[]>([{ id: 'lista', label: 'Lista', pinned: true }])
  const [activeTabId, setActiveTabId] = useState('lista')

  const openContractTab = (row: Row) => {
    const existing = tabs.find(t => t.row?.id === row.id)
    if (existing) { setActiveTabId(existing.id); return }
    const id = `tab_${row.id}`
    setTabs(prev => [...prev, { id, label: row.numero, pinned: false, row }])
    setActiveTabId(id)
  }

  const closeContractTab = (tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId))
    if (activeTabId === tabId) setActiveTabId('lista')
  }

  const openNewContractTab = () => {
    const existing = tabs.find(t => t.id === 'tab_new')
    if (existing) { setActiveTabId('tab_new'); return }
    setTabs(prev => [...prev, { id: 'tab_new', label: 'Novo contrato', pinned: false, type: 'new' }])
    setActiveTabId('tab_new')
  }

  const handleContractSaved = async (result?: { id?: string }) => {
    const rows = await loadContratos()
    const row  = result?.id ? rows.find(r => r.id === result.id) : undefined
    setTabs(prev => prev.filter(t => t.id !== 'tab_new'))
    if (row) openContractTab(row)
    else setActiveTabId('lista')
  }

  const contractTabsRef              = useRef<HTMLDivElement>(null)
  const [canScrollLeft,  setCanScrollLeft]  = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = contractTabsRef.current
    if (!el) return
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    check()
    el.addEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [tabs])

  const scrollTabs = (dir: 'left' | 'right') =>
    contractTabsRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })

  const saveInputRef = useRef<HTMLInputElement>(null)
  const viewsRef     = useRef<HTMLDivElement>(null)

  useEffect(() => { if (saving) saveInputRef.current?.focus() }, [saving])
  useEffect(() => {
    if (!showViews) return
    const h = (e: MouseEvent) => { if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) setShowViews(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showViews])
  useEffect(() => { setPage(1) }, [search, filters, sort, logic, pageSize])

  const selectView = (id: string | null) => {
    setActiveViewId(id); setShowViews(false)
    if (!id) { setSort({ col: 'numero', dir: 'desc' }); setFilters([]); setLogic('AND'); setShowFilters(false) }
    else { const v = views.find(v => v.id === id); if (!v) return; setSort(v.sort); setFilters(v.filters); setLogic(v.logic) }
  }

  const addFilter    = () => setFilters(p => [...p, { id: `f${Date.now()}`, col: 'numero', op: 'contains', value: '' }])
  const removeFilter = (id: string) => setFilters(p => p.filter(f => f.id !== id))
  const updateFilter = (id: string, key: keyof FilterRow, val: string) => setFilters(p => p.map(f => f.id === id ? { ...f, [key]: val } : f))
  const clearFilters = () => { setFilters([]); setSort(null); setLogic('AND') }
  const handleSort   = (col: string) => setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const handleSaveView = () => {
    if (!viewName.trim()) return
    const v = saveView(viewName.trim(), { sort, filters: filters.filter(f => f.value.trim()), logic })
    setActiveViewId(v.id); setSaving(false); setViewName('')
  }
  const handleDeleteView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); deleteView(id); if (activeViewId === id) selectView(null)
  }

  const handleExport = async () => {
    const HEADERS = COLUMNS.map(c => c.label)
    const wb = new ExcelJS.Workbook(); wb.creator = 'primeApps'; wb.created = new Date()
    const ws = wb.addWorksheet('Contratos')
    const exportName = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'
    ws.addRow([`Exportação — ${exportName}`]); ws.mergeCells(1, 1, 1, HEADERS.length)
    const t = ws.getCell('A1'); t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; t.alignment = { vertical: 'middle', horizontal: 'center' }; ws.getRow(1).height = 28
    const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    ws.addRow([`Gerado em ${date}  •  ${filteredRows.length} registro${filteredRows.length !== 1 ? 's' : ''}`]); ws.mergeCells(2, 1, 2, HEADERS.length)
    const s = ws.getCell('A2'); s.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } }
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; s.alignment = { vertical: 'middle', horizontal: 'center' }; ws.getRow(2).height = 18
    const hr = ws.addRow(HEADERS)
    hr.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } } })
    ws.getRow(3).height = 20
    filteredRows.forEach((r, i) => {
      const row = ws.addRow([r.numero, r.titulo, r.tipo, r.parte_principal, fmtDate(r.inicio), fmtDate(r.termino), BRL.format(r.valor_total), SIT_LABEL[r.situacao] ?? r.situacao])
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } }; c.font = { size: 10 } }); row.height = 18
    })
    ws.columns.forEach((col, i) => { col.width = Math.min((HEADERS[i]?.length ?? 10) + 8, 60) })
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `contratos_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
  }

  const isModified = useMemo(() => {
    if (!activeViewId) return false
    const v = views.find(v => v.id === activeViewId); if (!v) return false
    return stateKey({ sort, filters, logic }) !== stateKey({ sort: v.sort, filters: v.filters, logic: v.logic })
  }, [activeViewId, views, sort, filters, logic])

  const filteredRows = useMemo(() => {
    let data = [...allContratos]
    const q = search.trim().toLowerCase()
    if (q) data = data.filter(r => COLUMNS.some(c => fieldValue(r, c.key).toLowerCase().includes(q)))
    const active = filters.filter(f => f.value.trim())
    if (active.length) data = data.filter(r => { const res = active.map(f => applyOp(fieldValue(r, f.col), f.op, f.value)); return logic === 'AND' ? res.every(Boolean) : res.some(Boolean) })
    if (sort) data.sort((a, b) => { const cmp = fieldValue(a, sort.col).localeCompare(fieldValue(b, sort.col), 'pt-BR', { sensitivity: 'base' }); return sort.dir === 'asc' ? cmp : -cmp })
    return data
  }, [allContratos, search, sort, filters, logic])

  const totalFiltered      = filteredRows.length
  const totalPages         = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage           = Math.min(page, totalPages)
  const pageRows           = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const firstItem          = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize + 1
  const lastItem           = Math.min(safePage * pageSize, totalFiltered)
  const totalAll           = allContratos.length
  const activeFiltersCount = filters.filter(f => f.value.trim()).length
  const activeViewName     = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'

  function renderCell(row: Row, key: string, colIdx: number) {
    const sticky = colIdx === 0
      ? 'sticky left-0 z-[1] bg-card group-hover/row:bg-muted/30 transition-colors'
      : ''
    switch (key) {
      case 'numero':
        return <td key={key} className={cn('px-3 py-1 font-medium font-mono whitespace-nowrap', sticky)}><button type="button" onClick={() => openContractTab(row)} className="hover:text-primary hover:underline text-left">{row.numero}</button></td>
      case 'titulo':
        return <td key={key} className={cn('px-3 py-1 font-medium max-w-[200px] truncate', sticky)}>{row.titulo}</td>
      case 'tipo':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{row.tipo}</td>
      case 'parte_principal': {
        const linha = (label: string, nome?: string, doc?: string) => nome ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-muted-foreground shrink-0">{label}</span>
            <span className="font-medium text-foreground truncate max-w-[160px]">{nome}</span>
            {doc && <span className="text-[10px] text-muted-foreground/80 shrink-0">{doc}</span>}
          </span>
        ) : null
        const ctn = linha('Contratante', row.contratante_nome, row.contratante_doc)
        const ctd = linha('Contratada', row.contratada_nome, row.contratada_doc)
        return (
          <td key={key} className={cn('px-3 py-1 text-xs', sticky)}>
            {ctn || ctd ? <div className="flex flex-col gap-0.5">{ctn}{ctd}</div> : <span className="text-muted-foreground">{row.parte_principal || '—'}</span>}
          </td>
        )
      }
      case 'inicio':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground tabular-nums whitespace-nowrap', sticky)}>{fmtDate(row.inicio)}</td>
      case 'termino':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground tabular-nums whitespace-nowrap', sticky)}>{fmtDate(row.termino)}</td>
      case 'valor_total':
        return <td key={key} className={cn('px-3 py-1 text-right tabular-nums whitespace-nowrap', sticky)}>{BRL.format(row.valor_total)}</td>
      case 'situacao':
        return <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}><span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${SIT_CLS[row.situacao]}`}>{SIT_LABEL[row.situacao]}</span></td>
      default: {
        const v = (row as Record<string, unknown>)[key]
        let display: React.ReactNode = (v as string) || '—'
        if (key === 'valor_parcela')        display = v ? BRL.format(Number(v)) : '—'
        else if (key === 'data_assinatura') display = fmtDate((v as string) || null)
        else if (key === 'papel')           display = v ? (v as string) : '—'
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap',
          (key === 'valor_parcela' || key === 'data_assinatura') && 'tabular-nums', key === 'valor_parcela' && 'text-right', sticky)}>{display}</td>
      }
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (!sort || sort.col !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  }

  function SelFilter({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
    return <select value={value} onChange={e => onChange(e.target.value)} className={cn('h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}>{children}</select>
  }

  return (
    <>
    {/* barra de abas */}
    <div className="flex items-end border-b mb-3">

      {/* aba Lista — sempre visível */}
      <div className={cn(
        'flex items-center px-3 py-2 border-b-2 cursor-pointer whitespace-nowrap transition-colors shrink-0',
        activeTabId === 'lista' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}>
        <button type="button" onClick={() => setActiveTabId('lista')} className="text-xs font-medium">Lista</button>
      </div>

      {tabs.length > 1 && (
        <>
          <div className="w-px h-4 bg-border self-center mx-1 shrink-0" />

          <button type="button" onClick={() => scrollTabs('left')}
            className={cn('flex items-center justify-center h-6 w-5 shrink-0 self-center rounded transition-all text-muted-foreground',
              canScrollLeft ? 'opacity-100 hover:bg-muted hover:text-foreground' : 'opacity-0 pointer-events-none')}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <div ref={contractTabsRef}
            className="flex items-end overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
            {tabs.filter(t => !t.pinned).map(tab => (
              <div key={tab.id}
                className={cn(
                  'group flex items-center gap-1 px-3 py-2 border-b-2 cursor-pointer whitespace-nowrap transition-colors shrink-0',
                  activeTabId === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}>
                <button type="button" onClick={() => setActiveTabId(tab.id)} className="text-xs font-medium max-w-[200px] truncate">
                  {tab.label}
                </button>
                <button type="button" onClick={() => closeContractTab(tab.id)}
                  className="ml-0.5 flex items-center justify-center h-4 w-4 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => scrollTabs('right')}
            className={cn('flex items-center justify-center h-6 w-5 shrink-0 self-center rounded transition-all text-muted-foreground',
              canScrollRight ? 'opacity-100 hover:bg-muted hover:text-foreground' : 'opacity-0 pointer-events-none')}>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>

    {/* abas de detalhe — todas montadas, inativa fica hidden */}
    {tabs.filter(t => !t.pinned).map(tab => (
      <div key={tab.id} className={activeTabId === tab.id ? '' : 'hidden'}>
        {tab.type === 'new' ? (
          <div className="max-w-3xl mx-auto">
            <ContractNewForm
              embedded
              onSaved={handleContractSaved}
              onCancel={() => closeContractTab(tab.id)}
            />
          </div>
        ) : (
          <ContractDetailView row={tab.row!} onClose={() => closeContractTab(tab.id)} onSaved={() => { void loadContratos() }} />
        )}
      </div>
    ))}

    {/* aba Lista */}
    <div className={activeTabId === 'lista' ? '' : 'hidden'}>
    <div className="space-y-3">

      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Contratos</h1>
          <p className="text-[11px] text-muted-foreground">
            {activeViewId
              ? <>Visão: <span className="text-primary font-medium">{activeViewName}</span>{isModified && <span className="ml-1.5 text-orange-400">(modificada)</span>}</>
              : 'Gestão de contratos'
            }
          </p>
        </div>
        <button type="button" onClick={openNewContractTab}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />Novo contrato
        </button>
      </div>

      {/* cards de resumo */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: 'Total',       value: totalAll,                                                          cls: 'text-foreground'  },
          { label: 'Ativos',      value: allContratos.filter(r => r.situacao === 'ATIVO').length,      cls: 'text-green-600'   },
          { label: 'Pendentes',   value: allContratos.filter(r => r.situacao === 'PENDENTE').length,   cls: 'text-yellow-600'  },
          { label: 'Em revisão',  value: allContratos.filter(r => r.situacao === 'REVISAO').length,    cls: 'text-blue-600'    },
          { label: 'Encerrados',  value: allContratos.filter(r => r.situacao === 'ENCERRADO').length,  cls: 'text-gray-500'    },
          { label: 'Rescindidos', value: allContratos.filter(r => r.situacao === 'RESCINDIDO').length, cls: 'text-red-600'     },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-lg border bg-card px-3 py-2 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Buscar em todas as colunas..." />
          </div>

          <button onClick={() => { setShowFilters(v => !v); setShowViews(false); if (!filters.length) addFilter() }}
            className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
              showFilters || activeFiltersCount > 0 ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
            <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
            {activeFiltersCount > 0 && <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{activeFiltersCount}</span>}
          </button>

          <div ref={viewsRef} className="relative">
            <button onClick={() => { setShowViews(v => !v); setShowFilters(false) }}
              className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
                activeViewId ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
              <LayoutList className="h-3.5 w-3.5" />{activeViewId ? activeViewName : 'Visões'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showViews && 'rotate-180')} />
            </button>
            {showViews && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-lg border bg-card shadow-lg py-1">
                <button onClick={() => selectView(null)} className={cn('flex w-full items-center gap-3 px-3 py-2 text-xs transition-colors', !activeViewId ? 'text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                  <Check className={cn('h-3.5 w-3.5 shrink-0', !activeViewId ? 'opacity-100' : 'opacity-0')} /><span>Todos</span>
                </button>
                {views.length > 0 && <div className="my-1 h-px bg-border" />}
                {views.map(v => (
                  <div key={v.id} className="group/item flex items-center">
                    <button onClick={() => selectView(v.id)} className={cn('flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-xs transition-colors', activeViewId === v.id ? 'text-primary font-medium' : 'text-foreground hover:bg-muted')}>
                      <Check className={cn('h-3.5 w-3.5 shrink-0', activeViewId === v.id ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{v.name}</span>
                    </button>
                    <button onClick={e => handleDeleteView(e, v.id)} className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-all"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saving ? (
            <div className="flex items-center gap-1">
              <input ref={saveInputRef} value={viewName} onChange={e => setViewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') { setSaving(false); setViewName('') } }}
                placeholder="Nome da visão..."
                className="h-7 w-40 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <button onClick={handleSaveView} disabled={!viewName.trim()} className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setSaving(false); setViewName('') }} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setSaving(true); setShowViews(false) }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
              <Bookmark className="h-3.5 w-3.5" />Salvar visão
            </button>
          )}

          <button onClick={() => setShowFields(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-auto">
            <Settings2 className="h-3.5 w-3.5" />Configurações
          </button>

          <button onClick={() => { void handleExport() }} disabled={totalFiltered === 0}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>

          <p className="text-[11px] text-muted-foreground">
            {totalFiltered === totalAll ? <>{totalAll} registro{totalAll !== 1 ? 's' : ''}</> : <>{totalFiltered} de {totalAll} registro{totalAll !== 1 ? 's' : ''}</>}
          </p>
        </div>

        {showFilters && (
          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">Combinar condições com:</span>
              <div className="flex rounded-md border overflow-hidden">
                {(['AND', 'OR'] as const).map(l => (
                  <button key={l} onClick={() => setLogic(l)} className={cn('px-3 py-1 text-xs font-semibold transition-colors', logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                    {l === 'AND' ? 'E' : 'OU'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {filters.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{idx === 0 ? 'Se' : logic === 'AND' ? 'E' : 'OU'}</span>
                  <SelFilter value={f.col} onChange={v => updateFilter(f.id, 'col', v)} className="w-36">
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </SelFilter>
                  <SelFilter value={f.op} onChange={v => updateFilter(f.id, 'op', v)} className="w-36">
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SelFilter>
                  <input value={f.value} onChange={e => updateFilter(f.id, 'value', e.target.value)} placeholder="Valor..."
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={addFilter} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar condição</button>
              {activeFiltersCount > 0 && <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar filtros</button>}
            </div>
          </div>
        )}
      </div>

      {/* tabela */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              {orderedColumns.map((col, idx) => (
                <th key={col.key} draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => { handleDrop(idx); clearDrag() }}
                  onDragEnd={clearDrag}
                  className={cn(
                    'text-left px-3 py-1.5 font-medium text-muted-foreground select-none cursor-grab active:cursor-grabbing transition-all whitespace-nowrap',
                    col.key === 'valor_total' && 'text-right',
                    idx === 0 && 'sticky left-0 z-10 bg-muted/40',
                    dragFrom === idx && 'opacity-40',
                    dragOver === idx && dragOver !== dragFrom && 'border-l-2 border-primary bg-primary/5',
                  )}>
                  <button draggable={false} onClick={() => handleSort(col.key)} className="group inline-flex items-center hover:text-foreground transition-colors">
                    {col.label}<SortIcon col={col.key} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={orderedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhum contrato encontrado.</td></tr>
            ) : pageRows.map(r => (
              <tr key={r.id} className="group/row border-b last:border-0 hover:bg-muted/30 transition-colors">
                {orderedColumns.map((col, colIdx) => renderCell(r, col.key, colIdx))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Linhas por página:</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              className="h-6 rounded border border-input bg-background px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-[11px] text-muted-foreground">{totalFiltered === 0 ? '0' : `${firstItem}–${lastItem}`} de {totalFiltered}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '...' ? <span key={`e${i}`} className="flex h-6 w-6 items-center justify-center text-[11px] text-muted-foreground">…</span>
              : <button key={p} onClick={() => setPage(p)} className={cn('flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium transition-colors', safePage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{p}</button>
            )}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
    </div>{/* fim aba Lista */}

    {showFields && <SettingsDrawer onClose={() => setShowFields(false)} />}
    </>
  )
}
