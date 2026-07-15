'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Building2, Phone, MapPin, CreditCard, Users, Briefcase, Clock, Plus, X, SlidersHorizontal, CheckCircle2, RotateCcw, Pencil, Ban, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { usePartnerFields, useFieldVisibility } from '@/hooks/use-partner-fields'
import { getLogUser } from '@/hooks/use-partner-logs'
import { SaveStatus } from '@/components/save-status'
import { useScreens, getScreenValues, putScreenValues } from '@/hooks/use-screens'
import { pickDefaultScreen, resolvePartnerSections } from '@/lib/screen-partner-layout'
import { PartnerSectionBody } from './partner-screen-body'
import {
  usePartnerForm, newPCon, newPEnd, newPBan, CategoryTabs,
  IdentificacaoFields, ContatoFields, EnderecoFields, BancarioFields, SociosFields, CnaeFields,
  validateSociosParticipacao,
  CATEGORIES, maskCNPJ, maskCPF, type PartnerCategory,
} from '@/components/partners/partner-fields'

export interface PartnerAPI {
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
  dataAbertura: string | null
  naturezaJuridica: string | null
  paisOrigem: string | null
  contatos: DCon[]
  enderecos: DEnd[]
  bancos: DBan[]
  socios: DSoc[]
  cnaePrincipal: string | null
  cnaesSecundarios: string[] | null
  createdAt: string
  updatedAt: string
}

interface DCon  { id: string; email: string; nome: string; telefone: string; celular: string; cargo: string; website: string }
interface DEnd  { id: string; cep: string; estado: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; address1: string; address2: string; pais_endereco: string }
interface DBan  { id: string; banco: string; tipo_conta: string; agencia: string; conta: string; pix: string }
interface DSoc  { id: string; nome: string; documento: string; participacao: string; cargo: string }

const STATUS_LABEL: Record<string, string> = {
  ATIVO:            'Ativo',
  EM_CADASTRAMENTO: 'Em cadastramento',
  INATIVO:          'Inativo',
}

/* ── ícones/cores por evento (mesma linguagem visual do histórico de contratos) ── */
const EVENT_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  EM_CADASTRAMENTO: { label: 'Cadastrado',              color: 'emerald', icon: Plus },
  EM_REVISAO:       { label: 'Habilitado para alteração', color: 'amber',  icon: RotateCcw },
  ATIVADO:          { label: 'Ativado',    color: 'emerald', icon: CheckCircle2 },
  INATIVADO:        { label: 'Inativado',  color: 'gray',    icon: Ban },
  REATIVADO:        { label: 'Reativado',  color: 'teal',    icon: RotateCcw },
  ALTERADO:         { label: 'Atualização', color: 'blue',   icon: Pencil },
}
const EVENT_FALLBACK = { label: 'Alteração', color: 'blue', icon: Pencil }
const DOT_CLS: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red:     'bg-red-500/10 text-red-600 dark:text-red-500',
  teal:    'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  gray:    'bg-gray-500/10 text-gray-600 dark:text-gray-400',
}

