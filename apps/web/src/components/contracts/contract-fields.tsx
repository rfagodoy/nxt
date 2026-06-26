'use client'

import { useState, useRef, useCallback } from 'react'
import { Plus, Trash2, Search, Upload, Download, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { INIT_PAPEIS, PAPEIS_KEY, ORIGEM, origemDoPapel } from '@/lib/contract-roles'
import {
  TIPOS_KEY, OBJETOS_KEY, MOEDAS_KEY, CONDICOES_KEY, INDICES_KEY,
  INIT_TIPOS, INIT_OBJETOS, INIT_MOEDAS, INIT_CONDICOES, INIT_INDICES,
  SITUACOES, PERIODICIDADES, TIPOS_DOCUMENTO, STATUS_ASSINATURA,
  newCParte, newCReajuste, newCDocumento,
  type ContractFormValues, type CParte, type CReajuste, type CDocumento,
} from '@/lib/contract-options'

/* ─── controlador de estado (usado pelas duas telas) ─────── */

export function useContractForm(initial: ContractFormValues) {
  const [values, setValues] = useState<ContractFormValues>(initial)

  const set = useCallback(<K extends keyof ContractFormValues>(k: K, v: ContractFormValues[K]) =>
    setValues(p => ({ ...p, [k]: v })), [])

  const addParte    = useCallback((papel = '') => setValues(p => ({ ...p, partes: [...p.partes, newCParte(papel)] })), [])
  const remParte    = useCallback((id: string) => setValues(p => ({ ...p, partes: p.partes.filter(x => x.id !== id) })), [])
  const updParte    = useCallback((id: string, k: keyof Omit<CParte, 'id'>, v: string) =>
    setValues(p => ({ ...p, partes: p.partes.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])
  const setParteEntity = useCallback((id: string, e: { ref_tipo: string; ref_id: string; nome: string; documento: string }) =>
    setValues(p => ({ ...p, partes: p.partes.map(x => x.id === id ? { ...x, ...e } : x) })), [])

  const addReaj = useCallback(() => setValues(p => ({ ...p, reajustes: [...p.reajustes, newCReajuste()] })), [])
  const remReaj = useCallback((id: string) => setValues(p => ({ ...p, reajustes: p.reajustes.filter(x => x.id !== id) })), [])
  const updReaj = useCallback((id: string, k: keyof Omit<CReajuste, 'id'>, v: string) =>
    setValues(p => ({ ...p, reajustes: p.reajustes.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])

  const addDoc = useCallback(() => setValues(p => ({ ...p, documentos: [...p.documentos, newCDocumento()] })), [])
  const remDoc = useCallback((id: string) => setValues(p => ({ ...p, documentos: p.documentos.filter(x => x.id !== id) })), [])
  const updDoc = useCallback((id: string, k: keyof Omit<CDocumento, 'id'>, v: string) =>
    setValues(p => ({ ...p, documentos: p.documentos.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])
  const patchDoc = useCallback((id: string, patch: Partial<Omit<CDocumento, 'id'>>) =>
    setValues(p => ({ ...p, documentos: p.documentos.map(x => x.id !== id ? x : { ...x, ...patch }) })), [])

  return { values, set, setValues, addParte, remParte, updParte, setParteEntity, addReaj, remReaj, updReaj, addDoc, remDoc, updDoc, patchDoc }
}
export type ContractForm = ReturnType<typeof useContractForm>

/* ─── estilos + primitivos controlados (com modo leitura) ── */

const inputCls  = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const areaCls   = 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none'
const readCls   = 'flex min-h-[1.25rem] w-full items-center bg-transparent px-0 text-[13px] font-medium text-foreground'
const readArea  = 'block w-full bg-transparent px-0 py-0 text-[13px] font-medium text-foreground whitespace-pre-wrap'

function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

function Txt({ value, onChange, ro, type = 'text', placeholder }: { value: string; onChange: (v: string) => void; ro?: boolean; type?: string; placeholder?: string }) {
  if (ro) return <span className={readCls}>{value || '—'}</span>
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
}

function Area({ value, onChange, ro, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; ro?: boolean; placeholder?: string; rows?: number }) {
  if (ro) return <p className={readArea}>{value || '—'}</p>
  return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={areaCls} />
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

const lookupOpts = (entries: { id: string; label: string }[]) => entries.map(e => ({ value: e.label, label: e.label }))

/** Campo monetário com máscara pt-BR e prefixo do código da moeda. `value` é o número como string. */
function MoneyField({ value, moedaCode, onChange, ro }: { value: string; moedaCode: string; onChange: (v: string) => void; ro?: boolean }) {
  const num     = value ? parseFloat(value) : 0
  const display = value ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  if (ro) return <span className={readCls}>{value ? `${moedaCode} ${display}` : '—'}</span>
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 13)
    onChange(digits ? String(parseInt(digits, 10) / 100) : '')
  }
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground pointer-events-none select-none">{moedaCode}</span>
      <input inputMode="numeric" value={display} onChange={handle} placeholder="0,00" className={cn(inputCls, 'pl-11 tabular-nums')} />
    </div>
  )
}

/* ─── grupos de campos ───────────────────────────────────── */

/** Dados Gerais: Número, Situação, Tipo, Título, Descrição, Objeto. Número e Situação seguem editáveis mesmo em modo leitura. */
export function IdentificacaoFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const tipos   = useLookupTable(TIPOS_KEY, INIT_TIPOS)
  const objetos = useLookupTable(OBJETOS_KEY, INIT_OBJETOS)
  const [objetoInput, setObjetoInput] = useState('')
  const v = form.values
  const addObjeto = () => { if (objetoInput && !v.objeto.includes(objetoInput)) { form.set('objeto', [...v.objeto, objetoInput]); setObjetoInput('') } }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Número" required><Txt value={v.numero} onChange={x => form.set('numero', x)} placeholder="CTR-2026-001" /></Field>
      <Field label="Situação" required><Sel value={v.situacao} onChange={x => form.set('situacao', x)} options={SITUACOES} /></Field>
      <Field label="Tipo de contrato" required><Sel value={v.tipo} onChange={x => form.set('tipo', x)} ro={ro} options={lookupOpts(tipos.active)} placeholder="Selecione..." /></Field>
      <Field label="Título" required span2><Txt value={v.titulo} onChange={x => form.set('titulo', x)} ro={ro} placeholder="Título resumido do contrato" /></Field>
      <Field label="Descrição" span2><Area value={v.descricao} onChange={x => form.set('descricao', x)} ro={ro} rows={4} placeholder="Descrição detalhada do objeto e escopo do contrato..." /></Field>
      <Field label="Objeto do contrato" span2>
        <div className="space-y-1.5">
          {v.objeto.length === 0 && ro && <p className={readCls}>—</p>}
          {v.objeto.map((label, i) => (
            <div key={label} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5">
              <div className="flex items-center gap-2"><span className="text-[10px] font-medium text-muted-foreground w-4 shrink-0 text-right">{i + 1}.</span><span className="text-xs">{label}</span></div>
              {!ro && <button type="button" onClick={() => form.set('objeto', v.objeto.filter(x => x !== label))} className="text-muted-foreground hover:text-destructive transition-colors ml-2"><Trash2 className="h-3 w-3" /></button>}
            </div>
          ))}
          {!ro && (
            <div className="flex gap-2">
              <select value={objetoInput} onChange={e => setObjetoInput(e.target.value)} className={cn(inputCls, 'flex-1')}>
                <option value="">Selecione um objeto para adicionar...</option>
                {objetos.active.filter(o => !v.objeto.includes(o.label)).map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
              </select>
              <button type="button" onClick={addObjeto} disabled={!objetoInput} className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><Plus className="h-3.5 w-3.5" />Adicionar</button>
            </div>
          )}
        </div>
      </Field>
    </div>
  )
}

/** Vigência: Início, Prazo indeterminado, Término, Data de assinatura. */
export function VigenciaFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const v = form.values
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Início da vigência" required><Txt type="date" value={v.inicioVigencia} onChange={x => form.set('inicioVigencia', x)} ro={ro} /></Field>
      <Field label="Prazo indeterminado">
        {ro ? <span className={readCls}>{v.prazoIndeterminado ? 'Sim' : 'Não'}</span> : (
          <label className="flex items-center gap-2 h-8 cursor-pointer">
            <input type="checkbox" checked={v.prazoIndeterminado} onChange={e => form.set('prazoIndeterminado', e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 accent-primary" />
            <span className="text-xs text-muted-foreground">Sem data de término</span>
          </label>
        )}
      </Field>
      {!v.prazoIndeterminado && <Field label="Término da vigência"><Txt type="date" value={v.terminoVigencia} onChange={x => form.set('terminoVigencia', x)} ro={ro} /></Field>}
      <Field label="Data de assinatura"><Txt type="date" value={v.dataAssinatura} onChange={x => form.set('dataAssinatura', x)} ro={ro} /></Field>
    </div>
  )
}

/** Valor e Pagamento: Moeda, Valor da parcela, Valor total, Condição de pagamento, Complemento. */
export function ValoresFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const moedas    = useLookupTable(MOEDAS_KEY, INIT_MOEDAS)
  const condicoes = useLookupTable(CONDICOES_KEY, INIT_CONDICOES)
  const v = form.values
  const moedaOpts = moedas.active.map(m => ({ value: m.code ?? m.label, label: m.code ? `${m.code} — ${m.label}` : m.label }))
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Moeda"><Sel value={v.moeda} onChange={x => form.set('moeda', x)} ro={ro} options={moedaOpts} /></Field>
      <Field label="Valor da parcela"><MoneyField value={v.valorParcela} moedaCode={v.moeda} onChange={x => form.set('valorParcela', x)} ro={ro} /></Field>
      <Field label="Valor total do contrato" required><MoneyField value={v.valorTotal} moedaCode={v.moeda} onChange={x => form.set('valorTotal', x)} ro={ro} /></Field>
      <Field label="Condição de pagamento"><Sel value={v.condicaoPagamento} onChange={x => form.set('condicaoPagamento', x)} ro={ro} options={lookupOpts(condicoes.active)} placeholder="Selecione..." /></Field>
      <Field label="Complemento do valor" span2><Area value={v.complementoValor} onChange={x => form.set('complementoValor', x)} ro={ro} placeholder="Ex: mais impostos, inclusive ISS, frete e demais encargos..." /></Field>
    </div>
  )
}

/** Reajustes (múltiplos): Índice, Data, Periodicidade. */
export function ReajustesFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const indices = useLookupTable(INDICES_KEY, INIT_INDICES)
  const v = form.values
  return (
    <div className="space-y-3">
      {v.reajustes.length === 0 && <p className="text-xs text-muted-foreground">{ro ? 'Sem reajustes.' : 'Nenhum reajuste. Adicione abaixo.'}</p>}
      {v.reajustes.map((r, idx) => (
        <div key={r.id} className="rounded-md border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
            <span className="text-[11px] font-semibold text-muted-foreground">Reajuste {idx + 1}</span>
            {!ro && <button type="button" onClick={() => form.remReaj(r.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="p-3 grid grid-cols-3 gap-3">
            <Field label="Índice de reajuste"><Sel value={r.indice} onChange={x => form.updReaj(r.id, 'indice', x)} ro={ro} options={lookupOpts(indices.active)} placeholder="Selecione..." /></Field>
            <Field label="Data de reajuste"><Txt type="date" value={r.data} onChange={x => form.updReaj(r.id, 'data', x)} ro={ro} /></Field>
            <Field label="Periodicidade"><Sel value={r.periodicidade} onChange={x => form.updReaj(r.id, 'periodicidade', x)} ro={ro} options={PERIODICIDADES.map(p => ({ value: p, label: p }))} placeholder="Selecione..." /></Field>
          </div>
        </div>
      ))}
      {!ro && <button type="button" onClick={form.addReaj} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar reajuste</button>}
    </div>
  )
}

/** Documentos (múltiplos): Nome, Tipo, Data, Status de assinatura, Arquivo, Observação. */
export function DocumentosFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const v = form.values
  return (
    <div className="space-y-3">
      {v.documentos.length === 0 && <p className="text-xs text-muted-foreground">{ro ? 'Nenhum documento.' : 'Nenhum documento. Adicione abaixo.'}</p>}
      {v.documentos.map((doc, idx) => <DocumentoCard key={doc.id} doc={doc} idx={idx} ro={ro} form={form} />)}
      {!ro && <button type="button" onClick={form.addDoc} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar documento</button>}
    </div>
  )
}

function DocumentoCard({ doc, idx, ro, form }: { doc: CDocumento; idx: number; ro?: boolean; form: ContractForm }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'up' | 'down' | null>(null)
  const [err, setErr]   = useState('')

  const handleUpload = async (f: File) => {
    setErr(''); setBusy('up')
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await apiFetch('/api/files', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(res.status === 413 ? 'Arquivo muito grande (máx. 25 MB)' : 'Falha no upload')
      const meta = await res.json() as { key: string; name: string }
      form.patchDoc(doc.id, { arquivo_key: meta.key, arquivo_nome: meta.name })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha no upload')
    } finally { setBusy(null) }
  }

  const handleDownload = async () => {
    if (!doc.arquivo_key) return
    setErr(''); setBusy('down')
    try {
      const res = await apiFetch(`/api/files/${encodeURIComponent(doc.arquivo_key)}`)
      if (!res.ok) throw new Error('Falha ao baixar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = doc.arquivo_nome || 'arquivo'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao baixar')
    } finally { setBusy(null) }
  }

  const handleRemoveFile = () => {
    const key = doc.arquivo_key
    form.patchDoc(doc.id, { arquivo_key: '', arquivo_nome: '' })
    if (key) void apiFetch(`/api/files/${encodeURIComponent(key)}`, { method: 'DELETE' }) // limpeza best-effort
  }

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <span className="text-[11px] font-semibold text-muted-foreground">Documento {idx + 1}</span>
        {!ro && <button type="button" onClick={() => form.remDoc(doc.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nome do documento" required span2><Txt value={doc.nome} onChange={x => form.updDoc(doc.id, 'nome', x)} ro={ro} placeholder="Ex: Contrato assinado, Proposta comercial..." /></Field>
          <Field label="Tipo"><Sel value={doc.tipo} onChange={x => form.updDoc(doc.id, 'tipo', x)} ro={ro} options={TIPOS_DOCUMENTO.map(t => ({ value: t, label: t }))} placeholder="Selecione..." /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Data do documento"><Txt type="date" value={doc.data} onChange={x => form.updDoc(doc.id, 'data', x)} ro={ro} /></Field>
          <Field label="Status de assinatura" span2><Sel value={doc.status_assinatura} onChange={x => form.updDoc(doc.id, 'status_assinatura', x)} ro={ro} options={STATUS_ASSINATURA} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Arquivo" span2>
            {ro ? (
              doc.arquivo_key ? (
                <button type="button" onClick={handleDownload} disabled={busy === 'down'}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50">
                  {busy === 'down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{doc.arquivo_nome || 'Baixar'}
                </button>
              ) : <span className={readCls}>{doc.arquivo_nome || '—'}</span>
            ) : (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input readOnly value={doc.arquivo_nome} placeholder="Nenhum arquivo selecionado"
                    className={cn(inputCls, 'flex-1 cursor-default text-muted-foreground')} />
                  {doc.arquivo_key ? (
                    <>
                      <button type="button" onClick={handleDownload} disabled={busy === 'down'} title="Baixar"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border hover:bg-muted transition-colors disabled:opacity-50">
                        {busy === 'down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={handleRemoveFile} title="Remover arquivo"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'up'}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50">
                      {busy === 'up' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{busy === 'up' ? 'Enviando...' : 'Anexar'}
                    </button>
                  )}
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = '' }} />
                </div>
                {err && <p className="text-[11px] text-red-500">{err}</p>}
              </div>
            )}
          </Field>
          <Field label="Observação" span2><Area value={doc.observacao} onChange={x => form.updDoc(doc.id, 'observacao', x)} ro={ro} placeholder="Observações sobre o documento..." /></Field>
        </div>
      </div>
    </div>
  )
}

/** Partes em tabela compacta: Papel · Nome/Razão Social · Documento (lupa via modal do shell). */
export function PartesFields({ form, ro, onOpenSearch, onNewPartner }: {
  form: ContractForm; ro?: boolean
  onOpenSearch: (parteId: string, origem: string) => void
  onNewPartner: () => void
}) {
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const v = form.values
  const COLS = 'grid grid-cols-[12rem_1fr_10rem_1.25rem] items-center gap-2'
  return (
    <div className="space-y-2">
      {v.partes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma parte.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className={cn(COLS, 'px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Papel</span><span>Nome / Razão Social</span><span>Documento</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {v.partes.map((p, idx) => {
              const origem = origemDoPapel(papeis.active, p.papel)
              const isUnidade = origem === ORIGEM.UNIDADE
              const onPapel = (val: string) => {
                form.updParte(p.id, 'papel', val)
                if (origemDoPapel(papeis.active, val) !== origem) form.setParteEntity(p.id, { ref_tipo: '', ref_id: '', nome: '', documento: '' })
              }
              const open = () => { if (p.papel && !ro) onOpenSearch(p.id, origem) }
              return (
                <div key={p.id} className={cn(COLS, 'group px-3 py-1.5 hover:bg-muted/30', idx === 0 && 'border-l-2 border-l-primary/50')} title={idx === 0 ? 'Parte principal' : undefined}>
                  {ro ? (
                    <span className="text-xs font-medium truncate">{p.papel || '—'}</span>
                  ) : (
                    <select value={p.papel} onChange={e => onPapel(e.target.value)} className={cn(inputCls, 'h-7')}>
                      <option value="">Selecione...</option>
                      {p.papel && !papeis.active.some(pp => pp.label === p.papel) && <option value={p.papel}>{p.papel}</option>}
                      {papeis.active.map(pp => <option key={pp.id} value={pp.label}>{pp.label}</option>)}
                    </select>
                  )}
                  {ro ? (
                    <span className="text-xs truncate">{p.nome || '—'}</span>
                  ) : (
                    <div className="flex gap-1 min-w-0">
                      <input readOnly value={p.nome} onClick={open}
                        placeholder={p.papel ? (isUnidade ? 'Selecionar unidade' : 'Selecionar empresa/parceiro') : 'Selecione o papel'}
                        className={cn(inputCls, 'h-7', p.papel ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed')} />
                      <button type="button" disabled={!p.papel} title="Pesquisar" onClick={open} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Search className="h-3 w-3 text-muted-foreground" /></button>
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground truncate">{p.documento || '—'}</span>
                  {!ro && v.partes.length > 1 ? (
                    <button type="button" onClick={() => form.remParte(p.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                  ) : <span />}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {!ro && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => form.addParte(papeis.active[0]?.label ?? '')} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar parte</button>
          <button type="button" onClick={onNewPartner} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"><Plus className="h-3 w-3" />Cadastrar novo parceiro</button>
        </div>
      )}
    </div>
  )
}
