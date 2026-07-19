'use client'

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { Plus, Trash2, Search, Upload, Download, Loader2, X, Eye, ChevronDown, FileText, RefreshCw, ListPlus, Paperclip, FileDown } from 'lucide-react'
import {
  aplicarReajuste, acumuladoPeriodo, parcelasAlvo, proximaDataReajuste, proximaDataReajusteContrato,
  planejarReajuste, stepMeses, temCronograma, gerarParcelas, parcelaProvisoria, totaisAVencer, campoRenovacao,
  renovarUmPeriodoComReajuste,
  comp, currentComp, todayISO, type CoreLancamento, type CoreReajusteRealizado, type LancField,
} from '@nxt/contracts-core'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { exportExcel } from '@/lib/export-excel'
import { UserSelect } from '@/components/ui/user-select'
import { useSelectableUsers } from '@/hooks/use-users'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { useIndiceValores } from '@/hooks/use-indice-valores'
import { INIT_PAPEIS, PAPEIS_KEY, ORIGEM, REFERENCIA, origemDoPapel, ladoDoPapel, referenciaDoPapelEntry } from '@/lib/contract-roles'
import {
  TIPOS_KEY, OBJETOS_KEY, MOEDAS_KEY, CONDICOES_KEY, INDICES_KEY, TIPOS_ADITIVO_KEY, FORMAS_PGTO_KEY,
  INIT_TIPOS, INIT_OBJETOS, INIT_MOEDAS, INIT_CONDICOES, INIT_INDICES, INIT_TIPOS_ADITIVO, INIT_FORMAS_PGTO,
  SITUACOES, PERIODICIDADES, TIPOS_DOCUMENTO, effectiveSituacao, APLICACOES_REAJUSTE,
  NATUREZAS, ACOES_TERMINO, temPagamentos, temRecebimentos, somaLancamentos, somaLancamentosPagos, somaDesvios,
  lancPago, lancPrevisto, lancDesvio,
  valorVigente, parcelaVigente, parcelaVigenteInput, condicaoVigente, complementoVigente, terminoVigente, objetoVigente, partesVigentes, terminoVigenteAntes, objetoVigenteAntes, proximoDiaISO,
  tituloVigente, descricaoVigente, tituloVigenteInfo, descricaoVigenteInfo,
  periodosVigencia, historicoRenegociacao, historicoObjeto, historicoCessoes,
  newCParte, newCReajuste, newCReajusteRealizado, newCDocumento, newCLancamento, newCAditivo, newCCessao, uid,
  type ContractFormValues, type CParte, type CReajuste, type CReajusteRealizado, type CDocumento, type CLancamento, type CAditivo, type CCessao,
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

  /* reajustes efetivamente aplicados (fato, não agenda) */
  const addReajRealizado = useCallback((r: CReajusteRealizado) => setValues(p => ({ ...p, reajustesRealizados: [...(p.reajustesRealizados ?? []), r] })), [])
  const remReajRealizado = useCallback((id: string) => setValues(p => ({ ...p, reajustesRealizados: (p.reajustesRealizados ?? []).filter(x => x.id !== id) })), [])

  const addDoc = useCallback(() => setValues(p => ({ ...p, documentos: [...p.documentos, newCDocumento()] })), [])
  const remDoc = useCallback((id: string) => setValues(p => ({ ...p, documentos: p.documentos.filter(x => x.id !== id) })), [])
  const updDoc = useCallback((id: string, k: keyof Omit<CDocumento, 'id'>, v: string) =>
    setValues(p => ({ ...p, documentos: p.documentos.map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])
  const patchDoc = useCallback((id: string, patch: Partial<Omit<CDocumento, 'id'>>) =>
    setValues(p => ({ ...p, documentos: p.documentos.map(x => x.id !== id ? x : { ...x, ...patch }) })), [])

  /* lançamentos: 'pagamentos' (Despesa) e 'recebimentos' (Receita) — mesma forma */
  const addLanc = useCallback((field: 'pagamentos' | 'recebimentos') => {
    const novo = newCLancamento()
    setValues(p => ({ ...p, [field]: [...p[field], novo] }))
    return novo.id  // devolve o id para a tela focar/destacar a linha recém-criada
  }, [])
  const remLanc = useCallback((field: 'pagamentos' | 'recebimentos', id: string) => setValues(p => ({ ...p, [field]: p[field].filter(x => x.id !== id) })), [])
  const updLanc = useCallback((field: 'pagamentos' | 'recebimentos', id: string, k: keyof Omit<CLancamento, 'id'>, v: string) =>
    setValues(p => ({ ...p, [field]: p[field].map(x => x.id !== id ? x : { ...x, [k]: v }) })), [])
  const patchLanc = useCallback((field: 'pagamentos' | 'recebimentos', id: string, patch: Partial<Omit<CLancamento, 'id'>>) =>
    setValues(p => ({ ...p, [field]: p[field].map(x => x.id !== id ? x : { ...x, ...patch }) })), [])

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

  return { values, set, setValues, addParte, remParte, updParte, setParteEntity, addReaj, remReaj, updReaj, addReajRealizado, remReajRealizado, addDoc, remDoc, updDoc, patchDoc, addLanc, remLanc, updLanc, patchLanc, addAditivo, remAditivo, patchAditivo, addCessao, remCessao, patchCessao }
}
export type ContractForm = ReturnType<typeof useContractForm>

/* ─── estilos + primitivos controlados (com modo leitura) ── */

/* primitivos idênticos aos do cadastro de Parceiros (padrão único de campo do sistema) */
const inputCls  = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const areaCls   = 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none'
const readCls   = 'flex min-h-[1.5rem] w-full items-center bg-transparent px-0 text-[13px] font-medium text-foreground'
const readArea  = 'block w-full bg-transparent px-0 py-0 text-[13px] font-medium text-foreground whitespace-pre-wrap'

export function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

/** R3 — predicado de visibilidade de campo nativo dirigido pela tela. Sem tela (form nativo
 *  puro) o default mostra tudo; a tela padrão do sistema também mostra tudo. */
export type ContractVisFn = (key: string) => boolean
const showAll: ContractVisFn = () => true

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

/** Avaliador SEGURO de expressão aritmética (o "=expr" dos campos de valor). Sem `eval`:
 *  descida recursiva sobre + − × ÷ e parênteses, com menos/mais unário. Convenção pt-BR igual
 *  à do campo: `.` é separador de MILHAR (removido) e `,` é o decimal (vira `.`) — assim
 *  `1.000,50` = 1000.5 e `120000/12` = 10000. Devolve null quando a expressão é inválida
 *  (sobra de caractere, divisão por zero, número malformado). */
function evalExpr(src: string): number | null {
  const s = src.replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.')
  if (!s) return null
  let i = 0
  let ok = true
  const peek = () => s[i]
  function expr(): number {           // + e −
    let v = term()
    while (ok && (peek() === '+' || peek() === '-')) { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r }
    return v
  }
  function term(): number {           // × e ÷
    let v = factor()
    while (ok && (peek() === '*' || peek() === '/')) { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r }
    return v
  }
  function factor(): number {         // unário · parênteses · número
    if (peek() === '+') { i++; return factor() }
    if (peek() === '-') { i++; return -factor() }
    if (peek() === '(') { i++; const v = expr(); if (peek() === ')') i++; else ok = false; return v }
    const start = i
    while (i < s.length && /[0-9.]/.test(s[i])) i++
    if (i === start) { ok = false; return 0 }
    const n = parseFloat(s.slice(start, i))
    if (Number.isNaN(n)) { ok = false; return 0 }
    return n
  }
  const out = expr()
  if (!ok || i !== s.length || !Number.isFinite(out)) return null
  return out
}

/** Campo monetário com máscara pt-BR e prefixo do código da moeda. `value` é o número como string.
 *  `vazio`: sem placeholder e sem moldura — usado quando o valor ainda NÃO EXISTE (parcela não
 *  baixada). Um "0,00" cinza ali sugeriria que se pagou zero.
 *
 *  CÁLCULO NO CAMPO: digitar `=` entra em "modo fórmula" — o campo aceita texto livre (ex.:
 *  `=120000/12`) e, no Enter ou ao sair, avalia a conta e grava o número já arredondado a 2
 *  casas. Enquanto NÃO se usa `=`, a máscara de centavos original é preservada intacta. */
function MoneyField({ value, moedaCode, onChange, ro, bare, vazio }: { value: string; moedaCode: string; onChange: (v: string) => void; ro?: boolean; bare?: boolean; vazio?: boolean }) {
  const num     = value ? parseFloat(value) : 0
  const display = value ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  const [draft, setDraft] = useState<string | null>(null)   // texto da fórmula em edição (null = máscara normal)
  const [erroCalc, setErroCalc] = useState(false)
  if (ro) return <span className={readCls}>{value ? (bare ? display : `${moedaCode} ${display}`) : '—'}</span>

  const emFormula = draft !== null
  const shown = emFormula ? (draft as string) : display

  /** aplica a fórmula: grava o número; se inválida, ou descarta (blur) ou apenas sinaliza (Enter). */
  const aplicar = (descartarSeInvalida: boolean) => {
    if (draft === null) return
    const r = evalExpr(draft.replace(/^=/, ''))
    if (r === null) {
      if (descartarSeInvalida) { setDraft(null); setErroCalc(false) }  // blur: descarta, volta ao valor anterior
      else setErroCalc(true)                                          // Enter: mantém e sinaliza p/ corrigir
      return
    }
    onChange(String(Math.round(r * 100) / 100))
    setDraft(null); setErroCalc(false)
  }
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (emFormula) { setDraft(raw); setErroCalc(false); return }            // já em fórmula: texto livre
    if (raw.includes('=')) { setDraft(raw.slice(raw.indexOf('='))); setErroCalc(false); return }  // dispara a fórmula
    const digits = raw.replace(/\D/g, '').slice(0, 13)                       // máscara de centavos (comportamento original)
    onChange(digits ? String(parseInt(digits, 10) / 100) : '')
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!emFormula) return
    if (e.key === 'Enter') { e.preventDefault(); aplicar(false) }
    else if (e.key === 'Escape') { e.preventDefault(); setDraft(null); setErroCalc(false) }
  }
  const dica = 'Dica: comece com = para calcular. Ex.: =120000/12'
  const anel = emFormula ? (erroCalc ? 'ring-1 ring-red-400 border-red-400' : 'ring-1 ring-amber-400/70') : ''

  /* bare: sem prefixo de moeda, alinhado à direita (para listas onde a moeda vive no resumo) */
  if (bare) return (
    <input inputMode={emFormula ? 'text' : 'numeric'} value={shown} onChange={onInput} onKeyDown={onKeyDown} onBlur={() => aplicar(true)}
           title={dica} placeholder={vazio ? '' : '0,00'}
           className={cn(inputCls, 'h-7', anel, emFormula ? 'text-left' : 'text-right tabular-nums', !emFormula && vazio && 'border-transparent bg-transparent hover:border-input focus:border-input')} />
  )
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground pointer-events-none select-none">{moedaCode}</span>
      <input inputMode={emFormula ? 'text' : 'numeric'} value={shown} onChange={onInput} onKeyDown={onKeyDown} onBlur={() => aplicar(true)}
             title={dica} placeholder="0,00" className={cn(inputCls, 'pl-11 tabular-nums', anel, emFormula && 'text-left')} />
    </div>
  )
}