/* ── filtros do Histórico (auditoria) — client-side ── */
const HIST_COLUMNS = [
  { key: 'eventLabel', label: 'Evento'         },
  { key: 'ts',         label: 'Data / Hora'    },
  { key: 'user',       label: 'Usuário'        },
  { key: 'label',      label: 'Campo Alterado' },
  { key: 'before',     label: 'Valor Anterior' },
  { key: 'after',      label: 'Novo Valor'     },
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

interface AuditChange { field: string; label: string; before: string; after: string }
interface AuditEntry  { id: string; createdAt: string; user: string; event: string; motivo: string | null; changes: AuditChange[] }

/* ── painel de aba: só renderiza quando a aba está ativa (o título é a própria sub-aba) ── */
function DSection({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null
  return <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">{children}</div>
}

export function PartnerDetailView({ partner, onClose, onSaved, onDirtyChange }: {
  partner: PartnerAPI
  onClose: () => void
  onSaved: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const partnerForm = usePartnerForm({
    category:       partner.categoria as PartnerCategory,
    documento:      ((d, c) => c === 'PJ_BR' ? maskCNPJ(d) : c === 'PF_BR' ? maskCPF(d) : d)(partner.documento ?? '', partner.categoria),
    razaoSocial:    partner.razaoSocial ?? '',
    nomeFantasia:   partner.nomeFantasia ?? '',
    ie:             partner.ie ?? '',
    im:             partner.im ?? '',
    rg:             partner.rg ?? '',
    orgaoExpedidor: partner.orgaoExpedidor ?? '',
    dataNascimento: partner.dataNascimento ?? '',
    dataAbertura:   partner.dataAbertura ?? '',
    naturezaJuridica: partner.naturezaJuridica ?? '',
    paisOrigem:     partner.paisOrigem ?? (partner.categoria === 'PF_BR' ? 'Brasil' : ''),
    contatos:  partner.contatos?.length  ? partner.contatos  : [newPCon()],
    enderecos: partner.enderecos?.length ? partner.enderecos : [newPEnd()],
    bancos:    partner.bancos?.length    ? partner.bancos    : [newPBan()],
    socios:    partner.socios ?? [],
    cnaePrincipal:    partner.cnaePrincipal ?? '',
    cnaesSecundarios: partner.cnaesSecundarios ?? [],
  })
  const v        = partnerForm.values
  const category = v.category

  /* indicador de "não salvo": compara o estado atual com o baseline (capturado na montagem) —
     para a aba (workspace) e para o selo de estado no cabeçalho */
  const cleanRef = useRef<string | null>(null)
  const [dirty,     setDirtyLocal] = useState(false)
  const [justSaved, setJustSaved]  = useState(false)  // "Salvo" verde por instantes após salvar
  const [screenValues, setScreenValues] = useState<Record<string, string>>({}) // valores das telas personalizadas
  const [screenDirty,  setScreenDirty]  = useState(false)
  useEffect(() => {
    if (cleanRef.current === null) cleanRef.current = JSON.stringify(v)
    const d = (cleanRef.current !== null && JSON.stringify(v) !== cleanRef.current) || screenDirty
    setDirtyLocal(d)
    onDirtyChange?.(d)
  }, [v, screenDirty, onDirtyChange])
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(t)
  }, [justSaved])

  /* edição respeita a visibilidade de campo e renderiza campos personalizados (paridade com o cadastro) */
  const { isVisibleInForm }  = useFieldVisibility()
  const { fieldsForSection } = usePartnerFields()
  const vfs = (section: string) => fieldsForSection(section).filter(f => (f.visible === 'form' || f.visible === 'both') && isVisibleInForm(f.id))

  /* R2 — a tela padrão (isDefault/ACTIVE) desenha o cadastro; valores custom ligados ao Save. */
  const { screens: allScreens } = useScreens('FORNECEDOR')
  const defaultScreen = useMemo(() => pickDefaultScreen(allScreens), [allScreens])
  const screenDriven  = !!defaultScreen
  useEffect(() => {
    let alive = true
    void getScreenValues('PARTNER', partner.id).then(vals => {
      if (!alive) return
      const map: Record<string, string> = {}
      vals.forEach(x => { map[x.fieldId] = x.value })
      setScreenValues(map)
    })
    return () => { alive = false }
  }, [partner.id])
  const onScreenChange = (fieldId: string, value: string) => {
    setScreenValues(p => ({ ...p, [fieldId]: value }))
    setScreenDirty(true)
  }

  const [tab,          setTab]          = useState<string>('identificacao')
  const [situacao,     setSituacao]     = useState(partner.status)
  const [showMotivo,   setShowMotivo]   = useState(false)
  const [motivo,       setMotivo]       = useState('')
  const [motivoAction, setMotivoAction] = useState<'habilitar' | 'inativar' | 'reativar' | ''>('')
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [audit, setAudit]               = useState<AuditEntry[]>([])
  const fetchAudit = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/partners/${partner.id}/audit`)
      if (res.ok) setAudit(await res.json() as AuditEntry[])
    } catch {}
  }, [partner.id])
  useEffect(() => { void fetchAudit() }, [fetchAudit])

  /* linhas planas: cada alteração vira uma linha (Evento/Data/Hora/Usuário repetidos) */
  const auditRows = audit.flatMap(e => {
    const meta = EVENT_META[e.event] ?? EVENT_FALLBACK
    return (e.changes ?? []).map((c, i) => ({
      key: `${e.id}_${i}`, ts: e.createdAt, user: e.user,
      eventLabel: meta.label, color: meta.color, Icon: meta.icon,
      motivo: c.field === 'status' ? e.motivo : null,
      label: c.label, before: c.before, after: c.after,
    }))
  })

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

  const isPJ   = category === 'PJ_BR' || category === 'PJ_EST'
  const isPJBR = category === 'PJ_BR' // CNAE é classificação nacional: só PJ brasileira
  const locked = situacao !== 'EM_CADASTRAMENTO'

  const docLabel = category === 'PJ_BR' ? 'CNPJ' : category === 'PF_BR' ? 'CPF' : 'Código'
  const catLabel = CATEGORIES.find(c => c.value === category)?.label ?? category

  /* R2 — seções resolvidas da tela padrão (ordem/rótulos/visibilidade); gating de categoria por cima. */
  const screenSections = useMemo(
    () => defaultScreen ? resolvePartnerSections(defaultScreen, category as PartnerCategory) : [],
    [defaultScreen, category],
  )

  /* abas: dirigidas pela tela quando há tela padrão; senão, seções nativas (sem a antiga aba "Telas"). */
  const sectionTabs = screenDriven
    ? [
        ...screenSections.map(s => ({ id: s.key, label: s.label, icon: s.icon })),
        { id: 'historico', label: 'Histórico', icon: Clock },
      ]
    : [
        { id: 'identificacao', label: 'Identificação',   icon: Building2 },
        ...(isPJBR ? [{ id: 'cnae', label: 'CNAE', icon: Briefcase }] : []),
        { id: 'contato',       label: 'Contato',          icon: Phone },
        { id: 'endereco',      label: 'Endereço',         icon: MapPin },
        { id: 'bancario',      label: 'Dados Bancários',  icon: CreditCard },
        ...(isPJ ? [{ id: 'socios', label: 'Sócios', icon: Users }] : []),
        { id: 'historico',     label: 'Histórico',        icon: Clock },
      ]

  /* se a aba ativa deixar de existir (ex.: trocar PJ→PF, ou CNAE ao sair de PJ_BR), volta para a primeira. */
  useEffect(() => {
    if (!sectionTabs.some(t => t.id === tab)) setTab(sectionTabs[0]?.id ?? 'identificacao')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPJ, isPJBR, screenDriven, screenSections.length, tab])

  const handleSave = async (statusOverride?: string, motivoTexto?: string) => {
    // Regra dos sócios: valida ao salvar rascunho (sem override) e ao ativar/reativar.
    const validaSocios = statusOverride === undefined || statusOverride === 'ATIVO'
    if (isPJ && validaSocios) {
      const socErr = validateSociosParticipacao(v.socios)
      if (socErr) {
        setTab('socios')
        setSaveError(socErr)
        return
      }
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await apiFetch(`/api/partners/${partner.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          categoria:    v.category,
          documento:    v.documento.trim(),
          razaoSocial:  v.razaoSocial.trim(),
          nomeFantasia: v.nomeFantasia.trim(),
          ie:             v.ie.trim(),
          im:             v.im.trim(),
          rg:             v.rg.trim(),
          orgaoExpedidor: v.orgaoExpedidor.trim(),
          dataNascimento: v.dataNascimento.trim() || undefined,
          dataAbertura:   v.dataAbertura.trim() || undefined,
          naturezaJuridica: v.naturezaJuridica.trim() || undefined,
          paisOrigem:     v.paisOrigem.trim() || undefined,
          status:       statusOverride ?? situacao,
          contatos:  v.contatos,
          enderecos: v.enderecos,
          bancos:    v.bancos,
          socios:    v.socios,
          cnaePrincipal:    v.cnaePrincipal.trim() || undefined,
          cnaesSecundarios: v.cnaesSecundarios,
          user:         getLogUser(),
          motivo:       motivoTexto,
        }),
      })
      if (!res.ok) throw new Error()
      // valores dos campos personalizados da tela (R2) — persistidos junto ao parceiro
      if (screenDriven) {
        await putScreenValues('PARTNER', partner.id, Object.entries(screenValues).map(([fieldId, value]) => ({ fieldId, value })))
        setScreenDirty(false)
      }
      if (statusOverride) setSituacao(statusOverride)
      cleanRef.current = JSON.stringify(v); setDirtyLocal(false); setJustSaved(true); onDirtyChange?.(false)
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

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* cabeçalho fixo: identidade + ações + abas (padrão do sistema) */}
      <div className="shrink-0 space-y-3">

      {/* cabeçalho de identidade */}
      <div className="rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-4 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate max-w-[460px]">{v.razaoSocial.trim() || 'Sem nome'}</h2>
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
            <span>{docLabel}: <span className="font-medium text-foreground/80">{v.documento || '—'}</span></span>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{catLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!showMotivo && <SaveStatus dirty={dirty} saving={saving} justSaved={justSaved} className="mr-1" />}
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
      {!locked && <CategoryTabs value={category} onChange={partnerForm.setCategory} />}

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

      </div>{/* fim do cabeçalho fixo */}

      <form ref={formRef} className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-3" onSubmit={e => e.preventDefault()}>

        {/* R2 — seções dirigidas pela tela padrão; fallback ao nativo quando não há tela padrão. */}
        {screenDriven ? (
          screenSections.map(s => (
            <DSection key={s.id} active={tab === s.key}>
              <PartnerSectionBody section={s} form={partnerForm} ro={locked} screenValues={screenValues} onScreenChange={onScreenChange} />
            </DSection>
          ))
        ) : (
          <>
            {/* Identificação */}
            <DSection active={tab === 'identificacao'}>
              <IdentificacaoFields form={partnerForm} ro={locked} isVisible={isVisibleInForm} customFields={vfs('identificacao')} />
            </DSection>

            {/* Contato */}
            <DSection active={tab === 'contato'}>
              <ContatoFields form={partnerForm} ro={locked} isVisible={isVisibleInForm} customFields={vfs('contato')} />
            </DSection>

            {/* Endereço */}
            <DSection active={tab === 'endereco'}>
              <EnderecoFields form={partnerForm} ro={locked} isVisible={isVisibleInForm} customFields={vfs('endereco')} />
            </DSection>

            {/* Dados Bancários */}
            <DSection active={tab === 'bancario'}>
              <BancarioFields form={partnerForm} ro={locked} isVisible={isVisibleInForm} customFields={vfs('bancario')} />
            </DSection>

            {/* Quadro de Sócios */}
            {isPJ && (
              <DSection active={tab === 'socios'}>
                <SociosFields form={partnerForm} ro={locked} isVisible={isVisibleInForm} />
              </DSection>
            )}

            {/* CNAE — classificação nacional: só PJ brasileira */}
            {isPJBR && (
              <DSection active={tab === 'cnae'}>
                <CnaeFields form={partnerForm} ro={locked} />
              </DSection>
            )}
          </>
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

              {/* tabela — rola junto com o conteúdo (cabeçalho da tabela fixa no topo da área rolável) */}
              <div className="rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-[hsl(240_5%_97%)] dark:bg-[hsl(240_21%_15%)]">
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Evento</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Data / Hora</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Usuário</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Campo Alterado</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">Valor Anterior</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">Novo Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum registro com os filtros aplicados.</td></tr>
                    ) : filteredAuditRows.map(r => (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-muted/20 transition-colors align-top">
                        <td className="px-4 py-1 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', DOT_CLS[r.color])}><r.Icon className="h-3 w-3" /></span>
                            <span className="font-medium">{r.eventLabel}</span>
                          </span>
                        </td>
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

