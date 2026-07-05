'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { PAISES, PAISES_SEED, PAISES_STORAGE_KEY } from '@/lib/paises'
import type { CustomField } from '@/hooks/use-partner-fields'

/* ─── tipos ───────────────────────────────────────────────── */

export type PartnerCategory = 'PJ_BR' | 'PJ_EST' | 'PF_BR' | 'PF_EST'

export interface PCon { id: string; email: string; nome: string; telefone: string; celular: string; cargo: string; website: string }
export interface PEnd { id: string; cep: string; estado: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; address1: string; address2: string; pais_endereco: string }
export interface PBan { id: string; banco: string; tipo_conta: string; agencia: string; conta: string; pix: string }
export interface PSoc { id: string; nome: string; documento: string; participacao: string; cargo: string }

export interface PartnerFormValues {
  category:       PartnerCategory
  documento:      string
  razaoSocial:    string
  nomeFantasia:   string
  ie:             string
  im:             string
  rg:             string
  orgaoExpedidor: string
  dataNascimento: string
  paisOrigem:     string
  contatos:       PCon[]
  enderecos:      PEnd[]
  bancos:         PBan[]
  socios:         PSoc[]
}

let _seq = 0
const uid = (p: string) => `${p}_${Date.now()}_${++_seq}`

export const newPCon = (nome = ''): PCon => ({ id: uid('c'), email: '', nome, telefone: '', celular: '', cargo: '', website: '' })
export const newPEnd = (cidade = '', estado = ''): PEnd => ({ id: uid('e'), cep: '', estado, logradouro: '', numero: '', complemento: '', bairro: '', cidade, address1: '', address2: '', pais_endereco: '' })
export const newPBan = (): PBan => ({ id: uid('b'), banco: '', tipo_conta: '', agencia: '', conta: '', pix: '' })
export const newPSoc = (): PSoc => ({ id: uid('s'), nome: '', documento: '', participacao: '', cargo: '' })

