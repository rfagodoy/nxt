'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Phone, MapPin, CreditCard, Users,
  Plus, Trash2, ChevronDown, Layers, FileText, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PAISES } from '@/lib/paises'
import { usePartnerFields, useFieldVisibility, type CustomField } from '@/hooks/use-partner-fields'
import { usePartnerSections } from '@/hooks/use-partner-sections'
import { getLogUser } from '@/hooks/use-partner-logs'

/* ─── lista de bancos brasileiros ────────────────────────── */

const BRAZIL_BANKS = [
  '001 — Banco do Brasil',         '003 — Banco da Amazônia',        '004 — BNB',
  '033 — Santander',               '041 — Banrisul',                 '047 — Banese',
  '070 — BRB',                     '077 — Banco Inter',              '084 — Uniprime Norte do Paraná',
  '085 — Ailos',                   '097 — Credisis',                 '099 — Uniprime Central',
  '104 — Caixa Econômica Federal', '121 — Agibank',                  '133 — Cresol',
  '136 — Unicred',                 '197 — Stone Pagamentos',         '208 — BTG Pactual',
  '212 — Banco Original',          '218 — BS2',                      '224 — Banco Fibra',
  '237 — Bradesco',                '246 — ABC Brasil',               '260 — Nu Pagamentos (Nubank)',
  '290 — PagSeguro',               '318 — Banco BMG',                '323 — Mercado Pago',
  '336 — C6 Bank',                 '341 — Itaú Unibanco',            '348 — XP Investimentos',
  '364 — Efí (Gerencianet)',        '380 — PicPay',                   '389 — Banco Mercantil do Brasil',
  '403 — Cora',                    '422 — Banco Safra',              '456 — Banco MUFG Brasil',
  '477 — Citibank',                '487 — Deutsche Bank',            '488 — JPMorgan Chase',
  '492 — ING Bank',                '505 — Credit Suisse',            '611 — Banco Paulista',
  '623 — Banco Pan',               '633 — Banco Rendimento',         '634 — Banco Triângulo',
  '637 — Banco Sofisa',            '643 — Banco Pine',               '655 — Votorantim',
  '707 — Banco Daycoval',          '739 — Banco Cetelem',            '748 — Sicredi',
  '752 — BNP Paribas Brasil',      '756 — Sicoob',
]

/* ─── constantes ─────────────────────────────────────────── */

type Category = 'PJ_BR' | 'PJ_EST' | 'PF_BR' | 'PF_EST'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'PJ_BR',  label: 'PJ Brasileira'  },
  { value: 'PJ_EST', label: 'PJ Estrangeira' },
  { value: 'PF_BR',  label: 'PF Brasileira'  },
  { value: 'PF_EST', label: 'PF Estrangeira' },
]

const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

/* ─── interfaces ─────────────────────────────────────────── */

interface Socio    { id: string; nome: string; documento: string; participacao: string; cargo: string }
interface Contato  { id: string; email: string; nome: string; telefone: string; celular: string; cargo: string; website: string }
interface Endereco { id: string; cep: string; estado: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; address1: string; address2: string; pais_endereco: string }
interface Banco    { id: string; banco: string; tipo_conta: string; agencia: string; conta: string; pix: string }

export interface PartnerSaveResult { id: string; razaoSocial: string }

