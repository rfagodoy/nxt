'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown,
  SlidersHorizontal, X, Check, Bookmark, ChevronDown, LayoutList,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, Settings2,
  Building2, Phone, MapPin, CreditCard, Users, Trash2, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { useViews, type ViewState } from '@/hooks/use-views'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import ExcelJS from 'exceljs'
import { SettingsDrawer } from '@/components/partners/field-drawer'
import { usePartnerFields, useFieldVisibility, useDefaultColumns, NATIVE_FIELDS, CORE_TABLE_KEYS, COLUMN_ORDER_RESET_EVENT } from '@/hooks/use-partner-fields'
import { getLogUser } from '@/hooks/use-partner-logs'
import { usePartnerSections } from '@/hooks/use-partner-sections'
import PartnerNewForm from '@/components/partners/partner-new-form'

interface PartnerAPI {
  id: string
  organizationId: string
  categoria: string
  status: string
  documento: string | null
  razaoSocial: string
  nomeFantasia: string | null
  ie: string | null
  im: string | null
  rg: string | null
  orgaoExpedidor: string | null
  dataNascimento: string | null
  paisOrigem: string | null
  contatos: DCon[]
  enderecos: DEnd[]
  bancos: DBan[]
  socios: DSoc[]
  createdAt: string
  updatedAt: string
}


const STATUS_CLS: Record<string, string> = {
  ATIVO:            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  EM_CADASTRAMENTO: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  INATIVO:          'bg-muted text-muted-foreground',
}
const STATUS_LABEL: Record<string, string> = {
  ATIVO:            'Ativo',
  EM_CADASTRAMENTO: 'Em cadastramento',
  INATIVO:          'Inativo',
}
const TIPO_CLS: Record<string, string> = {
  'PJ Brasileira': 'bg-blue-500/10 text-blue-600 dark:text-blue-400', 'PJ Estrangeira': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'PF Brasileira': 'bg-teal-500/10 text-teal-600 dark:text-teal-400', 'PF Estrangeira': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
}

const COLUMNS = [
  { key: 'nome',          label: 'Nome / Razão Social' },
  { key: 'categoria',     label: 'Categoria'           },
  { key: 'identificador', label: 'Identificador'       },
  { key: 'cidade',        label: 'Localização'         },
  { key: 'contato',       label: 'Contato'             },
  { key: 'status',        label: 'Status'              },
]

const OPERATORS = [
  { value: 'contains',      label: 'Contém'           },
  { value: 'notContains',   label: 'Não contém'       },
  { value: 'eq',            label: 'Igual a'          },
  { value: 'neq',           label: 'Diferente de'     },
  { value: 'startsWith',    label: 'Começa com'       },
  { value: 'notStartsWith', label: 'Não começa com'   },
  { value: 'endsWith',      label: 'Termina com'      },
  { value: 'notEndsWith',   label: 'Não termina com'  },
  { value: 'gt',            label: 'Maior que'        },
  { value: 'gte',           label: 'Maior ou igual a' },
  { value: 'lt',            label: 'Menor que'        },
  { value: 'lte',           label: 'Menor ou igual a' },
]

/* ── filtros do Histórico (auditoria) — client-side ── */
const HIST_COLUMNS = [
  { key: 'ts',     label: 'Data / Hora'    },
  { key: 'user',   label: 'Usuário'        },
  { key: 'label',  label: 'Campo Alterado' },
  { key: 'before', label: 'Valor Anterior' },
  { key: 'after',  label: 'Novo Valor'     },
]

function fmtAuditTs(ts: string): string {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function matchAudit(cell: string, op: string, raw: string): boolean {
  const c = cell.toLowerCase(), v = raw.toLowerCase()
  const nc = Number(cell.replace(',', '.')), nv = Number(raw.replace(',', '.'))
  const bothNum = cell.trim() !== '' && raw.trim() !== '' && !Number.isNaN(nc) && !Number.isNaN(nv)
  switch (op) {
    case 'eq':            return c === v
    case 'neq':           return c !== v
    case 'startsWith':    return c.startsWith(v)
    case 'notStartsWith': return !c.startsWith(v)
    case 'endsWith':      return c.endsWith(v)
    case 'notEndsWith':   return !c.endsWith(v)
    case 'notContains':   return !c.includes(v)
    case 'gt':            return bothNum ? nc >  nv : c >  v
    case 'gte':           return bothNum ? nc >= nv : c >= v
    case 'lt':            return bothNum ? nc <  nv : c <  v
    case 'lte':           return bothNum ? nc <= nv : c <= v
    default:              return c.includes(v)
  }
}

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500]
const COL_ORDER_KEY     = 'primeapps:columns:parceiros'

interface Row {
  id: string; nome: string; categoria: string; identificador: string
  cidade: string; estado: string; contato: string; status: string
  /* campos nativos extras — retornados pela API */
  nomeFantasia: string; ie: string; im: string; paisOrigem: string
  rg: string; orgaoExpedidor: string; dataNascimento: string
  email: string; telefone: string; celular: string; cargo: string; website: string
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string
  address1: string; address2: string; endPais: string
  banco: string; tipoConta: string; agencia: string; conta: string; pix: string
  socNome: string; socDoc: string; socPart: string; socCargo: string
  [key: string]: string
}

interface SortState  { col: string; dir: 'asc' | 'desc' }
interface FilterRow  { id: string; col: string; op: string; value: string }

/* ── tipos e helpers para o formulário de detalhe ── */
type DetailCategory = 'PJ_BR' | 'PJ_EST' | 'PF_BR' | 'PF_EST'
const DETAIL_CATS: { value: DetailCategory; label: string }[] = [
  { value: 'PJ_BR',  label: 'PJ Brasileira'  },
  { value: 'PJ_EST', label: 'PJ Estrangeira' },
  { value: 'PF_BR',  label: 'PF Brasileira'  },
  { value: 'PF_EST', label: 'PF Estrangeira' },
]
const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

interface DCon  { id: string; email: string; nome: string; telefone: string; celular: string; cargo: string; website: string }
interface DEnd  { id: string; cep: string; estado: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; address1: string; address2: string; pais_endereco: string }
interface DBan  { id: string; banco: string; tipo_conta: string; agencia: string; conta: string; pix: string }
interface DSoc  { id: string; nome: string; documento: string; participacao: string; cargo: string }

const newDCon = (nome = ''): DCon => ({ id: `c_${Date.now()}_${Math.random()}`, email: '', nome, telefone: '', celular: '', cargo: '', website: '' })
const newDEnd = (cidade = '', estado = ''): DEnd => ({ id: `e_${Date.now()}_${Math.random()}`, cep: '', estado, logradouro: '', numero: '', complemento: '', bairro: '', cidade, address1: '', address2: '', pais_endereco: '' })
const newDBan = (): DBan => ({ id: `b_${Date.now()}_${Math.random()}`, banco: '', tipo_conta: '', agencia: '', conta: '', pix: '' })

interface TabData { id: string; label: string; pinned: boolean; partner?: PartnerAPI; type?: 'detail' | 'new'; loading?: boolean }

interface AuditChange { field: string; label: string; before: string; after: string }
interface AuditEntry  { id: string; createdAt: string; user: string; event: string; motivo: string | null; changes: AuditChange[] }


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

