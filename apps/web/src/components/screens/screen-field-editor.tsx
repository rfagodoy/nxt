'use client'

import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CUSTOM_FIELD_TYPES, FIELD_TYPE_LABELS, PARTNER_CATEGORIES, slug,
  type ScreenField, type ScreenFieldType, type ScreenFieldOption, type ScreenSection,
  type ScreenSubject, type PartnerCategory,
} from '@/lib/screen-types'

const ALL_CATS: PartnerCategory[] = ['PJ_BR', 'PJ_EST', 'PF_BR', 'PF_EST']

const inputCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const labelCls = 'text-xs font-medium'

/** Editor de um campo PERSONALIZADO (captura). Campos nativos não passam por aqui —
 *  são pré-carregados e só têm toggle de visibilidade no construtor. */
export function ScreenFieldEditor({ sections, subjectType, initial, defaultSectionId, onClose, onSave }: {
  sections: ScreenSection[]
  subjectType?: ScreenSubject
  initial?: ScreenField
  defaultSectionId?: string
  onClose: () => void
  onSave: (field: ScreenField) => void
}) {
  const isEdit = !!initial
  // "Obrigatório por tipo" só existe no Fornecedor (as 4 categorias são dimensão de Parceiro).
  const perType = subjectType === 'FORNECEDOR'

  const [sectionId, setSectionId] = useState(initial?.sectionId ?? defaultSectionId ?? sections[0]?.id ?? '')
  const [type,      setType]      = useState<ScreenFieldType>(initial?.type ?? 'text')
  const [name,      setName]      = useState(initial?.name ?? '')
  const [label,     setLabel]     = useState(initial?.label ?? '')
  const [required,  setRequired]  = useState(initial?.required ?? false)
  // seed dos tipos onde é obrigatório: usa requiredCategories se definido; senão, retrocompat do required global
  const [reqCats,   setReqCats]   = useState<PartnerCategory[]>(
    initial?.requiredCategories ?? (initial?.required ? ALL_CATS : []))
  const toggleReqCat = (c: PartnerCategory) =>
    setReqCats(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])
  const [placeholder, setPlaceholder] = useState(initial?.placeholder ?? '')
  const [maxLength, setMaxLength] = useState(initial?.validation?.maxLength != null ? String(initial.validation.maxLength) : '')
  const [minV,      setMinV]      = useState(initial?.validation?.min != null ? String(initial.validation.min) : '')
  const [maxV,      setMaxV]      = useState(initial?.validation?.max != null ? String(initial.validation.max) : '')
  const [options,   setOptions]   = useState<ScreenFieldOption[]>(initial?.options ?? [])
  const [err,       setErr]       = useState('')

  const addOption    = () => setOptions(p => [...p, { value: '', label: '' }])
  const removeOption = (i: number) => setOptions(p => p.filter((_, idx) => idx !== i))
  const updOption    = (i: number, k: 'value' | 'label', v: string) =>
    setOptions(p => p.map((o, idx) => idx === i ? { ...o, [k]: k === 'value' ? slug(v) : v } : o))

  const needsOptions = type === 'select' || type === 'multiselect'
  const needsMaxLen  = type === 'text' || type === 'textarea'
  const needsMinMax  = type === 'number' || type === 'currency'

  const handleSave = () => {
    if (!label.trim()) { setErr('Descrição obrigatória'); return }
    const nm = (name.trim() || slug(label))
    if (!nm) { setErr('Nome obrigatório'); return }
    onSave({
      id: initial?.id ?? `sf_${Date.now()}`,
      sectionId, name: nm, label: label.trim(), type, source: 'CUSTOM', mode: 'EDIT', visible: true,
      // Fornecedor: obrigatório por tipo (reqCats). Demais: booleano global. `required` fica coerente com o efetivo.
      required: perType ? reqCats.length > 0 : required,
      requiredCategories: perType ? reqCats : undefined,
      placeholder: placeholder.trim() || undefined, order: initial?.order ?? 0,
      options: needsOptions ? options.filter(o => o.value && o.label) : undefined,
      validation: {
        ...(needsMaxLen && maxLength ? { maxLength: Number(maxLength) } : {}),
        ...(needsMinMax && minV ? { min: Number(minV) } : {}),
        ...(needsMinMax && maxV ? { max: Number(maxV) } : {}),
      },
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[70] w-96 bg-background border-l shadow-xl flex flex-col">
        <div className="px-4 py-3 border-b bg-card flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold">{isEdit ? 'Editar campo' : 'Novo campo personalizado'}</h2>
            <p className="text-[11px] text-muted-foreground">{isEdit ? initial!.label : 'Coleta um dado novo (persistido)'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sections.length > 0 && (
            <div className="space-y-1">
              <label className={labelCls}>Seção</label>
              <select value={sectionId} onChange={e => setSectionId(e.target.value)} className={inputCls}>
                {sections.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className={labelCls}>Tipo <span className="text-red-500">*</span></label>
            <select value={type} onChange={e => setType(e.target.value as ScreenFieldType)} className={inputCls}>
              {CUSTOM_FIELD_TYPES.map(t => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          {needsOptions && (
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/40"><p className="text-xs font-semibold">Opções da lista</p></div>
              <div className="p-3 space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-4 text-center shrink-0">{idx + 1}</span>
                    <input value={opt.value} onChange={e => updOption(idx, 'value', e.target.value)} placeholder="valor" className={cn(inputCls, 'flex-1')} />
                    <input value={opt.label} onChange={e => updOption(idx, 'label', e.target.value)} placeholder="Rótulo" className={cn(inputCls, 'flex-1')} />
                    <button type="button" onClick={() => removeOption(idx)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {options.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-1">Nenhuma opção.</p>}
                <button type="button" onClick={addOption} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"><Plus className="h-3.5 w-3.5" />Adicionar opção</button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className={labelCls}>Descrição (rótulo) <span className="text-red-500">*</span></label>
            <input value={label} onChange={e => { setLabel(e.target.value); setErr('') }} placeholder="ex: Regime tributário" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Nome técnico</label>
            <input value={name} onChange={e => setName(slug(e.target.value))} placeholder={label ? slug(label) : 'ex: regime_tributario'} className={inputCls} />
            <p className="text-[11px] text-muted-foreground">Em branco = gerado da descrição.</p>
          </div>

          {needsMaxLen && (
            <div className="space-y-1">
              <label className={labelCls}>Máx. de caracteres</label>
              <input type="number" min={1} value={maxLength} onChange={e => setMaxLength(e.target.value)} placeholder="Sem limite" className={inputCls} />
            </div>
          )}
          {needsMinMax && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className={labelCls}>Mínimo</label><input type="number" value={minV} onChange={e => setMinV(e.target.value)} placeholder="—" className={inputCls} /></div>
              <div className="space-y-1"><label className={labelCls}>Máximo</label><input type="number" value={maxV} onChange={e => setMaxV(e.target.value)} placeholder="—" className={inputCls} /></div>
            </div>
          )}

          {type !== 'checkbox' && (
            <div className="space-y-1">
              <label className={labelCls}>Placeholder</label>
              <input value={placeholder} onChange={e => setPlaceholder(e.target.value)} placeholder="Texto de ajuda no campo" className={inputCls} />
            </div>
          )}

          {perType ? (
            <div className="space-y-1.5">
              <label className={labelCls}>Preenchimento obrigatório em</label>
              <div className="flex flex-wrap gap-1.5">
                {PARTNER_CATEGORIES.map(c => {
                  const on = reqCats.includes(c.value)
                  return (
                    <button key={c.value} type="button" onClick={() => toggleReqCat(c.value)}
                      className={cn('h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground'
                           : 'border-input bg-background text-muted-foreground hover:border-primary/50')}>
                      {c.short}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Nenhum selecionado = nunca obrigatório.</p>
            </div>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs">Preenchimento obrigatório</span>
            </label>
          )}

          {err && <p className="text-[11px] text-red-500">{err}</p>}
        </div>

        <div className="px-4 py-3 border-t bg-card flex items-center justify-between shrink-0">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          <button type="button" onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            {isEdit ? 'Salvar campo' : 'Adicionar campo'}
          </button>
        </div>
      </div>
    </>
  )
}