function newContato(): Contato  { return { id: `c_${Date.now()}_${Math.random()}`, email: '', nome: '', telefone: '', celular: '', cargo: '', website: '' } }
function newEndereco(): Endereco { return { id: `e_${Date.now()}_${Math.random()}`, cep: '', estado: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', address1: '', address2: '', pais_endereco: '' } }
function newBanco(): Banco      { return { id: `b_${Date.now()}_${Math.random()}`, banco: '', tipo_conta: '', agencia: '', conta: '', pix: '' } }

/* ─── funções de máscara ─────────────────────────────────── */

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

/* ─── primitivos ─────────────────────────────────────────── */

function Field({ label, required, hint, children, span2 }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode; span2?: boolean
}) {
  return (
    <div className={cn('space-y-1', span2 && 'col-span-2')}>
      <label className="text-xs font-medium">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />
}

/* ─── campo personalizado ────────────────────────────────── */

function CustomFieldInput({ field }: { field: CustomField }) {
  let input: React.ReactNode
  switch (field.type) {
    case 'number':   input = <input type="number" name={field.name} className={inputCls} />; break
    case 'date':     input = <input type="date" name={field.name} className={inputCls} />; break
    case 'time':     input = <input type="time" name={field.name} className={inputCls} />; break
    case 'datetime': input = <input type="datetime-local" name={field.name} className={inputCls} />; break
    case 'currency':
      input = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
          <input type="number" step="0.01" name={field.name} className={cn(inputCls, 'pl-9')} />
        </div>
      ); break
    case 'checkbox':
      input = (
        <div className="flex items-center gap-2 h-8">
          <input type="checkbox" id={field.name} name={field.name} className="h-3.5 w-3.5 rounded border-gray-300" />
          <label htmlFor={field.name} className="text-xs text-muted-foreground">Marcar</label>
        </div>
      ); break
    case 'select':
      input = (
        <select name={field.name} className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">Selecione...</option>
          {field.options?.map(o => <option key={o.id} value={o.value}>{o.label}</option>)}
        </select>
      ); break
    default:
      input = <input type="text" name={field.name} maxLength={field.maxLength} className={inputCls} />
  }
  return <Field label={field.label}>{input}</Field>
}

/* ─── card de item múltiplo ──────────────────────────────── */

function ItemCard({ index, total, label, onRemove, children }: {
  index: number; total: number; label: string; onRemove: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">{label} {index + 1}</span>
          {index === 0 && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">Principal</span>
          )}
        </div>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors" title={`Remover ${label.toLowerCase()}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  )
}

/* ─── seção accordion ────────────────────────────────────── */

function Section({ icon: Icon, title, isOpen, onToggle, hasError, customFields, children }: {
  icon: React.ElementType; title: string; isOpen: boolean; onToggle: () => void
  hasError?: boolean; customFields?: CustomField[]; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button" onClick={onToggle}
        className={cn('w-full px-4 py-2 flex items-center gap-2 transition-colors hover:bg-muted/40 bg-muted/30', isOpen && 'border-b')}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : 'text-muted-foreground')} />
        <h3 className={cn('text-xs font-semibold flex-1 text-left', hasError && 'text-red-500')}>{title}</h3>
        {hasError && <span className="text-[11px] text-red-500 font-medium mr-1">Campos obrigatórios</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="p-4 space-y-3">
          {children}
          {customFields && customFields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {customFields.map(f => <CustomFieldInput key={f.id} field={f} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── props ──────────────────────────────────────────────── */

interface PartnerNewFormProps {
  embedded?: boolean
  onSaved?:  (result?: PartnerSaveResult) => void
  onCancel?: () => void
}

/* ─── componente principal ───────────────────────────────── */

export default function PartnerNewForm({ embedded = false, onSaved, onCancel }: PartnerNewFormProps) {
  const router               = useRouter()
  const { fieldsForSection } = usePartnerFields()
  const { isVisible }        = useFieldVisibility()
  const { sections: customSections, sectionOrder, sectionDefaultOpen, loaded: sectionsLoaded } = usePartnerSections()

  const [category,      setCategory]      = useState<Category>('PJ_BR')
  const [docValue,      setDocValue]      = useState('')
  const [contatos,      setContatos]      = useState<Contato[]>([newContato()])
  const [enderecos,     setEnderecos]     = useState<Endereco[]>([newEndereco()])
  const [bancos,        setBancos]        = useState<Banco[]>([newBanco()])
  const [socios,        setSocios]        = useState<Socio[]>([])
  const [open,          setOpen]          = useState<Set<string>>(new Set<string>())
  const [errors,        setErrors]        = useState<Set<string>>(new Set())
  const [fromContratos, setFromContratos] = useState(false)
  const [saving,        setSaving]        = useState<'draft' | 'active' | null>(null)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [cepLoading,    setCepLoading]    = useState<Record<string, boolean>>({})
  const [cepError,      setCepError]      = useState<Record<string, string>>({})
  const formRef                           = useRef<HTMLFormElement>(null)
  const openInit                          = useRef(false)

  const isPJ = category === 'PJ_BR' || category === 'PJ_EST'
  const isBR = category === 'PJ_BR' || category === 'PF_BR'

  useEffect(() => {
    if (embedded) return
    const params = new URLSearchParams(window.location.search)
    setFromContratos(params.get('from') === 'contratos')
  }, [embedded])

  useEffect(() => {
    if (!sectionsLoaded || openInit.current) return
    openInit.current = true
    const ids = ['identificacao', 'contato', 'endereco', 'bancario', 'socios', ...customSections.map(s => s.id)]
    const openSet = new Set<string>()
    for (const id of ids) {
      const defaultOpen = sectionDefaultOpen[id] ?? (id === 'identificacao')
      if (defaultOpen) openSet.add(id)
    }
    setOpen(openSet)
  }, [sectionsLoaded, sectionDefaultOpen, customSections])

  useEffect(() => {
    if (open.has('socios') && isPJ && socios.length === 0) {
      setSocios([{ id: `s_${Date.now()}`, nome: '', documento: '', participacao: '', cargo: '' }])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPJ])

  const allSectionIds = ['identificacao', 'contato', 'endereco', 'bancario', 'socios', ...customSections.map(s => s.id)]
  const resolvedOrder = [
    ...sectionOrder.filter(id => allSectionIds.includes(id)),
    ...allSectionIds.filter(id => !sectionOrder.includes(id)),
  ]

  /* campos personalizados visíveis */
  const vfs = (section: string) => fieldsForSection(section).filter(f =>
    (f.visible === 'form' || f.visible === 'both') && isVisible(f.id)
  )

  /* nfv = native field visible */
  const nfv = (key: string) => isVisible(key)

  const toggle = (key: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const addContato    = () => setContatos(p => [...p, newContato()])
  const removeContato = (id: string) => setContatos(p => p.filter(c => c.id !== id))
  const updateContato = (id: string, key: keyof Omit<Contato, 'id'>, val: string) =>
    setContatos(p => p.map(c => c.id === id ? { ...c, [key]: val } : c))

  const addEndereco    = () => setEnderecos(p => [...p, newEndereco()])
  const removeEndereco = (id: string) => setEnderecos(p => p.filter(e => e.id !== id))
  const updateEndereco = (id: string, key: keyof Omit<Endereco, 'id'>, val: string) =>
    setEnderecos(p => p.map(e => e.id === id ? { ...e, [key]: val } : e))

  const addBanco    = () => setBancos(p => [...p, newBanco()])
  const removeBanco = (id: string) => setBancos(p => p.filter(b => b.id !== id))
  const updateBanco = (id: string, key: keyof Omit<Banco, 'id'>, val: string) =>
    setBancos(p => p.map(b => b.id === id ? { ...b, [key]: val } : b))

  const addSocio    = () => setSocios(p => [...p, { id: `s_${Date.now()}`, nome: '', documento: '', participacao: '', cargo: '' }])
  const removeSocio = (id: string) => setSocios(p => p.filter(s => s.id !== id))
  const updateSocio = (id: string, field: keyof Omit<Socio, 'id'>, value: string) =>
    setSocios(p => p.map(s => s.id === id ? { ...s, [field]: value } : s))

  /* ─── busca CEP via ViaCEP ──────────────────────────────── */
  const fetchCep = async (enderecoId: string, rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(prev => ({ ...prev, [enderecoId]: true }))
    setCepError(prev => ({ ...prev, [enderecoId]: '' }))
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (data.erro) { setCepError(prev => ({ ...prev, [enderecoId]: 'CEP não encontrado.' })); return }
      if (data.logradouro) updateEndereco(enderecoId, 'logradouro', data.logradouro)
      if (data.bairro)     updateEndereco(enderecoId, 'bairro',     data.bairro)
      if (data.localidade) updateEndereco(enderecoId, 'cidade',     data.localidade)
      if (data.uf)         updateEndereco(enderecoId, 'estado',     data.uf)
    } catch {
      setCepError(prev => ({ ...prev, [enderecoId]: 'Erro ao buscar CEP.' }))
    } finally {
      setCepLoading(prev => ({ ...prev, [enderecoId]: false }))
    }
  }

  const buildPayload = (fd: FormData, status: string) => {
    const get = (name: string) => (fd.get(name) as string || '').trim()
    const opt = (val: string) => val || undefined
    return {
      organizationId: process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev',
      categoria: category,
      status,
      documento:      opt(get('cnpj') || get('cpf') || get('codigo')),
      razaoSocial:    get('razao_social'),
      nomeFantasia:   opt(get('nome_fantasia')),
      ie:             opt(get('ie')),
      im:             opt(get('im')),
      rg:             opt(get('rg')),
      orgaoExpedidor: opt(get('orgao_expedidor')),
      dataNascimento: opt(get('data_nascimento')),
      paisOrigem:     opt(get('pais_origem')),
      contatos, enderecos, bancos, socios,
      user:           getLogUser(),
    }
  }

  const afterSave = (result?: PartnerSaveResult) => {
    if (onSaved) { onSaved(result) } else { router.push('/modules/parceiros') }
  }

  /* ─── salvar rascunho ───────────────────────────────────── */
  const handleSaveDraft = async () => {
    if (!formRef.current) return
    const fd          = new FormData(formRef.current)
    const get         = (n: string) => (fd.get(n) as string || '').trim()
    const razaoSocial = get('razao_social')
    if (!razaoSocial) {
      setErrors(new Set(['identificacao']))
      setOpen(prev => { const n = new Set(prev); n.add('identificacao'); return n })
      return
    }
    setSaving('draft'); setSaveError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/partners`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(fd, 'EM_CADASTRAMENTO')),
      })
      if (!res.ok) { setSaveError(`Erro ao salvar (${res.status}). Verifique a conexão com o servidor.`); return }
      const created = await res.json() as { id?: string }
      if (created.id) {
        afterSave({ id: created.id, razaoSocial })
      } else { afterSave() }
    } catch {
      setSaveError('Não foi possível conectar ao servidor. Verifique se o serviço está disponível.')
    } finally { setSaving(null) }
  }

  /* ─── ativar parceiro ───────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current) return
    const fd          = new FormData(formRef.current)
    const get         = (n: string) => (fd.get(n) as string || '').trim()
    const razaoSocial = get('razao_social')
    const err         = new Set<string>()

    if (category === 'PJ_BR'  && !get('cnpj'))  err.add('identificacao')
    if (category === 'PF_BR'  && !get('cpf'))    err.add('identificacao')
    if ((category === 'PJ_EST' || category === 'PF_EST') && !get('codigo')) err.add('identificacao')
    if (!razaoSocial) err.add('identificacao')
    if ((category === 'PF_BR' || category === 'PF_EST') && !get('data_nascimento')) err.add('identificacao')
    if ((category === 'PJ_EST' || category === 'PF_EST') && !get('pais_origem'))    err.add('identificacao')

    const e0 = enderecos[0]
    if (isBR) {
      if (!e0?.cep || !e0?.estado || !e0?.logradouro || !e0?.numero || !e0?.bairro || !e0?.cidade) err.add('endereco')
    } else {
      if (!e0?.address1 || !e0?.cidade || !e0?.pais_endereco) err.add('endereco')
    }

    setErrors(err)
    if (err.size > 0) {
      setOpen(prev => { const n = new Set(prev); err.forEach(k => n.add(k)); return n })
      return
    }

    if (!embedded && fromContratos) {
      const novoParceiro = { id: `p_${Date.now()}`, nome: razaoSocial, documento: get('cnpj') || get('cpf') || get('codigo') }
      sessionStorage.setItem('primeapps:contract:newParceiro', JSON.stringify(novoParceiro))
      router.push('/modules/contratos/new')
      return
    }

    setSaving('active'); setSaveError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/partners`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(fd, 'ATIVO')),
      })
      if (!res.ok) { setSaveError(`Erro ao ativar (${res.status}). Verifique a conexão com o servidor.`); return }
      const created = await res.json() as { id?: string }
      if (created.id) {
        afterSave({ id: created.id, razaoSocial })
      } else { afterSave() }
    } catch {
      setSaveError('Não foi possível conectar ao servidor. Verifique se o serviço está disponível.')
    } finally { setSaving(null) }
  }

  /* ─── renderizador de seção por chave ────────────────────── */
  const renderSection = (key: string): React.ReactNode => {

    if (key === 'identificacao') return (
      <Section key="identificacao" icon={Building2} title="Identificação"
        isOpen={open.has('identificacao')} onToggle={() => toggle('identificacao')}
        hasError={errors.has('identificacao')} customFields={vfs('identificacao')}
      >
        <div className="grid grid-cols-2 gap-3">
          {nfv('cnpj') && category === 'PJ_BR' && (
            <Field label="CNPJ" required hint="Novo formato alfanumérico — Reforma Tributária 2026">
              <Input name="cnpj" value={docValue} placeholder="00.000.000/0000-00" maxLength={18}
                onChange={e => setDocValue(maskCNPJ(e.target.value))} />
            </Field>
          )}
          {nfv('cpf') && category === 'PF_BR' && (
            <Field label="CPF" required>
              <Input name="cpf" value={docValue} placeholder="000.000.000-00" maxLength={14}
                onChange={e => setDocValue(maskCPF(e.target.value))} />
            </Field>
          )}
          {nfv('codigo') && (category === 'PJ_EST' || category === 'PF_EST') && (
            <Field label={category === 'PF_EST' ? 'Passaporte / Documento' : 'Código'} required hint="Identificador no país de origem">
              <Input name="codigo" placeholder="Número do documento" />
            </Field>
          )}
          {nfv('razao_social') && (
            <Field label={isPJ ? 'Razão Social' : 'Nome Completo'} required>
              <Input name="razao_social" placeholder={isPJ ? 'Razão social da empresa' : 'Nome completo'} />
            </Field>
          )}
          {nfv('nome_fantasia') && isPJ && (
            <Field label="Nome Fantasia"><Input name="nome_fantasia" placeholder="Nome fantasia (se houver)" /></Field>
          )}
          {category === 'PJ_BR' && (
            <>
              {nfv('ie') && <Field label="Inscrição Estadual"><Input name="ie" placeholder="Inscrição estadual" /></Field>}
              {nfv('im') && <Field label="Inscrição Municipal"><Input name="im" placeholder="Inscrição municipal" /></Field>}
            </>
          )}
          {category === 'PF_BR' && (
            <>
              {nfv('rg') && <Field label="RG"><Input name="rg" placeholder="00.000.000-0" /></Field>}
              {nfv('orgao_expedidor') && <Field label="Órgão Expedidor"><Input name="orgao_expedidor" placeholder="Ex: SSP/SP" /></Field>}
              {nfv('data_nascimento') && <Field label="Data de Nascimento" required><Input type="date" name="data_nascimento" /></Field>}
              {nfv('pais_origem') && (
                <Field label="País de Origem">
                  <select name="pais_origem" defaultValue="Brasil" className={inputCls}>
                    {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}
            </>
          )}
          {(category === 'PJ_EST' || category === 'PF_EST') && (
            <>
              {nfv('pais_origem') && (
                <Field label="País de Origem" required>
                  <select name="pais_origem" className={inputCls}>
                    <option value="">Selecione o país...</option>
                    {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}
              {nfv('data_nascimento') && category === 'PF_EST' && <Field label="Data de Nascimento"><Input type="date" name="data_nascimento" /></Field>}
            </>
          )}
        </div>
      </Section>
    )

    if (key === 'contato') return (
      <Section key="contato" icon={Phone} title="Contato"
        isOpen={open.has('contato')} onToggle={() => toggle('contato')}
        customFields={vfs('contato')}
      >
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {contatos.map((c, idx) => (
          <ItemCard key={c.id} index={idx} total={contatos.length} label="Contato" onRemove={() => removeContato(c.id)}>
            {nfv('con_email') && (
              <Field label="E-mail">
                <input type="email" value={c.email} onChange={e => updateContato(c.id, 'email', e.target.value)}
                  placeholder="email@empresa.com" className={inputCls} />
              </Field>
            )}
            {nfv('con_nome') && (
              <Field label="Nome do Contato">
                <input value={c.nome} onChange={e => updateContato(c.id, 'nome', e.target.value)}
                  placeholder="Pessoa responsável pelo contato" className={inputCls} />
              </Field>
            )}
            {nfv('con_telefone') && (
              <Field label="Telefone">
                <input value={c.telefone} onChange={e => updateContato(c.id, 'telefone', isBR ? maskTelefone(e.target.value) : e.target.value)}
                  placeholder={isBR ? '(00) 0000-0000' : '+1 (000) 000-0000'} className={inputCls} />
              </Field>
            )}
            {nfv('con_celular') && (
              <Field label="Celular / WhatsApp">
                <input value={c.celular} onChange={e => updateContato(c.id, 'celular', isBR ? maskCelular(e.target.value) : e.target.value)}
                  placeholder={isBR ? '(00) 00000-0000' : '+1 (000) 000-0000'} className={inputCls} />
              </Field>
            )}
            {nfv('con_cargo') && (
              <Field label="Cargo do Contato">
                <input value={c.cargo} onChange={e => updateContato(c.id, 'cargo', e.target.value)}
                  placeholder="Ex: Diretor Comercial" className={inputCls} />
              </Field>
            )}
            {nfv('con_website') && isPJ && (
              <Field label="Website">
                <input value={c.website} onChange={e => updateContato(c.id, 'website', e.target.value)}
                  placeholder="https://www.empresa.com" className={inputCls} />
              </Field>
            )}
          </ItemCard>
        ))}
        </div>
        <button type="button" onClick={addContato}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
          <Plus className="h-3.5 w-3.5" />Adicionar contato
        </button>
      </Section>
    )

    if (key === 'endereco') return (
      <Section key="endereco" icon={MapPin} title="Endereço"
        isOpen={open.has('endereco')} onToggle={() => toggle('endereco')}
        hasError={errors.has('endereco')} customFields={vfs('endereco')}
      >
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {enderecos.map((en, idx) => (
          <ItemCard key={en.id} index={idx} total={enderecos.length} label="Endereço" onRemove={() => removeEndereco(en.id)}>
            {isBR ? (
              <>
                {nfv('end_cep') && (
                  <Field label="CEP" required={idx === 0}>
                    <div className="flex gap-2">
                      <input value={en.cep}
                        onChange={e => {
                          updateEndereco(en.id, 'cep', e.target.value)
                          const d = e.target.value.replace(/\D/g, '')
                          if (d.length === 8) void fetchCep(en.id, d)
                        }}
                        placeholder="00000-000" maxLength={9} className={inputCls} />
                      <button type="button" onClick={() => void fetchCep(en.id, en.cep)} disabled={cepLoading[en.id]}
                        className="px-2.5 h-8 shrink-0 text-xs rounded-md border hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                        {cepLoading[en.id] && <Loader2 className="h-3 w-3 animate-spin" />}
                        Buscar
                      </button>
                    </div>
                    {cepError[en.id] && <p className="text-[11px] text-red-500 mt-0.5">{cepError[en.id]}</p>}
                  </Field>
                )}
                {nfv('end_estado') && (
                  <Field label="Estado" required={idx === 0}>
                    <select value={en.estado} onChange={e => updateEndereco(en.id, 'estado', e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      <option value="">Selecione...</option>
                      {UF.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </Field>
                )}
                {nfv('end_logradouro') && <Field label="Logradouro" required={idx === 0}><input value={en.logradouro} onChange={e => updateEndereco(en.id, 'logradouro', e.target.value)} placeholder="Rua, Avenida..." className={inputCls} /></Field>}
                {nfv('end_numero')    && <Field label="Número" required={idx === 0}><input value={en.numero} onChange={e => updateEndereco(en.id, 'numero', e.target.value)} placeholder="Nº" className={inputCls} /></Field>}
                {nfv('end_complemento') && <Field label="Complemento"><input value={en.complemento} onChange={e => updateEndereco(en.id, 'complemento', e.target.value)} placeholder="Apto, sala, bloco..." className={inputCls} /></Field>}
                {nfv('end_bairro')   && <Field label="Bairro" required={idx === 0}><input value={en.bairro} onChange={e => updateEndereco(en.id, 'bairro', e.target.value)} placeholder="Bairro" className={inputCls} /></Field>}
                {nfv('end_cidade')   && <Field label="Cidade" required={idx === 0} span2><input value={en.cidade} onChange={e => updateEndereco(en.id, 'cidade', e.target.value)} placeholder="Cidade" className={inputCls} /></Field>}
              </>
            ) : (
              <>
                {nfv('end_address1') && <Field label="Endereço — Linha 1" required={idx === 0} span2><input value={en.address1} onChange={e => updateEndereco(en.id, 'address1', e.target.value)} placeholder="Street address, P.O. box" className={inputCls} /></Field>}
                {nfv('end_address2') && <Field label="Endereço — Linha 2" span2><input value={en.address2} onChange={e => updateEndereco(en.id, 'address2', e.target.value)} placeholder="Apt, suite, floor..." className={inputCls} /></Field>}
                {nfv('end_cidade')   && <Field label="Cidade" required={idx === 0}><input value={en.cidade} onChange={e => updateEndereco(en.id, 'cidade', e.target.value)} placeholder="City" className={inputCls} /></Field>}
                {nfv('end_estado')   && <Field label="Estado / Província"><input value={en.estado} onChange={e => updateEndereco(en.id, 'estado', e.target.value)} placeholder="State / Province" className={inputCls} /></Field>}
                {nfv('end_cep')      && <Field label="CEP / ZIP Code"><input value={en.cep} onChange={e => updateEndereco(en.id, 'cep', e.target.value)} placeholder="Postal code" className={inputCls} /></Field>}
                {nfv('end_pais')     && (
                  <Field label="País" required={idx === 0}>
                    <select value={en.pais_endereco} onChange={e => updateEndereco(en.id, 'pais_endereco', e.target.value)} className={inputCls}>
                      <option value="">Selecione o país...</option>
                      {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                )}
              </>
            )}
          </ItemCard>
        ))}
        </div>
        <button type="button" onClick={addEndereco}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
          <Plus className="h-3.5 w-3.5" />Adicionar endereço
        </button>
      </Section>
    )

    if (key === 'bancario') return (
      <>
        <datalist id="brasil-banks">
          {BRAZIL_BANKS.map(b => <option key={b} value={b} />)}
        </datalist>
        <Section key="bancario" icon={CreditCard} title="Dados Bancários"
          isOpen={open.has('bancario')} onToggle={() => toggle('bancario')} customFields={vfs('bancario')}
        >
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {bancos.map((b, idx) => (
            <ItemCard key={b.id} index={idx} total={bancos.length} label="Banco" onRemove={() => removeBanco(b.id)}>
              {nfv('ban_banco') && (
                <Field label="Banco">
                  <input list="brasil-banks" value={b.banco} onChange={e => updateBanco(b.id, 'banco', e.target.value)}
                    placeholder="Digite o nome ou número do banco..." className={inputCls} />
                </Field>
              )}
              {nfv('ban_tipo_conta') && (
                <Field label="Tipo de Conta">
                  <select value={b.tipo_conta} onChange={e => updateBanco(b.id, 'tipo_conta', e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="">Selecione...</option>
                    <option value="corrente">Conta Corrente</option>
                    <option value="poupanca">Conta Poupança</option>
                    <option value="pagamento">Conta de Pagamento</option>
                  </select>
                </Field>
              )}
              {nfv('ban_agencia')  && <Field label="Agência"><input value={b.agencia} onChange={e => updateBanco(b.id, 'agencia', e.target.value)} placeholder="0000" className={inputCls} /></Field>}
              {nfv('ban_conta')    && <Field label="Conta"><input value={b.conta} onChange={e => updateBanco(b.id, 'conta', e.target.value)} placeholder="00000-0" className={inputCls} /></Field>}
              {nfv('ban_pix')      && <Field label="Chave PIX" span2><input value={b.pix} onChange={e => updateBanco(b.id, 'pix', e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" className={inputCls} /></Field>}
            </ItemCard>
          ))}
          </div>
          <button type="button" onClick={addBanco}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
            <Plus className="h-3.5 w-3.5" />Adicionar banco
          </button>
        </Section>
      </>
    )

    if (key === 'socios') {
      if (!isPJ) return null
      return (
        <Section key="socios" icon={Users} title="Quadro de Sócios"
          isOpen={open.has('socios')} onToggle={() => toggle('socios')}
        >
          {socios.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum sócio cadastrado.</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-12 gap-2 px-1 sticky top-0 bg-card z-10 py-1">
                <div className="col-span-1" />
                {nfv('soc_nome')         && <p className="col-span-3 text-[11px] font-medium text-muted-foreground">Nome</p>}
                {nfv('soc_documento')    && <p className="col-span-3 text-[11px] font-medium text-muted-foreground">{isBR ? 'CPF' : 'Documento'}</p>}
                {nfv('soc_participacao') && <p className="col-span-2 text-[11px] font-medium text-muted-foreground">Participação %</p>}
                {nfv('soc_cargo')        && <p className="col-span-2 text-[11px] font-medium text-muted-foreground">Cargo / Função</p>}
                <div className="col-span-1" />
              </div>
              {socios.map((socio, idx) => (
                <div key={socio.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-md border bg-muted/20">
                  <span className="col-span-1 text-[11px] text-muted-foreground text-center font-medium">{idx + 1}</span>
                  {nfv('soc_nome')         && <div className="col-span-3"><input placeholder="Nome completo" value={socio.nome} onChange={e => updateSocio(socio.id, 'nome', e.target.value)} className={inputCls} /></div>}
                  {nfv('soc_documento')    && <div className="col-span-3"><input placeholder={isBR ? '000.000.000-00' : 'Documento'} value={socio.documento} onChange={e => updateSocio(socio.id, 'documento', e.target.value)} className={inputCls} /></div>}
                  {nfv('soc_participacao') && <div className="col-span-2"><input placeholder="0,00 %" value={socio.participacao} onChange={e => updateSocio(socio.id, 'participacao', e.target.value)} className={inputCls} /></div>}
                  {nfv('soc_cargo')        && <div className="col-span-2"><input placeholder="Ex: Sócio-Diretor" value={socio.cargo} onChange={e => updateSocio(socio.id, 'cargo', e.target.value)} className={inputCls} /></div>}
                  <div className="col-span-1 flex justify-center">
                    <button type="button" onClick={() => removeSocio(socio.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addSocio} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
            <Plus className="h-3.5 w-3.5" />Adicionar sócio
          </button>
        </Section>
      )
    }

    const cs = customSections.find(s => s.id === key)
    if (cs) return (
      <Section key={cs.id} icon={Layers} title={cs.label}
        isOpen={open.has(cs.id)} onToggle={() => toggle(cs.id)} customFields={vfs(cs.id)}
      >
        {vfs(cs.id).length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-2">Nenhum campo nesta seção.</p>
        )}
      </Section>
    )

    return null
  }

  /* ─── render ─────────────────────────────────────────────── */

  return (
    <div className={cn('space-y-4', !embedded && 'max-w-3xl mx-auto')}>

      {!embedded && (
        <div className="flex items-center gap-3">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link href={fromContratos ? '/modules/contratos/new' : '/modules/parceiros'}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div>
            <h1 className="text-base font-semibold tracking-tight">Novo parceiro</h1>
            <p className="text-[11px] text-muted-foreground">Preencha os dados do parceiro</p>
          </div>
        </div>
      )}

      {!embedded && fromContratos && (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
          <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Você está cadastrando um parceiro para vincular a um contrato.
            Após salvar, você será redirecionado de volta ao formulário do contrato.
          </p>
        </div>
      )}

      <div className="rounded-lg border bg-card p-1 grid grid-cols-4 gap-1">
        {CATEGORIES.map(cat => (
          <button key={cat.value} type="button" onClick={() => { setCategory(cat.value); setDocValue('') }}
            className={cn('rounded-md py-1.5 px-3 text-xs font-medium transition-all',
              category === cat.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}>
            {cat.label}
          </button>
        ))}
      </div>

      <form ref={formRef} className="space-y-2" onSubmit={handleSubmit}>

        {resolvedOrder.map(key => renderSection(key))}

        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
            {saveError}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 pb-6">
          {onCancel ? (
            <button type="button" onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          ) : (
            <Link href={fromContratos ? '/modules/contratos/new' : '/modules/parceiros'}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </Link>
          )}
          <div className="flex items-center gap-2">
            {!fromContratos && (
              <button type="button" onClick={() => { void handleSaveDraft() }} disabled={saving !== null}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {saving === 'draft' ? 'Salvando...' : 'Salvar rascunho'}
              </button>
            )}
            <button type="submit" disabled={saving !== null}
              className="inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving === 'active' ? 'Salvando...' : fromContratos ? 'Salvar e vincular ao contrato' : 'Ativar parceiro'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