/* ── lista de países ── */
const PAISES = [
  'Afeganistão','África do Sul','Albânia','Alemanha','Angola','Arábia Saudita','Argélia',
  'Argentina','Armênia','Austrália','Áustria','Azerbaijão','Bangladesh','Belarus','Bélgica',
  'Benin','Bolívia','Bósnia e Herzegovina','Botsuana','Brasil','Bulgária','Burkina Faso',
  'Camarões','Camboja','Canadá','Cazaquistão','Chile','China','Chipre','Colômbia','Congo',
  'Coreia do Norte','Coreia do Sul','Costa do Marfim','Costa Rica','Croácia','Cuba',
  'Dinamarca','Egito','El Salvador','Emirados Árabes Unidos','Equador','Eritreia','Eslováquia',
  'Eslovênia','Espanha','Estados Unidos','Etiópia','Filipinas','Finlândia','França','Gana',
  'Geórgia','Grécia','Guatemala','Guiné','Haiti','Honduras','Hungria','Iêmen','Índia',
  'Indonésia','Irã','Iraque','Irlanda','Israel','Itália','Jamaica','Japão','Jordânia',
  'Quênia','Kosovo','Kuwait','Laos','Líbano','Líbia','Lituânia','Luxemburgo','Malásia',
  'Mali','Marrocos','Mauritânia','México','Moçambique','Mongólia','Myanmar','Nepal',
  'Nicarágua','Nigéria','Noruega','Nova Zelândia','Omã','Paquistão','Panamá','Paraguai',
  'Peru','Polônia','Portugal','Qatar','Reino Unido','República Checa','República Dominicana',
  'Romênia','Rússia','Ruanda','Senegal','Sérvia','Serra Leoa','Singapura','Síria','Somália',
  'Sri Lanka','Sudão','Suécia','Suíça','Tailândia','Taiwan','Tanzânia','Togo','Tunísia',
  'Turquia','Ucrânia','Uganda','Uruguai','Uzbequistão','Venezuela','Vietnã','Zimbábue',
]

/* ── funções de máscara ── */

function maskCNPJ(v: string): string {
  const d = v.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 14)
  if (d.length <=  2) return d
  if (d.length <=  5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <=  8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}