/** Data ISO (yyyy-mm-dd) → dd/mm/aaaa (— quando vazia). */
const fmtDataBR = (iso: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

/** Data ISO (yyyy-mm[-dd]) → mm/aaaa (— quando vazia). Usado na data base de reajuste. */
const fmtMesAnoBR = (iso: string) => {
  if (!iso) return '—'
  const [ano, mes] = iso.slice(0, 7).split('-')
  return mes && ano ? `${mes}/${ano}` : '—'
}

/** Bloco de "histórico embutido" (procedência dos aditivos) — recolhível, fechado por padrão.
 *  O contador no cabeçalho sinaliza que há histórico sem poluir a tela. */
function HistBlock({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="col-span-2 rounded-lg border bg-muted/20 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/30 transition-colors">
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{count}</span>
      </button>
      {open && <div className="px-2.5 pb-2.5 pt-0.5 space-y-1">{children}</div>}
    </div>
  )
}

/* ─── grupos de campos ───────────────────────────────────── */

/** Dados Gerais: Número, Situação, Título, Descrição, Objeto, Tipo. Número segue editável mesmo em leitura;
 *  Situação é sempre só-leitura e preenchida automaticamente pelo ciclo de vida (ver effectiveSituacao). */
export function IdentificacaoFields({ form, ro, autoNumero = false, numeroPreview, isVisible = showAll }: { form: ContractForm; ro?: boolean; autoNumero?: boolean; numeroPreview?: string; isVisible?: ContractVisFn }) {
  const tipos   = useLookupTable(TIPOS_KEY, INIT_TIPOS)
  const objetos = useLookupTable(OBJETOS_KEY, INIT_OBJETOS)
  const v = form.values
  /* título/descrição podem ser alterados por aditivo de escopo — em leitura, exibe o vigente + origem */
  const titInfo  = tituloVigenteInfo(v)
  const descInfo = descricaoVigenteInfo(v)
  /* objeto guarda o id da entrada (resolução ao vivo); adiciona ao escolher no dropdown */
  const addObjeto = (id: string) => { if (id && !v.objeto.includes(id)) form.set('objeto', [...v.objeto, id]) }

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Natureza vem primeiro: é o "modo" que define o que o resto do formulário exibe */}
      {isVisible('natureza') && <Field label="Natureza do contrato" span2><Segmented value={v.natureza} onChange={x => form.set('natureza', x)} ro={ro} options={NATUREZAS} /></Field>}
      {isVisible('numero') && (autoNumero ? (
        <Field label="Número">
          <span className={readCls}>{numeroPreview || 'Gerado ao salvar'}</span>
          <p className="mt-0.5 text-[10px] text-muted-foreground normal-case">Gerado automaticamente ao salvar (Parâmetros gerais)</p>
        </Field>
      ) : (
        <Field label="Número" required><Txt value={v.numero} onChange={x => form.set('numero', x)} ro={ro} placeholder="CTR-2026-001" /></Field>
      ))}
      {/* situação usa o término VIGENTE (com aditivos) — prorrogou, não fica "Vencido" */}
      {isVisible('situacao') && <Field label="Situação"><span className={readCls}>{SITUACOES.find(s => s.value === effectiveSituacao(v.situacao, v.prazoIndeterminado ? '' : terminoVigente(v)))?.label ?? '—'}</span></Field>}
      {isVisible('titulo') && <Field label="Título" required span2>
        <Txt value={ro ? tituloVigente(v) : v.titulo} onChange={x => form.set('titulo', x)} ro={ro} placeholder="Título resumido do contrato" />
        {ro && titInfo.aditivo && <p className="mt-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">· alterado no {titInfo.aditivo}</p>}
      </Field>}
      {isVisible('descricao') && <Field label="Descrição" span2>
        <Area value={ro ? descricaoVigente(v) : v.descricao} onChange={x => form.set('descricao', x)} ro={ro} rows={4} placeholder="Descrição detalhada do objeto e escopo do contrato..." />
        {ro && descInfo.aditivo && <p className="mt-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">· alterado no {descInfo.aditivo}</p>}
      </Field>}
      {isVisible('objeto') && <Field label="Objeto do contrato" span2>
        <div className="space-y-1.5">
          {ro ? (() => {
            /* leitura: diff dos aditivos de escopo — acrescido (verde) / removido (tachado vermelho) */
            const diff = historicoObjeto(v)
            if (diff.length === 0) return <p className={readCls}>—</p>
            return diff.map((it, i) => (
              <div key={it.value} className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5',
                it.status === 'removido'  ? 'border-red-200/70 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/20'
                : it.status === 'acrescido' ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                : 'bg-muted/20')}>
                <span className="text-[10px] font-medium text-muted-foreground w-4 shrink-0 text-right">{i + 1}.</span>
                <span className={cn('text-xs', it.status === 'removido' && 'line-through text-muted-foreground')}>{labelOf(objetos.entries, it.value)}</span>
                {/* procedência inline, colada ao item (a cor da linha já dá o panorama) */}
                {it.status !== 'original' && (
                  <span className={cn('text-[10px] font-medium', it.status === 'acrescido' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                    · {it.status === 'acrescido' ? 'acrescido' : 'removido'} no {it.aditivo}
                  </span>
                )}
              </div>
            ))
          })() : (
            <>
              {v.objeto.map((id, i) => (
                <div key={id} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5">
                  <div className="flex items-center gap-2"><span className="text-[10px] font-medium text-muted-foreground w-4 shrink-0 text-right">{i + 1}.</span><span className="text-xs">{labelOf(objetos.entries, id)}</span></div>
                  <button type="button" onClick={() => form.set('objeto', v.objeto.filter(x => x !== id))} className="text-muted-foreground hover:text-destructive transition-colors ml-2"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              <select value="" onChange={e => addObjeto(e.target.value)} className={cn(inputCls)}>
                <option value="">Adicionar objeto...</option>
                {objetos.active.filter(o => !v.objeto.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </>
          )}
        </div>
      </Field>}
      {isVisible('tipo') && <Field label="Tipo de contrato" required><Sel value={v.tipo} onChange={x => form.set('tipo', x)} ro={ro} options={lookupOpts(tipos.active)} placeholder="Selecione..." /></Field>}
      {isVisible('data_assinatura') && <Field label="Data de assinatura"><Txt type="date" value={v.dataAssinatura} onChange={x => form.set('dataAssinatura', x)} ro={ro} /></Field>}
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
/** O core devolve valores numéricos; o formulário guarda strings. Parcela projetada
 *  nasce sem baixa: `valorPago` vazio. */
const toCLancamento = (l: CoreLancamento): CLancamento => ({
  ...newCLancamento(),
  ...l,
  valorPrevisto: String(lancPrevisto(l)),
  valorPago: l.valorPago == null || l.valorPago === '' ? '' : String(l.valorPago),
})

/** Reajuste aplicado pelo core (números) → registro do formulário (strings). Mesmo
 *  mapeamento do "Registrar reajuste" manual, para que renovação e registro gravem igual. */
const toCReajusteRealizado = (r: CoreReajusteRealizado): CReajusteRealizado => ({
  ...newCReajusteRealizado(r.reajusteId),
  id: r.id, competencia: String(r.competencia),
  indiceSnapshot: r.indiceSnapshot ?? '', base: r.base ?? 'parcela',
  percentual: r.percentual == null || r.percentual === '' ? '' : String(r.percentual),
  valorAnterior: String(r.valorAnterior ?? ''), valorNovo: String(r.valorNovo ?? ''),
  parcelaAnterior: String(r.parcelaAnterior ?? ''), parcelaNova: String(r.parcelaNova ?? ''),
  parcelasReajustadas: String(r.parcelasReajustadas ?? ''),
  dataAplicacao: r.dataAplicacao ?? '', observacao: r.observacao ?? '', createdAt: r.createdAt ?? '',
})

export function VigenciaFields({ form, ro, isVisible = showAll }: { form: ContractForm; ro?: boolean; isVisible?: ContractVisFn }) {
  const v = form.values
  /* série de índices e catálogo: alimentam o reajuste que a renovação aplica antes de gerar o período */
  const indiceVals = useIndiceValores()
  const indices    = useLookupTable(INDICES_KEY, INIT_INDICES)

  /* ── Renovar período (renovação MANUAL) ───────────────────────────────────
     Mora aqui, e não na aba de pagamentos, porque o que ele faz de mais importante
     é estender a VIGÊNCIA e somar o período ao valor do contrato — gerar as parcelas
     é consequência.

     Antecipar a renovação = fazer o que o motor de datas faria ao renovar este período:
     por isso aplica ANTES os reajustes automáticos vencidos que pertencem à vigência atual
     (via `renovarUmPeriodoComReajuste`, a MESMA função do scheduler), e só então gera as
     parcelas — que nascem no preço já reajustado. Um contrato sem reajuste vencido renova
     como sempre. Linha de reajuste MANUAL não é aplicada aqui: quem a aplica é a pessoa.

     Aparece sempre que renovar faça sentido: prazo determinado, com término, e a ação
     no término não é "Encerrar". Note que NÃO basta a ação ser "Renovar automaticamente":
     o motor só age DEPOIS do término (aqui você antecipa) e a renovação automática pode
     estar desligada nos parâmetros globais — nesses casos este botão é a única saída.
     Com ação "Definir manualmente" não há prazo cadastrado, então ele é pedido abaixo. */
  const [renovOpen, setRenovOpen] = useState(false)
  const [renovErr, setRenovErr]   = useState<string | null>(null)
  const prazoCadastrado = v.acaoTermino === 'RENOVAR'
  /* prazo informado na hora, quando o contrato não tem um cadastrado */
  const [rAnos, setRAnos]   = useState('')
  const [rMeses, setRMeses] = useState('')
  const [rDias, setRDias]   = useState('')

  const anos  = parseInt(prazoCadastrado ? v.renovacaoAnos  : rAnos, 10)  || 0
  const meses = parseInt(prazoCadastrado ? v.renovacaoMeses : rMeses, 10) || 0
  const dias  = parseInt(prazoCadastrado ? v.renovacaoDias  : rDias, 10)  || 0
  const temPrazo = (anos || meses || dias) > 0

  const podeRenovar = !v.prazoIndeterminado && !!terminoVigente(v) && v.acaoTermino !== 'ENCERRAR'

  const campoRenov: LancField = campoRenovacao(v.natureza)

  /* opções do motor único: a série vem do índice de cada linha; o rótulo do índice vira o
     snapshot do reajuste. Os geradores de id são injetados (prévia usa ids estáveis, o
     registro usa uid()). */
  const renovarOpts = (ids: { r: (n: number) => string; reno: (n: number) => string; parc: (n: number, i: number) => string }) => ({
    serie: (id: string) => indiceVals.serieDe(id),
    today: todayISO(),
    campo: campoRenov,
    prazo: { anos, meses, dias },
    indiceSnapshot: (id: string) => labelOf(indices.entries, id),
    observacao: 'Reajuste aplicado ao renovar o período.',
    dataRegistro: todayISO(),
    createdAt: new Date().toISOString(),
    makeReajusteId: ids.r, makeRenovacaoId: ids.reno, makeParcelaId: ids.parc,
  })

  /* prévia = a MESMA função que será executada, sobre um CLONE descartado: o que você lê é
     o que acontece (inclusive os reajustes que serão aplicados). */
  const previa = podeRenovar && temPrazo
    ? renovarUmPeriodoComReajuste(structuredClone(v), renovarOpts({ r: n => `previa_r_${n}`, reno: () => 'previa', parc: (_n, i) => `previa_${i}` }))
    : null

  const abrirRenovacao = () => {
    setRenovErr(null)
    /* sem prazo cadastrado, começa pelo prazo do contrato (se houver) como sugestão */
    if (!prazoCadastrado) { setRAnos(v.renovacaoAnos || ''); setRMeses(v.renovacaoMeses || ''); setRDias(v.renovacaoDias || '') }
    setRenovOpen(true)
  }

  const confirmarRenovacao = () => {
    setRenovErr(null)
    if (!temPrazo) { setRenovErr('Informe por quanto tempo renovar (anos, meses ou dias).'); return }
    /* o core MUTA o contrato: trabalhamos num clone e escrevemos o resultado no formulário */
    const work = structuredClone(v)
    const res = renovarUmPeriodoComReajuste(work, renovarOpts({ r: () => uid(), reno: () => `reno_${Date.now()}`, parc: () => uid() }))
    if (!res) { setRenovErr('Não foi possível renovar: verifique o término da vigência e o prazo de renovação.'); return }
    const reno = {
      id: String(res.renovacao.id), data: String(res.renovacao.data),
      terminoAnterior: String(res.renovacao.terminoAnterior), novoTermino: String(res.renovacao.novoTermino),
      automatica: false, valorPeriodo: String(res.renovacao.valorPeriodo),
    }
    /* pagamentos/recebimentos do clone já trazem as parcelas reprecificadas + as do novo
       período; reajustesRealizados só ganha os reajustes que esta renovação aplicou. */
    form.setValues(p => ({
      ...p,
      pagamentos:   (work.pagamentos   ?? []).map(toCLancamento),
      recebimentos: (work.recebimentos ?? []).map(toCLancamento),
      reajustesRealizados: [...(p.reajustesRealizados ?? []), ...res.reajustes.map(toCReajusteRealizado)],
      renovacoes: [...(p.renovacoes ?? []), reno],
    }))
    setRenovOpen(false)
  }

  const money = (n: number | string) => `${v.moeda ? v.moeda + ' ' : ''}${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Ordem: Início → Prazo indeterminado → Término → Ao término (a âncora vem antes do modificador) */}
      {isVisible('inicio') && <Field label="Início da vigência" required><Txt type="date" value={v.inicioVigencia} onChange={x => form.set('inicioVigencia', x)} ro={ro} /></Field>}
      {isVisible('prazo_indeterminado') && <Field label="Prazo indeterminado">
        {ro ? <span className={readCls}>{v.prazoIndeterminado ? 'Sim' : 'Não'}</span> : (
          <label className="flex items-center gap-2 h-7 cursor-pointer">
            <input type="checkbox" checked={v.prazoIndeterminado} onChange={e => form.set('prazoIndeterminado', e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 accent-primary" />
            <span className="text-xs text-muted-foreground">Sem data de término</span>
          </label>
        )}
      </Field>}
      {!v.prazoIndeterminado && isVisible('termino') && <Field label="Término da vigência"><Txt type="date" value={ro ? terminoVigente(v) : v.terminoVigencia} onChange={x => form.set('terminoVigencia', x)} ro={ro} min={v.inicioVigencia || undefined} /></Field>}

      {!v.prazoIndeterminado && isVisible('acao_termino') && (
        <Field label="Ao término da vigência">
          <Sel value={v.acaoTermino || 'MANUAL'} onChange={x => form.set('acaoTermino', x)} ro={ro} options={ACOES_TERMINO} />
        </Field>
      )}
      {!v.prazoIndeterminado && isVisible('acao_termino') && v.acaoTermino === 'RENOVAR' && (
        <Field label="Renovar por" span2>
          {ro ? (
            <span className={readCls}>{renovacaoResumo(v) || '—'}</span>
          ) : (
            <div className="space-y-2">
              {/* "Prazo indeterminado" torna a vigência sem término (marca Prazo indeterminado = Sim e oculta o Término) */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={false} onChange={e => { if (e.target.checked) form.set('prazoIndeterminado', true) }} className="h-3.5 w-3.5 rounded border-gray-300 accent-primary" />
                <span className="text-xs text-muted-foreground">Prazo indeterminado (renova sem data de término)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <NumBox caption="Anos"  value={v.renovacaoAnos}  onChange={x => form.set('renovacaoAnos', x)} />
                <NumBox caption="Meses" value={v.renovacaoMeses} onChange={x => form.set('renovacaoMeses', x)} />
                <NumBox caption="Dias"  value={v.renovacaoDias}  onChange={x => form.set('renovacaoDias', x)} />
              </div>
            </div>
          )}
        </Field>
      )}

      {/* Renovar período: ato contratual — estende a vigência e soma o período ao valor.
          Pede confirmação porque é o único botão desta tela que muda o contrato. */}
      {podeRenovar && (
        <div className="col-span-2 rounded-md border bg-muted/20 p-3">
          {!renovOpen ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Renovar período</p>
                <p className="text-[11px] text-muted-foreground">
                  Estende a vigência e projeta as parcelas do novo período, somando-as ao valor do contrato.
                  {prazoCadastrado
                    ? ' O motor de datas faz isto sozinho após o término — use aqui para antecipar.'
                    : ' Este contrato não renova sozinho: o prazo é informado na confirmação.'}
                </p>
              </div>
              <button type="button" onClick={abrirRenovacao}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted">
                <RefreshCw className="h-3.5 w-3.5" />Renovar período
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium">Confirmar renovação</p>

              {/* sem prazo cadastrado ("Definir manualmente"), o prazo é informado agora */}
              {!prazoCadastrado && (
                <div>
                  <p className="mb-1 text-[10px] font-medium text-muted-foreground">Renovar por</p>
                  <div className="grid grid-cols-3 gap-2">
                    <NumBox caption="Anos"  value={rAnos}  onChange={setRAnos} />
                    <NumBox caption="Meses" value={rMeses} onChange={setRMeses} />
                    <NumBox caption="Dias"  value={rDias}  onChange={setRDias} />
                  </div>
                </div>
              )}

              {previa ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                  {previa.reajustes.length > 0 && (
                    <> Antes de renovar, {previa.reajustes.length === 1 ? 'é aplicado' : 'são aplicados'}{' '}
                      <strong>{previa.reajustes.length}</strong> reajuste(s) vencido(s); a parcela passa a{' '}
                      <strong className="tabular-nums">{money(previa.reajustes[previa.reajustes.length - 1].parcelaNova ?? 0)}</strong>.{' '}</>
                  )}
                  A vigência passa de <strong className="tabular-nums">{fmtDataBR(String(previa.renovacao.terminoAnterior))}</strong> para{' '}
                  <strong className="tabular-nums">{fmtDataBR(String(previa.renovacao.novoTermino))}</strong>.
                  {previa.lancamentos.length > 0 ? (
                    <> São geradas <strong>{previa.lancamentos.length}</strong> parcela(s) a vencer, somando{' '}
                      <strong className="tabular-nums">{money(previa.renovacao.valorPeriodo ?? 0)}</strong> ao valor do contrato.</>
                  ) : (
                    <> Nenhuma parcela é gerada (o contrato ainda não tem cronograma) e o valor total não muda.</>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {temPrazo ? 'Defina o término da vigência antes de renovar.' : 'Informe por quanto tempo renovar.'}
                </p>
              )}
              {renovErr && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{renovErr}</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setRenovOpen(false)} className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
                <button type="button" onClick={confirmarRenovacao} disabled={!previa}
                  className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                  Confirmar renovação
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Renovações: períodos completos de vigência (prazo original + prorrogações), o último "em vigor" */}
      {ro && (() => {
        const periodos = periodosVigencia(v)
        if (periodos.length <= 1) return null   // sem prorrogação, não há o que historiar
        return (
          <HistBlock title="Renovações" count={periodos.length - 1}>
            {periodos.map((p, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-xs', p.emVigor && 'font-medium')}>
                <span className="tabular-nums">{fmtDataBR(p.inicio)} – {fmtDataBR(p.termino)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.label}</span>
                {p.emVigor && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">em vigor</span>}
              </div>
            ))}
          </HistBlock>
        )
      })()}
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
export function ValoresFields({ form, ro, isVisible = showAll }: { form: ContractForm; ro?: boolean; isVisible?: ContractVisFn }) {
  const moedas    = useLookupTable(MOEDAS_KEY, INIT_MOEDAS)
  const condicoes = useLookupTable(CONDICOES_KEY, INIT_CONDICOES)
  const formas    = useLookupTable(FORMAS_PGTO_KEY, INIT_FORMAS_PGTO)
  const v = form.values
  const moedaOpts = moedas.active.map(m => ({ value: m.code ?? m.label, label: m.code ? `${m.code} — ${m.label}` : m.label }))
  const totalPago     = somaLancamentosPagos(v.pagamentos)    // consumo/saldo = só o realizado (pago)
  const totalRecebido = somaLancamentosPagos(v.recebimentos)
  const valorTotalNum = valorVigente(v)            // valor VIGENTE (original + aditivos) — usado no topo e no saldo
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Ordem: (1) moeda + condição — descritores de topo; (2) os dois VALORES colados
          (vigentes na leitura); (3) forma + quantidade — como paga e em quantas. A quantidade
          é condicional e fica por último, então nunca separa os dois valores. */}
      {isVisible('moeda') && <Field label="Moeda"><Sel value={v.moeda} onChange={x => form.set('moeda', x)} ro={ro} options={moedaOpts} placeholder="Selecione..." /></Field>}
      {isVisible('condicao_pagamento') && <Field label="Condição de pagamento"><Sel value={ro ? condicaoVigente(v) : v.condicaoPagamento} onChange={x => form.set('condicaoPagamento', x)} ro={ro} options={lookupOpts(condicoes.active)} placeholder="Selecione..." /></Field>}

      {isVisible('valor_total') && <Field label="Valor total do contrato" required>
        <MoneyField value={ro ? String(valorTotalNum) : v.valorTotal} moedaCode={v.moeda} onChange={x => form.set('valorTotal', x)} ro={ro} />
      </Field>}
      {isVisible('valor_parcela') && <Field label="Valor da parcela">
        <MoneyField value={ro ? parcelaVigenteInput(v) : v.valorParcela} moedaCode={v.moeda} onChange={x => form.set('valorParcela', x)} ro={ro} />
      </Field>}

      {isVisible('forma_pagamento') && <Field label="Forma de pagamento"><Sel value={v.formaPagamento} onChange={x => form.set('formaPagamento', x)} ro={ro} options={lookupOpts(formas.active)} placeholder="Selecione..." /></Field>}
      {/* Quantidade de parcelas — só faz sentido em prazo determinado; base do reajuste de parcela */}
      {!v.prazoIndeterminado && isVisible('qtd_parcelas') && (
        <Field label="Quantidade de parcelas">
          {ro
            ? <span className={readCls}>{v.qtdParcelas || '—'}</span>
            : <input type="number" min="0" step="1" value={v.qtdParcelas} onChange={e => form.set('qtdParcelas', e.target.value)} placeholder="Ex: 12" className={inputCls} />}
        </Field>
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

      {/* Complemento vigente fica junto do estado atual, ANTES do histórico */}
      {isVisible('complemento') && <Field label="Complemento do valor" span2><Area value={ro ? complementoVigente(v) : v.complementoValor} onChange={x => form.set('complementoValor', x)} ro={ro} placeholder="Ex: mais impostos, inclusive ISS, frete e demais encargos..." /></Field>}

      {/* Histórico de valor: changelog por aditivo — rótulo à esquerda + valor colado (de → para, com acréscimo) */}
      {ro && (() => {
        const eventos = historicoRenegociacao(v)
        if (eventos.length === 0) return null
        const money = (s: string) => `${v.moeda ? v.moeda + ' ' : ''}${(parseFloat(s) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const fmtVal = (kind: string, val: string) => kind === 'money' ? money(val) : kind === 'condicao' ? (labelOf(condicoes.entries, val) || '—') : val
        return (
          <HistBlock title="Histórico de valor" count={eventos.length}>
            <div className="space-y-2">
              {eventos.map((ev, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{ev.aditivo}{ev.data ? ` · ${fmtDataBR(ev.data)}` : ''}</p>
                  {ev.mudancas.map((m, j) => (
                    <div key={j} className="flex items-baseline gap-3 text-xs">
                      <span className="w-28 shrink-0 text-muted-foreground">{m.campo}</span>
                      {m.kind === 'texto' ? (
                        <span className="min-w-0 truncate font-medium" title={m.para}>{m.para}</span>
                      ) : (
                        <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                          <span className="tabular-nums text-muted-foreground/50 line-through">{fmtVal(m.kind, m.de)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="tabular-nums font-medium">{fmtVal(m.kind, m.para)}</span>
                          {m.delta && (parseFloat(m.delta) || 0) !== 0 && (
                            <span className={cn('tabular-nums', (parseFloat(m.delta) || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                              {(parseFloat(m.delta) || 0) > 0 ? '+ ' : '− '}{money(String(Math.abs(parseFloat(m.delta) || 0)))}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </HistBlock>
        )
      })()}
    </div>
  )
}

/** Lançamentos (pagamentos OU recebimentos): tabela densa editável na própria linha.
 *  Editável mesmo com o contrato travado — registra-se pagamentos ao longo da vigência. */
/** Tile de resumo (padrão bento) — rótulo pequeno + valor grande, opcionalmente com barra de progresso.
 *  `hint` traz um complemento discreto abaixo do valor (ex.: parte provisória do "A vencer"). */
function StatTile({ label, value, bar, danger, hint }: { label: string; value: string; bar?: number; danger?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', danger && 'text-red-600 dark:text-red-400')}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground tabular-nums truncate" title={hint}>{hint}</p>}
      {bar != null && <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden"><div className={cn('h-full rounded-full', bar >= 100 ? 'bg-red-500' : 'bg-primary')} style={{ width: `${Math.min(100, bar)}%` }} /></div>}
    </div>
  )
}

/** Pagamentos/Recebimentos como "extrato operacional": resumo (total, nº, % do contrato, saldo),
 *  toolbar fixa (adicionar / gerar em massa) e lista agrupada por ano — cada ano recolhível.
 *  Editável mesmo com o contrato travado. */
export function LancamentosFields({ form, field, moedaCode, travado, dualView }: { form: ContractForm; field: 'pagamentos' | 'recebimentos'; moedaCode: string; travado?: boolean; dualView?: boolean }) {
  const v = form.values
  const lista = v[field]
  const singular = field === 'pagamentos' ? 'pagamento' : 'recebimento'
  const rotulo   = field === 'pagamentos' ? 'pago' : 'recebido'
  const secao    = field === 'pagamentos' ? 'Pagamentos' : 'Recebimentos'
  const saldoLbl = field === 'pagamentos' ? 'Saldo a pagar' : 'Saldo a receber'
  const total       = somaLancamentos(lista)      // PREVISTO: o que está contratado
  const totalPago   = somaLancamentosPagos(lista)  // REALIZADO: o que foi efetivamente pago
  const desvioTotal = somaDesvios(lista)           // realizado − previsto, só das pagas
  const formas    = useLookupTable(FORMAS_PGTO_KEY, INIT_FORMAS_PGTO)
  const valorContrato = valorVigente(v)
  const pct   = valorContrato > 0 ? Math.round((totalPago / valorContrato) * 100) : 0
  const saldo = valorContrato - totalPago
  const money = (n: number) => `${moedaCode ? moedaCode + ' ' : ''}${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  /* status por parcela: pago / a vencer / vencido (vencido é derivado: previsto + vencimento < hoje) */
  const hoje = todayISO()
  const refDate = (l: CLancamento) => l.vencimento || l.data   // referência = vencimento (ou pagamento p/ legado)
  /* "A vencer" separa o que é FIRME do que é PROVISÓRIO: parcela alcançada pelo próximo
     reajuste ainda vai mudar de valor. Contrato sem reajuste → nada é provisório. */
  const { firme: aVencer, provisorio, vencido } = totaisAVencer(v, lista, hoje)
  const provisoria = (l: CLancamento) => parcelaProvisoria(v, l)
  const statusInfo = (l: CLancamento) => {
    if (lancPago(l)) return { label: field === 'pagamentos' ? 'Pago' : 'Recebido', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
    if (refDate(l) && refDate(l) < hoje) return { label: 'Vencido', cls: 'bg-red-500/10 text-red-600 dark:text-red-500' }
    return { label: 'A vencer', cls: 'bg-muted text-muted-foreground' }
  }
  /* Baixar = registrar o valor pago. O caso comum é "pagou o previsto", então um clique
     basta; se pagou diferente, edite a coluna Pago e o desvio aparece sozinho. */
  const marcarPago = (l: CLancamento) => form.patchLanc(field, l.id, { valorPago: l.valorPrevisto, data: l.data || l.vencimento || hoje })
  /* Estornar preserva o comprovante: o arquivo continua no campo, some só da tela (o clipe
     não aparece em parcela não paga). Rebaixando, ele reaparece. Apagá-lo aqui destruiria
     um documento por causa de um clique errado no selo de status. */
  const reabrir    = (l: CLancamento) => form.patchLanc(field, l.id, { valorPago: '', data: '' })

  /* ── comprovante da baixa (anexo) ──────────────────────────────────────────
     Um único <input type=file> escondido, reaproveitado por todas as linhas: `alvoRef`
     guarda de quem é o clique. Metadado puro — não toca em valor nem em status. */
  const compRef = useRef<HTMLInputElement>(null)
  const alvoRef = useRef<string>('')
  const [anexando, setAnexando] = useState<string | null>(null)
  const [erroAnexo, setErroAnexo] = useState('')

  const pedirArquivo = (id: string) => { setErroAnexo(''); alvoRef.current = id; compRef.current?.click() }

  const subirComprovante = async (f: File) => {
    const id = alvoRef.current
    if (!id) return
    setErroAnexo(''); setAnexando(id)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await apiFetch('/api/files', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(res.status === 413 ? 'Arquivo muito grande (máx. 25 MB)' : 'Falha no upload')
      const meta = await res.json() as { key: string; name: string }
      form.patchLanc(field, id, { comprovante_key: meta.key, comprovante_nome: meta.name })
    } catch (e) {
      setErroAnexo(e instanceof Error ? e.message : 'Falha ao anexar o comprovante')
    } finally { setAnexando(null) }
  }

  /* Clicar no clipe ABRE o comprovante numa janela separada, com a moldura Nxt — o mesmo
     caminho do "Visualizar" dos Documentos do contrato (openAnexoJanela). Consultar é ler,
     não baixar. Formato que o navegador não renderiza (zip, xml, ofx) cai no download,
     porque uma janela em branco não é visualização. */
  const abrirComprovante = async (l: CLancamento) => {
    if (!l.comprovante_key) return
    setErroAnexo(''); setAnexando(l.id)
    const nome = l.comprovante_nome || 'comprovante'
    try {
      if (isPreviewable(nome)) {
        const e = await openAnexoJanela(l.comprovante_key, nome)
        if (e) setErroAnexo(e)
        return
      }
      const res = await apiFetch(`/api/files/${encodeURIComponent(l.comprovante_key)}`)
      if (!res.ok) throw new Error('Falha ao baixar o comprovante')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url; a.download = nome
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErroAnexo(e instanceof Error ? e.message : 'Falha ao abrir o comprovante')
    } finally { setAnexando(null) }
  }

  /* Remover LIMPA A REFERÊNCIA, não apaga o arquivo. O DELETE imediato criaria um ponteiro
     para o vazio se a pessoa removesse e fechasse a tela sem salvar: o banco ainda teria a
     key, o storage não teria o arquivo. Referência perdida sem salvar é reversível (basta
     não salvar); arquivo apagado, não. O órfão é tratado por varredura, fora daqui. */
  const removerComprovante = (l: CLancamento) =>
    form.patchLanc(field, l.id, { comprovante_key: '', comprovante_nome: '' })

  /* Exportação — leva para a planilha o que a TELA DERIVA e o banco não guarda: o status
     (Pago/Vencido/A vencer) e o desvio. Sem eles a planilha é uma cópia pior do JSON.
     Valores vão como número (não string) para o Excel poder somar. */
  const exportar = async () => {
    const ordenado = [...lista].sort((a, b) => String(refDate(a)).localeCompare(String(refDate(b))))
    const fmtD = (d: string) => (d ? d.split('-').reverse().join('/') : '')
    await exportExcel({
      fileName: `${(v.numero || 'contrato').toLowerCase()}_${field}`,
      sheet: secao,
      title: `${secao} — ${v.numero || 'Contrato'}${v.titulo ? ` · ${v.titulo}` : ''}`,
      columns: [
        { header: 'Vencimento', width: 13, align: 'center' },
        { header: 'Valor previsto', width: 15, align: 'right' },
        { header: `Data do ${rotulo === 'pago' ? 'pagamento' : 'recebimento'}`, width: 16, align: 'center' },
        { header: 'Valor realizado', width: 15, align: 'right' },
        { header: 'Desvio', width: 12, align: 'right' },
        { header: 'Status', width: 11, align: 'center' },
        { header: 'Reajustável', width: 12, align: 'center' },
        { header: 'Forma', width: 20 },
        { header: 'Nº documento', width: 16 },
        { header: 'Comprovante', width: 26 },
        { header: 'Observação', width: 40 },
      ],
      rows: ordenado.map(l => [
        fmtD(l.vencimento),
        lancPrevisto(l),
        fmtD(l.data),
        lancPago(l) ? Number(l.valorPago) || 0 : '',
        lancDesvio(l) || '',
        statusInfo(l).label,
        l.reajustavel === false ? 'Não' : 'Sim',
        labelOf(formas.entries, l.forma),
        l.documento,
        l.comprovante_nome,
        l.observacao,
      ]),
      footer: ['Total', total, '', totalPago, desvioTotal || '', '', '', '', '', '', ''],
    })
  }

  /* Agrupa por ano — a ORDEM só recalcula ao ADICIONAR/REMOVER/GERAR ou ao SAIR do campo de data
     (onBlur). Assim o lançamento não "pula" enquanto a data é digitada; o valor exibido é ao vivo. */
  const byId = new Map(lista.map(l => [l.id, l]))
  const buildGrupos = (): [string, string[]][] => {
    const ordenado = [...lista].sort((a, b) => {
      const da = refDate(a), db = refDate(b)
      if (!da && !db) return 0
      if (!da) return 1   // sem vencimento vai por último
      if (!db) return -1
      return da < db ? -1 : da > db ? 1 : 0
    })
    const byYear = new Map<string, string[]>()
    for (const l of ordenado) {
      const ano = refDate(l) ? refDate(l).slice(0, 4) : '—'
      if (!byYear.has(ano)) byYear.set(ano, [])
      byYear.get(ano)!.push(l.id)
    }
    /* "Sem data" PRIMEIRO: um lançamento recém-adicionado nasce sem data e, no fim da lista,
       ficava fora da tela — parecia que o clique não fez nada. No topo, aparece logo abaixo
       da toolbar; ao ganhar data e sair do campo, desce para o seu mês (reordenar). */
    return [...byYear.entries()].sort((a, b) => (a[0] === '—' ? -1 : b[0] === '—' ? 1 : 0))
  }
  const [grupos, setGrupos] = useState<[string, string[]][]>(buildGrupos)
  const prevLen = useRef(lista.length)
  useEffect(() => {
    if (lista.length !== prevLen.current) { prevLen.current = lista.length; setGrupos(buildGrupos()) }
  }, [lista.length]) // eslint-disable-line react-hooks/exhaustive-deps

  /* recolher/expandir por ano — default: último ano com data aberto; "Sem data" sempre visível */
  const [openYears, setOpenYears] = useState<Set<string>>(() => {
    const anos = buildGrupos().map(([a]) => a).filter(a => a !== '—')
    return new Set(anos.length ? [anos[anos.length - 1]] : [])
  })
  const yearOpen  = (ano: string) => ano === '—' || openYears.has(ano)
  const toggleYear = (ano: string) => setOpenYears(s => { const n = new Set(s); n.has(ano) ? n.delete(ano) : n.add(ano); return n })
  /* onBlur da data: re-agrupa e mantém visível o ano para onde a linha foi (evita "sumir") */
  const reordenar = (anoAbrir?: string) => { setGrupos(buildGrupos()); if (anoAbrir) setOpenYears(s => new Set(s).add(anoAbrir)) }

  /* Adicionar UM lançamento: nasce sem data (grupo "Sem data", agora no topo). Focamos o
     campo de data e destacamos a linha por um instante — sem isso a linha aparece sem aviso e
     o clique parece não ter surtido efeito. */
  const [novoId, setNovoId] = useState<string | null>(null)
  const adicionar = () => setNovoId(form.addLanc(field))
  const focarNovo = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'nearest' })
      ;(el.querySelector('input[type="date"]') as HTMLInputElement | null)?.focus()
    })
  }, [])
  useEffect(() => {
    if (!novoId) return
    const t = setTimeout(() => setNovoId(null), 1200)  // destaque some depois da transição
    return () => clearTimeout(t)
  }, [novoId])

  /* ── gerar em massa (valor fixo) ─────────────────────────── */
  /* visão da grade: 'planejar' (default, foco em criar o cronograma) ou 'baixas' (liquidar) */
  const [modo, setModo] = useState<'planejar' | 'baixas'>('planejar')
  const [gerarOpen, setGerarOpen] = useState(false)
  const [gData, setGData]   = useState('')
  const [gQtd, setGQtd]     = useState('')
  const [gValor, setGValor] = useState('')
  const [gForma, setGForma] = useState('')
  const [gErr, setGErr]     = useState<string | null>(null)
  const abrirGerar = () => {
    setGData(v.inicioVigencia || ''); setGQtd(v.qtdParcelas || ''); setGValor(parcelaVigenteInput(v) || v.valorParcela || ''); setGForma(v.formaPagamento || ''); setGErr(null)
    setGerarOpen(o => !o)
  }
  const gerar = () => {
    const n = parseInt(gQtd, 10)
    if (!gData)        { setGErr('Informe a data inicial.'); return }
    if (!(n > 0))      { setGErr('Informe a quantidade de parcelas.'); return }
    if (n > 240)       { setGErr('Máximo de 240 parcelas por vez.'); return }
    /* cada parcela nasce com o reajuste já conhecido do seu mês (senão, o valor base informado) */
    const novos = gerarParcelas(v, { inicio: gData, qtd: n, valorBase: parseFloat(gValor) || 0, forma: gForma, makeId: () => uid() }).map(toCLancamento)
    form.setValues(p => ({ ...p, [field]: [...p[field], ...novos] }))
    setOpenYears(s => new Set([...s, ...novos.map(l => l.vencimento.slice(0, 4))]))  // expande os anos gerados
    setGerarOpen(false)
  }

  /* A renovação manual ("Renovar período") mora na aba Vigência: ela estende a vigência e
     soma o período ao valor do contrato — gerar as parcelas é consequência, não o ato. */

  /* Dois blocos SIMÉTRICOS de data+valor — "o que era" contra "o que foi":
       PREVISTO   → data (vencimento) · valor
       REALIZADO  → data (baixa)      · valor
     Depois os ATRIBUTOS da parcela: reaj. · forma · nº doc · status · observação · (remover).
     `Reaj.` é atributo, não uma terceira dimensão do previsto: dentro do grupo ele
     quebrava a simetria 2×2, que é o que torna a tabela legível.

     As duas colunas de DATA precisam caber "dd/mm/aaaa" + o ícone do date picker do
     navegador: abaixo de ~9rem o Chrome corta o ícone. A soma das larguras fixas fica
     sob o `min-w` da tabela, que rola na horizontal em telas estreitas em vez de cortar. */
  /* DUAS VISÕES da grade (só no CADASTRO, `dualView`) — as 11 colunas juntas estouravam a
     largura do painel e escondiam campos à direita. Cada visão mostra só o que se preenche
     NAQUELA fase e cabe sem rolar para o lado:
       PLANEJAMENTO (ao criar): previsto data/valor · reaj · forma · nº doc · observação
       BAIXAS (ao liquidar):    previsto data/valor · baixa data/valor pago · anexo · status
     As duas primeiras colunas (previsto data/valor) são âncora comum. Datas ficam em 9rem —
     abaixo disso o Chrome corta o ícone do date picker. Nada é perdido ao trocar de visão.
     No DETALHE (edição, sem `dualView`) mantém-se a grade LEGADA de 11 colunas, com rolagem
     horizontal — a pedido: só o cadastro ganhou as duas visões. */
  const modoBaixas = modo === 'baixas'
  const COLS = !dualView
    ? 'grid grid-cols-[9rem_7.5rem_9rem_7.5rem_4.25rem_2.75rem_7.5rem_5.5rem_5.5rem_minmax(8rem,1fr)_1.25rem] items-center gap-2'
    : modoBaixas
      ? 'grid grid-cols-[9rem_7.5rem_9rem_7.5rem_4.25rem_minmax(5.5rem,1fr)_1.25rem] items-center gap-2'
      : 'grid grid-cols-[9rem_7.5rem_3rem_8rem_6rem_minmax(8rem,1fr)_1.25rem] items-center gap-2'
  const MINW = dualView ? 'min-w-[42rem]' : 'min-w-[75rem]'
  const cell = cn(inputCls, 'h-7')
  const desvioDe = (l: CLancamento) => lancDesvio(l)
  /* o bloco REALIZADO (só na visão Baixas) ganha fundo e bordas que descem por TODA a tabela:
     é isso que faz o agrupamento existir na linha, e não só no cabeçalho. `self-stretch` faz o
     fundo cobrir a altura inteira da linha sem deslocar o conteúdo (margem negativa desalinhava). */
  const blocoRealizado = 'col-span-3 grid grid-cols-subgrid items-center gap-2 self-stretch bg-muted/20 border-x border-border/40'

  return (
    <div className="space-y-3">
      {/* input único reaproveitado por todas as linhas — `alvoRef` diz de quem é o arquivo */}
      <input ref={compRef} type="file" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void subirComprovante(f); e.target.value = '' }} />
      {erroAnexo && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {erroAnexo}
        </p>
      )}
      {/* faixa de resumo (rola) */}
      {lista.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile
            label={field === 'pagamentos' ? 'Realizado' : 'Recebido'}
            value={money(totalPago)}
            hint={`de ${money(total)} previsto${desvioTotal !== 0 ? ` · desvio ${desvioTotal > 0 ? '+' : '−'}${money(Math.abs(desvioTotal))}` : ''}`}
            bar={valorContrato > 0 ? pct : undefined} />
          <StatTile label="A vencer" value={money(aVencer)} hint={provisorio > 0 ? `+ ${money(provisorio)} provisório` : undefined} />
          <StatTile label="Vencido" value={money(vencido)} danger={vencido > 0} />
          {valorContrato > 0 && <StatTile label={saldoLbl} value={money(saldo)} danger={saldo < 0} />}
        </div>
      )}

      {/* toolbar fixa (não some ao rolar a lista) */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background py-1.5 border-b border-border/60">
        <div className="flex items-center gap-4">
          <button type="button" onClick={adicionar} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar {singular}</button>
          <button type="button" onClick={abrirGerar} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"><ListPlus className="h-3.5 w-3.5" />Gerar cronograma</button>
          <button type="button" onClick={() => void exportar()} disabled={!lista.length}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <FileDown className="h-3.5 w-3.5" />Exportar
          </button>
        </div>
        {lista.length > 0 && (
          <div className="flex items-center gap-3">
            {/* alterna as colunas visíveis (só no cadastro): planejar o cronograma × registrar as baixas */}
            {dualView && (
              <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-[11px] font-medium">
                {([['planejar', 'Planejamento'], ['baixas', 'Baixas']] as const).map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => setModo(m)}
                    title={m === 'planejar' ? 'Colunas do cronograma: previsto, reajuste, forma, nº doc, observação' : 'Colunas de liquidação: baixa, valor pago, comprovante, status'}
                    className={cn('rounded px-2 py-0.5 transition-colors',
                      modo === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
            <span className="text-[11px] text-muted-foreground">{lista.length} lançamento{lista.length > 1 ? 's' : ''} · <span className="font-semibold tabular-nums text-foreground">{money(total)}</span></span>
          </div>
        )}
      </div>

      {/* gerar em massa (painel) */}
      {gerarOpen && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gerar cronograma de parcelas</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Vencimento inicial</span>
              <input type="date" value={gData} onChange={e => setGData(e.target.value)} className={cell} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Quantidade (meses)</span>
              <input type="number" min="1" step="1" value={gQtd} onChange={e => setGQtd(e.target.value)} placeholder={v.qtdParcelas || 'Ex: 12'} className={cell} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Valor base da parcela</span>
              <MoneyField value={gValor} moedaCode={moedaCode} bare onChange={setGValor} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Forma</span>
              <select value={gForma} onChange={e => setGForma(e.target.value)} className={cell}>
                <option value="">Forma...</option>
                {formas.active.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">Gera 1 parcela por mês (a vencer), aplicando os reajustes já registrados por competência. Depois é só marcar cada parcela como paga.</p>
          {gErr && <p className="text-xs text-destructive">{gErr}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setGerarOpen(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={gerar} className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Gerar {parseInt(gQtd, 10) > 0 ? `${parseInt(gQtd, 10)} ` : ''}parcelas</button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma parcela. Use &ldquo;Adicionar&rdquo; para uma a uma, ou &ldquo;Gerar cronograma&rdquo; para projetar a série mensal (a vencer).</p>
      ) : (
        /* Rolagem PRÓPRIA da tabela (horizontal quando a viewport é estreita, vertical sempre).
           A rolagem interna não é preferência: `sticky` só ativa dentro de um scrollport, e
           `overflow-x-auto` já fazia deste div um scrollport — só que sem altura, então o
           cabeçalho nunca teria onde grudar. */
        <div className="rounded-md border overflow-auto max-h-[60vh]">
          <div className={MINW}>
            {/* CABEÇALHO ÚNICO, grudado no topo. Antes havia uma cópia dentro de cada ano
                expandido — idênticas entre si, e todas sumiam ao rolar. Duas linhas (grupo +
                rótulos), altura fixa em ambos os modos p/ o subcabeçalho de ano grudar em top-8. */}
            <div className="sticky top-0 z-20 bg-card border-b">
              {/* faixa de grupo: pares simétricos "o que era × o que foi" (legado e Baixas) */}
              <div className={cn(COLS, 'h-4 px-3 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50')}>
                <span className="col-span-2 text-center">Previsto</span>
                {!dualView ? (
                  <>
                    <span className={cn(blocoRealizado, 'justify-items-center')}>
                      <span className="col-span-3 text-center">Realizado</span>
                    </span>
                    <span /><span /><span /><span /><span /><span />
                  </>
                ) : modoBaixas ? (
                  <>
                    <span className={cn(blocoRealizado, 'justify-items-center')}>
                      <span className="col-span-3 text-center">Realizado</span>
                    </span>
                    <span /><span />
                  </>
                ) : (
                  <><span /><span /><span /><span /><span /></>
                )}
              </div>
              <div className={cn(COLS, 'h-4 px-3 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70')}>
                <span title="Data prevista de pagamento — é ela que produz o status Vencido">Data</span>
                <span className="text-right pr-2" title="Valor contratado da parcela">Valor</span>
                {!dualView ? (
                  <>
                    <span className={blocoRealizado}>
                      <span title="Data em que a parcela foi baixada">Data</span>
                      <span className="text-right pr-2" title={`Valor efetivamente ${rotulo}. Preencher baixa a parcela.`}>Valor</span>
                      <span className="text-center" title="Comprovante do pagamento (anexo)">Anexo</span>
                    </span>
                    <span className="text-center" title="Se marcada, o reajuste alcança o valor previsto desta parcela">Reaj.</span>
                    <span>Forma</span><span>Nº doc.</span><span>Status</span><span>Observação</span><span />
                  </>
                ) : modoBaixas ? (
                  <>
                    <span className={blocoRealizado}>
                      <span title="Data em que a parcela foi baixada">Data</span>
                      <span className="text-right pr-2" title={`Valor efetivamente ${rotulo}. Preencher baixa a parcela.`}>Valor</span>
                      <span className="text-center" title="Comprovante do pagamento (anexo)">Anexo</span>
                    </span>
                    <span>Status</span><span />
                  </>
                ) : (
                  <>
                    <span className="text-center" title="Se marcada, o reajuste alcança o valor previsto desta parcela">Reaj.</span>
                    <span>Forma</span><span>Nº doc.</span><span>Observação</span><span />
                  </>
                )}
              </div>
            </div>
            {grupos.map(([ano, ids]) => {
              const itens = ids.map(id => byId.get(id)).filter(Boolean) as typeof lista
              if (itens.length === 0) return null
              const semData = ano === '—'
              const aberto  = yearOpen(ano)
              return (
                <div key={ano} className="border-b last:border-0">
                  {/* Subcabeçalho do ano — gruda LOGO ABAIXO do cabeçalho (h-4 + h-4 = 2rem),
                      empurrado pelo ano seguinte. Fundo OPACO: um sticky translúcido deixa
                      as linhas passarem por baixo. */}
                  <div
                    role={semData ? undefined : 'button'}
                    onClick={semData ? undefined : () => toggleYear(ano)}
                    className={cn('sticky top-8 z-10 flex items-center justify-between px-3 py-1 bg-muted border-b border-border/40', !semData && 'cursor-pointer hover:bg-muted/80 transition-colors')}>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {!semData && <ChevronDown className={cn('h-3 w-3 transition-transform', aberto && 'rotate-180')} />}
                      {semData ? 'Sem data' : ano}
                      <span className="font-normal normal-case">· {itens.length} lançamento{itens.length > 1 ? 's' : ''}</span>
                    </span>
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground">{money(somaLancamentos(itens))}</span>
                  </div>
                  {aberto && (
                    <div className="divide-y divide-border/50">
                      {itens.map(l => (
                        <div key={l.id} ref={l.id === novoId ? focarNovo : undefined}
                             className={cn(COLS, 'group px-3 py-1 transition-colors duration-700 hover:bg-muted/30', l.id === novoId && 'bg-primary/10')}>
                          <input type="date" value={l.vencimento} onChange={e => form.updLanc(field, l.id, 'vencimento', e.target.value)} onBlur={e => reordenar(e.target.value ? e.target.value.slice(0, 4) : undefined)} className={cell} />
                          {/* "≈" = valor provisório: o próximo reajuste ainda vai reprecificar esta parcela */}
                          <div className="relative">
                            <MoneyField value={l.valorPrevisto} moedaCode={moedaCode} bare onChange={x => form.updLanc(field, l.id, 'valorPrevisto', x)} />
                            {provisoria(l) && (
                              <span title={`Valor provisório: será atualizado no reajuste de ${fmtMesAnoBR(comp(proximaDataReajusteContrato(v)))}`}
                                    className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 select-none text-[11px] font-semibold text-amber-600 dark:text-amber-500">≈</span>
                            )}
                          </div>
                          {!dualView ? (
                            /* LEGADO (edição/detalhe): todas as 11 colunas numa linha só, como era antes. */
                            <>
                              <div className={cn(blocoRealizado, 'py-1 -my-1')}>
                                <input type="date" value={l.data} title={`Data do ${rotulo === 'pago' ? 'pagamento' : 'recebimento'} (preencher baixa a parcela pelo valor previsto)`}
                                       onChange={e => form.patchLanc(field, l.id, { data: e.target.value, ...(e.target.value && !lancPago(l) ? { valorPago: l.valorPrevisto } : {}) })}
                                       className={cn(cell, !lancPago(l) && 'border-transparent bg-transparent opacity-40 hover:opacity-100 hover:border-input focus:opacity-100 focus:border-input')} />
                                <div className="relative">
                                  <MoneyField value={l.valorPago} moedaCode={moedaCode} bare vazio={!lancPago(l)} onChange={x => form.updLanc(field, l.id, 'valorPago', x)} />
                                  {desvioDe(l) !== 0 && (
                                    <span title={`${rotulo === 'pago' ? 'Pago' : 'Recebido'} a ${desvioDe(l) > 0 ? 'mais' : 'menos'} que o previsto`}
                                          className={cn('pointer-events-none absolute -bottom-1 right-1 select-none text-[9px] font-semibold tabular-nums',
                                            desvioDe(l) > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-400')}>
                                      {desvioDe(l) > 0 ? '+' : '−'}{money(Math.abs(desvioDe(l)))}
                                    </span>
                                  )}
                                </div>
                                <div className="flex justify-center">
                                  {anexando === l.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : !lancPago(l) ? (
                                    <span className="text-[10px] text-muted-foreground/30 select-none" title="Anexe o comprovante após baixar a parcela">—</span>
                                  ) : l.comprovante_key ? (
                                    <span className="flex items-center gap-1">
                                      <button type="button" onClick={() => void abrirComprovante(l)} title={isPreviewable(l.comprovante_nome) ? `Abrir: ${l.comprovante_nome}` : `Baixar: ${l.comprovante_nome} (formato sem visualização)`} className="text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400"><Eye className="h-3.5 w-3.5" /></button>
                                      <button type="button" onClick={() => pedirArquivo(l.id)} title={`Substituir comprovante (atual: ${l.comprovante_nome})`} className="text-muted-foreground/60 transition-colors hover:text-primary"><Upload className="h-3 w-3" /></button>
                                      <button type="button" onClick={() => removerComprovante(l)} title="Remover comprovante desta parcela" className="text-muted-foreground/60 transition-colors hover:text-destructive"><X className="h-3 w-3" /></button>
                                    </span>
                                  ) : (
                                    <button type="button" onClick={() => pedirArquivo(l.id)} title="Anexar comprovante do pagamento" className="text-muted-foreground/40 transition-colors hover:text-primary"><Paperclip className="h-3.5 w-3.5" /></button>
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-center">
                                <input type="checkbox" checked={l.reajustavel !== false} disabled={lancPago(l)} onChange={e => form.patchLanc(field, l.id, { reajustavel: e.target.checked })}
                                  title={lancPago(l) ? `Parcela ${rotulo} — o reajuste não reprecifica parcela baixada. Estorne para alterar.` : l.reajustavel !== false ? 'O reajuste alcança esta parcela' : 'Esta parcela não é reajustada'}
                                  className={cn('h-3.5 w-3.5 accent-primary', lancPago(l) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer')} />
                              </div>
                              <select value={l.forma} onChange={e => form.updLanc(field, l.id, 'forma', e.target.value)} className={cell}>
                                <option value="">Forma...</option>
                                {l.forma && !formas.active.some(f => f.id === l.forma) && <option value={l.forma}>{labelOf(formas.entries, l.forma)}</option>}
                                {formas.active.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                              </select>
                              <input value={l.documento} onChange={e => form.updLanc(field, l.id, 'documento', e.target.value)} placeholder="NF 1234" className={cell} />
                              <button type="button" onClick={() => (lancPago(l) ? reabrir(l) : marcarPago(l))} title={lancPago(l) ? 'Reabrir (voltar a A vencer)' : `Marcar como ${rotulo}`} className={cn('inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80', statusInfo(l).cls)}>{statusInfo(l).label}</button>
                              <input value={l.observacao} onChange={e => form.updLanc(field, l.id, 'observacao', e.target.value)} placeholder="—" className={cn(cell, 'text-muted-foreground')} />
                              {travado ? <span /> : <button type="button" onClick={() => form.remLanc(field, l.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>}
                            </>
                          ) : modoBaixas ? (
                            <>
                              {/* ── REALIZADO: data da baixa e valor efetivo, lado a lado ──
                                  Enquanto não há baixa, as duas células ficam VAZIAS: o vazio diz
                                  "ainda não aconteceu" melhor que um 0,00 cinza, que sugeriria
                                  que se pagou zero. Continuam editáveis ao clicar. */}
                              <div className={cn(blocoRealizado, 'py-1 -my-1')}>
                                {/* informar a data também baixa a parcela: o pago assume o previsto */}
                                <input type="date" value={l.data} title={`Data do ${rotulo === 'pago' ? 'pagamento' : 'recebimento'} (preencher baixa a parcela pelo valor previsto)`}
                                       onChange={e => form.patchLanc(field, l.id, { data: e.target.value, ...(e.target.value && !lancPago(l) ? { valorPago: l.valorPrevisto } : {}) })}
                                       className={cn(cell, !lancPago(l) && 'border-transparent bg-transparent opacity-40 hover:opacity-100 hover:border-input focus:opacity-100 focus:border-input')} />
                                <div className="relative">
                                  <MoneyField value={l.valorPago} moedaCode={moedaCode} bare vazio={!lancPago(l)} onChange={x => form.updLanc(field, l.id, 'valorPago', x)} />
                                  {desvioDe(l) !== 0 && (
                                    <span title={`${rotulo === 'pago' ? 'Pago' : 'Recebido'} a ${desvioDe(l) > 0 ? 'mais' : 'menos'} que o previsto`}
                                          className={cn('pointer-events-none absolute -bottom-1 right-1 select-none text-[9px] font-semibold tabular-nums',
                                            desvioDe(l) > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-400')}>
                                      {desvioDe(l) > 0 ? '+' : '−'}{money(Math.abs(desvioDe(l)))}
                                    </span>
                                  )}
                                </div>
                                {/* COMPROVANTE — só existe prova de pagamento que aconteceu.
                                    Parcela a vencer não mostra clipe; estornar esconde, não apaga. */}
                                <div className="flex justify-center">
                                  {anexando === l.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : !lancPago(l) ? (
                                    <span className="text-[10px] text-muted-foreground/30 select-none" title="Anexe o comprovante após baixar a parcela">—</span>
                                  ) : l.comprovante_key ? (
                                    /* três ações SEMPRE visíveis: esconder a remoção atrás de hover,
                                       num alvo de 10px, é armadilha — e o overflow do scroll da
                                       tabela ainda cortaria o botão flutuante. */
                                    <span className="flex items-center gap-1">
                                      <button type="button" onClick={() => void abrirComprovante(l)}
                                        title={isPreviewable(l.comprovante_nome) ? `Abrir: ${l.comprovante_nome}` : `Baixar: ${l.comprovante_nome} (formato sem visualização)`}
                                        className="text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400">
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                      <button type="button" onClick={() => pedirArquivo(l.id)}
                                        title={`Substituir comprovante (atual: ${l.comprovante_nome})`}
                                        className="text-muted-foreground/60 transition-colors hover:text-primary">
                                        <Upload className="h-3 w-3" />
                                      </button>
                                      <button type="button" onClick={() => removerComprovante(l)} title="Remover comprovante desta parcela"
                                        className="text-muted-foreground/60 transition-colors hover:text-destructive">
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ) : (
                                    <button type="button" onClick={() => pedirArquivo(l.id)} title="Anexar comprovante do pagamento"
                                      className="text-muted-foreground/40 transition-colors hover:text-primary">
                                      <Paperclip className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Status = ação de baixar / reabrir a parcela */}
                              <button type="button" onClick={() => (lancPago(l) ? reabrir(l) : marcarPago(l))} title={lancPago(l) ? 'Reabrir (voltar a A vencer)' : `Marcar como ${rotulo}`} className={cn('inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80', statusInfo(l).cls)}>{statusInfo(l).label}</button>
                              {/* travado: registra baixa/comprovante, mas EXCLUIR exige abrir para revisão */}
                              {travado ? <span /> : <button type="button" onClick={() => form.remLanc(field, l.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>}
                            </>
                          ) : (
                            <>
                              {/* Atributo da parcela: o reajuste alcança (ou não) o valor previsto.
                                  Parcela PAGA não é reprecificada — isso já é derivado de lancPago, e a
                                  baixa NÃO desmarca este campo. Ele guarda a INTENÇÃO ("nunca reajustar
                                  esta parcela"), não o fato. Apagá-la na baixa zeraria `pagasAlcancadas`
                                  e o alerta de diferença não cobrada morreria em silêncio. Aqui o campo
                                  só é desabilitado: mostra que não age, sem destruir o que diz. */}
                              <div className="flex justify-center">
                                <input type="checkbox" checked={l.reajustavel !== false} disabled={lancPago(l)}
                                  onChange={e => form.patchLanc(field, l.id, { reajustavel: e.target.checked })}
                                  title={lancPago(l)
                                    ? `Parcela ${rotulo} — o reajuste não reprecifica parcela baixada. Estorne para alterar.`
                                    : l.reajustavel !== false ? 'O reajuste alcança esta parcela' : 'Esta parcela não é reajustada'}
                                  className={cn('h-3.5 w-3.5 accent-primary',
                                    lancPago(l) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer')} />
                              </div>
                              <select value={l.forma} onChange={e => form.updLanc(field, l.id, 'forma', e.target.value)} className={cell}>
                                <option value="">Forma...</option>
                                {l.forma && !formas.active.some(f => f.id === l.forma) && <option value={l.forma}>{labelOf(formas.entries, l.forma)}</option>}
                                {formas.active.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                              </select>
                              <input value={l.documento} onChange={e => form.updLanc(field, l.id, 'documento', e.target.value)} placeholder="NF 1234" className={cell} />
                              <input value={l.observacao} onChange={e => form.updLanc(field, l.id, 'observacao', e.target.value)} placeholder="—" className={cn(cell, 'text-muted-foreground')} />
                              {/* travado: registra baixa/comprovante, mas EXCLUIR exige abrir para revisão */}
                              {travado ? <span /> : <button type="button" onClick={() => form.remLanc(field, l.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* Rodapé: total geral + realizado — acompanha o min-w da tabela. Grudado embaixo:
              com a rolagem interna ele ficaria enterrado sob as parcelas, e o total é o
              número que se consulta o tempo todo. Opaco, como todo sticky. */}
          <div className={cn(COLS, MINW, 'sticky bottom-0 z-20 px-3 py-1.5 bg-muted border-t')}>
            {/* mesma ordem das colunas do modo atual: total previsto sob Previsto; na visão
                Baixas, o total realizado sob Realizado; o desvio na última coluna livre. */}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
            <span className="text-xs font-semibold tabular-nums text-right pr-2">{money(total)}</span>
            {!dualView ? (
              <>
                <span className={blocoRealizado}>
                  <span />
                  <span className="text-xs font-semibold tabular-nums text-right pr-2">{money(totalPago)}</span>
                  <span />
                </span>
                <span /><span /><span /><span />
                <span className={cn('text-[10px] tabular-nums truncate', desvioTotal === 0 ? 'text-muted-foreground' : desvioTotal > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-400')}>
                  {desvioTotal === 0 ? 'sem desvio' : `desvio ${desvioTotal > 0 ? '+' : '−'}${money(Math.abs(desvioTotal))}`}
                </span>
                <span />
              </>
            ) : modoBaixas ? (
              <>
                <span className={blocoRealizado}>
                  <span />
                  <span className="text-xs font-semibold tabular-nums text-right pr-2">{money(totalPago)}</span>
                  <span />
                </span>
                <span className={cn('text-[10px] tabular-nums truncate', desvioTotal === 0 ? 'text-muted-foreground' : desvioTotal > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-400')}>
                  {desvioTotal === 0 ? 'sem desvio' : `desvio ${desvioTotal > 0 ? '+' : '−'}${money(Math.abs(desvioTotal))}`}
                </span>
                <span />
              </>
            ) : (
              <>
                <span /><span /><span />
                <span className={cn('text-[10px] tabular-nums truncate', desvioTotal === 0 ? 'text-muted-foreground' : desvioTotal > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-400')}>
                  {desvioTotal === 0 ? 'sem desvio' : `desvio ${desvioTotal > 0 ? '+' : '−'}${money(Math.abs(desvioTotal))}`}
                </span>
                <span />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Reajustes: um card recolhível por índice (padrão dos aditivos). Cada card reúne o cadastro
 *  (índice · data base · periodicidade) e o histórico de reajustes aplicados daquele índice.
 *  Um índice só pode ser usado uma vez. O histórico é operável mesmo com o contrato travado. */
export function ReajustesFields({ form, ro }: { form: ContractForm; ro?: boolean }) {
  const indices = useLookupTable(INDICES_KEY, INIT_INDICES)
  const v = form.values
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  /* novo índice já abre expandido; os demais começam recolhidos */
  const handleAdd = () => {
    const novo = newCReajuste()
    form.setValues(p => ({ ...p, reajustes: [...p.reajustes, novo] }))
    setOpen(p => new Set(p).add(novo.id))
  }
  return (
    <div className="space-y-2">
      {v.reajustes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {ro ? 'Nenhum índice de reajuste cadastrado.' : 'Nenhum índice de reajuste. Adicione um índice para acompanhar as datas e registrar os reajustes aplicados.'}
        </p>
      )}
      {v.reajustes.map((r, idx) => (
        <ReajusteCard key={r.id} r={r} idx={idx} form={form} indices={indices} ro={ro} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
      ))}
      {!ro && <button type="button" onClick={handleAdd} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar índice de reajuste</button>}
    </div>
  )
}

/* ─── consentimento informado ao ligar "Automática" ───────────────────────────
   Marcar uma linha como AUTOMATICA autoriza o motor a aplicar TODOS os reajustes
   represados na primeira execução — e reprecificar o cronograma inteiro. Isso é de
   mão única. O aviso mora aqui, e não num interruptor global, porque só aqui dá para
   dizer o número: "7 reajustes, a parcela vai de X para Y".

   A projeção usa exatamente as funções que o motor de datas usará (planejarReajuste +
   aplicarReajuste, do core). Não é uma estimativa: é o mesmo cálculo, descartado. */

interface PassoBacklog { competencia: string; percentual: number; parcelaDe: number; parcelaPara: number }
interface Backlog { passos: PassoBacklog[]; totalDe: number; totalPara: number; motivo?: string; proxima: string }

function projetarBacklog(v: ContractFormValues, linha: CReajuste, serie: Record<string, number>, today: string): Backlog {
  const lin = { ...linha, aplicacao: 'AUTOMATICA' }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let cur: any = { ...v, reajustes: v.reajustes.map(x => (x.id === linha.id ? lin : x)) }
  const passos: PassoBacklog[] = []
  const totalDe = valorVigente(v)
  let guard = 0
  while (guard++ < 200) {
    const p = planejarReajuste(cur, lin, serie, today)
    if (!p.aplicar) return { passos, totalDe, totalPara: valorVigente(cur), motivo: p.motivo, proxima: p.competencia }
    const res = aplicarReajuste(cur, { id: `sim_${guard}`, reajusteId: lin.id, competencia: p.competencia, percentual: p.percentual, base: p.base })
    passos.push({
      competencia: p.competencia, percentual: p.percentual,
      parcelaDe: Number(res.reajuste.parcelaAnterior) || 0, parcelaPara: Number(res.reajuste.parcelaNova) || 0,
    })
    cur = { ...cur, reajustesRealizados: [...(cur.reajustesRealizados ?? []), res.reajuste], pagamentos: res.pagamentos, recebimentos: res.recebimentos }
  }
  return { passos, totalDe, totalPara: valorVigente(cur), motivo: 'LIMITE', proxima: '' }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Card recolhível de um índice de reajuste: cabeçalho-resumo (base, periodicidade, aplicados,
 *  último, próximo) + corpo com o cadastro e o histórico de reajustes aplicados daquele índice. */
function ReajusteCard({ r, idx, form, indices, ro, open, onToggle }: {
  r: CReajuste; idx: number; form: ContractForm; indices: ReturnType<typeof useLookupTable>; ro?: boolean; open: boolean; onToggle: () => void
}) {
  const v = form.values
  const cell = cn(inputCls, 'h-7')
  const money = (n: number) => `${v.moeda ? v.moeda + ' ' : ''}${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const indiceVals = useIndiceValores()
  /* ligar "Automática" fica PENDENTE até a confirmação: o select mostra a intenção,
     o formulário só recebe o valor quando a pessoa vê o número e aceita */
  const [pendente, setPendente] = useState<Backlog | null>(null)
  const [verPassos, setVerPassos] = useState(false)

  const escolherAplicacao = (valor: string) => {
    const atual = r.aplicacao || 'MANUAL'
    if (valor !== 'AUTOMATICA' || atual === 'AUTOMATICA') { setPendente(null); form.updReaj(r.id, 'aplicacao', valor); return }
    const projecao = projetarBacklog(v, r, indiceVals.serieDe(r.indice), todayISO())
    /* sem nada represado, não há o que consentir: liga direto */
    if (!projecao.passos.length) { form.updReaj(r.id, 'aplicacao', valor); return }
    setPendente(projecao); setVerPassos(false)
  }
  const confirmarAuto = () => { form.updReaj(r.id, 'aplicacao', 'AUTOMATICA'); setPendente(null) }

  /* índices já usados por OUTROS reajustes não são oferecidos (sem duplicidade) */
  const opts = indices.active.filter(i => !new Set(v.reajustes.filter(o => o.id !== r.id && o.indice).map(o => o.indice)).has(i.id))
  const indiceLabel = labelOf(indices.entries, r.indice)
  const realizados = (v.reajustesRealizados ?? []).filter(x => x.reajusteId === r.id).sort((a, b) => (a.competencia < b.competencia ? 1 : -1))
  const ultimo = realizados[0]
  const proxima = r.periodicidade ? comp(proximaDataReajuste(v, r)) : ''

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* cabeçalho-resumo (recolhido) — clique para expandir */}
      <div className={cn('flex items-center gap-2 px-3 py-2 bg-muted/30', open && 'border-b')}>
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 min-w-0 text-left">
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[11px] font-semibold shrink-0">{r.indice ? indiceLabel : `Reajuste ${idx + 1}`}</span>
          {r.data && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">base {fmtMesAnoBR(r.data)}</span>}
          {r.periodicidade && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/70">{r.periodicidade}</span>}
          {realizados.length > 0 && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/70">{realizados.length} aplicado{realizados.length > 1 ? 's' : ''}</span>}
          {ultimo && <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">último {ultimo.percentual ? `${ultimo.percentual.replace('.', ',')}% · ` : ''}{fmtMesAnoBR(ultimo.competencia)}</span>}
          {proxima && !ro && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/70 tabular-nums">próximo {fmtMesAnoBR(proxima)}</span>}
        </button>
        {!ro && <button type="button" onClick={() => form.remReaj(r.id)} title="Remover índice" className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>

      {open && (
        <div className="p-3 space-y-3">
          {/* cadastro do índice */}
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Índice de reajuste</span>
              {ro
                ? <span className={cn(readCls, 'text-xs')}>{indiceLabel || '—'}</span>
                : (
                  <select value={r.indice} onChange={e => form.updReaj(r.id, 'indice', e.target.value)} className={cell}>
                    <option value="">Selecione...</option>
                    {r.indice && !indices.active.some(i => i.id === r.indice) && <option value={r.indice}>{indiceLabel}</option>}
                    {opts.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                  </select>
                )}
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Data base de reajuste</span>
              {ro
                ? <span className={cn(readCls, 'text-xs')}>{fmtMesAnoBR(r.data)}</span>
                : <input type="month" value={r.data.slice(0, 7)} onChange={e => form.updReaj(r.id, 'data', e.target.value ? `${e.target.value}-01` : '')} className={cell} />}
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Periodicidade</span>
              {ro
                ? <span className={cn(readCls, 'text-xs')}>{r.periodicidade || '—'}</span>
                : (
                  <select value={r.periodicidade} onChange={e => form.updReaj(r.id, 'periodicidade', e.target.value)} className={cell}>
                    <option value="">Selecione...</option>
                    {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
            </label>
          </div>

          {/* política do motor de datas para esta linha — é AQUI que o reajuste automático
              é autorizado. Não há interruptor global: o freio de emergência (Notificações)
              só serve para PARAR o motor, nunca para habilitá-lo. */}
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Aplicação</span>
              {ro
                ? <span className={cn(readCls, 'text-xs')}>{APLICACOES_REAJUSTE.find(a => a.value === (r.aplicacao || 'MANUAL'))?.label ?? '—'}</span>
                : (
                  <select value={pendente ? 'AUTOMATICA' : (r.aplicacao || 'MANUAL')} onChange={e => escolherAplicacao(e.target.value)} className={cell}>
                    {APLICACOES_REAJUSTE.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                )}
            </label>
            {!pendente && (r.aplicacao || 'MANUAL') === 'AUTOMATICA' && (
              <p className="col-span-2 self-end pb-1 text-[10px] text-muted-foreground">
                O motor aplica quando a competência vence e o índice do período está publicado: o percentual incide sobre cada parcela a vencer. Parcelas já pagas não são reprecificadas.
              </p>
            )}
          </div>

          {/* CONSENTIMENTO INFORMADO: o número, antes do clique que não tem volta */}
          {pendente && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                Esta linha tem {pendente.passos.length} reajuste{pendente.passos.length > 1 ? 's' : ''} represado{pendente.passos.length > 1 ? 's' : ''} desde {fmtMesAnoBR(pendente.passos[0].competencia)}.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-400">
                Ao salvar, a próxima execução do motor aplicará {pendente.passos.length > 1 ? 'todos' : 'ele'} de uma vez: a parcela passa de{' '}
                <strong className="font-semibold tabular-nums">{money(pendente.passos[0].parcelaDe)}</strong> para{' '}
                <strong className="font-semibold tabular-nums">{money(pendente.passos[pendente.passos.length - 1].parcelaPara)}</strong>, e o valor do contrato de{' '}
                <strong className="font-semibold tabular-nums">{money(pendente.totalDe)}</strong> para{' '}
                <strong className="font-semibold tabular-nums">{money(pendente.totalPara)}</strong>. Parcelas já pagas não são reprecificadas.
              </p>
              {pendente.motivo === 'SEM_SERIE' && pendente.proxima && (
                <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-500">
                  A cadeia para em {fmtMesAnoBR(pendente.proxima)}: o índice desse período ainda não foi publicado.
                </p>
              )}

              <button type="button" onClick={() => setVerPassos(x => !x)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-300">
                <Eye className="h-3 w-3" />{verPassos ? 'Ocultar simulação' : 'Ver simulação'}
              </button>
              {verPassos && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded border border-amber-200 bg-background/60 dark:border-amber-900">
                  <div className="grid grid-cols-[5.5rem_4rem_1fr] gap-2 border-b border-amber-200 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground dark:border-amber-900">
                    <span>Competência</span><span>%</span><span>Parcela</span>
                  </div>
                  {pendente.passos.map(s => (
                    <div key={s.competencia} className="grid grid-cols-[5.5rem_4rem_1fr] gap-2 px-2 py-0.5 text-[10px] tabular-nums">
                      <span>{fmtMesAnoBR(s.competencia)}</span>
                      <span>{s.percentual.toFixed(2).replace('.', ',')}%</span>
                      <span>{money(s.parcelaDe)} → {money(s.parcelaPara)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={confirmarAuto} className="h-7 rounded-md bg-amber-600 px-3 text-[11px] font-medium text-white transition-colors hover:bg-amber-700">
                  Entendi, ativar
                </button>
                <button type="button" onClick={() => setPendente(null)} className="h-7 rounded-md border border-amber-300 px-3 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* histórico de reajustes aplicados deste índice */}
          <ReajusteRealizados form={form} indices={indices} linha={r} ro={ro} />
        </div>
      )}
    </div>
  )
}

const REAJ_BASES = [
  { v: 'total',   l: 'Valor total' },
  { v: 'parcela', l: 'Parcela'     },
]
const baseCurta = (b: string) => (b === 'parcela' ? 'Parcela' : 'Total')

/** Histórico de reajustes aplicados de UM índice (dentro do card do índice). Registra o FATO
 *  do reajuste (a próxima data segue derivada). Operável mesmo com o cadastro travado (como
 *  lançamentos), persistido pelo botão "Salvar". Base Valor total | Parcela com default inteligente;
 *  ao reajustar a PARCELA em prazo determinado, o novo total ACRESCENTA o stream: total + nova parcela × parcelas. */
function ReajusteRealizados({ form, indices, linha, ro }: { form: ContractForm; indices: ReturnType<typeof useLookupTable>; linha: CReajuste; ro?: boolean }) {
  const v = form.values
  const indiceVals = useIndiceValores()
  const [aberto, setAberto]             = useState(false)
  const [competencia, setCompetencia]   = useState('')
  const [percentual, setPercentual]     = useState('')
  const [base, setBase]                 = useState('total')
  const [valorAnterior, setValorAnt]    = useState('')
  const [valorNovo, setValorNovo]       = useState('')
  const [parcelaAnterior, setParcAnt]   = useState('')
  const [parcelaNova, setParcNova]      = useState('')
  const [parcelasReaj, setParcelasReaj] = useState('')   // fallback: nº de parcelas quando NÃO há cronograma
  const [observacao, setObservacao]     = useState('')
  const [erro, setErro]                 = useState<string | null>(null)

  const moedaFmt = (s: string | number) => `${v.moeda ? v.moeda + ' ' : ''}${(Number(s) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const realizados = (v.reajustesRealizados ?? []).filter(x => x.reajusteId === linha.id).sort((a, b) => (a.competencia < b.competencia ? 1 : -1))
  const temCrono = temCronograma(v)
  /* competência não pode ser futura: reajuste realizado é um fato (já ocorreu) */
  const mesAtual = currentComp()

  /* default inteligente: contrato com parcela → 'parcela'; senão 'total' */
  const baseInteligente = () => (parcelaVigente(v) > 0 ? 'parcela' : 'total')

  /* sugere a competência = a próxima do core; se for futura, não sugere nada
     (não há reajuste a aplicar ainda) */
  const sugereCompetencia = () => {
    const prox = comp(proximaDataReajuste(v, linha))
    return prox && prox <= mesAtual ? prox : ''
  }
  /* % ACUMULADO do índice na janela da periodicidade, pela série mensal guardada. */
  const acumulado = (cmp: string) => acumuladoPeriodo(indiceVals.serieDe(linha.indice), linha.periodicidade, cmp)
  const sugerido = acumulado(competencia)?.percentual ?? null

  /* Preview = o MESMO cálculo do registro (core.aplicarReajuste), só que descartado.
     Garante que o número que o usuário vê na caixa é exatamente o que será gravado. */
  const f2 = (n: unknown) => (Number(n) || 0).toFixed(2)
  const previa = (pctStr: string, b: string, vAnt: string, pAnt: string, cmp: string, parcReaj: string) => {
    if (!cmp) return
    const p  = parseFloat(String(pctStr).replace(',', '.')) || 0
    const pa = parseFloat(pAnt) || 0
    const va = parseFloat(vAnt) || 0
    /* sem percentual, a nova parcela é a que o usuário digitou (o campo é livre) */
    const novaManual = pa && p ? undefined : (parseFloat(parcelaNova) || 0) || undefined
    const res = aplicarReajuste(v, {
      id: '', reajusteId: linha.id, competencia: cmp, percentual: p, base: b as 'total' | 'parcela',
      valorAnterior:   b === 'total'   ? va : undefined,
      parcelaAnterior: b === 'parcela' ? pa : undefined,
      parcelaNova:     b === 'parcela' ? novaManual : undefined,
      qtdParcelas:     b === 'parcela' && !temCrono ? parseInt(parcReaj, 10) || 0 : undefined,
    })
    if (b === 'total') {
      if (va && p) setValorNovo(f2(res.reajuste.valorNovo))
      return
    }
    if (pa && p) setParcNova(f2(res.reajuste.parcelaNova))
    setValorAnt(f2(res.reajuste.valorAnterior))
    if (Number(res.reajuste.parcelaNova)) setValorNovo(f2(res.reajuste.valorNovo))
  }
  /* usa o % acumulado da periodicidade p/ pré-preencher e recalcular */
  const aplicarSugestao = (cmp: string, b: string, vAnt: string, pAnt: string, parcReaj: string) => {
    const sug = acumulado(cmp)?.percentual
    if (sug != null) { const s = sug.toFixed(2); setPercentual(s.replace('.', ',')); previa(s, b, vAnt, pAnt, cmp, parcReaj) }
  }

  const abrir = () => {
    const b    = baseInteligente()
    const cmp  = sugereCompetencia()
    const vAnt = b === 'total' ? (valorVigente(v) ? f2(valorVigente(v)) : '') : ''
    const pAnt = b === 'parcela' ? parcelaVigenteInput(v) : ''
    const pReaj = (b === 'parcela' && !temCrono) ? (v.qtdParcelas || '') : ''
    setCompetencia(cmp); setBase(b)
    setPercentual(''); setValorAnt(vAnt); setValorNovo(''); setParcAnt(pAnt); setParcNova(''); setParcelasReaj(pReaj); setObservacao(''); setErro(null)
    setAberto(true)
    if (cmp) aplicarSugestao(cmp, b, vAnt, pAnt, pReaj)
  }
  const onBase = (b: string) => {
    const vAnt  = b === 'total'   ? (valorAnterior   || (valorVigente(v) ? f2(valorVigente(v)) : '')) : valorAnterior
    const pAnt  = b === 'parcela' ? (parcelaAnterior || parcelaVigenteInput(v)) : parcelaAnterior
    const pReaj = (b === 'parcela' && !temCrono) ? (parcelasReaj || v.qtdParcelas || '') : parcelasReaj
    setBase(b); setValorAnt(vAnt); setParcAnt(pAnt); setParcelasReaj(pReaj); previa(percentual, b, vAnt, pAnt, competencia, pReaj)
  }
  const onCompetencia = (cmp: string) => { setCompetencia(cmp); aplicarSugestao(cmp, base, valorAnterior, parcelaAnterior, parcelasReaj) }
  const onPercentual = (p: string) => { setPercentual(p); previa(p, base, valorAnterior, parcelaAnterior, competencia, parcelasReaj) }
  const onValorAnterior   = (val: string) => { setValorAnt(val); previa(percentual, base, val, parcelaAnterior, competencia, parcelasReaj) }
  const onParcelaAnterior = (val: string) => { setParcAnt(val); previa(percentual, base, valorAnterior, val, competencia, parcelasReaj) }
  const onParcelasReaj    = (val: string) => { setParcelasReaj(val); previa(percentual, base, valorAnterior, parcelaAnterior, competencia, val) }

  /* Registrar = core.aplicarReajuste + persistir. Toda a regra (delta, reprecificação,
     quais parcelas entram) vive no core — a MESMA função que o backend usará. */
  const registrar = () => {
    if (!linha.indice) { setErro('Defina o índice deste reajuste acima primeiro.'); return }
    if (!competencia)  { setErro('Informe a competência (mês/ano).'); return }
    if (competencia > mesAtual) { setErro(`A competência não pode ser futura — o reajuste ainda não ocorreu (mês atual: ${fmtMesAnoBR(mesAtual)}).`); return }
    if (base === 'total'   && !(parseFloat(valorNovo) > 0))   { setErro('Informe o novo valor total.'); return }
    if (base === 'parcela' && !(parseFloat(parcelaNova) > 0)) { setErro('Informe a nova parcela.'); return }

    const { reajuste, pagamentos, recebimentos } = aplicarReajuste(v, {
      id: uid(), reajusteId: linha.id, competencia, base: base as 'total' | 'parcela',
      percentual: parseFloat(String(percentual).replace(',', '.')) || 0,
      indiceSnapshot: labelOf(indices.entries, linha.indice) || '',
      observacao: observacao.trim(),
      dataAplicacao: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      /* os campos do formulário são livres — o que o usuário digitou manda sobre o % */
      valorAnterior:   base === 'total'   ? parseFloat(valorAnterior)   || 0 : undefined,
      valorNovo:       base === 'total'   ? parseFloat(valorNovo)       || 0 : undefined,
      parcelaAnterior: base === 'parcela' ? parseFloat(parcelaAnterior) || 0 : undefined,
      parcelaNova:     base === 'parcela' ? parseFloat(parcelaNova)     || 0 : undefined,
      qtdParcelas:     base === 'parcela' && !temCrono ? parseInt(parcelasReaj, 10) || 0 : undefined,
    })

    /* o core devolve números; o formulário guarda strings */
    const rec: CReajusteRealizado = {
      ...newCReajusteRealizado(linha.id),
      id: reajuste.id, competencia: reajuste.competencia,
      indiceSnapshot: reajuste.indiceSnapshot ?? '', base: reajuste.base ?? base,
      percentual: percentual ? String(reajuste.percentual) : '',
      valorAnterior: String(reajuste.valorAnterior), valorNovo: String(reajuste.valorNovo),
      parcelaAnterior: String(reajuste.parcelaAnterior), parcelaNova: String(reajuste.parcelaNova),
      parcelasReajustadas: String(reajuste.parcelasReajustadas),
      dataAplicacao: reajuste.dataAplicacao ?? '', observacao: reajuste.observacao ?? '',
      createdAt: reajuste.createdAt ?? '',
    }
    const toStr = (arr: CoreLancamento[]): CLancamento[] => arr.map(l => ({ ...l, valor: String(l.valor) }) as CLancamento)
    form.setValues(p => ({
      ...p,
      reajustesRealizados: [...(p.reajustesRealizados ?? []), rec],
      pagamentos: toStr(pagamentos), recebimentos: toStr(recebimentos),
    }))
    setAberto(false)
  }

  const fmtComp = (c: string) => fmtMesAnoBR(c)
  const transicao = (r: CReajusteRealizado) => r.base === 'parcela'
    ? `${moedaFmt(r.parcelaAnterior)} → ${moedaFmt(r.parcelaNova)}`
    : `${moedaFmt(r.valorAnterior)} → ${moedaFmt(r.valorNovo)}`
  const selCls  = cn(inputCls, 'h-7')
  const readCls2 = cn(selCls, 'bg-muted/40 text-muted-foreground')
  const alvoCount = parcelasAlvo(v, competencia).length  // parcelas do cronograma que serão reprecificadas

  return (
    <div className="space-y-2 pt-3 border-t border-border/60">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reajustes aplicados</p>
        {!aberto && (
          linha.indice
            ? <button type="button" onClick={abrir} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Registrar reajuste</button>
            : <span className="text-[10px] text-muted-foreground">Defina o índice para registrar</span>
        )}
      </div>

      {realizados.length === 0 && !aberto ? (
        <p className="text-xs text-muted-foreground">Nenhum reajuste aplicado.</p>
      ) : realizados.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className="grid grid-cols-[6.5rem_5rem_4.5rem_1fr_1.25rem] items-center gap-2 px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Competência</span><span>Percentual</span><span>Base</span><span>Ant. → novo</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {realizados.map(r => (
              <div key={r.id} className="group grid grid-cols-[6.5rem_5rem_4.5rem_1fr_1.25rem] items-center gap-2 px-3 py-1.5 hover:bg-muted/30">
                <span className="text-xs font-medium tabular-nums">{fmtComp(r.competencia)}</span>
                <span className="text-xs tabular-nums">{r.percentual ? `${r.percentual.replace('.', ',')}%` : '—'}</span>
                <span className="text-[10px]"><span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/70">{baseCurta(r.base)}</span></span>
                <span className="text-xs tabular-nums truncate" title={r.base === 'parcela' && Number(r.parcelasReajustadas) ? `${r.parcelasReajustadas} parcela(s)` : undefined}>{transicao(r)}</span>
                {/* travado: registra reajuste realizado, mas EXCLUIR exige abrir para revisão */}
                {ro ? <span /> : <button type="button" onClick={() => form.remReajRealizado(r.id)} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {aberto && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Competência (mês/ano)</span>
              <input type="month" value={competencia} max={mesAtual} onChange={e => onCompetencia(e.target.value)} className={selCls} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Reajustar</span>
              <select value={base} onChange={e => onBase(e.target.value)} className={selCls}>
                {REAJ_BASES.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                Percentual aplicado (%)
                {sugerido != null && <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-normal">· acumulado {stepMeses(linha.periodicidade)}m: {sugerido.toFixed(2).replace('.', ',')}%</span>}
              </span>
              <input value={percentual} onChange={e => onPercentual(e.target.value)} placeholder="0,00" className={selCls} />
            </label>
            {base === 'total' ? (
              <>
                <label className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Valor total anterior</span>
                  <input value={valorAnterior} onChange={e => onValorAnterior(e.target.value)} placeholder="0,00" className={selCls} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Novo valor total</span>
                  <input value={valorNovo} onChange={e => setValorNovo(e.target.value)} placeholder="0,00" className={selCls} />
                </label>
              </>
            ) : (
              <>
                <label className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Parcela anterior</span>
                  <input value={parcelaAnterior} onChange={e => onParcelaAnterior(e.target.value)} placeholder="0,00" className={selCls} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Nova parcela</span>
                  <input value={parcelaNova} onChange={e => setParcNova(e.target.value)} placeholder="0,00" className={selCls} />
                </label>
                {temCrono ? (
                  <div className="col-span-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                    {alvoCount > 0
                      ? <>Serão atualizadas <span className="font-semibold text-foreground">{alvoCount}</span> parcela(s) a vencer do cronograma (a partir de {fmtMesAnoBR(competencia)}) para <span className="font-semibold text-foreground tabular-nums">{moedaFmt(parcelaNova)}</span>. Parcelas já pagas ficam intactas.</>
                      : <>Nenhuma parcela a vencer no cronograma a partir de {competencia ? fmtMesAnoBR(competencia) : '—'}. As próximas parcelas geradas já usarão o novo valor.</>}
                  </div>
                ) : (
                  <label className="space-y-1">
                    <span className="text-[10px] font-medium text-muted-foreground">Parcelas a reajustar</span>
                    <input type="number" min="0" step="1" value={parcelasReaj} onChange={e => onParcelasReaj(e.target.value)} placeholder={v.qtdParcelas || 'Ex: 12'} className={selCls} />
                  </label>
                )}
                <label className={cn('space-y-1', temCrono ? 'col-span-2' : '')}>
                  <span className="text-[10px] font-medium text-muted-foreground">Novo valor total do contrato (calculado)</span>
                  <input value={valorNovo} readOnly title="Total vigente + efeito do reajuste de parcela" className={readCls2} />
                </label>
              </>
            )}
            <label className="space-y-1 col-span-2">
              <span className="text-[10px] font-medium text-muted-foreground">Observação</span>
              <input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" className={selCls} />
            </label>
          </div>
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={registrar} className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Registrar</button>
          </div>
        </div>
      )}
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

/** HTML da janela do anexo — moldura branded Nxt que segue o TEMA (claro/escuro) do usuário. */
function anexoShell(name: string, url: string | null, isImg: boolean, isDark: boolean): string {
  const pal = isDark
    ? '--head:#0C1410;--bg:#0a130e;--line:#1b2a22;--tx:#e6efe9;--mu:#8aa397;--em:#18C07A'
    : '--head:#ffffff;--bg:#f4f7f5;--line:#e4eae7;--tx:#0C1410;--mu:#5b6b63;--em:#18C07A'
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  const n = esc(name)
  const inner = url
    ? (isImg ? `<img src="${url}" alt="${n}"/>` : `<iframe src="${url}#toolbar=1&navpanes=0" title="${n}"></iframe>`)
    : `<div class="ld"><div class="sp"></div><span>Carregando…</span></div>`
  const dl = url ? `<a class="btn" href="${url}" download="${n}">Baixar</a>` : ''
  /* logo oficial (Nxt-icone-app-primario): tile Forest Ink + barra Esmeralda + chevron Lime */
  const logo = `<svg viewBox="0 0 120 120" width="30" height="30" aria-label="Nxt"><rect width="120" height="120" rx="28" fill="#0C1410"/><rect x="37" y="36" width="10" height="48" rx="2" fill="#18C07A"/><polyline points="58,38 84,60 58,82" fill="none" stroke="#C6F24E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${n} — Nxt</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
:root{${pal}}
html,body{height:100%}
body{background:var(--bg);color:var(--tx);font-family:"Manrope",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:14px;padding:10px 18px;background:var(--head);border-bottom:1px solid var(--line);flex:0 0 auto}
.brand{display:flex;align-items:center;gap:9px}
.brand svg{box-shadow:0 2px 10px rgba(0,0,0,.4);border-radius:8px}
.brand .w{font-weight:800;letter-spacing:-.02em;font-size:17px;line-height:1}
.brand .w .x{color:var(--em)}
.sep{width:1px;height:22px;background:var(--line)}
.name{flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;height:32px;padding:0 16px;border:1px solid var(--em);border-radius:8px;color:var(--em);text-decoration:none;font-size:13px;font-weight:700;transition:all .15s}
.btn:hover{background:var(--em);color:#04110b}
main{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:${isImg ? '28px' : '0'};overflow:auto}
iframe{width:100%;height:100%;border:0;background:#fff}
img{max-width:100%;max-height:100%;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.55)}
.ld{display:flex;flex-direction:column;align-items:center;gap:14px;color:var(--mu);font-size:13px}
.sp{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--em);border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
</style></head><body>
<header><div class="brand">${logo}<span class="w">N<span class="x">x</span>t</span></div><div class="sep"></div><div class="name">${n}</div>${dl}</header>
<main>${inner}</main>
</body></html>`
}

/** Abre o anexo numa JANELA separada (não integrada) com moldura Nxt — o usuário navega
 *  pelo sistema em paralelo. Retorna mensagem de erro, ou null em caso de sucesso. */
async function openAnexoJanela(key: string, name: string): Promise<string | null> {
  /* segue o tema do usuário (next-themes aplica a classe `dark` no <html>) */
  const isDark = document.documentElement.classList.contains('dark')
  const W = 1200, H = 860
  const left = Math.max(0, Math.round((window.screen.width - W) / 2))
  const top  = Math.max(0, Math.round((window.screen.height - H) / 2))
  const win = window.open('', '_blank', `popup,width=${W},height=${H},left=${left},top=${top},resizable=yes,scrollbars=yes`)
  if (!win) return 'Permita pop-ups para visualizar o documento.'
  try { win.document.write(anexoShell(name, null, false, isDark)); win.document.close() } catch { /* ignore */ }
  try {
    const res = await apiFetch(`/api/files/${encodeURIComponent(key)}`)
    if (!res.ok) throw new Error('falha')
    const url = URL.createObjectURL(await res.blob())
    if (win.closed) { URL.revokeObjectURL(url); return null }
    const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
    win.document.open(); win.document.write(anexoShell(name, url, isImg, isDark)); win.document.close()
    win.focus()
    const timer = setInterval(() => { if (win.closed) { clearInterval(timer); URL.revokeObjectURL(url) } }, 1000)
    return null
  } catch {
    try { win.close() } catch { /* ignore */ }
    return 'Falha ao abrir'
  }
}

function DocumentoCard({ doc, idx, ro, form, open, onToggle, onCollapse }: { doc: CDocumento; idx: number; ro?: boolean; form: ContractForm; open: boolean; onToggle: () => void; onCollapse: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'up' | 'down' | 'view' | null>(null)
  const [err, setErr]   = useState('')
  const canPreview = isPreviewable(doc.arquivo_nome)

  /* abre o anexo numa janela separada (moldura Nxt) — não bloqueia a navegação */
  const handlePreview = async () => {
    if (!doc.arquivo_key) return
    setErr(''); setBusy('view')
    const e = await openAnexoJanela(doc.arquivo_key, doc.arquivo_nome || 'documento')
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

  /* Remover LIMPA A REFERÊNCIA, não apaga o arquivo — mesma regra do comprovante de parcela
     e do anexo de aditivo. O DELETE imediato criava um ponteiro para o vazio: quem removesse
     e fechasse a tela sem salvar deixava a key no banco e o storage sem o arquivo (a única
     forma conhecida de perder um anexo em silêncio). Referência perdida sem salvar é
     reversível (basta não salvar); arquivo apagado, não. O órfão é tratado por varredura. */
  const handleRemoveFile = () => form.patchDoc(doc.id, { arquivo_key: '', arquivo_nome: '' })

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
        {/* excluir só com o contrato ABERTO para edição — travado exige "abrir para revisão"
            (excluir um documento é correção destrutiva, não operação do contrato ativo) */}
        {!ro && <button type="button" onClick={() => form.remDoc(doc.id)} title="Excluir documento" className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
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
/** Uma linha de parte-PESSOA (responsável): papel + usuário. Persiste em role_assignments. */
interface PartePessoa { key: string; papelId: string; userId: string; userName?: string }
interface ApiAssignment { id: string; papelId: string; userId: string; userName: string; userEmail: string }

/** "Partes envolvidas" do contrato: UMA lista só. Cada linha tem um papel; se o papel
 *  é de ENTIDADE (Contratante…), escolhe-se a entidade (empresa/parceiro/unidade); se
 *  é de PESSOA (Gestor…), escolhe-se o usuário. Entidades vivem em Contract.partes;
 *  pessoas em role_assignments (para o motor de workflow). A UI é unificada. */
export function PartesFields({ form, ro, onOpenSearch, onNewPartner, contractId }: {
  form: ContractForm; ro?: boolean
  onOpenSearch: (parteId: string, origem: string, excludeIds: string[]) => void
  onNewPartner: () => void
  contractId?: string
}) {
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { users } = useSelectableUsers()
  const papeisEntidade = papeis.active.filter(p => referenciaDoPapelEntry(p) === REFERENCIA.ENTIDADE)
  const papeisPessoa   = papeis.active.filter(p => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA && p.origem === ORIGEM.CONTRATO)
  const isPessoaPapel  = (id: string) => papeisPessoa.some(p => p.id === id)
  // No contrato NÃO salvo (sem id) não dá para atribuir pessoas (precisam de role_assignments).
  const podePessoa = !!contractId
  const papelOptions = podePessoa ? [...papeisEntidade, ...papeisPessoa] : papeisEntidade
  const v = form.values

  // ── Partes-PESSOA (responsáveis) — store relacional role_assignments ──
  const [people, setPeople] = useState<PartePessoa[]>([])
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  useEffect(() => {
    if (!contractId) { setPeople([]); return }
    let alive = true
    void apiJson<ApiAssignment[]>(`/api/role-assignments?entityType=CONTRATO&entityId=${contractId}`)
      .then(list => { if (alive) setPeople((list ?? []).map(a => ({ key: a.id, papelId: a.papelId, userId: a.userId, userName: a.userName }))) })
    return () => { alive = false }
  }, [contractId])
  const persistPeople = (next: PartePessoa[]) => {
    setPeople(next)
    if (!contractId) return
    const items = next.filter(r => r.papelId && r.userId).map(r => ({ papelId: r.papelId, userId: r.userId }))
    setSaving('saving')
    void apiFetch('/api/role-assignments', { method: 'PUT', body: JSON.stringify({ entityType: 'CONTRATO', entityId: contractId, items }) })
      .then(res => setSaving(res.ok ? 'saved' : 'idle')).catch(() => setSaving('idle'))
  }
  const userName = (r: PartePessoa) => r.userName ?? users.find(u => u.id === r.userId)?.name ?? '(usuário removido)'

  const partesList = ro ? partesVigentes(v) : v.partes
  const isEmpty = partesList.length === 0 && people.length === 0
  const COLS = 'grid grid-cols-[12rem_1fr_10rem_1.25rem] items-center gap-2'

  // Troca de papel numa linha de ENTIDADE: se virar papel de PESSOA, CONVERTE a linha.
  const onEntityPapel = (p: { id: string; papel: string }, val: string) => {
    if (isPessoaPapel(val)) { form.remParte(p.id); persistPeople([...people, { key: `p_${Date.now()}`, papelId: val, userId: '' }]); return }
    const origemAntes = origemDoPapel(papeis.active, p.papel)
    form.updParte(p.id, 'papel', val)
    if (origemDoPapel(papeis.active, val) !== origemAntes) form.setParteEntity(p.id, { ref_tipo: '', ref_id: '', nome: '', documento: '' })
  }
  // Troca de papel numa linha de PESSOA: se virar papel de ENTIDADE, CONVERTE a linha.
  const onPersonPapel = (r: PartePessoa, val: string) => {
    if (!isPessoaPapel(val)) { persistPeople(people.filter(x => x.key !== r.key)); form.addParte(val); return }
    persistPeople(people.map(x => x.key === r.key ? { ...x, papelId: val } : x))
  }

  // Função (não componente) para não criar fronteira de remontagem no <select>.
  const papelSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={cn(inputCls, 'h-7')}>
      <option value="">Selecione...</option>
      {value && !papelOptions.some(pp => pp.id === value) && <option value={value}>{labelOf(papeis.entries, value)}</option>}
      {papeisEntidade.map(pp => <option key={pp.id} value={pp.id}>{pp.label}</option>)}
      {podePessoa && papeisPessoa.map(pp => <option key={pp.id} value={pp.id}>{pp.label}</option>)}
    </select>
  )

  return (
    <div className="space-y-2">
      {isEmpty ? (
        <p className="text-xs text-muted-foreground">Nenhuma parte.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className={cn(COLS, 'px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Papel</span><span>Nome / Responsável</span><span>Documento</span><span />
          </div>
          <div className="divide-y divide-border/50">
            {/* Linhas de ENTIDADE (empresa/parceiro/unidade) */}
            {partesList.map((p, idx) => {
              const origem = origemDoPapel(papeis.active, p.papel)
              const isUnidade = origem === ORIGEM.UNIDADE
              const open = () => {
                if (!p.papel || ro) return
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
                    papelSelect(p.papel, val => onEntityPapel(p, val))
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
            {/* Linhas de PESSOA (responsáveis) — mesma tabela, sem divisão */}
            {people.map((r) => (
              <div key={r.key} className={cn(COLS, 'group px-3 py-1.5 hover:bg-muted/30')}>
                {ro ? (
                  <span className="text-xs font-medium truncate">{labelOf(papeis.entries, r.papelId) || '—'}</span>
                ) : (
                  papelSelect(r.papelId, val => onPersonPapel(r, val))
                )}
                {ro ? (
                  <span className="text-xs truncate">{userName(r)}</span>
                ) : (
                  <UserSelect value={r.userId || undefined} onChange={id => persistPeople(people.map(x => x.key === r.key ? { ...x, userId: id ?? '', userName: undefined } : x))} placeholder="Selecionar responsável..." />
                )}
                <span className="text-[11px] text-muted-foreground truncate">—</span>
                {!ro ? (
                  <button type="button" onClick={() => persistPeople(people.filter(x => x.key !== r.key))} title="Remover" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                ) : <span />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cessões: histórico de troca de parte por aditivo (só em leitura) — nada some */}
      {ro && (() => {
        const cess = historicoCessoes(v)
        if (cess.length === 0) return null
        return (
          <HistBlock title="Cessões" count={cess.length}>
            {cess.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{labelOf(papeis.entries, s.papel)}</span>
                <span className="text-muted-foreground/60 line-through truncate max-w-[200px]">{s.de}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium truncate max-w-[200px]">{s.para}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.aditivo}{s.data ? ` · ${fmtDataBR(s.data)}` : ''}</span>
              </div>
            ))}
          </HistBlock>
        )
      })()}

      {!ro && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => form.addParte('')} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar parte</button>
          <button type="button" onClick={onNewPartner} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"><Plus className="h-3 w-3" />Cadastrar novo parceiro</button>
          {saving === 'saving' && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />salvando…</span>}
          {saving === 'saved' && <span className="text-[11px] text-primary">salvo</span>}
          {!podePessoa && <span className="text-[11px] text-muted-foreground">· salve o contrato para adicionar pessoas responsáveis</span>}
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
  const condicoes = useLookupTable(CONDICOES_KEY, INIT_CONDICOES)

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
  /* abre o anexo do aditivo numa janela separada (moldura Nxt) — não bloqueia a navegação */
  const handlePreview = async () => {
    if (!a.arquivo_key) return
    setErr(''); setBusy('view')
    const e = await openAnexoJanela(a.arquivo_key, a.arquivo_nome || 'documento')
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
    if (efeitos.has('termino') && a.novoTermino) {
      const anterior = terminoVigenteAntes(v, idx)
      if (anterior && a.novoTermino <= anterior) return `O novo término deve ser posterior ao término vigente anterior (${fmtBR(anterior)}).`
    }
    if (efeitos.has('valor') && !(parseFloat(a.novoValor) > 0)) return 'Informe o acréscimo ao valor total.'
    if (efeitos.has('objeto')) {
      const base = objetoVigente(v)  // baseline (rascunho não conta)
      const objetoIgual = a.novoObjeto.length === base.length && a.novoObjeto.every(x => base.includes(x))
      if (objetoIgual && !a.novoTitulo && !a.novaDescricao) return 'Altere o objeto, o título ou a descrição do contrato.'
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
  /* rótulo do escopo pelo DIFF real (não pelo tipo): acréscimo / redução / ambos / só texto */
  const escopoChip = (() => {
    if (!a.alteraObjeto) return ''
    const antes = objetoVigenteAntes(v, idx)
    const add = a.novoObjeto.filter(x => !antes.includes(x)).length
    const rem = antes.filter(x => !a.novoObjeto.includes(x)).length
    if (add && rem) return 'Escopo alterado'
    if (add) return 'Acréscimo de escopo'
    if (rem) return 'Redução de escopo'
    return 'Escopo revisado'
  })()
  /* chips de efeito (Opção B): pílulas escaneáveis do que o aditivo altera, no lugar da string corrida */
  const chips = [
    a.alteraTermino ? (a.novoTermino ? `Novo término ${fmtBR(a.novoTermino)}` : 'Prorrogação') : '',
    a.alteraValor   ? (a.novoValor ? `+ ${v.moeda ? v.moeda + ' ' : ''}${(parseFloat(a.novoValor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Reajuste de valor') : '',
    escopoChip,
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

            {a.alteraObjeto && (
              <div className="space-y-2">
                {/* ordem do escopo: título → descrição → objeto (título/descrição opcionais) */}
                <Field label="Novo título"><Txt value={a.novoTitulo} onChange={x => form.patchAditivo(a.id, { novoTitulo: x })} ro={lock} placeholder="Deixe em branco para manter o título atual" /></Field>
                <Field label="Nova descrição"><Area value={a.novaDescricao} onChange={x => form.patchAditivo(a.id, { novaDescricao: x })} ro={lock} rows={2} placeholder="Deixe em branco para manter a descrição atual" /></Field>
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
              </div>
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
                  {/* renegociação: condição e complemento são opcionais — em branco, mantém o vigente */}
                  <Field label="Nova condição de pagamento"><Sel value={a.novaCondicaoPagamento} onChange={x => form.patchAditivo(a.id, { novaCondicaoPagamento: x })} ro={lock} options={lookupOpts(condicoes.active)} placeholder="Manter atual..." /></Field>
                </div>
                <Field label="Novo complemento do valor"><Area value={a.novoComplemento} onChange={x => form.patchAditivo(a.id, { novoComplemento: x })} ro={lock} rows={2} placeholder="Deixe em branco para manter o complemento atual" /></Field>
                <p className="text-[10px] text-muted-foreground">Somado ao valor inicial · novo valor total: <span className="font-semibold tabular-nums text-foreground">{v.moeda ? v.moeda + ' ' : ''}{totalApos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
              </div>
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