/** Converte "50", "50,00", "50.00 %" -> número; string vazia -> null; inválido -> NaN. */
const parsePart = (s: string): number | null => {
  const t = (s ?? '').replace('%', '').replace(/\s/g, '').replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Regra de negócio do quadro de sócios: se AO MENOS UM sócio tiver o campo
 * Participação preenchido, a soma das participações de todos deve ser exatamente 100%.
 * Retorna a mensagem de erro, ou `null` quando válido (inclusive quando nenhuma
 * participação foi informada). Usado ao salvar e ao ativar o parceiro.
 */
export function validateSociosParticipacao(socios: PSoc[]): string | null {
  const parsed = socios.map(s => parsePart(s.participacao))
  if (!parsed.some(n => n !== null)) return null // nenhuma participação preenchida
  if (parsed.some(n => Number.isNaN(n))) return 'Há sócio com o campo Participação inválido. Use apenas números (ex.: 50 ou 50,00).'
  const soma = parsed.reduce<number>((acc, n) => acc + (n ?? 0), 0)
  if (Math.abs(soma - 100) > 0.01) {
    const fmt = soma.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `A soma das participações dos sócios deve ser 100%. Soma atual: ${fmt}%.`
  }
  return null
}

export function emptyPartnerForm(category: PartnerCategory = 'PJ_BR'): PartnerFormValues {
  return {
    category, documento: '', razaoSocial: '', nomeFantasia: '', ie: '', im: '', rg: '',
    orgaoExpedidor: '', dataNascimento: '', paisOrigem: category === 'PF_BR' ? 'Brasil' : '',
    contatos: [newPCon()], enderecos: [newPEnd()], bancos: [newPBan()], socios: [],
  }
}

/* ─── constantes ──────────────────────────────────────────── */

export const CATEGORIES: { value: PartnerCategory; label: string }[] = [
  { value: 'PJ_BR',  label: 'PJ Brasileira'  },
  { value: 'PJ_EST', label: 'PJ Estrangeira' },
  { value: 'PF_BR',  label: 'PF Brasileira'  },
  { value: 'PF_EST', label: 'PF Estrangeira' },
]

export const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export const TIPOS_CONTA = [
  { value: 'corrente',  label: 'Conta Corrente'    },
  { value: 'poupanca',  label: 'Conta Poupança'    },
  { value: 'pagamento', label: 'Conta de Pagamento' },
]

export const BRAZIL_BANKS = [
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

/* ─── máscaras ────────────────────────────────────────────── */

export function maskCNPJ(v: string): string {
  const d = v.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 14)
  if (d.length <=  2) return d
  if (d.length <=  5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <=  8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}
export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}
export function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (!d.length)      return ''
  if (d.length <=  2) return `(${d}`
  if (d.length <=  6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
}
export function maskCelular(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d.length)      return ''
  if (d.length <=  2) return `(${d}`
  if (d.length <=  7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

/* ─── controlador de estado (usado pelas duas telas) ─────── */

export function usePartnerForm(initial: PartnerFormValues) {
  const [values, setValues] = useState<PartnerFormValues>(initial)

  const set = useCallback(<K extends keyof PartnerFormValues>(k: K, v: PartnerFormValues[K]) =>
    setValues(p => ({ ...p, [k]: v })), [])

  /* trocar categoria reseta documento e país de origem (default Brasil p/ PF nacional) */
  const setCategory = useCallback((category: PartnerCategory) =>
    setValues(p => ({ ...p, category, documento: '', paisOrigem: category === 'PF_BR' ? 'Brasil' : '' })), [])

  const addCon = useCallback(() => setValues(p => ({ ...p, contatos: [...p.contatos, newPCon()] })), [])
  const remCon = useCallback((id: string) => setValues(p => ({ ...p, contatos: p.contatos.filter(x => x.id !== id) })), [])
  const updCon = useCallback((id: string, k: keyof Omit<PCon, 'id'>, v: string) =>
    setValues(p => ({ ...p, contatos: p.contatos.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])

  const addEnd = useCallback(() => setValues(p => ({ ...p, enderecos: [...p.enderecos, newPEnd()] })), [])
  const remEnd = useCallback((id: string) => setValues(p => ({ ...p, enderecos: p.enderecos.filter(x => x.id !== id) })), [])
  const updEnd = useCallback((id: string, k: keyof Omit<PEnd, 'id'>, v: string) =>
    setValues(p => ({ ...p, enderecos: p.enderecos.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])
  const patchEnd = useCallback((id: string, patch: Partial<Omit<PEnd, 'id'>>) =>
    setValues(p => ({ ...p, enderecos: p.enderecos.map(x => x.id !== id ? x : { ...x, ...patch }) })), [])

  const addBan = useCallback(() => setValues(p => ({ ...p, bancos: [...p.bancos, newPBan()] })), [])
  const remBan = useCallback((id: string) => setValues(p => ({ ...p, bancos: p.bancos.filter(x => x.id !== id) })), [])
  const updBan = useCallback((id: string, k: keyof Omit<PBan, 'id'>, v: string) =>
    setValues(p => ({ ...p, bancos: p.bancos.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])

  const addSoc = useCallback(() => setValues(p => ({ ...p, socios: [...p.socios, newPSoc()] })), [])
  const remSoc = useCallback((id: string) => setValues(p => ({ ...p, socios: p.socios.filter(x => x.id !== id) })), [])
  const updSoc = useCallback((id: string, k: keyof Omit<PSoc, 'id'>, v: string) =>
    setValues(p => ({ ...p, socios: p.socios.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])

  return { values, set, setValues, setCategory, addCon, remCon, updCon, addEnd, remEnd, updEnd, patchEnd, addBan, remBan, updBan, addSoc, remSoc, updSoc }
}
export type PartnerForm = ReturnType<typeof usePartnerForm>

/* ─── visibilidade: callback que decide se um campo nativo aparece ─── */
export type VisFn = (key: string) => boolean
const always: VisFn = () => true

/* ─── estilos + primitivos controlados (com modo leitura) ── */

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const readCls  = 'flex min-h-[1.5rem] w-full items-center bg-transparent px-0 text-[13px] font-medium text-foreground'

export function Field({ label, required, span2, hint, children }: { label: string; required?: boolean; span2?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground normal-case">{hint}</p>}
    </div>
  )
}

function Txt({ value, onChange, ro, type = 'text', placeholder, maxLength }: { value: string; onChange: (v: string) => void; ro?: boolean; type?: string; placeholder?: string; maxLength?: number }) {
  if (ro) return <span className={readCls}>{value || '—'}</span>
  return <input type={type} value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
}

function Sel({ value, onChange, ro, options, placeholder }: { value: string; onChange: (v: string) => void; ro?: boolean; options: { value: string; label: string }[]; placeholder?: string }) {
  if (ro) return <span className={readCls}>{options.find(o => o.value === value)?.label || value || '—'}</span>
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {value && !options.some(o => o.value === value) && <option value={value}>{value}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/* ─── seletor de categoria (compartilhado) ───────────────── */
export function CategoryTabs({ value, onChange, disabled }: { value: PartnerCategory; onChange: (c: PartnerCategory) => void; disabled?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-1 grid grid-cols-4 gap-1">
      {CATEGORIES.map(c => (
        <button key={c.value} type="button" disabled={disabled} onClick={() => onChange(c.value)}
          className={cn('rounded-md py-1.5 px-3 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed',
            value === c.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
          {c.label}
        </button>
      ))}
    </div>
  )
}

/* ─── card de item múltiplo ──────────────────────────────── */
export function ItemCard({ index, total, label, onRemove, ro, children }: { index: number; total: number; label: string; onRemove: () => void; ro?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">{label} {index + 1}</span>
          {index === 0 && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">Principal</span>}
        </div>
        {total > 1 && !ro && <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors" title={`Remover ${label.toLowerCase()}`}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
      <Plus className="h-3.5 w-3.5" />{children}
    </button>
  )
}

/* ─── campo personalizado (não persistido — placeholder de exibição, Fase 2B) ─── */
export function CustomFieldInput({ field }: { field: CustomField }) {
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
        <select name={field.name} className={inputCls}>
          <option value="">Selecione...</option>
          {field.options?.map(o => <option key={o.id} value={o.value}>{o.label}</option>)}
        </select>
      ); break
    default:
      input = <input type="text" name={field.name} maxLength={field.maxLength} className={inputCls} />
  }
  return <Field label={field.label}>{input}</Field>
}

export function CustomFieldsGrid({ fields }: { fields: CustomField[] }) {
  if (!fields.length) return null
  return (
    <div className="grid grid-cols-2 gap-3 pt-1">
      {fields.map(f => <CustomFieldInput key={f.id} field={f} />)}
    </div>
  )
}

/* ═══════════════════════ grupos de campos ═══════════════════════ */

interface GroupProps {
  form:        PartnerForm
  ro?:         boolean
  isVisible?:  VisFn
  customFields?: CustomField[]
}

const isPJof = (c: PartnerCategory) => c === 'PJ_BR' || c === 'PJ_EST'
const isBRof = (c: PartnerCategory) => c === 'PJ_BR' || c === 'PF_BR'

/** Identificação: documento + razão/nome + campos por categoria (CNPJ/CPF/Código, IE/IM, RG, etc.). */
export function IdentificacaoFields({ form, ro, isVisible = always, customFields = [] }: GroupProps) {
  const v   = form.values
  const cat = v.category
  const isPJ = isPJof(cat)
  const { active: paisesAtivos } = useLookupTable(PAISES_STORAGE_KEY, PAISES_SEED)
  const paisesList = paisesAtivos.length ? paisesAtivos.map(e => e.label) : PAISES
  const paisOpts = paisesList.map(p => ({ value: p, label: p }))

  const docKey  = cat === 'PJ_BR' ? 'cnpj' : cat === 'PF_BR' ? 'cpf' : 'codigo'
  const docMask = cat === 'PJ_BR' ? maskCNPJ : cat === 'PF_BR' ? maskCPF : (x: string) => x
  const docLabel = cat === 'PJ_BR' ? 'CNPJ' : cat === 'PF_BR' ? 'CPF' : cat === 'PF_EST' ? 'Passaporte / Documento' : 'Código'
  const docPlaceholder = cat === 'PJ_BR' ? '00.000.000/0000-00' : cat === 'PF_BR' ? '000.000.000-00' : 'Número do documento'
  const docHint = cat === 'PJ_BR' ? 'Novo formato alfanumérico — Reforma Tributária 2026' : (cat === 'PJ_EST' || cat === 'PF_EST') ? 'Identificador no país de origem' : undefined

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Razão Social / Nome Completo: campo-título em largura total (mais importante e mais longo) */}
        {isVisible('razao_social') && (
          <Field label={isPJ ? 'Razão Social' : 'Nome Completo'} required span2>
            <Txt value={v.razaoSocial} onChange={x => form.set('razaoSocial', x)} ro={ro} placeholder={isPJ ? 'Razão social da empresa' : 'Nome completo'} />
          </Field>
        )}
        {isVisible(docKey) && (
          <Field label={docLabel} required hint={docHint}>
            {ro ? <span className={readCls}>{v.documento || '—'}</span>
                : <input value={v.documento} onChange={e => form.set('documento', docMask(e.target.value))} placeholder={docPlaceholder} maxLength={cat === 'PJ_BR' ? 18 : cat === 'PF_BR' ? 14 : undefined} className={inputCls} />}
          </Field>
        )}
        {isPJ && isVisible('nome_fantasia') && (
          <Field label="Nome Fantasia"><Txt value={v.nomeFantasia} onChange={x => form.set('nomeFantasia', x)} ro={ro} placeholder="Nome fantasia (se houver)" /></Field>
        )}
        {cat === 'PJ_BR' && (
          <>
            {isVisible('ie') && <Field label="Inscrição Estadual"><Txt value={v.ie} onChange={x => form.set('ie', x)} ro={ro} placeholder="Inscrição estadual" /></Field>}
            {isVisible('im') && <Field label="Inscrição Municipal"><Txt value={v.im} onChange={x => form.set('im', x)} ro={ro} placeholder="Inscrição municipal" /></Field>}
          </>
        )}
        {cat === 'PF_BR' && (
          <>
            {isVisible('rg') && <Field label="RG"><Txt value={v.rg} onChange={x => form.set('rg', x)} ro={ro} placeholder="00.000.000-0" /></Field>}
            {isVisible('orgao_expedidor') && <Field label="Órgão Expedidor"><Txt value={v.orgaoExpedidor} onChange={x => form.set('orgaoExpedidor', x)} ro={ro} placeholder="Ex: SSP/SP" /></Field>}
            {isVisible('data_nascimento') && <Field label="Data de Nascimento" required><Txt type="date" value={v.dataNascimento} onChange={x => form.set('dataNascimento', x)} ro={ro} /></Field>}
            {isVisible('pais_origem') && <Field label="País de Origem"><Sel value={v.paisOrigem} onChange={x => form.set('paisOrigem', x)} ro={ro} options={paisOpts} /></Field>}
          </>
        )}
        {(cat === 'PJ_EST' || cat === 'PF_EST') && (
          <>
            {isVisible('pais_origem') && <Field label="País de Origem" required><Sel value={v.paisOrigem} onChange={x => form.set('paisOrigem', x)} ro={ro} options={paisOpts} placeholder="Selecione o país..." /></Field>}
            {cat === 'PF_EST' && isVisible('data_nascimento') && <Field label="Data de Nascimento" required><Txt type="date" value={v.dataNascimento} onChange={x => form.set('dataNascimento', x)} ro={ro} /></Field>}
          </>
        )}
      </div>
      <CustomFieldsGrid fields={customFields} />
    </>
  )
}

/** Contato (múltiplos). */
export function ContatoFields({ form, ro, isVisible = always, customFields = [] }: GroupProps) {
  const v = form.values
  const isPJ = isPJof(v.category)
  const isBR = isBRof(v.category)
  return (
    <>
      <div className="space-y-3 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
        {v.contatos.map((c, idx) => (
          <ItemCard key={c.id} index={idx} total={v.contatos.length} label="Contato" onRemove={() => form.remCon(c.id)} ro={ro}>
            {/* identidade do contato primeiro (nome + cargo), depois e-mail em largura total */}
            {isVisible('con_nome')     && <Field label="Nome do Contato"><Txt value={c.nome} onChange={x => form.updCon(c.id, 'nome', x)} ro={ro} placeholder="Pessoa responsável" /></Field>}
            {isVisible('con_cargo')    && <Field label="Cargo do Contato"><Txt value={c.cargo} onChange={x => form.updCon(c.id, 'cargo', x)} ro={ro} placeholder="Ex: Diretor Comercial" /></Field>}
            {isVisible('con_email')    && <Field label="E-mail" span2><Txt type="email" value={c.email} onChange={x => form.updCon(c.id, 'email', x)} ro={ro} placeholder="email@empresa.com" /></Field>}
            {isVisible('con_telefone') && <Field label="Telefone"><Txt value={c.telefone} onChange={x => form.updCon(c.id, 'telefone', isBR ? maskTelefone(x) : x)} ro={ro} placeholder={isBR ? '(00) 0000-0000' : '+1 (000) 000-0000'} /></Field>}
            {isVisible('con_celular')  && <Field label="Celular / WhatsApp"><Txt value={c.celular} onChange={x => form.updCon(c.id, 'celular', isBR ? maskCelular(x) : x)} ro={ro} placeholder={isBR ? '(00) 00000-0000' : '+1 (000) 000-0000'} /></Field>}
            {isPJ && isVisible('con_website') && <Field label="Website" span2><Txt value={c.website} onChange={x => form.updCon(c.id, 'website', x)} ro={ro} placeholder="https://www.empresa.com" /></Field>}
          </ItemCard>
        ))}
      </div>
      <CustomFieldsGrid fields={customFields} />
      {!ro && <AddButton onClick={form.addCon}>Adicionar contato</AddButton>}
    </>
  )
}

/** Endereço (múltiplos) — com busca de CEP (ViaCEP) para endereços nacionais. */
export function EnderecoFields({ form, ro, isVisible = always, customFields = [] }: GroupProps) {
  const v = form.values
  const isBR = isBRof(v.category)
  const { active: paisesAtivos } = useLookupTable(PAISES_STORAGE_KEY, PAISES_SEED)
  const paisesList = paisesAtivos.length ? paisesAtivos.map(e => e.label) : PAISES
  const [cepLoading, setCepLoading] = useState<Record<string, boolean>>({})
  const [cepError,   setCepError]   = useState<Record<string, string>>({})

  const fetchCep = async (id: string, rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(p => ({ ...p, [id]: true }))
    setCepError(p => ({ ...p, [id]: '' }))
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (data.erro) { setCepError(p => ({ ...p, [id]: 'CEP não encontrado.' })); return }
      form.patchEnd(id, {
        ...(data.logradouro ? { logradouro: data.logradouro } : {}),
        ...(data.bairro     ? { bairro: data.bairro }         : {}),
        ...(data.localidade ? { cidade: data.localidade }     : {}),
        ...(data.uf         ? { estado: data.uf }             : {}),
      })
    } catch {
      setCepError(p => ({ ...p, [id]: 'Erro ao buscar CEP.' }))
    } finally {
      setCepLoading(p => ({ ...p, [id]: false }))
    }
  }

  return (
    <>
      <div className="space-y-3 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
        {v.enderecos.map((en, idx) => (
          <ItemCard key={en.id} index={idx} total={v.enderecos.length} label="Endereço" onRemove={() => form.remEnd(en.id)} ro={ro}>
            {isBR ? (
              <>
                {isVisible('end_cep') && (
                  <Field label="CEP" required={idx === 0}>
                    {ro ? <span className={readCls}>{en.cep || '—'}</span> : (
                      <>
                        <div className="flex gap-2">
                          <input value={en.cep}
                            onChange={e => { form.updEnd(en.id, 'cep', e.target.value); if (e.target.value.replace(/\D/g, '').length === 8) void fetchCep(en.id, e.target.value) }}
                            placeholder="00000-000" maxLength={9} className={inputCls} />
                          <button type="button" onClick={() => void fetchCep(en.id, en.cep)} disabled={cepLoading[en.id]}
                            className="px-2.5 h-8 shrink-0 text-xs rounded-md border hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                            {cepLoading[en.id] && <Loader2 className="h-3 w-3 animate-spin" />}Buscar
                          </button>
                        </div>
                        {cepError[en.id] && <p className="text-[11px] text-red-500 mt-0.5">{cepError[en.id]}</p>}
                      </>
                    )}
                  </Field>
                )}
                {isVisible('end_estado')      && <Field label="Estado" required={idx === 0}><Sel value={en.estado} onChange={x => form.updEnd(en.id, 'estado', x)} ro={ro} options={UF.map(u => ({ value: u, label: u }))} placeholder="Selecione..." /></Field>}
                {isVisible('end_logradouro')  && <Field label="Logradouro" required={idx === 0}><Txt value={en.logradouro} onChange={x => form.updEnd(en.id, 'logradouro', x)} ro={ro} placeholder="Rua, Avenida..." /></Field>}
                {isVisible('end_numero')      && <Field label="Número" required={idx === 0}><Txt value={en.numero} onChange={x => form.updEnd(en.id, 'numero', x)} ro={ro} placeholder="Nº" /></Field>}
                {isVisible('end_complemento') && <Field label="Complemento"><Txt value={en.complemento} onChange={x => form.updEnd(en.id, 'complemento', x)} ro={ro} placeholder="Apto, sala, bloco..." /></Field>}
                {isVisible('end_bairro')      && <Field label="Bairro" required={idx === 0}><Txt value={en.bairro} onChange={x => form.updEnd(en.id, 'bairro', x)} ro={ro} placeholder="Bairro" /></Field>}
                {isVisible('end_cidade')      && <Field label="Cidade" required={idx === 0} span2><Txt value={en.cidade} onChange={x => form.updEnd(en.id, 'cidade', x)} ro={ro} placeholder="Cidade" /></Field>}
              </>
            ) : (
              <>
                {isVisible('end_address1') && <Field label="Endereço — Linha 1" required={idx === 0} span2><Txt value={en.address1} onChange={x => form.updEnd(en.id, 'address1', x)} ro={ro} placeholder="Street address, P.O. box" /></Field>}
                {isVisible('end_address2') && <Field label="Endereço — Linha 2" span2><Txt value={en.address2} onChange={x => form.updEnd(en.id, 'address2', x)} ro={ro} placeholder="Apt, suite, floor..." /></Field>}
                {isVisible('end_cidade')   && <Field label="Cidade" required={idx === 0}><Txt value={en.cidade} onChange={x => form.updEnd(en.id, 'cidade', x)} ro={ro} placeholder="City" /></Field>}
                {isVisible('end_estado')   && <Field label="Estado / Província"><Txt value={en.estado} onChange={x => form.updEnd(en.id, 'estado', x)} ro={ro} placeholder="State / Province" /></Field>}
                {isVisible('end_cep')      && <Field label="CEP / ZIP Code"><Txt value={en.cep} onChange={x => form.updEnd(en.id, 'cep', x)} ro={ro} placeholder="Postal code" /></Field>}
                {isVisible('end_pais')     && <Field label="País" required={idx === 0}><Sel value={en.pais_endereco} onChange={x => form.updEnd(en.id, 'pais_endereco', x)} ro={ro} options={paisesList.map(p => ({ value: p, label: p }))} placeholder="Selecione o país..." /></Field>}
              </>
            )}
          </ItemCard>
        ))}
      </div>
      <CustomFieldsGrid fields={customFields} />
      {!ro && <AddButton onClick={form.addEnd}>Adicionar endereço</AddButton>}
    </>
  )
}

/** Dados Bancários (múltiplos) — com autocomplete de bancos brasileiros. */
export function BancarioFields({ form, ro, isVisible = always, customFields = [] }: GroupProps) {
  const v = form.values
  return (
    <>
      <datalist id="brasil-banks">{BRAZIL_BANKS.map(b => <option key={b} value={b} />)}</datalist>
      <div className="space-y-3 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
        {v.bancos.map((b, idx) => (
          <ItemCard key={b.id} index={idx} total={v.bancos.length} label="Banco" onRemove={() => form.remBan(b.id)} ro={ro}>
            {isVisible('ban_banco') && (
              <Field label="Banco">
                {ro ? <span className={readCls}>{b.banco || '—'}</span>
                    : <input list="brasil-banks" value={b.banco} onChange={e => form.updBan(b.id, 'banco', e.target.value)} placeholder="Digite o nome ou número do banco..." className={inputCls} />}
              </Field>
            )}
            {isVisible('ban_tipo_conta') && <Field label="Tipo de Conta"><Sel value={b.tipo_conta} onChange={x => form.updBan(b.id, 'tipo_conta', x)} ro={ro} options={TIPOS_CONTA} placeholder="Selecione..." /></Field>}
            {isVisible('ban_agencia')    && <Field label="Agência"><Txt value={b.agencia} onChange={x => form.updBan(b.id, 'agencia', x)} ro={ro} placeholder="0000" /></Field>}
            {isVisible('ban_conta')      && <Field label="Conta"><Txt value={b.conta} onChange={x => form.updBan(b.id, 'conta', x)} ro={ro} placeholder="00000-0" /></Field>}
            {isVisible('ban_pix')        && <Field label="Chave PIX" span2><Txt value={b.pix} onChange={x => form.updBan(b.id, 'pix', x)} ro={ro} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" /></Field>}
          </ItemCard>
        ))}
      </div>
      <CustomFieldsGrid fields={customFields} />
      {!ro && <AddButton onClick={form.addBan}>Adicionar banco</AddButton>}
    </>
  )
}

/** Quadro de Sócios (somente PJ) — tabela compacta. */
export function SociosFields({ form, ro, isVisible = always }: GroupProps) {
  const v = form.values
  const isBR = isBRof(v.category)
  return (
    <>
      {v.socios.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum sócio cadastrado.</p>
      ) : (
        <div className="space-y-2 max-h-[calc(100vh-24rem)] overflow-y-auto pr-1">
          <div className="grid grid-cols-12 gap-2 px-1 sticky top-0 bg-card z-10 py-1">
            <div className="col-span-1" />
            {isVisible('soc_nome')         && <p className="col-span-3 text-[11px] font-medium text-muted-foreground">Nome</p>}
            {isVisible('soc_documento')    && <p className="col-span-3 text-[11px] font-medium text-muted-foreground">{isBR ? 'CPF' : 'Documento'}</p>}
            {isVisible('soc_participacao') && <p className="col-span-2 text-[11px] font-medium text-muted-foreground">Participação %</p>}
            {isVisible('soc_cargo')        && <p className="col-span-2 text-[11px] font-medium text-muted-foreground">Cargo / Função</p>}
            <div className="col-span-1" />
          </div>
          {v.socios.map((s, idx) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-md border bg-muted/20">
              <span className="col-span-1 text-[11px] text-muted-foreground text-center font-medium">{idx + 1}</span>
              {isVisible('soc_nome')         && <div className="col-span-3"><input value={s.nome} onChange={e => form.updSoc(s.id, 'nome', e.target.value)} disabled={ro} placeholder="Nome completo" className={inputCls} /></div>}
              {isVisible('soc_documento')    && <div className="col-span-3"><input value={s.documento} onChange={e => form.updSoc(s.id, 'documento', e.target.value)} disabled={ro} placeholder={isBR ? '000.000.000-00' : 'Documento'} className={inputCls} /></div>}
              {isVisible('soc_participacao') && <div className="col-span-2"><input value={s.participacao} onChange={e => form.updSoc(s.id, 'participacao', e.target.value)} disabled={ro} placeholder="0,00 %" className={inputCls} /></div>}
              {isVisible('soc_cargo')        && <div className="col-span-2"><input value={s.cargo} onChange={e => form.updSoc(s.id, 'cargo', e.target.value)} disabled={ro} placeholder="Ex: Sócio-Diretor" className={inputCls} /></div>}
              <div className="col-span-1 flex justify-center">
                {!ro && <button type="button" onClick={() => form.remSoc(s.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!ro && <AddButton onClick={form.addSoc}>Adicionar sócio</AddButton>}
    </>
  )
}