function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}
function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (!d.length)      return ''
  if (d.length <=  2) return `(${d}`
  if (d.length <=  6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
}
function maskCelular(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d.length)      return ''
  if (d.length <=  2) return `(${d}`
  if (d.length <=  7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

/* ── componentes internos para detalhe/edição ── */

const dinputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/40'
/* modo leitura: dado como texto (sem caixa) quando o cadastro está travado */
const dreadCls  = 'flex h-5 w-full items-center bg-transparent px-0 text-[13px] font-medium text-foreground border-0 shadow-none disabled:cursor-default disabled:opacity-100'

function DField({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

/* painel de aba: só renderiza quando a aba está ativa (o título agora é a própria sub-aba) */
function DSection({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null
  return <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">{children}</div>
}

function DCard({ index, total, label, onRemove, locked, children }: { index: number; total: number; label: string; onRemove: () => void; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">{label} {index + 1}</span>
          {index === 0 && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">Principal</span>}
        </div>
        {total > 1 && !locked && <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function PartnerDetailView({ partner, onClose, onSaved }: {
  partner: PartnerAPI
  onClose: () => void
  onSaved: () => void
}) {
  const formRef                            = useRef<HTMLFormElement>(null)
  const [category,     setCategory]        = useState<DetailCategory>(partner.categoria as DetailCategory)
  const [tab,          setTab]             = useState<string>('identificacao')
  const [contatos,     setContatos]        = useState<DCon[]>(partner.contatos?.length ? partner.contatos : [newDCon()])
  const [enderecos,    setEnderecos]       = useState<DEnd[]>(partner.enderecos?.length ? partner.enderecos : [newDEnd()])
  const [bancos,       setBancos]          = useState<DBan[]>(partner.bancos?.length ? partner.bancos : [newDBan()])
  const [socios,       setSocios]          = useState<DSoc[]>(partner.socios ?? [])
  const [situacao,     setSituacao]        = useState(partner.status)
  const [showMotivo,   setShowMotivo]      = useState(false)
  const [motivo,       setMotivo]          = useState('')
  const [motivoAction, setMotivoAction]    = useState<'habilitar' | 'inativar' | 'reativar' | ''>('')
  const [razaoSocial,  setRazaoSocial]     = useState(partner.razaoSocial ?? '')
  const [nomeFantasia, setNomeFantasia]    = useState(partner.nomeFantasia ?? '')
  const [ieValue,      setIeValue]         = useState(partner.ie ?? '')
  const [imValue,      setImValue]         = useState(partner.im ?? '')
  const [rgValue,      setRgValue]         = useState(partner.rg ?? '')
  const [orgaoValue,   setOrgaoValue]      = useState(partner.orgaoExpedidor ?? '')
  const [dataNascV,    setDataNascV]       = useState(partner.dataNascimento ?? '')
  const [paisOrigemV,  setPaisOrigemV]     = useState(partner.paisOrigem ?? (partner.categoria === 'PF_BR' ? 'Brasil' : ''))
  const [saving,       setSaving]          = useState(false)
  const [saveError,    setSaveError]       = useState<string | null>(null)
  const [docValue,     setDocValue]        = useState(() => {
    const v = partner.documento ?? ''
    const cat = partner.categoria as string
    return cat === 'PJ_BR' ? maskCNPJ(v) : cat === 'PF_BR' ? maskCPF(v) : v
  })
  const [audit, setAudit]                  = useState<AuditEntry[]>([])
  const fetchAudit = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/partners/${partner.id}/audit`)
      if (res.ok) setAudit(await res.json() as AuditEntry[])
    } catch {}
  }, [partner.id])
  useEffect(() => { void fetchAudit() }, [fetchAudit])

  /* linhas planas: cada alteração vira uma linha (Data/Hora e Usuário repetidos) */
  const auditRows = audit.flatMap(e =>
    (e.changes ?? []).map((c, i) => ({
      key: `${e.id}_${i}`, ts: e.createdAt, user: e.user,
      motivo: c.field === 'status' ? e.motivo : null,
      label: c.label, before: c.before, after: c.after,
    })),
  )

  /* filtros do histórico (client-side, igual à tabela de parceiros) */
  const [showHistFilters, setShowHistFilters] = useState(false)
  const [histLogic,       setHistLogic]       = useState<'AND' | 'OR'>('AND')
  const [histFilters,     setHistFilters]     = useState<{ id: string; col: string; op: string; value: string }[]>([])

  const addHistFilter    = () => setHistFilters(p => [...p, { id: `hf${Date.now()}`, col: 'label', op: 'contains', value: '' }])
  const removeHistFilter = (id: string) => setHistFilters(p => p.filter(f => f.id !== id))
  const updateHistFilter = (id: string, key: 'col' | 'op' | 'value', val: string) =>
    setHistFilters(p => p.map(f => f.id === id ? { ...f, [key]: val } : f))
  const clearHistFilters = () => setHistFilters([])

  const activeHistFilters = histFilters.filter(f => f.value.trim())
  const filteredAuditRows = auditRows.filter(r => {
    if (!activeHistFilters.length) return true
    const cellOf = (col: string) => col === 'ts' ? fmtAuditTs(r.ts) : String((r as Record<string, unknown>)[col] ?? '')
    const res = activeHistFilters.map(f => matchAudit(cellOf(f.col), f.op, f.value.trim()))
    return histLogic === 'AND' ? res.every(Boolean) : res.some(Boolean)
  })

  const histSelCls = 'h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  const docCatMounted = useRef(false)
  useEffect(() => {
    if (!docCatMounted.current) { docCatMounted.current = true; return }
    setDocValue('')
    setPaisOrigemV(category === 'PF_BR' ? 'Brasil' : '')
  }, [category])

  const isPJ   = category === 'PJ_BR' || category === 'PJ_EST'
  const isBR   = category === 'PJ_BR' || category === 'PF_BR'
  const locked = situacao !== 'EM_CADASTRAMENTO'

  const docLabel = category === 'PJ_BR' ? 'CNPJ' : category === 'PF_BR' ? 'CPF' : 'Código'
  const catLabel = DETAIL_CATS.find(c => c.value === category)?.label ?? category
  const sectionTabs = [
    { id: 'identificacao', label: 'Identificação',   icon: Building2 },
    { id: 'contato',       label: 'Contato',          icon: Phone },
    { id: 'endereco',      label: 'Endereço',         icon: MapPin },
    { id: 'bancario',      label: 'Dados Bancários',  icon: CreditCard },
    ...(isPJ ? [{ id: 'socios', label: 'Sócios', icon: Users }] : []),
    { id: 'historico',     label: 'Histórico',        icon: Clock },
  ]

  /* se a aba ativa deixar de existir (ex.: trocar PJ→PF na aba Sócios), volta para Identificação */
  useEffect(() => {
    if (tab === 'socios' && !isPJ) setTab('identificacao')
  }, [isPJ, tab])

  const addCon = () => setContatos(p => [...p, newDCon()])
  const remCon = (id: string) => setContatos(p => p.filter(c => c.id !== id))
  const updCon = (id: string, k: keyof Omit<DCon, 'id'>, v: string) => setContatos(p => p.map(c => c.id === id ? { ...c, [k]: v } : c))

  const addEnd = () => setEnderecos(p => [...p, newDEnd()])
  const remEnd = (id: string) => setEnderecos(p => p.filter(e => e.id !== id))
  const updEnd = (id: string, k: keyof Omit<DEnd, 'id'>, v: string) => setEnderecos(p => p.map(e => e.id === id ? { ...e, [k]: v } : e))

  const addBan = () => setBancos(p => [...p, newDBan()])
  const remBan = (id: string) => setBancos(p => p.filter(b => b.id !== id))
  const updBan = (id: string, k: keyof Omit<DBan, 'id'>, v: string) => setBancos(p => p.map(b => b.id === id ? { ...b, [k]: v } : b))

  const addSoc = () => setSocios(p => [...p, { id: `s_${Date.now()}`, nome: '', documento: '', participacao: '', cargo: '' }])
  const remSoc = (id: string) => setSocios(p => p.filter(s => s.id !== id))
  const updSoc = (id: string, k: keyof Omit<DSoc, 'id'>, v: string) => setSocios(p => p.map(s => s.id === id ? { ...s, [k]: v } : s))

  const handleSave = async (statusOverride?: string, motivoTexto?: string) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await apiFetch(`/api/partners/${partner.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          categoria:    category,
          documento:    docValue.trim(),
          razaoSocial:  razaoSocial.trim(),
          nomeFantasia: nomeFantasia.trim(),
          ie:             ieValue.trim(),
          im:             imValue.trim(),
          rg:             rgValue.trim(),
          orgaoExpedidor: orgaoValue.trim(),
          dataNascimento: dataNascV.trim() || undefined,
          paisOrigem:     paisOrigemV.trim() || undefined,
          status:       statusOverride ?? situacao,
          contatos,
          enderecos,
          bancos,
          socios,
          user:         getLogUser(),
          motivo:       motivoTexto,
        }),
      })
      if (!res.ok) throw new Error()
      if (statusOverride) setSituacao(statusOverride)
      void fetchAudit()
      onSaved()
    } catch {
      setSaveError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleAtivar = () => { void handleSave('ATIVO') }

  const confirmAction = () => {
    const newStatus =
      motivoAction === 'habilitar' ? 'EM_CADASTRAMENTO' :
      motivoAction === 'inativar'  ? 'INATIVO' :
      motivoAction === 'reativar'  ? 'ATIVO' : undefined
    const motivoTexto = motivo.trim()
    setShowMotivo(false); setMotivo(''); setMotivoAction('')
    if (newStatus) void handleSave(newStatus, motivoTexto)
  }

  const selectCls = cn(
    'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/40',
  )

  return (
    <div className="space-y-3 pb-6">

      {/* cabeçalho de identidade */}
      <div className="rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-4 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate max-w-[460px]">{razaoSocial.trim() || 'Sem nome'}</h2>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
              situacao === 'ATIVO'            && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
              situacao === 'EM_CADASTRAMENTO' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
              situacao === 'INATIVO'          && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full',
                situacao === 'ATIVO'            && 'bg-green-500',
                situacao === 'EM_CADASTRAMENTO' && 'bg-blue-500 animate-pulse',
                situacao === 'INATIVO'          && 'bg-gray-400')} />
              {STATUS_LABEL[situacao] ?? situacao}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span>{docLabel}: <span className="font-medium text-foreground/80">{docValue || '—'}</span></span>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{catLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>
          {situacao === 'EM_CADASTRAMENTO' && (
            <>
              <button type="button" onClick={() => { void handleSave() }} disabled={saving}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors">
                {saving ? 'Salvando...' : 'Salvar rascunho'}
              </button>
              <button type="button" onClick={handleAtivar} disabled={saving}
                className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {saving ? 'Salvando...' : 'Ativar'}
              </button>
            </>
          )}
          {situacao === 'ATIVO' && !showMotivo && (
            <>
              <button type="button" onClick={() => { setMotivoAction('habilitar'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
                Habilitar para alteração
              </button>
              <button type="button" onClick={() => { setMotivoAction('inativar'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-red-200 text-red-600 px-3 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                Inativar
              </button>
            </>
          )}
          {situacao === 'INATIVO' && !showMotivo && (
            <button type="button" onClick={() => { setMotivoAction('reativar'); setShowMotivo(true) }}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Ativar
            </button>
          )}
        </div>
      </div>

      {/* prompt de motivo */}
      {showMotivo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            {motivoAction === 'habilitar' && 'Motivo da abertura para alteração'}
            {motivoAction === 'inativar'  && 'Motivo da inativação'}
            {motivoAction === 'reativar'  && 'Motivo da reativação'}
          </p>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            placeholder="Descreva o motivo..." autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setShowMotivo(false); setMotivo('') }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={confirmAction} disabled={!motivo.trim() || saving}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Confirmar</button>
          </div>
        </div>
      )}

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      {/* categoria — editável apenas em rascunho */}
      {!locked && (
        <div className="rounded-lg border bg-card p-1 grid grid-cols-4 gap-1">
          {DETAIL_CATS.map(c => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)}
              className={cn('rounded-md py-1.5 px-3 text-xs font-medium transition-all',
                category === c.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
              {c.label}
            </button>
          ))}
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

      <form ref={formRef} className="space-y-2" onSubmit={e => e.preventDefault()}>

        {/* Identificação */}
        <DSection active={tab === 'identificacao'}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <DField label={category === 'PJ_BR' ? 'CNPJ' : category === 'PF_BR' ? 'CPF' : 'Código / Documento'} required>
              <input
                name="identificador"
                value={docValue}
                onChange={e => setDocValue(
                  category === 'PJ_BR' ? maskCNPJ(e.target.value) :
                  category === 'PF_BR' ? maskCPF(e.target.value)  :
                  e.target.value
                )}
                disabled={locked}
                placeholder={category === 'PJ_BR' ? '00.000.000/0000-00' : category === 'PF_BR' ? '000.000.000-00' : ''}
                className={locked ? dreadCls : dinputCls}
              />
            </DField>
            <DField label={isPJ ? 'Razão Social' : 'Nome Completo'} required>
              <input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
            </DField>
            {isPJ && (
              <DField label="Nome Fantasia">
                <input value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
              </DField>
            )}
            {category === 'PJ_BR' && (
              <>
                <DField label="Inscrição Estadual">
                  <input value={ieValue} onChange={e => setIeValue(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
                </DField>
                <DField label="Inscrição Municipal">
                  <input value={imValue} onChange={e => setImValue(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
                </DField>
              </>
            )}
            {category === 'PF_BR' && (
              <>
                <DField label="RG">
                  <input value={rgValue} onChange={e => setRgValue(e.target.value)} disabled={locked} placeholder="00.000.000-0" className={locked ? dreadCls : dinputCls} />
                </DField>
                <DField label="Órgão Expedidor">
                  <input value={orgaoValue} onChange={e => setOrgaoValue(e.target.value)} disabled={locked} placeholder="Ex: SSP/SP" className={locked ? dreadCls : dinputCls} />
                </DField>
                <DField label="Data de Nascimento" required>
                  <input type="date" value={dataNascV} onChange={e => setDataNascV(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
                </DField>
                <DField label="País de Origem">
                  <select value={paisOrigemV} onChange={e => setPaisOrigemV(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls}>
                    {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </DField>
              </>
            )}
            {category === 'PF_EST' && (
              <DField label="Data de Nascimento">
                <input type="date" value={dataNascV} onChange={e => setDataNascV(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
              </DField>
            )}
            {(category === 'PJ_EST' || category === 'PF_EST') && (
              <DField label="País de Origem" required>
                <select value={paisOrigemV} onChange={e => setPaisOrigemV(e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls}>
                  <option value="">Selecione o país...</option>
                  {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </DField>
            )}
          </div>
        </DSection>

        {/* Contato */}
        <DSection active={tab === 'contato'}>
          <div className="space-y-3 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
          {contatos.map((c, idx) => (
            <DCard key={c.id} index={idx} total={contatos.length} label="Contato" onRemove={() => remCon(c.id)} locked={locked}>
              <DField label="E-mail" required={idx === 0}>
                <input type="email" value={c.email} onChange={e => updCon(c.id, 'email', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
              </DField>
              <DField label="Nome do Contato" required={idx === 0}>
                <input value={c.nome} onChange={e => updCon(c.id, 'nome', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
              </DField>
              <DField label="Telefone">
                <input value={c.telefone} onChange={e => updCon(c.id, 'telefone', isBR ? maskTelefone(e.target.value) : e.target.value)} disabled={locked} placeholder={isBR ? '(00) 0000-0000' : '+1 (000) 000-0000'} className={locked ? dreadCls : dinputCls} />
              </DField>
              <DField label="Celular / WhatsApp">
                <input value={c.celular} onChange={e => updCon(c.id, 'celular', isBR ? maskCelular(e.target.value) : e.target.value)} disabled={locked} placeholder={isBR ? '(00) 00000-0000' : '+1 (000) 000-0000'} className={locked ? dreadCls : dinputCls} />
              </DField>
              <DField label="Cargo">
                <input value={c.cargo} onChange={e => updCon(c.id, 'cargo', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} />
              </DField>
              {isPJ && (
                <DField label="Website">
                  <input value={c.website} onChange={e => updCon(c.id, 'website', e.target.value)} disabled={locked} placeholder="https://..." className={locked ? dreadCls : dinputCls} />
                </DField>
              )}
            </DCard>
          ))}
          </div>
          {!locked && (
            <button type="button" onClick={addCon} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
              <Plus className="h-3.5 w-3.5" />Adicionar contato
            </button>
          )}
        </DSection>

        {/* Endereço */}
        <DSection active={tab === 'endereco'}>
          <div className="space-y-3 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
          {enderecos.map((en, idx) => (
            <DCard key={en.id} index={idx} total={enderecos.length} label="Endereço" onRemove={() => remEnd(en.id)} locked={locked}>
              {isBR ? (
                <>
                  <DField label="CEP" required={idx === 0}>
                    <div className="flex gap-2">
                      <input value={en.cep} onChange={e => updEnd(en.id, 'cep', e.target.value)} disabled={locked} placeholder="00000-000" maxLength={9} className={locked ? dreadCls : dinputCls} />
                      {!locked && <button type="button" className="px-2.5 h-8 shrink-0 text-xs rounded-md border hover:bg-muted transition-colors">Buscar</button>}
                    </div>
                  </DField>
                  <DField label="Estado" required={idx === 0}>
                    <select value={en.estado} onChange={e => updEnd(en.id, 'estado', e.target.value)} disabled={locked} className={locked ? dreadCls : selectCls}>
                      <option value="">Selecione...</option>
                      {UF.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </DField>
                  <DField label="Logradouro" required={idx === 0}><input value={en.logradouro} onChange={e => updEnd(en.id, 'logradouro', e.target.value)} disabled={locked} placeholder="Rua, Avenida..." className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Número" required={idx === 0}><input value={en.numero} onChange={e => updEnd(en.id, 'numero', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Complemento"><input value={en.complemento} onChange={e => updEnd(en.id, 'complemento', e.target.value)} disabled={locked} placeholder="Apto, sala..." className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Bairro" required={idx === 0}><input value={en.bairro} onChange={e => updEnd(en.id, 'bairro', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Cidade" required={idx === 0} span2><input value={en.cidade} onChange={e => updEnd(en.id, 'cidade', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} /></DField>
                </>
              ) : (
                <>
                  <DField label="Endereço — Linha 1" required={idx === 0} span2><input value={en.address1} onChange={e => updEnd(en.id, 'address1', e.target.value)} disabled={locked} placeholder="Street address" className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Endereço — Linha 2" span2><input value={en.address2} onChange={e => updEnd(en.id, 'address2', e.target.value)} disabled={locked} placeholder="Apt, suite..." className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Cidade" required={idx === 0}><input value={en.cidade} onChange={e => updEnd(en.id, 'cidade', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="Estado / Província"><input value={en.estado} onChange={e => updEnd(en.id, 'estado', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="CEP / ZIP"><input value={en.cep} onChange={e => updEnd(en.id, 'cep', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls} /></DField>
                  <DField label="País" required={idx === 0}>
                    <select value={en.pais_endereco} onChange={e => updEnd(en.id, 'pais_endereco', e.target.value)} disabled={locked} className={locked ? dreadCls : dinputCls}>
                      <option value="">Selecione o país...</option>
                      {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </DField>
                </>
              )}
            </DCard>
          ))}
          </div>
          {!locked && (
            <button type="button" onClick={addEnd} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
              <Plus className="h-3.5 w-3.5" />Adicionar endereço
            </button>
          )}
        </DSection>

        {/* Dados Bancários */}
        <DSection active={tab === 'bancario'}>
          <div className="space-y-3 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
          {bancos.map((b, idx) => (
            <DCard key={b.id} index={idx} total={bancos.length} label="Banco" onRemove={() => remBan(b.id)} locked={locked}>
              <DField label="Banco"><input value={b.banco} onChange={e => updBan(b.id, 'banco', e.target.value)} disabled={locked} placeholder="Ex: 001 — Banco do Brasil" className={locked ? dreadCls : dinputCls} /></DField>
              <DField label="Tipo de Conta">
                <select value={b.tipo_conta} onChange={e => updBan(b.id, 'tipo_conta', e.target.value)} disabled={locked} className={locked ? dreadCls : selectCls}>
                  <option value="">Selecione...</option>
                  <option value="corrente">Conta Corrente</option>
                  <option value="poupanca">Conta Poupança</option>
                  <option value="pagamento">Conta de Pagamento</option>
                </select>
              </DField>
              <DField label="Agência"><input value={b.agencia} onChange={e => updBan(b.id, 'agencia', e.target.value)} disabled={locked} placeholder="0000" className={locked ? dreadCls : dinputCls} /></DField>
              <DField label="Conta"><input value={b.conta} onChange={e => updBan(b.id, 'conta', e.target.value)} disabled={locked} placeholder="00000-0" className={locked ? dreadCls : dinputCls} /></DField>
              <DField label="Chave PIX" span2><input value={b.pix} onChange={e => updBan(b.id, 'pix', e.target.value)} disabled={locked} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" className={locked ? dreadCls : dinputCls} /></DField>
            </DCard>
          ))}
          </div>
          {!locked && (
            <button type="button" onClick={addBan} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
              <Plus className="h-3.5 w-3.5" />Adicionar banco
            </button>
          )}
        </DSection>

        {/* Quadro de Sócios */}
        {isPJ && (
          <DSection active={tab === 'socios'}>
            {socios.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhum sócio cadastrado.</p>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
                <div className="grid grid-cols-12 gap-2 px-1 sticky top-0 bg-card z-10 py-1">
                  <div className="col-span-1" />
                  <p className="col-span-3 text-[11px] font-medium text-muted-foreground">Nome</p>
                  <p className="col-span-3 text-[11px] font-medium text-muted-foreground">{isBR ? 'CPF' : 'Documento'}</p>
                  <p className="col-span-2 text-[11px] font-medium text-muted-foreground">Participação %</p>
                  <p className="col-span-2 text-[11px] font-medium text-muted-foreground">Cargo / Função</p>
                  <div className="col-span-1" />
                </div>
                {socios.map((s, idx) => (
                  <div key={s.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-md border bg-muted/20">
                    <span className="col-span-1 text-[11px] text-muted-foreground text-center font-medium">{idx + 1}</span>
                    <div className="col-span-3"><input value={s.nome} onChange={e => updSoc(s.id, 'nome', e.target.value)} disabled={locked} placeholder="Nome completo" className={locked ? dreadCls : dinputCls} /></div>
                    <div className="col-span-3"><input value={s.documento} onChange={e => updSoc(s.id, 'documento', e.target.value)} disabled={locked} placeholder={isBR ? '000.000.000-00' : 'Documento'} className={locked ? dreadCls : dinputCls} /></div>
                    <div className="col-span-2"><input value={s.participacao} onChange={e => updSoc(s.id, 'participacao', e.target.value)} disabled={locked} placeholder="0,00 %" className={locked ? dreadCls : dinputCls} /></div>
                    <div className="col-span-2"><input value={s.cargo} onChange={e => updSoc(s.id, 'cargo', e.target.value)} disabled={locked} placeholder="Ex: Sócio-Diretor" className={locked ? dreadCls : dinputCls} /></div>
                    {!locked && (
                      <div className="col-span-1 flex justify-center">
                        <button type="button" onClick={() => remSoc(s.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!locked && (
              <button type="button" onClick={addSoc} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                <Plus className="h-3.5 w-3.5" />Adicionar sócio
              </button>
            )}
          </DSection>
        )}

        {/* Histórico — controle de alterações (auditoria) */}
        <DSection active={tab === 'historico'}>
          {auditRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhuma alteração registrada.</p>
          ) : (
            <>
              {/* toolbar de filtros */}
              <div className="flex items-center gap-2 mb-3">
                <button type="button"
                  onClick={() => { setShowHistFilters(v => !v); if (!histFilters.length) addHistFilter() }}
                  className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
                    showHistFilters || activeHistFilters.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground')}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
                  {activeHistFilters.length > 0 && (
                    <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{activeHistFilters.length}</span>
                  )}
                </button>
                {activeHistFilters.length > 0 && (
                  <button type="button" onClick={clearHistFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar</button>
                )}
                <p className="ml-auto text-[11px] text-muted-foreground tabular-nums">{filteredAuditRows.length} de {auditRows.length}</p>
              </div>

              {/* painel de filtros */}
              {showHistFilters && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-medium">Combinar condições com:</span>
                    <div className="flex rounded-md border overflow-hidden">
                      {(['AND', 'OR'] as const).map(l => (
                        <button key={l} type="button" onClick={() => setHistLogic(l)}
                          className={cn('px-3 py-1 text-xs font-semibold transition-colors', histLogic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                          {l === 'AND' ? 'E' : 'OU'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {histFilters.map((f, idx) => (
                      <div key={f.id} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{idx === 0 ? 'Se' : histLogic === 'AND' ? 'E' : 'OU'}</span>
                        <select value={f.col} onChange={e => updateHistFilter(f.id, 'col', e.target.value)} className={cn(histSelCls, 'w-36')}>
                          {HIST_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <select value={f.op} onChange={e => updateHistFilter(f.id, 'op', e.target.value)} className={cn(histSelCls, 'w-40')}>
                          {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input value={f.value} onChange={e => updateHistFilter(f.id, 'value', e.target.value)} placeholder="Valor..."
                          className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        <button type="button" onClick={() => removeHistFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addHistFilter} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                    <Plus className="h-3.5 w-3.5" />Adicionar condição
                  </button>
                </div>
              )}

              {/* tabela */}
              <div className="rounded-lg border max-h-[calc(100vh-24rem)] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-[hsl(240_5%_97%)] dark:bg-[hsl(240_21%_15%)]">
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Data / Hora</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Usuário</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Campo Alterado</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">Valor Anterior</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">Novo Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum registro com os filtros aplicados.</td></tr>
                    ) : filteredAuditRows.map(r => (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-muted/20 transition-colors align-top">
                        <td className="px-4 py-1 text-muted-foreground tabular-nums whitespace-nowrap">{fmtAuditTs(r.ts)}</td>
                        <td className="px-4 py-1 text-muted-foreground whitespace-nowrap">{r.user}</td>
                        <td className="px-4 py-1 font-medium whitespace-nowrap">{r.label}</td>
                        <td className="px-4 py-1 text-muted-foreground line-through">{r.before}</td>
                        <td className="px-4 py-1">
                          {r.after}
                          {r.motivo && <span className="block text-[11px] text-muted-foreground italic mt-0.5">motivo: {r.motivo}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DSection>

      </form>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════ */
export default function ParceirosPage() {
  const { views, saveView, deleteView }  = useViews('parceiros')
  const { fields: customFields }         = usePartnerFields()
  const { isVisibleInTable }             = useFieldVisibility()
  const { isColumnVisible }              = useDefaultColumns()
  const tableFields = customFields.filter(f => f.visible === 'table' || f.visible === 'both')

  /* colunas padrão visíveis (usuário pode ocultar via "Configurar campos") */
  const baseColumns = useMemo(() => COLUMNS.filter(c => isColumnVisible(c.key)), [isColumnVisible])

  /* mapeamento de chave de campo nativo → coluna na tabela */
  const NATIVE_COL_MAP: Record<string, string> = {
    nome_fantasia:   'nomeFantasia', ie:             'ie',        im:          'im',
    rg:              'rg',           orgao_expedidor:'orgaoExpedidor', data_nascimento: 'dataNascimento',
    pais_origem:     'paisOrigem',   con_email:      'email',     con_telefone:'telefone',
    con_celular:     'celular',      con_cargo:      'cargo',     con_website: 'website',
    end_cep:         'cep',          end_logradouro: 'logradouro',end_numero:  'numero',
    end_complemento: 'complemento',  end_bairro:     'bairro',   end_address1:'address1',
    end_address2:    'address2',     end_pais:       'endPais',
    ban_banco:       'banco',        ban_tipo_conta: 'tipoConta', ban_agencia: 'agencia',
    ban_conta:       'conta',        ban_pix:        'pix',
    soc_nome:        'socNome',      soc_documento:  'socDoc',    soc_participacao:'socPart',
    soc_cargo:       'socCargo',
  }
  const nativeTableCols = NATIVE_FIELDS
    .filter(nf => !CORE_TABLE_KEYS.has(nf.key) && isVisibleInTable(nf.key) && nf.key in NATIVE_COL_MAP)
    .map(nf => ({ key: NATIVE_COL_MAP[nf.key], label: nf.label }))

  /* ── dados do servidor ── */
  const [serverRows,      setServerRows]      = useState<Row[]>([])
  const [serverTotal,     setServerTotal]     = useState(0)
  const [serverStats,     setServerStats]     = useState({ total: 0, ativo: 0, inativo: 0, emCadastramento: 0 })
  const [serverLoading,   setServerLoading]   = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reqIdRef    = useRef(0)

  /* ── column order ── */
  const [columnOrder, setColumnOrder] = useState<string[]>(() => COLUMNS.map(c => c.key))
  const [dragFrom,    setDragFrom]    = useState<number | null>(null)
  const [dragOver,    setDragOver]    = useState<number | null>(null)
  const storageLoaded = useRef(false)

  /* reconcilia columnOrder quando tableFields ou colunas nativas mudam */
  useEffect(() => {
    const allKeys = [
      ...baseColumns.map(c => c.key),
      ...nativeTableCols.map(c => c.key),
      ...tableFields.map(f => f.name),
    ]

    setColumnOrder(prev => {
      let base = prev
      if (!storageLoaded.current) {
        storageLoaded.current = true
        const saved = cacheRead<string[] | null>(COL_ORDER_KEY, null)
        if (saved) base = saved
      }
      const reconciled = [
        ...base.filter(k => allKeys.includes(k)),
        ...allKeys.filter(k => !base.includes(k)),
      ]
      return reconciled.join(',') === prev.join(',') && base === prev ? prev : reconciled
    })
  }, [tableFields, nativeTableCols, baseColumns])

  /* persiste (cache local + backend) sempre que columnOrder muda */
  useEffect(() => {
    if (!storageLoaded.current) return
    pushSetting(COL_ORDER_KEY, columnOrder)
  }, [columnOrder])

  /* hidrata a ordem das colunas a partir do backend no mount */
  useEffect(() => {
    void pullSetting<string[]>(COL_ORDER_KEY).then(remote => { if (remote) setColumnOrder(remote) })
  }, [])

  /* reset da ordem das colunas (disparado por "Restaurar padrão" no drawer) */
  useEffect(() => {
    const handler = () => setColumnOrder(COLUMNS.map(c => c.key))
    window.addEventListener(COLUMN_ORDER_RESET_EVENT, handler)
    return () => window.removeEventListener(COLUMN_ORDER_RESET_EVENT, handler)
  }, [])

  /* lista de colunas ordenadas */
  const allColumns = useMemo(() => [
    ...baseColumns,
    ...nativeTableCols,
    ...tableFields.map(f => ({ key: f.name, label: f.label })),
  ], [baseColumns, nativeTableCols, tableFields])

  const orderedColumns = useMemo(() =>
    columnOrder
      .map(k => allColumns.find(c => c.key === k))
      .filter((c): c is typeof allColumns[0] => !!c),
    [columnOrder, allColumns],
  )

  /* ── drag handlers ── */
  const handleDragStart = (idx: number) => setDragFrom(idx)
  const handleDragOver  = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (idx !== dragOver) setDragOver(idx)
  }
  const handleDrop = (idx: number) => {
    if (dragFrom === null || dragFrom === idx) return
    const next = [...columnOrder]
    const [moved] = next.splice(dragFrom, 1)
    next.splice(idx, 0, moved)
    setColumnOrder(next)
  }
  const clearDrag = () => { setDragFrom(null); setDragOver(null) }

  /* ── abas ── */
  const [tabs,        setTabs]        = useState<TabData[]>([{ id: 'lista', label: 'Lista', pinned: true }])
  const [activeTabId, setActiveTabId] = useState('lista')

  const openPartnerTab = async (partnerId: string, label: string) => {
    const existing = tabs.find(t => t.partner?.id === partnerId)
    if (existing) { setActiveTabId(existing.id); return }
    const tabId = `tab_${partnerId}`
    setTabs(prev => [...prev, { id: tabId, label, pinned: false, loading: true }])
    setActiveTabId(tabId)
    try {
      const res = await apiFetch(`/api/partners/${partnerId}`)
      if (res.ok) {
        const partner = await res.json() as PartnerAPI
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, partner, loading: false } : t))
        return
      }
    } catch {}
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false } : t))
  }

  const closePartnerTab = (tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId))
    if (activeTabId === tabId) setActiveTabId('lista')
  }

  const openNewTab = () => {
    const existing = tabs.find(t => t.id === 'tab_new')
    if (existing) { setActiveTabId('tab_new'); return }
    setTabs(prev => [...prev, { id: 'tab_new', label: 'Novo parceiro', pinned: false, type: 'new' }])
    setActiveTabId('tab_new')
  }

  /* ── restante do estado ── */
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [sort,         setSort]         = useState<SortState | null>({ col: 'nome', dir: 'asc' })
  const [showFilters,  setShowFilters]  = useState(false)
  const [showViews,    setShowViews]    = useState(false)
  const [logic,        setLogic]        = useState<'AND' | 'OR'>('AND')
  const [filters,      setFilters]      = useState<FilterRow[]>([])
  const [saving,       setSaving]       = useState(false)
  const [viewName,     setViewName]     = useState('')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(10)
  const [showFields,   setShowFields]   = useState(false)

  /* ── query server-side ── */
  const queryServer = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setServerLoading(true)
    try {
      const res = await apiFetch(`/api/partners/query`, {
        method: 'POST',
        body: JSON.stringify({
          page,
          pageSize,
          search:  debouncedSearch || undefined,
          sort:    sort   ?? undefined,
          filters: filters.filter(f => f.value.trim()),
          logic,
        }),
      })
      if (reqId !== reqIdRef.current) return
      if (res.ok) {
        const data = await res.json() as { rows: Row[]; total: number; stats: { total: number; ativo: number; inativo: number; emCadastramento: number } }
        setServerRows(data.rows)
        setServerTotal(data.total)
        if (data.stats) setServerStats(data.stats)
      }
    } catch {}
    finally { if (reqId === reqIdRef.current) setServerLoading(false) }
  }, [page, pageSize, debouncedSearch, sort, filters, logic]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void queryServer() }, [queryServer])

  const saveInputRef   = useRef<HTMLInputElement>(null)
  const viewsRef       = useRef<HTMLDivElement>(null)
  const partnerTabsRef = useRef<HTMLDivElement>(null)

  const [canScrollLeft,  setCanScrollLeft]  = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = partnerTabsRef.current
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
    partnerTabsRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })

  useEffect(() => { if (saving) saveInputRef.current?.focus() }, [saving])

  useEffect(() => {
    if (!showViews) return
    const handler = (e: MouseEvent) => {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) setShowViews(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showViews])

  useEffect(() => { setPage(1) }, [debouncedSearch, filters, sort, logic, pageSize])

  const selectView = (id: string | null) => {
    setActiveViewId(id)
    setShowViews(false)
    if (!id) {
      setSort({ col: 'nome', dir: 'asc' }); setFilters([]); setLogic('AND'); setShowFilters(false)
    } else {
      const v = views.find(v => v.id === id)
      if (!v) return
      setSort(v.sort); setFilters(v.filters); setLogic(v.logic)
    }
  }

  const addFilter    = () => setFilters(p => [...p, { id: `f${Date.now()}`, col: 'nome', op: 'contains', value: '' }])
  const removeFilter = (id: string) => setFilters(p => p.filter(f => f.id !== id))
  const updateFilter = (id: string, key: keyof FilterRow, val: string) =>
    setFilters(p => p.map(f => f.id === id ? { ...f, [key]: val } : f))
  const clearFilters = () => { setFilters([]); setSort(null); setLogic('AND') }

  const handleSort = (col: string) =>
    setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null)

  const handleSaveView = () => {
    if (!viewName.trim()) return
    const v = saveView(viewName.trim(), { sort, filters: filters.filter(f => f.value.trim()), logic })
    setActiveViewId(v.id)
    setSaving(false)
    setViewName('')
  }

  const handleDeleteView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteView(id)
    if (activeViewId === id) selectView(null)
  }

  const handleExport = async () => {
    let rows: Row[] = []
    try {
      const res = await apiFetch(`/api/partners/query`, {
        method: 'POST',
        body: JSON.stringify({
          page: 1,
          pageSize: 10000,
          search:  debouncedSearch || undefined,
          sort:    sort   ?? undefined,
          filters: filters.filter(f => f.value.trim()),
          logic,
        }),
      })
      if (!res.ok) return
      rows = ((await res.json()) as { rows: Row[] }).rows
    } catch { return }
    if (!rows.length) return

    const HEADERS = [
      'Nome / Razão Social', 'Categoria', 'Identificador',
      'Cidade', 'Estado', 'Contato', 'Status',
      ...tableFields.map(f => f.label),
    ]
    const wb  = new ExcelJS.Workbook()
    wb.creator = 'Nxt'; wb.created = new Date()
    const ws  = wb.addWorksheet('Parceiros')
    const totalCols  = HEADERS.length
    const exportName = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'

    ws.addRow([`Exportação — ${exportName}`])
    ws.mergeCells(1, 1, 1, totalCols)
    const titleCell = ws.getCell('A1')
    titleCell.font  = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    ws.getRow(1).height = 28

    const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    ws.addRow([`Gerado em ${date}  •  ${serverTotal} registro${serverTotal !== 1 ? 's' : ''}`])
    ws.mergeCells(2, 1, 2, totalCols)
    const subCell = ws.getCell('A2')
    subCell.font  = { size: 9, italic: true, color: { argb: 'FF6B7280' } }
    subCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
    subCell.alignment = { vertical: 'middle', horizontal: 'center' }
    ws.getRow(2).height = 18

    const headerRow = ws.addRow(HEADERS)
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }
    })
    ws.getRow(3).height = 20

    rows.forEach((p, idx) => {
      const row = ws.addRow([
        p.nome, p.categoria, p.identificador,
        p.cidade, p.estado, p.contato,
        STATUS_LABEL[p.status] ?? p.status,
        ...tableFields.map(() => ''),
      ])
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC'
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        cell.alignment = { vertical: 'middle' }
        cell.font = { size: 10 }
      })
      row.height = 18
    })

    ws.columns.forEach((col, i) => {
      const header = HEADERS[i] ?? ''
      let maxLen = header.length
      rows.forEach(p => {
        const vals = [p.nome, p.categoria, p.identificador, p.cidade, p.estado, p.contato, STATUS_LABEL[p.status] ?? p.status]
        const len  = (vals[i] ?? '').length
        if (len > maxLen) maxLen = len
      })
      col.width = Math.min(maxLen + 4, 60)
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href = url; a.download = `parceiros_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  const isModified = useMemo(() => {
    if (!activeViewId) return false
    const v = views.find(v => v.id === activeViewId)
    if (!v) return false
    return stateKey({ sort, filters, logic }) !== stateKey({ sort: v.sort, filters: v.filters, logic: v.logic })
  }, [activeViewId, views, sort, filters, logic])

  const totalFiltered      = serverTotal
  const totalPages         = Math.max(1, Math.ceil(serverTotal / pageSize))
  const safePage           = page
  const pageRows           = serverRows
  const firstItem          = serverTotal === 0 ? 0 : (page - 1) * pageSize + 1
  const lastItem           = Math.min(page * pageSize, serverTotal)
  const activeFiltersCount = filters.filter(f => f.value.trim()).length
  const activeViewName     = activeViewId ? (views.find(v => v.id === activeViewId)?.name ?? 'Todos') : 'Todos'

  /* renderiza célula pelo key da coluna */
  function renderCell(row: Row, key: string, colIdx: number) {
    /* coluna fixa precisa de fundo OPACO senão o conteúdo que rola atrás vaza.
       hover = equivalente opaco de muted/30 sobre card (mesma cor, sem transparência). */
    const sticky = colIdx === 0
      ? 'sticky left-0 z-10 bg-card group-hover/row:bg-[hsl(240_5%_97%)] dark:group-hover/row:bg-[hsl(240_21%_15%)] transition-colors'
      : ''
    switch (key) {
      case 'nome':
        return (
          <td key={key} className={cn('px-3 py-1 font-medium whitespace-nowrap', sticky)}>
            <button type="button" onClick={() => { void openPartnerTab(row.id, row.nome) }} className="hover:text-primary hover:underline text-left">{row.nome}</button>
          </td>
        )
      case 'categoria':
        return (
          <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}>
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${TIPO_CLS[row.categoria]}`}>{row.categoria}</span>
          </td>
        )
      case 'identificador': {
        const docTipo = row.categoria === 'PJ Brasileira' ? 'CNPJ' : row.categoria === 'PF Brasileira' ? 'CPF' : row.identificador ? 'Cód.' : ''
        return (
          <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}>
            <span className="flex items-center gap-1.5">
              {docTipo && <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{docTipo}</span>}
              <span className="font-mono text-muted-foreground">{row.identificador || '—'}</span>
            </span>
          </td>
        )
      }
      case 'cidade':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{[row.cidade, row.estado].filter(Boolean).join(' — ')}</td>
      case 'contato':
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{row.contato}</td>
      case 'status':
        return (
          <td key={key} className={cn('px-3 py-1 whitespace-nowrap', sticky)}>
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
          </td>
        )
      case 'dataNascimento': {
        const raw = row.dataNascimento
        const fmt = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split('-').reverse().join('/') : raw
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap tabular-nums', sticky)}>{fmt || '—'}</td>
      }
      default:
        return <td key={key} className={cn('px-3 py-1 text-muted-foreground whitespace-nowrap', sticky)}>{row[key] || '—'}</td>
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (!sort || sort.col !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />
    return sort.dir === 'asc'
      ? <ArrowUp   className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  }

  function Sel({ value, onChange, children, className }: {
    value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string
  }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className={cn('h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}>
        {children}
      </select>
    )
  }

  return (
    <>
    {/* barra de abas */}
    <div className="flex items-end border-b mb-3">

      {/* aba Lista — sempre visível, fora do scroll */}
      <div className={cn(
        'flex items-center px-3 py-2 border-b-2 cursor-pointer whitespace-nowrap transition-colors shrink-0',
        activeTabId === 'lista'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}>
        <button type="button" onClick={() => setActiveTabId('lista')} className="text-xs font-medium">
          Lista
        </button>
      </div>

      {tabs.length > 1 && (
        <>
          {/* separador */}
          <div className="w-px h-4 bg-border self-center mx-1 shrink-0" />

          {/* seta esquerda */}
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            className={cn(
              'flex items-center justify-center h-6 w-5 shrink-0 self-center rounded transition-all text-muted-foreground',
              canScrollLeft ? 'opacity-100 hover:bg-muted hover:text-foreground' : 'opacity-0 pointer-events-none',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* abas de parceiro — sem scrollbar visível */}
          <div
            ref={partnerTabsRef}
            className="flex items-end overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]"
          >
            {tabs.filter(t => !t.pinned).map(tab => (
              <div
                key={tab.id}
                className={cn(
                  'group flex items-center gap-1 px-3 py-2 border-b-2 cursor-pointer whitespace-nowrap transition-colors shrink-0',
                  activeTabId === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <button type="button" onClick={() => setActiveTabId(tab.id)}
                  className="text-xs font-medium max-w-[180px] truncate">
                  {tab.label}
                </button>
                <button type="button" onClick={() => closePartnerTab(tab.id)}
                  className="ml-0.5 flex items-center justify-center h-4 w-4 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>

          {/* seta direita */}
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            className={cn(
              'flex items-center justify-center h-6 w-5 shrink-0 self-center rounded transition-all text-muted-foreground',
              canScrollRight ? 'opacity-100 hover:bg-muted hover:text-foreground' : 'opacity-0 pointer-events-none',
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>

    {/* abas de detalhe e de novo cadastro — todas montadas, inativa fica hidden */}
    {tabs.filter(t => !t.pinned).map(tab => (
      <div key={tab.id} className={activeTabId === tab.id ? '' : 'hidden'}>
        {tab.loading ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">Carregando...</div>
        ) : tab.type === 'new' ? (
          <div className="max-w-3xl mx-auto">
            <PartnerNewForm
              embedded
              onSaved={(result) => {
                if (result?.id) {
                  void (async () => {
                    try {
                      const res = await apiFetch(`/api/partners/${result.id}`)
                      if (res.ok) {
                        const partner = await res.json() as PartnerAPI
                        const newId = `tab_${result.id}`
                        setTabs(prev => prev.map(t =>
                          t.id === 'tab_new'
                            ? { id: newId, label: partner.razaoSocial, pinned: false, type: 'detail' as const, partner }
                            : t,
                        ))
                        setActiveTabId(newId)
                        void queryServer()
                        return
                      }
                    } catch {}
                    closePartnerTab('tab_new')
                    void queryServer()
                  })()
                } else {
                  closePartnerTab('tab_new')
                  void queryServer()
                }
              }}
              onCancel={() => closePartnerTab('tab_new')}
            />
          </div>
        ) : tab.partner ? (
          <PartnerDetailView
            partner={tab.partner}
            onClose={() => closePartnerTab(tab.id)}
            onSaved={() => { void queryServer() }}
          />
        ) : null}
      </div>
    ))}

    {/* aba Lista */}
    <div className={activeTabId === 'lista' ? '' : 'hidden'}>
    <div className="space-y-3">

      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Parceiros</h1>
          <p className="text-[11px] text-muted-foreground">
            {activeViewId
              ? <>Visão: <span className="text-primary font-medium">{activeViewName}</span>
                  {isModified && <span className="ml-1.5 text-orange-400">(modificada)</span>}
                </>
              : 'Cadastro e gestão de parceiros'
            }
          </p>
        </div>
        <button
          type="button"
          onClick={openNewTab}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Novo parceiro
        </button>
      </div>

      {/* cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total',            value: serverStats.total,           cls: 'text-foreground' },
          { label: 'Em cadastramento', value: serverStats.emCadastramento, cls: 'text-blue-600 dark:text-blue-400'       },
          { label: 'Ativos',           value: serverStats.ativo,           cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Inativos',         value: serverStats.inativo,         cls: 'text-muted-foreground'                  },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
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
            <input value={search} onChange={e => {
              const v = e.target.value
              setSearch(v)
              clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300)
            }}
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Buscar em todas as colunas..." />
          </div>

          <button
            onClick={() => { setShowFilters(v => !v); setShowViews(false); if (!filters.length) addFilter() }}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
              showFilters || activeFiltersCount > 0
                ? 'border-primary bg-primary/5 text-primary'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <div ref={viewsRef} className="relative">
            <button
              onClick={() => { setShowViews(v => !v); setShowFilters(false) }}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
                activeViewId
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              {activeViewId ? activeViewName : 'Visões'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showViews && 'rotate-180')} />
            </button>

            {showViews && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-lg border bg-card shadow-lg py-1">
                <button
                  onClick={() => selectView(null)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-xs transition-colors',
                    !activeViewId ? 'text-primary font-medium' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', !activeViewId ? 'opacity-100' : 'opacity-0')} />
                  <span>Todos</span>
                </button>
                {views.length > 0 && <div className="my-1 h-px bg-border" />}
                {views.map(v => (
                  <div key={v.id} className="group/item flex items-center">
                    <button
                      onClick={() => selectView(v.id)}
                      className={cn(
                        'flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-xs transition-colors',
                        activeViewId === v.id ? 'text-primary font-medium' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('h-3.5 w-3.5 shrink-0', activeViewId === v.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button
                      onClick={(e) => handleDeleteView(e, v.id)}
                      className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-all"
                      title="Excluir visão"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saving ? (
            <div className="flex items-center gap-1">
              <input
                ref={saveInputRef}
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveView()
                  if (e.key === 'Escape') { setSaving(false); setViewName('') }
                }}
                placeholder="Nome da visão..."
                className="h-7 w-40 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button onClick={handleSaveView} disabled={!viewName.trim()}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { setSaving(false); setViewName('') }}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setSaving(true); setShowViews(false) }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              <Bookmark className="h-3.5 w-3.5" />Salvar visão
            </button>
          )}

          <button
            onClick={() => setShowFields(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-auto"
          >
            <Settings2 className="h-3.5 w-3.5" />Configurações
          </button>

          <button
            onClick={() => { void handleExport() }}
            disabled={totalFiltered === 0}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>

          <p className="text-[11px] text-muted-foreground">
            {serverLoading ? '…' : `${serverTotal} registro${serverTotal !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* painel de filtros */}
        {showFilters && (
          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">Combinar condições com:</span>
              <div className="flex rounded-md border overflow-hidden">
                {(['AND', 'OR'] as const).map(l => (
                  <button key={l} onClick={() => setLogic(l)}
                    className={cn('px-3 py-1 text-xs font-semibold transition-colors',
                      logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
                    {l === 'AND' ? 'E' : 'OU'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {filters.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {idx === 0 ? 'Se' : logic === 'AND' ? 'E' : 'OU'}
                  </span>
                  <Sel value={f.col} onChange={v => updateFilter(f.id, 'col', v)} className="w-40">
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    {tableFields.map(tf => <option key={tf.name} value={tf.name}>{tf.label}</option>)}
                  </Sel>
                  <Sel value={f.op} onChange={v => updateFilter(f.id, 'op', v)} className="w-40">
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Sel>
                  <input
                    value={f.value}
                    onChange={e => updateFilter(f.id, 'value', e.target.value)}
                    placeholder="Valor..."
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={addFilter} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                <Plus className="h-3.5 w-3.5" />Adicionar condição
              </button>
              {activeFiltersCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* tabela */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-19rem)]">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="border-b">
              {orderedColumns.map((col, idx) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => { handleDrop(idx); clearDrag() }}
                  onDragEnd={clearDrag}
                  className={cn(
                    'text-left px-3 py-1.5 font-medium text-muted-foreground select-none transition-all whitespace-nowrap bg-muted',
                    'cursor-grab active:cursor-grabbing',
                    idx === 0 && 'sticky left-0 z-20 bg-muted', // opaco p/ sticky vertical + horizontal
                    dragFrom === idx && 'opacity-40',
                    dragOver === idx && dragOver !== dragFrom && 'border-l-2 border-primary bg-primary/5',
                  )}
                >
                  <button
                    draggable={false}
                    onClick={() => handleSort(col.key)}
                    className="group inline-flex items-center hover:text-foreground transition-colors"
                  >
                    {col.label}<SortIcon col={col.key} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Nenhum registro encontrado com os filtros aplicados.
                </td>
              </tr>
            ) : pageRows.map(p => (
              <tr key={p.id} className="group/row border-b last:border-0 hover:bg-muted/30 transition-colors">
                {orderedColumns.map((col, colIdx) => renderCell(p, col.key, colIdx))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* rodapé com paginação */}
        <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Linhas por página:</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="h-6 rounded border border-input bg-background px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-[11px] text-muted-foreground">
              {totalFiltered === 0 ? '0' : `${firstItem}–${lastItem}`} de {totalFiltered}
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`e${i}`} className="flex h-6 w-6 items-center justify-center text-[11px] text-muted-foreground">…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium transition-colors',
                    safePage === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}>
                  {p}
                </button>
              )
            )}

            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    </div>{/* fim aba Lista */}

    {showFields && <SettingsDrawer onClose={() => setShowFields(false)} />}
    </>
  )
}
