'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, Search, Upload, Download, Loader2, X, Eye, ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { INIT_PAPEIS, PAPEIS_KEY, ORIGEM, origemDoPapel, ladoDoPapel } from '@/lib/contract-roles'
import {
  TIPOS_KEY, OBJETOS_KEY, MOEDAS_KEY, CONDICOES_KEY, INDICES_KEY, TIPOS_ADITIVO_KEY, FORMAS_PGTO_KEY,
  INIT_TIPOS, INIT_OBJETOS, INIT_MOEDAS, INIT_CONDICOES, INIT_INDICES, INIT_TIPOS_ADITIVO, INIT_FORMAS_PGTO,
  SITUACOES, PERIODICIDADES, TIPOS_DOCUMENTO, effectiveSituacao,
  NATUREZAS, ACOES_TERMINO, temPagamentos, temRecebimentos, somaLancamentos,
  valorVigente, parcelaVigente, terminoVigente, objetoVigente, partesVigentes, terminoVigenteAntes, proximoDiaISO,
  newCParte, newCReajuste, newCDocumento, newCLancamento, newCAditivo, newCCessao,
  type ContractFormValues, type CParte, type CReajuste, type CDocumento, type CLancamento, type CAditivo, type CCessao,
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

  /* lançamentos: 'pagamentos' (Despesa) e 'recebimentos' (Receita) — mesma forma */
  const addLanc = useCallback((field: 'pagamentos' | 'recebimentos') => setValues(p => ({ ...p, [field]: [...p[field], newCLancamento()] })), [])
  const remLanc = useCallback((field: 'pagamentos' | 'recebimentos', id: string) => setValues(p => ({ ...p, [field]: p[field].filter(x => x.id !== id) })), [])
  const updLanc = useCallback((field: 'pagamentos' | 'recebimentos', id: string, k: keyof Omit<CLancamento, 'id'>, v: string) =>
    setValues(p => ({ ...p, [field]: p[field].map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])

  /* aditivos (e suas cessões aninhadas) */
  const addAditivo   = useCallback((numero = '') => setValues(p => ({ ...p, aditivos: [...p.aditivos, newCAditivo(numero)] })), [])
  const remAditivo   = useCallback((id: string) => setValues(p => ({ ...p, aditivos: p.aditivos.filter(x => x.id !== id) })), [])
  const patchAditivo = useCallback((id: string, patch: Partial<Omit<CAditivo, 'id'>>) =>
    setValues(p => ({ ...p, aditivos: p.aditivos.map(x => x.id !== id ? x : { ...x, ...patch }) })), [])
  const addCessao    = useCallback((aditivoId: string, parteId = '') =>
    setValues(p => ({ ...p, aditivos: p.aditivos.map(a => a.id !== aditivoId ? a : { ...a, cessoes: [...a.cessoes, newCCessao(parteId)] }) })), [])
  const remCessao    = useCallback((aditivoId: string, cessaoId: string) =>
    setValues(p => ({ ...p, aditivos: p.aditivos.map(a => a.id !== aditivoId ? a : { ...a, cessoes: a.cessoes.filter(c => c.id !== cessaoId) }) })), [])
  const patchCessao  = useCallback((aditivoId: string, cessaoId: string, patch: Partial<Omit<CCessao, 'id'>>) =>
    setValues(p => ({ ...p, aditivos: p.aditivos.map(a => a.id !== aditivoId ? a : { ...a, cessoes: a.cessoes.map(c => c.id !== cessaoId ? c : { ...c, ...patch }) }) })), [])

  return { values, set, setValues, addParte, remParte, updParte, setParteEntity, addReaj, remReaj, updReaj, addDoc, remDoc, updDoc, patchDoc, addLanc, remLanc, updLanc, addAditivo, remAditivo, patchAditivo, addCessao, remCessao, patchCessao }
}
export type ContractForm = ReturnType<typeof useContractForm>

/* ─── estilos + primitivos controlados (com modo leitura) ── */

/* primitivos idênticos aos do cadastro de Parceiros (padrão único de campo do sistema) */
const inputCls  = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const areaCls   = 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none'
const readCls   = 'flex min-h-[1.5rem] w-full items-center bg-transparent px-0 text-[13px] font-medium text-foreground'
const readArea  = 'block w-full bg-transparent px-0 py-0 text-[13px] font-medium text-foreground whitespace-pre-wrap'

function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

function Txt({ value, onChange, ro, type = 'text', placeholder, min }: { value: string; onChange: (v: string) => void; ro?: boolean; type?: string; placeholder?: string; min?: string }) {
  if (ro) {
    /* datas (ISO yyyy-mm-dd) são exibidas como dd/mm/aaaa em leitura */
    const display = type === 'date' && value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : value
    return <span className={readCls}>{display || '—'}</span>
  }
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} min={min} className={inputCls} />
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

/** Seletor segmentado (poucas opções fixas, todas visíveis) — melhor que dropdown p/ "modo". */
function Segmented({ value, onChange, ro, options }: { value: string; onChange: (v: string) => void; ro?: boolean; options: { value: string; label: string }[] }) {
  if (ro) return <span className={readCls}>{options.find(o => o.value === value)?.label || '—'}</span>
  return (
    <div className="inline-flex rounded-md border overflow-hidden">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('px-4 h-7 text-xs font-medium transition-colors border-r last:border-r-0',
            value === o.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* PADRÃO: referência a tabela auxiliar guarda o id estável; o rótulo é resolvido ao vivo.
   lookupOpts → value = id; labelOf resolve id → rótulo atual (fallback no próprio valor p/ dados legados gravados como rótulo). */
const lookupOpts = (entries: { id: string; label: string }[]) => entries.map(e => ({ value: e.id, label: e.label }))
const labelOf    = (entries: { id: string; label: string }[], value: string) => entries.find(e => e.id === value)?.label ?? value

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

/** Dados Gerais: Número, Situação, Título, Descrição, Objeto, Tipo. Número segue editável mesmo em leitura;
 *  Situação é sempre só-leitura e preenchida automaticamente pelo ciclo de vida (ver effectiveSituacao). */
export function IdentificacaoFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const tipos   = useLookupTable(TIPOS_KEY, INIT_TIPOS)
  const objetos = useLookupTable(OBJETOS_KEY, INIT_OBJETOS)
  const v = form.values
  /* objeto guarda o id da entrada (resolução ao vivo); adiciona ao escolher no dropdown */
  const addObjeto = (id: string) => { if (id && !v.objeto.includes(id)) form.set('objeto', [...v.objeto, id]) }
  /* em leitura, exibe o objeto VIGENTE (original + aditivos de escopo) */
  const objetoList = ro ? objetoVigente(v) : v.objeto

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Natureza vem primeiro: é o "modo" que define o que o resto do formulário exibe */}
      <Field label="Natureza do contrato" span2><Segmented value={v.natureza} onChange={x => form.set('natureza', x)} ro={ro} options={NATUREZAS} /></Field>
      <Field label="Número" required><Txt value={v.numero} onChange={x => form.set('numero', x)} ro={ro} placeholder="CTR-2026-001" /></Field>
      <Field label="Situação"><span className={readCls}>{SITUACOES.find(s => s.value === effectiveSituacao(v.situacao, v.prazoIndeterminado ? '' : v.terminoVigencia))?.label ?? '—'}</span></Field>
      <Field label="Título" required span2><Txt value={v.titulo} onChange={x => form.set('titulo', x)} ro={ro} placeholder="Título resumido do contrato" /></Field>
      <Field label="Descrição" span2><Area value={v.descricao} onChange={x => form.set('descricao', x)} ro={ro} rows={4} placeholder="Descrição detalhada do objeto e escopo do contrato..." /></Field>
      <Field label="Objeto do contrato" span2>
        <div className="space-y-1.5">
          {objetoList.length === 0 && ro && <p className={readCls}>—</p>}
          {objetoList.map((id, i) => (
            <div key={id} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5">
              <div className="flex items-center gap-2"><span className="text-[10px] font-medium text-muted-foreground w-4 shrink-0 text-right">{i + 1}.</span><span className="text-xs">{labelOf(objetos.entries, id)}</span></div>
              {!ro && <button type="button" onClick={() => form.set('objeto', v.objeto.filter(x => x !== id))} className="text-muted-foreground hover:text-destructive transition-colors ml-2"><Trash2 className="h-3 w-3" /></button>}
            </div>
          ))}
          {!ro && (
            <select value="" onChange={e => addObjeto(e.target.value)} className={cn(inputCls)}>
              <option value="">Adicionar objeto...</option>
              {objetos.active.filter(o => !v.objeto.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
        </div>
      </Field>
      <Field label="Tipo de contrato" required span2><Sel value={v.tipo} onChange={x => form.set('tipo', x)} ro={ro} options={lookupOpts(tipos.active)} placeholder="Selecione..." /></Field>
    </div>
  )
}

/** Resumo legível do prazo de renovação ("1 ano · 6 meses · 10 dias"), ignorando zeros. */
function renovacaoResumo(v: ContractFormValues): string {
  const parts: string[] = []
  const a = parseInt(v.renovacaoAnos, 10), m = parseInt(v.renovacaoMeses, 10), d = parseInt(v.renovacaoDias, 10)
  if (a) parts.push(`${a} ${a === 1 ? 'ano' : 'anos'}`)
  if (m) parts.push(`${m} ${m === 1 ? 'mês' : 'meses'}`)
  if (d) parts.push(`${d} ${d === 1 ? 'dia' : 'dias'}`)
  return parts.join(' · ')
}

/** Campo numérico curto com legenda (anos/meses/dias). */
function NumBox({ caption, value, onChange }: { caption: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-0.5">
      <input type="number" min={0} value={value} onChange={e => onChange(e.target.value)} placeholder="0" className={cn(inputCls, 'tabular-nums')} />
      <span className="block text-[10px] text-muted-foreground text-center">{caption}</span>
    </div>
  )
}

/** Vigência: Prazo indeterminado, Início, Término, Data de assinatura + ação no término (grade 2×2). */
export function VigenciaFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const v = form.values
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Prazo indeterminado">
        {ro ? <span className={readCls}>{v.prazoIndeterminado ? 'Sim' : 'Não'}</span> : (
          <label className="flex items-center gap-2 h-7 cursor-pointer">
            <input type="checkbox" checked={v.prazoIndeterminado} onChange={e => form.set('prazoIndeterminado', e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 accent-primary" />
            <span className="text-xs text-muted-foreground">Sem data de término</span>
          </label>
        )}
      </Field>
      <Field label="Início da vigência" required><Txt type="date" value={v.inicioVigencia} onChange={x => form.set('inicioVigencia', x)} ro={ro} /></Field>
      {!v.prazoIndeterminado && <Field label="Término da vigência"><Txt type="date" value={ro ? terminoVigente(v) : v.terminoVigencia} onChange={x => form.set('terminoVigencia', x)} ro={ro} min={v.inicioVigencia || undefined} /></Field>}
      <Field label="Data de assinatura"><Txt type="date" value={v.dataAssinatura} onChange={x => form.set('dataAssinatura', x)} ro={ro} /></Field>

      {!v.prazoIndeterminado && (
        <Field label="Ao término da vigência" span2={v.acaoTermino !== 'RENOVAR'}>
          <Sel value={v.acaoTermino || 'MANUAL'} onChange={x => form.set('acaoTermino', x)} ro={ro} options={ACOES_TERMINO} />
        </Field>
      )}
      {!v.prazoIndeterminado && v.acaoTermino === 'RENOVAR' && (
        <Field label="Renovar por">
          {ro ? (
            <span className={readCls}>{renovacaoResumo(v) || '—'}</span>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <NumBox caption="Anos"  value={v.renovacaoAnos}  onChange={x => form.set('renovacaoAnos', x)} />
              <NumBox caption="Meses" value={v.renovacaoMeses} onChange={x => form.set('renovacaoMeses', x)} />
              <NumBox caption="Dias"  value={v.renovacaoDias}  onChange={x => form.set('renovacaoDias', x)} />
            </div>
          )}
        </Field>
      )}
    </div>
  )
}

/** Valor monetário só-leitura (derivado) — soma de lançamentos, saldo. */
function MoneyRead({ label, value, moedaCode, strong }: { label: string; value: number; moedaCode: string; strong?: boolean }) {
  const display = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <Field label={label}>
      <span className={cn('flex min-h-[1.25rem] items-center px-0 text-sm tabular-nums', strong ? 'font-semibold text-foreground' : 'font-medium text-foreground', value < 0 && 'text-red-600 dark:text-red-400')}>
        {moedaCode ? `${moedaCode} ` : ''}{display}
      </span>
    </Field>
  )
}

/** Valor e Pagamento: Moeda, Valor da parcela, Valor total, totais realizados + saldo (por natureza), Condição, Complemento. */
export function ValoresFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const moedas    = useLookupTable(MOEDAS_KEY, INIT_MOEDAS)
  const condicoes = useLookupTable(CONDICOES_KEY, INIT_CONDICOES)
  const v = form.values
  const moedaOpts = moedas.active.map(m => ({ value: m.code ?? m.label, label: m.code ? `${m.code} — ${m.label}` : m.label }))
  const totalPago     = somaLancamentos(v.pagamentos)
  const totalRecebido = somaLancamentos(v.recebimentos)
  const valorOriginal   = parseFloat(v.valorTotal) || 0
  const valorTotalNum   = valorVigente(v)          // saldo usa o valor VIGENTE (original + aditivos)
  const temAditivoValor = valorTotalNum !== valorOriginal
  const parcelaOriginal   = parseFloat(v.valorParcela) || 0
  const parcelaVig        = parseFloat(parcelaVigente(v)) || 0
  const temAditivoParcela = parcelaVig !== parcelaOriginal
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Moeda"><Sel value={v.moeda} onChange={x => form.set('moeda', x)} ro={ro} options={moedaOpts} placeholder="Selecione..." /></Field>
      <Field label="Condição de pagamento"><Sel value={v.condicaoPagamento} onChange={x => form.set('condicaoPagamento', x)} ro={ro} options={lookupOpts(condicoes.active)} placeholder="Selecione..." /></Field>

      {/* Valor total e parcela ao lado do respectivo ORIGINAL (só quando alterado por aditivo); em edição, pareados entre si */}
      {ro ? (
        <>
          <Field label="Valor total do contrato" required><MoneyField value={String(valorTotalNum)} moedaCode={v.moeda} onChange={x => form.set('valorTotal', x)} ro /></Field>
          {temAditivoValor ? <MoneyRead label="Valor total original" value={valorOriginal} moedaCode={v.moeda} /> : <div />}
          <Field label="Valor da parcela"><MoneyField value={parcelaVigente(v)} moedaCode={v.moeda} onChange={x => form.set('valorParcela', x)} ro /></Field>
          {temAditivoParcela ? <MoneyRead label="Valor da parcela original" value={parcelaOriginal} moedaCode={v.moeda} /> : <div />}
        </>
      ) : (
        <>
          <Field label="Valor total do contrato" required><MoneyField value={v.valorTotal} moedaCode={v.moeda} onChange={x => form.set('valorTotal', x)} /></Field>
          <Field label="Valor da parcela"><MoneyField value={v.valorParcela} moedaCode={v.moeda} onChange={x => form.set('valorParcela', x)} /></Field>
        </>
      )}

      {/* Totais realizados (soma automática das seções) + saldo — variam conforme a natureza */}
      {temPagamentos(v.natureza)   && <MoneyRead label="Pagamentos realizados"   value={totalPago}     moedaCode={v.moeda} />}
      {temRecebimentos(v.natureza) && <MoneyRead label="Recebimentos realizados" value={totalRecebido} moedaCode={v.moeda} />}
      {v.natureza === 'DESPESA' && <MoneyRead label="Saldo do contrato" value={valorTotalNum - totalPago}     moedaCode={v.moeda} strong />}
      {v.natureza === 'RECEITA' && <MoneyRead label="Saldo do contrato" value={valorTotalNum - totalRecebido} moedaCode={v.moeda} strong />}
      {v.natureza === 'AMBOS' && <>
        <MoneyRead label="Saldo a pagar"   value={valorTotalNum - totalPago}     moedaCode={v.moeda} strong />
        <MoneyRead label="Saldo a receber" value={valorTotalNum - totalRecebido} moedaCode={v.moeda} strong />
      </>}

      <Field label="Complemento do valor" span2><Area value={v.complementoValor} onChange={x => form.set('complementoValor', x)} ro={ro} placeholder="Ex: mais impostos, inclusive ISS, frete e demais encargos..." /></Field>
    </div>
  )
}

/** Lançamentos (pagamentos OU recebimentos): tabela densa editável na própria linha.
 *  Editável mesmo com o contrato travado — registra-se pagamentos ao longo da vigência. */
export function LancamentosFields({ form, field, moedaCode }: { form: ContractForm; field: 'pagamentos' | 'recebimentos'; moedaCode: string }) {
  const v = form.values
  const lista = v[field]
  const singular = field === 'pagamentos' ? 'pagamento' : 'recebimento'
  const total = somaLancamentos(lista)
  const formas = useLookupTable(FORMAS_PGTO_KEY, INIT_FORMAS_PGTO)
  const COLS = 'grid grid-cols-[7.5rem_9.5rem_8rem_8rem_1fr_1.5rem] items-center gap-2'
  const cell = cn(inputCls, 'h-7')
  return (
    <div className="space-y-2">
      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum {singular} lançado. Adicione abaixo.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className={cn(COLS, 'px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Data</span><span>Valor</span><span>Forma</span><span>Nº doc.</span><span>Observação</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {lista.map(l => (
              <div key={l.id} className={cn(COLS, 'group px-3 py-1 hover:bg-muted/30')}>
                <input type="date" value={l.data} onChange={e => form.updLanc(field, l.id, 'data', e.target.value)} className={cell} />
                <MoneyField value={l.valor} moedaCode={moedaCode} onChange={x => form.updLanc(field, l.id, 'valor', x)} />
                <select value={l.forma} onChange={e => form.updLanc(field, l.id, 'forma', e.target.value)} className={cell}>
                  <option value="">Forma...</option>
                  {l.forma && !formas.active.some(f => f.id === l.forma) && <option value={l.forma}>{labelOf(formas.entries, l.forma)}</option>}
                  {formas.active.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <input value={l.documento} onChange={e => form.updLanc(field, l.id, 'documento', e.target.value)} placeholder="NF 1234" className={cell} />
                <input value={l.observacao} onChange={e => form.updLanc(field, l.id, 'observacao', e.target.value)} placeholder="—" className={cell} />
                <button type="button" onClick={() => form.remLanc(field, l.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => form.addLanc(field)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar {singular}</button>
        {lista.length > 0 && (
          <span className="text-[11px] text-muted-foreground">Total: <span className="font-semibold tabular-nums text-foreground">{moedaCode ? `${moedaCode} ` : ''}{total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
        )}
      </div>
    </div>
  )
}

/** Reajustes (múltiplos) em tabela compacta: Índice · Data · Periodicidade.
 *  Um índice só pode ser usado uma vez — o dropdown oferece apenas os ainda não utilizados. */
export function ReajustesFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const indices = useLookupTable(INDICES_KEY, INIT_INDICES)
  const v = form.values
  const COLS = 'grid grid-cols-[1fr_10rem_10rem_1.25rem] items-center gap-2'
  const cell = cn(inputCls, 'h-7')
  return (
    <div className="space-y-2">
      {v.reajustes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{ro ? 'Sem reajustes.' : 'Nenhum reajuste. Adicione abaixo.'}</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className={cn(COLS, 'px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Índice de reajuste</span><span>Data de reajuste</span><span>Periodicidade</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {v.reajustes.map(r => {
              /* índices já usados por OUTROS reajustes não são oferecidos (sem duplicidade) */
              const usados = new Set(v.reajustes.filter(o => o.id !== r.id && o.indice).map(o => o.indice))
              const opts   = indices.active.filter(i => !usados.has(i.id))
              return (
                <div key={r.id} className={cn(COLS, 'group px-3 py-1.5 hover:bg-muted/30')}>
                  {ro ? (
                    <span className="text-xs font-medium truncate">{labelOf(indices.entries, r.indice) || '—'}</span>
                  ) : (
                    <select value={r.indice} onChange={e => form.updReaj(r.id, 'indice', e.target.value)} className={cell}>
                      <option value="">Selecione...</option>
                      {r.indice && !indices.active.some(i => i.id === r.indice) && <option value={r.indice}>{labelOf(indices.entries, r.indice)}</option>}
                      {opts.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                    </select>
                  )}
                  {ro ? (
                    <span className="text-xs truncate">{r.data ? new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                  ) : (
                    <input type="date" value={r.data} onChange={e => form.updReaj(r.id, 'data', e.target.value)} className={cell} />
                  )}
                  {ro ? (
                    <span className="text-xs truncate">{r.periodicidade || '—'}</span>
                  ) : (
                    <select value={r.periodicidade} onChange={e => form.updReaj(r.id, 'periodicidade', e.target.value)} className={cell}>
                      <option value="">Selecione...</option>
                      {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                  {!ro ? (
                    <button type="button" onClick={() => form.remReaj(r.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                  ) : <span />}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {!ro && <button type="button" onClick={form.addReaj} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar reajuste</button>}
    </div>
  )
}

/** Documentos (múltiplos): Nome, Tipo, Data, Status de assinatura, Arquivo, Observação. */
export function DocumentosFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const v = form.values
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle   = (id: string) => setOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const collapse = (id: string) => setOpen(p => { const n = new Set(p); n.delete(id); return n })
  /* novo documento já abre expandido; os existentes (carregados) começam recolhidos */
  const handleAdd = () => {
    const novo = newCDocumento()
    form.setValues(p => ({ ...p, documentos: [...p.documentos, novo] }))
    setOpen(p => new Set(p).add(novo.id))
  }
  return (
    <div className="space-y-3">
      {v.documentos.length === 0 && <p className="text-xs text-muted-foreground">{ro ? 'Nenhum documento.' : 'Nenhum documento. Adicione abaixo.'}</p>}
      {v.documentos.map((doc, idx) => <DocumentoCard key={doc.id} doc={doc} idx={idx} ro={ro} form={form} open={open.has(doc.id)} onToggle={() => toggle(doc.id)} onCollapse={() => collapse(doc.id)} />)}
      {!ro && <button type="button" onClick={handleAdd} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar documento</button>}
    </div>
  )
}

/** Tipos que o navegador renderiza nativamente (preview embutido); o resto cai no download. */
function isPreviewable(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md)$/i.test(name)
}

/** Abre um anexo (por key) numa janela POP-UP separada — assim o usuário continua navegando
 *  pelo sistema e alterna livremente entre o anexo e os dados do contrato.
 *  Retorna mensagem de erro, ou null em caso de sucesso. */
async function openAnexoPopup(key: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/files/${encodeURIComponent(key)}`)
    if (!res.ok) return 'Falha ao abrir'
    const url = URL.createObjectURL(await res.blob())
    const w = window.open(url, 'nxt_anexo', 'popup,width=1024,height=800,resizable=yes,scrollbars=yes')
    if (!w) { URL.revokeObjectURL(url); return 'Permita pop-ups para visualizar o documento.' }
    w.focus()
    /* libera o blob quando o pop-up é fechado */
    const timer = setInterval(() => { if (w.closed) { clearInterval(timer); URL.revokeObjectURL(url) } }, 1000)
    return null
  } catch {
    return 'Falha ao abrir'
  }
}

function DocumentoCard({ doc, idx, ro, form, open, onToggle, onCollapse }: { doc: CDocumento; idx: number; ro?: boolean; form: ContractForm; open: boolean; onToggle: () => void; onCollapse: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'up' | 'down' | 'view' | null>(null)
  const [err, setErr]   = useState('')
  const canPreview = isPreviewable(doc.arquivo_nome)

  /* item 3: abre o anexo num pop-up separado (não bloqueia a navegação no sistema) */
  const handlePreview = async () => {
    if (!doc.arquivo_key) return
    setErr(''); setBusy('view')
    const e = await openAnexoPopup(doc.arquivo_key)
    if (e) setErr(e)
    setBusy(null)
  }

  const handleUpload = async (f: File) => {
    setErr(''); setBusy('up')
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await apiFetch('/api/files', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(res.status === 413 ? 'Arquivo muito grande (máx. 25 MB)' : 'Falha no upload')
      const meta = await res.json() as { key: string; name: string }
      form.patchDoc(doc.id, { arquivo_key: meta.key, arquivo_nome: meta.name })
      onCollapse()  // item 2: após anexar, recolhe o detalhamento (mostra só o resumo)
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
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      {/* linha-resumo (sempre visível): clique para expandir/recolher o detalhamento */}
      <div className={cn('flex items-center gap-2 px-3 py-2 bg-muted/30', open && 'border-b')}>
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 min-w-0 text-left">
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[11px] font-semibold truncate">{doc.nome.trim() || `Documento ${idx + 1}`}</span>
          {doc.tipo && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{doc.tipo}</span>}
        </button>
        {/* recolhido + com arquivo: link para visualizar/baixar */}
        {!open && doc.arquivo_key && (
          <div className="flex items-center gap-3 shrink-0">
            {canPreview && (
              <button type="button" onClick={handlePreview} disabled={busy === 'view'} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
                {busy === 'view' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}Visualizar
              </button>
            )}
            <button type="button" onClick={handleDownload} disabled={busy === 'down'} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
              {busy === 'down' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Baixar
            </button>
          </div>
        )}
        {/* excluir sempre disponível — erros de cadastro acontecem, mesmo com o contrato já travado */}
        <button type="button" onClick={() => form.remDoc(doc.id)} title="Excluir documento" className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      {err && !open && <p className="px-3 pb-2 text-[11px] text-red-500">{err}</p>}

      {open && (
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nome do documento" required span2><Txt value={doc.nome} onChange={x => form.updDoc(doc.id, 'nome', x)} ro={ro} placeholder="Ex: Contrato assinado, Proposta comercial..." /></Field>
          <Field label="Tipo"><Sel value={doc.tipo} onChange={x => form.updDoc(doc.id, 'tipo', x)} ro={ro} options={TIPOS_DOCUMENTO.map(t => ({ value: t, label: t }))} placeholder="Selecione..." /></Field>
        </div>

        {/* Arquivo: chip elegante quando anexado; dropzone tracejada quando vazio */}
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Arquivo</label>
          {doc.arquivo_key ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{doc.arquivo_nome || 'Arquivo'}</p>
                <p className="text-[10px] text-muted-foreground">{canPreview ? 'Pré-visualizável' : 'Anexado'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canPreview && (
                  <button type="button" onClick={handlePreview} disabled={busy === 'view'} title="Visualizar"
                    className="inline-flex items-center gap-1.5 h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50">
                    {busy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}<span className="hidden md:inline">Ver</span>
                  </button>
                )}
                <button type="button" onClick={handleDownload} disabled={busy === 'down'} title="Baixar"
                  className="inline-flex items-center gap-1.5 h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50">
                  {busy === 'down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}<span className="hidden md:inline">Baixar</span>
                </button>
                {!ro && (
                  <button type="button" onClick={handleRemoveFile} title="Remover arquivo"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : ro ? (
            <span className={readCls}>Nenhum arquivo anexado</span>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'up'}
              className="group flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-5 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60">
              {busy === 'up' ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />}
              <span className="text-xs font-medium">{busy === 'up' ? 'Enviando...' : 'Anexar arquivo'}</span>
              <span className="text-[10px] text-muted-foreground">PDF, imagem ou documento · máx. 25 MB</span>
            </button>
          )}
          <input ref={fileRef} type="file" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = '' }} />
          {err && <p className="text-[11px] text-red-500">{err}</p>}
        </div>

        <Field label="Observação"><Area value={doc.observacao} onChange={x => form.updDoc(doc.id, 'observacao', x)} ro={ro} placeholder="Observações sobre o documento..." /></Field>
      </div>
      )}
    </div>
  )
}

/** Partes em tabela compacta: Papel · Nome/Razão Social · Documento (lupa via modal do shell). */
export function PartesFields({ form, ro, onOpenSearch, onNewPartner }: {
  form: ContractForm; ro?: boolean
  onOpenSearch: (parteId: string, origem: string, excludeIds: string[]) => void
  onNewPartner: () => void
}) {
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const v = form.values
  /* em leitura, exibe as partes VIGENTES (com cessões dos aditivos aplicadas) */
  const partesList = ro ? partesVigentes(v) : v.partes
  const COLS = 'grid grid-cols-[12rem_1fr_10rem_1.25rem] items-center gap-2'
  return (
    <div className="space-y-2">
      {partesList.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma parte.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className={cn(COLS, 'px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Papel</span><span>Nome / Razão Social</span><span>Documento</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {partesList.map((p, idx) => {
              const origem = origemDoPapel(papeis.active, p.papel)
              const isUnidade = origem === ORIGEM.UNIDADE
              const onPapel = (val: string) => {
                form.updParte(p.id, 'papel', val)
                if (origemDoPapel(papeis.active, val) !== origem) form.setParteEntity(p.id, { ref_tipo: '', ref_id: '', nome: '', documento: '' })
              }
              const open = () => {
                if (!p.papel || ro) return
                /* Exclui entidades já usadas: (1) no MESMO papel; (2) no lado OPOSTO
                   (contratante ↔ contratada) — a mesma entidade não pode estar nos dois lados. */
                const meuLado = ladoDoPapel(papeis.active, p.papel)
                const oposto  = meuLado === 'CONTRATANTE' ? 'CONTRATADA' : meuLado === 'CONTRATADA' ? 'CONTRATANTE' : null
                const excludeIds = v.partes.filter(o => {
                  if (o.id === p.id || !o.ref_id) return false
                  if (o.papel === p.papel) return true
                  return oposto !== null && ladoDoPapel(papeis.active, o.papel) === oposto
                }).map(o => o.ref_id)
                onOpenSearch(p.id, origem, excludeIds)
              }
              return (
                <div key={p.id} className={cn(COLS, 'group px-3 py-1.5 hover:bg-muted/30', idx === 0 && 'border-l-2 border-l-primary/50')} title={idx === 0 ? 'Parte principal' : undefined}>
                  {ro ? (
                    <span className="text-xs font-medium truncate">{labelOf(papeis.entries, p.papel) || '—'}</span>
                  ) : (
                    <select value={p.papel} onChange={e => onPapel(e.target.value)} className={cn(inputCls, 'h-7')}>
                      <option value="">Selecione...</option>
                      {p.papel && !papeis.active.some(pp => pp.id === p.papel) && <option value={p.papel}>{labelOf(papeis.entries, p.papel)}</option>}
                      {papeis.active.map(pp => <option key={pp.id} value={pp.id}>{pp.label}</option>)}
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
          <button type="button" onClick={() => form.addParte(papeis.active[0]?.id ?? '')} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar parte</button>
          <button type="button" onClick={onNewPartner} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"><Plus className="h-3 w-3" />Cadastrar novo parceiro</button>
        </div>
      )}
    </div>
  )
}

/* ─── Aditivos (termos aditivos) ──────────────────────────────
   Cada aditivo altera, EM VIGOR, término/valor/objeto/partes; o original é preservado
   (ver terminoVigente/valorVigente/objetoVigente/partesVigentes). Sempre editável —
   adita-se um contrato já vigente. */
export function AditivosFields({ form, onOpenCessaoSearch, onActivate, onRevise }: {
  form: ContractForm
  onOpenCessaoSearch: (aditivoId: string, cessaoId: string, origem: string) => void
  onActivate: (id: string) => void
  onRevise: (id: string) => void
}) {
  const v = form.values
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  /* novo aditivo já abre expandido; os demais começam recolhidos */
  const handleAdd = () => {
    const novo = newCAditivo(String(v.aditivos.length + 1))
    form.setValues(p => ({ ...p, aditivos: [...p.aditivos, novo] }))
    setOpen(prev => new Set(prev).add(novo.id))
  }
  return (
    <div className="space-y-2">
      {v.aditivos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum aditivo. Adicione para prorrogar, reajustar, alterar escopo ou ceder o contrato — o valor/término vigente e o saldo se ajustam automaticamente.</p>}
      {v.aditivos.map((a, idx) => <AditivoCard key={a.id} a={a} idx={idx} form={form} open={open.has(a.id)} onToggle={() => toggle(a.id)} onOpenCessaoSearch={onOpenCessaoSearch} onActivate={onActivate} onRevise={onRevise} />)}
      <button type="button" onClick={handleAdd} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar aditivo</button>
    </div>
  )
}

function AditivoCard({ a, idx, form, open, onToggle, onOpenCessaoSearch, onActivate, onRevise }: {
  a: CAditivo; idx: number; form: ContractForm; open: boolean; onToggle: () => void
  onOpenCessaoSearch: (aditivoId: string, cessaoId: string, origem: string) => void
  onActivate: (id: string) => void
  onRevise: (id: string) => void
}) {
  const v = form.values
  const lock = a.situacao === 'ATIVO'   // ativo = travado (somente leitura)
  const tiposAditivo = useLookupTable(TIPOS_ADITIVO_KEY, INIT_TIPOS_ADITIVO)
  const objetos = useLookupTable(OBJETOS_KEY, INIT_OBJETOS)
  const papeis  = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'up' | 'down' | 'view' | null>(null)
  const [err, setErr]   = useState('')
  const canPreview = isPreviewable(a.arquivo_nome)

  const upload = async (f: File) => {
    setErr(''); setBusy('up')
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await apiFetch('/api/files', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(res.status === 413 ? 'Arquivo muito grande (máx. 25 MB)' : 'Falha no upload')
      const meta = await res.json() as { key: string; name: string }
      form.patchAditivo(a.id, { arquivo_key: meta.key, arquivo_nome: meta.name })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Falha no upload') } finally { setBusy(null) }
  }
  const download = async () => {
    if (!a.arquivo_key) return
    setBusy('down')
    try {
      const res = await apiFetch(`/api/files/${encodeURIComponent(a.arquivo_key)}`)
      if (!res.ok) throw new Error('falha')
      const url = URL.createObjectURL(await res.blob())
      const el = document.createElement('a'); el.href = url; el.download = a.arquivo_nome || 'aditivo'; document.body.appendChild(el); el.click(); el.remove(); URL.revokeObjectURL(url)
    } catch { /* ignore */ } finally { setBusy(null) }
  }
  /* item 3: abre o anexo do aditivo num pop-up separado (não bloqueia a navegação) */
  const handlePreview = async () => {
    if (!a.arquivo_key) return
    setErr(''); setBusy('view')
    const e = await openAnexoPopup(a.arquivo_key)
    if (e) setErr(e)
    setBusy(null)
  }

  const [actErr, setActErr] = useState('')
  const addObj  = (id: string) => { if (id && !a.novoObjeto.includes(id)) form.patchAditivo(a.id, { novoObjeto: [...a.novoObjeto, id] }) }
  const toggleTipo = (id: string) => form.patchAditivo(a.id, { tipos: a.tipos.includes(id) ? a.tipos.filter(x => x !== id) : [...a.tipos, id] })

  /* O TIPO comanda o que o aditivo altera: cada tipo tem um `efeito` (tabela de Tipos de
     aditivo). Sincroniza os flags alteraTermino/Valor/Objeto/Partes e pré-carrega o editor
     com o valor vigente — assim não há duplicidade entre "tipo" e "o que altera". */
  const efeitos   = new Set(a.tipos.map(id => tiposAditivo.entries.find(t => t.id === id)?.efeito ?? 'nenhum'))
  const efeitoKey = a.tipos.map(id => `${id}:${tiposAditivo.entries.find(t => t.id === id)?.efeito ?? 'nenhum'}`).join('|')
  useEffect(() => {
    if (lock) return  // aditivo ativo não tem seus flags re-sincronizados
    const wantT = efeitos.has('termino'), wantV = efeitos.has('valor'), wantO = efeitos.has('objeto'), wantP = efeitos.has('partes')
    const patch: Partial<Omit<CAditivo, 'id'>> = {}
    if (a.alteraTermino !== wantT) patch.alteraTermino = wantT
    if (a.alteraValor   !== wantV) patch.alteraValor   = wantV
    if (a.alteraObjeto  !== wantO) patch.alteraObjeto  = wantO
    if (a.alteraPartes  !== wantP) patch.alteraPartes  = wantP
    /* "Novo término" começa VAZIO — o usuário informa a nova data (não pré-preenche com o vigente) */
    if (wantO && a.novoObjeto.length === 0) patch.novoObjeto  = objetoVigente(v)
    if (Object.keys(patch).length) form.patchAditivo(a.id, patch)
  }, [efeitoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const inicioProrrog = proximoDiaISO(terminoVigenteAntes(v, idx))
  const fmtBR = (iso: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  /* Validação para ATIVAR: regras por efeito do(s) tipo(s) selecionado(s). */
  const validarAtivacao = (): string | null => {
    if (!a.data) return 'Informe a data de assinatura.'
    if (!a.descricao.trim()) return 'Informe a descrição do aditivo.'
    if (a.tipos.length === 0) return 'Selecione ao menos um tipo de aditamento.'
    if (efeitos.has('termino') && !a.novoTermino) return 'Informe o novo término (prorrogação).'
    if (efeitos.has('valor') && !(parseFloat(a.novoValor) > 0)) return 'Informe o acréscimo ao valor total.'
    if (efeitos.has('objeto')) {
      const base = objetoVigente(v)  // baseline (rascunho não conta)
      const igual = a.novoObjeto.length === base.length && a.novoObjeto.every(x => base.includes(x))
      if (igual) return 'Altere o objeto (escopo) do contrato.'
    }
    if (efeitos.has('partes') && !a.cessoes.some(c => c.parteId && c.nome)) return 'Defina ao menos uma cessão de parte.'
    return null
  }
  const ativar = () => {
    const e = validarAtivacao()
    if (e) { setActErr(e); return }
    setActErr(''); onActivate(a.id)
  }
  /* valor total resultante até este aditivo (inicial + acréscimos até idx) */
  const totalApos = (parseFloat(v.valorTotal) || 0) + v.aditivos.slice(0, idx + 1).reduce((s, x) => s + (x.alteraValor && x.novoValor ? (parseFloat(x.novoValor) || 0) : 0), 0)
  /* chips de efeito (Opção B): pílulas escaneáveis do que o aditivo altera, no lugar da string corrida */
  const chips = [
    a.alteraTermino ? (a.novoTermino ? `Novo término ${fmtBR(a.novoTermino)}` : 'Prorrogação') : '',
    a.alteraValor   ? (a.novoValor ? `+ ${v.moeda ? v.moeda + ' ' : ''}${(parseFloat(a.novoValor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Reajuste de valor') : '',
    a.alteraObjeto  ? 'Novo objeto' : '',
    a.alteraPartes  ? `Cessão${a.cessoes.length > 1 ? ` (${a.cessoes.length})` : ''}` : '',
  ].filter(Boolean)

  return (
    <>
    <div className="rounded-md border bg-card overflow-hidden">
      {/* linha-resumo (recolhida) — clique para expandir/editar */}
      <div className={cn('flex items-center gap-2 px-3 py-2 bg-muted/30', open && 'border-b')}>
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 min-w-0 text-left">
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <span className="text-[11px] font-semibold shrink-0">{a.numero ? `${a.numero}º Termo aditivo` : `Aditivo ${idx + 1}`}</span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', lock ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>{lock ? 'Ativo' : 'Rascunho'}</span>
          {chips.length > 0 && (
            <span className="flex items-center gap-1 overflow-hidden">
              {chips.map(c => <span key={c} className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/70">{c}</span>)}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums pl-2">{a.data ? fmtBR(a.data) : ''}</span>
        </button>
        {/* recolhido + com arquivo: link para visualizar/baixar o anexo (igual aos documentos) */}
        {!open && a.arquivo_key && (
          <div className="flex items-center gap-3 shrink-0">
            {canPreview && (
              <button type="button" onClick={handlePreview} disabled={busy === 'view'} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
                {busy === 'view' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}Visualizar
              </button>
            )}
            <button type="button" onClick={download} disabled={busy === 'down'} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
              {busy === 'down' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Baixar
            </button>
          </div>
        )}
        {!lock && <button type="button" onClick={() => form.remAditivo(a.id)} title="Excluir aditivo (rascunho)" className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {open && (
      <div className="p-3 space-y-3">
        {/* barra de ação do aditivo (no topo) */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[10px]', actErr ? 'text-red-500' : 'text-muted-foreground')}>{lock ? 'Aditivo ativo — aplicado ao contrato. Para corrigir, abra para revisão.' : (actErr || 'Rascunho — ative para aplicar as mudanças ao contrato.')}</span>
          {lock ? (
            <button type="button" onClick={() => onRevise(a.id)} className="inline-flex items-center h-7 shrink-0 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">Abrir para revisão</button>
          ) : (
            <button type="button" onClick={ativar} className="inline-flex items-center h-7 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Ativar aditivo</button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Número"><Txt value={a.numero} onChange={x => form.patchAditivo(a.id, { numero: x })} ro={lock} placeholder="1" /></Field>
          <Field label="Data de assinatura" required><Txt type="date" value={a.data} onChange={x => form.patchAditivo(a.id, { data: x })} ro={lock} /></Field>
        </div>

        <Field label="Tipos de aditamento" required>
          {lock ? (
            <div className="flex flex-wrap gap-1.5">
              {a.tipos.length === 0 ? <span className={readCls}>—</span> : a.tipos.map(id => (
                <span key={id} className="inline-flex items-center px-2.5 h-7 rounded-full bg-primary/10 text-primary text-[11px] font-medium">{labelOf(tiposAditivo.entries, id)}</span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tiposAditivo.active.map(t => {
                const on = a.tipos.includes(t.id)
                return (
                  <button key={t.id} type="button" onClick={() => toggleTipo(t.id)}
                    className={cn('px-2.5 h-7 rounded-full border text-[11px] font-medium transition-colors',
                      on ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:bg-muted')}>
                    {t.label}
                  </button>
                )
              })}
              {a.tipos.filter(id => !tiposAditivo.active.some(t => t.id === id)).map(id => (
                <button key={id} type="button" onClick={() => toggleTipo(id)}
                  className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full border border-primary bg-primary text-primary-foreground text-[11px] font-medium">
                  {labelOf(tiposAditivo.entries, id)}<X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Descrição" required><Area value={a.descricao} onChange={x => form.patchAditivo(a.id, { descricao: x })} ro={lock} placeholder="O que este aditivo estabelece..." /></Field>

        <Field label="Documento (termo aditivo)">
          {lock ? (
            a.arquivo_key ? (
              <div className="flex items-center gap-4">
                {canPreview && <button type="button" onClick={handlePreview} disabled={busy === 'view'} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50">{busy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Visualizar</button>}
                <button type="button" onClick={download} disabled={busy === 'down'} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50">{busy === 'down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{a.arquivo_nome || 'Baixar'}</button>
              </div>
            ) : <span className={readCls}>{a.arquivo_nome || '—'}</span>
          ) : (
            <div className="flex gap-2">
              <input readOnly value={a.arquivo_nome} placeholder="Nenhum arquivo" className={cn(inputCls, 'flex-1 cursor-default text-muted-foreground')} />
              {a.arquivo_key ? (
                <>
                  {canPreview && (
                    <button type="button" onClick={handlePreview} disabled={busy === 'view'} title="Visualizar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50">{busy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}</button>
                  )}
                  <button type="button" onClick={download} disabled={busy === 'down'} title="Baixar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50">{busy === 'down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}</button>
                  <button type="button" onClick={() => form.patchAditivo(a.id, { arquivo_key: '', arquivo_nome: '' })} title="Remover" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'up'} className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">{busy === 'up' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Anexar</button>
              )}
              <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
            </div>
          )}
          {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
        </Field>

        {/* editores comandados pelo TIPO (efeito) */}
        {(a.alteraTermino || a.alteraValor || a.alteraObjeto || a.alteraPartes) ? (
          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground">Alterações aplicadas ao contrato</p>

            {a.alteraTermino && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início da prorrogação"><span className={readCls}>{fmtBR(inicioProrrog)}</span></Field>
                <Field label="Novo término"><Txt type="date" value={a.novoTermino} onChange={x => form.patchAditivo(a.id, { novoTermino: x })} ro={lock} /></Field>
              </div>
            )}

            {a.alteraValor && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Acréscimo ao valor total"><MoneyField value={a.novoValor} moedaCode={v.moeda} onChange={x => form.patchAditivo(a.id, { novoValor: x })} ro={lock} /></Field>
                  <Field label="Nova parcela"><MoneyField value={a.novaParcela} moedaCode={v.moeda} onChange={x => form.patchAditivo(a.id, { novaParcela: x })} ro={lock} /></Field>
                </div>
                <p className="text-[10px] text-muted-foreground">Somado ao valor inicial · novo valor total: <span className="font-semibold tabular-nums text-foreground">{v.moeda ? v.moeda + ' ' : ''}{totalApos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
              </div>
            )}

            {a.alteraObjeto && (
              <Field label="Novo objeto (escopo)">
                <div className="space-y-1.5">
                  {a.novoObjeto.length === 0 && lock && <span className={readCls}>—</span>}
                  {a.novoObjeto.map((id, i) => (
                    <div key={id} className="flex items-center justify-between rounded-md border bg-background px-3 py-1.5">
                      <span className="text-xs">{i + 1}. {labelOf(objetos.entries, id)}</span>
                      {!lock && <button type="button" onClick={() => form.patchAditivo(a.id, { novoObjeto: a.novoObjeto.filter(x => x !== id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}
                    </div>
                  ))}
                  {!lock && (
                    <select value="" onChange={e => addObj(e.target.value)} className={inputCls}>
                      <option value="">Adicionar objeto...</option>
                      {objetos.active.filter(o => !a.novoObjeto.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  )}
                </div>
              </Field>
            )}

            {a.alteraPartes && (
              <Field label="Cessão / troca de parte">
                <div className="space-y-2">
                  {a.cessoes.length === 0 && <p className="text-[11px] text-muted-foreground">{lock ? '—' : 'Nenhuma cessão. Adicione abaixo.'}</p>}
                  {a.cessoes.map(c => {
                    const parte  = v.partes.find(p => p.id === c.parteId)
                    const origem = parte ? origemDoPapel(papeis.active, parte.papel) : ORIGEM.EMPRESA_PARCEIRO
                    if (lock) return (
                      <div key={c.id} className="rounded-md border bg-background px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">{parte ? labelOf(papeis.entries, parte.papel) : 'Parte'}:</span> {parte?.nome || '—'} <span className="text-muted-foreground">→</span> <span className="font-medium">{c.nome || '—'}</span>
                      </div>
                    )
                    return (
                      <div key={c.id} className="rounded-md border bg-background p-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <select value={c.parteId} onChange={e => form.patchCessao(a.id, c.id, { parteId: e.target.value })} className={cn(inputCls, 'flex-1')}>
                            <option value="">Parte que será cedida...</option>
                            {v.partes.map(p => <option key={p.id} value={p.id}>{labelOf(papeis.entries, p.papel)} — {p.nome || '(sem nome)'}</option>)}
                          </select>
                          <button type="button" onClick={() => form.remCessao(a.id, c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="flex gap-2">
                          <input readOnly value={c.nome} onClick={() => { if (c.parteId) onOpenCessaoSearch(a.id, c.id, origem) }}
                            placeholder={c.parteId ? 'Selecionar nova entidade (cessionária)' : 'Escolha a parte primeiro'}
                            className={cn(inputCls, 'flex-1', c.parteId ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed')} />
                          <button type="button" disabled={!c.parteId} onClick={() => onOpenCessaoSearch(a.id, c.id, origem)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50"><Search className="h-3 w-3 text-muted-foreground" /></button>
                        </div>
                      </div>
                    )
                  })}
                  {!lock && <button type="button" onClick={() => form.addCessao(a.id)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium"><Plus className="h-3 w-3" />Adicionar cessão</button>}
                </div>
              </Field>
            )}
          </div>
        ) : (!lock && (
          <p className="text-[11px] text-muted-foreground">Selecione um <span className="font-medium">tipo de aditamento</span> acima — ele define o que muda (término, valor, escopo ou cessão).</p>
        ))}
      </div>
      )}
    </div>
    </>
  )
}
