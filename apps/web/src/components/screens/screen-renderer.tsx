'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Screen, ScreenField } from '@/lib/screen-types'

const inputCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const readCls  = 'text-xs text-foreground/90 py-1'

interface Props {
  screen: Screen
  /** valores dos campos CUSTOM, por fieldId. */
  values?: Record<string, string>
  onChange?: (fieldId: string, value: string) => void
  /** leitura (sem edição). Campos com mode=VIEW também renderizam como leitura. */
  ro?: boolean
  /** resolve o valor de um campo NATIVE (visão) pela nativeKey. */
  nativeValue?: (key: string) => string
}

/**
 * Renderiza uma Tela (seções + campos) como o usuário final a vê. Campos NATIVE
 * mostram o dado nativo (via `nativeValue`); campos CUSTOM são inputs controlados
 * por `values`/`onChange`. Usado no preview do construtor e no formulário real.
 */
export function ScreenRenderer({ screen, values = {}, onChange, ro, nativeValue }: Props) {
  const sections = [...screen.sections].filter(s => s.visible !== false).sort((a, b) => a.order - b.order)
  const fieldsOf = (sectionId: string) =>
    screen.fields.filter(f => f.sectionId === sectionId && f.visible !== false).sort((a, b) => a.order - b.order)
  // Órfão = campo sem seção, OU cuja seção nem existe. Campo de seção OCULTA não é órfão:
  // ele simplesmente não aparece (a seção some), exatamente como no cadastro real.
  const allSectionIds = new Set(screen.sections.map(s => s.id))
  const looseFields = screen.fields.filter(f => f.visible !== false && (!f.sectionId || !allSectionIds.has(f.sectionId)))

  if (screen.fields.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">Nenhum campo ainda. Adicione seções e campos para ver a prévia.</p>
  }

  return (
    <div className="space-y-2">
      {sections.map(s => {
        const fs = fieldsOf(s.id)
        if (fs.length === 0) return null
        return <Section key={s.id} label={s.label} defaultOpen={s.defaultOpen}>{fs.map(renderField)}</Section>
      })}
      {looseFields.length > 0 && (
        <Section label="Sem seção" defaultOpen>{looseFields.map(renderField)}</Section>
      )}
    </div>
  )

  function renderField(f: ScreenField) {
    const isView = ro || f.mode === 'VIEW'
    const span = f.type === 'textarea' ? 'sm:col-span-2' : ''
    return (
      <div key={f.id} className={cn('space-y-0.5', span)}>
        <label className="text-[11px] font-medium text-muted-foreground">
          {f.label}{f.required && !isView && <span className="text-red-500"> *</span>}
        </label>
        {f.source === 'NATIVE'
          ? <NativeValue value={nativeValue?.(f.nativeKey ?? '') ?? ''} />
          : <CustomInput field={f} value={values[f.id] ?? ''} ro={isView} onChange={v => onChange?.(f.id, v)} />}
      </div>
    )
  }
}

function Section({ label, defaultOpen, children }: { label: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors">
        <span className="text-xs font-semibold">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>}
    </div>
  )
}

function NativeValue({ value }: { value: string }) {
  // Aparência de campo real (caixa somente-leitura), SEMPRE VAZIA no construtor —
  // o cadastro de telas é um molde e nunca exibe dados de um fornecedor.
  return (
    <div className="h-8 rounded-md border border-input/70 bg-muted/30 flex items-center px-2.5 text-xs">
      {value && <span className="text-foreground/85 truncate">{value}</span>}
    </div>
  )
}

/** Input de um campo CUSTOM (captura persistida), sem rótulo — reutilizado no
 *  cadastro dirigido pela tela (R2), envolto pelo `Field` nativo do parceiro. */
export function ScreenCustomInput(props: {
  field: ScreenField; value: string; ro?: boolean; onChange: (v: string) => void
}) {
  return <CustomInput {...props} />
}

function CustomInput({ field, value, ro, onChange }: {
  field: ScreenField; value: string; ro?: boolean; onChange: (v: string) => void
}) {
  if (ro) {
    if (field.type === 'checkbox') return <p className={readCls}>{value === '1' ? 'Sim' : 'Não'}</p>
    if (field.type === 'multiselect') {
      const arr = safeArr(value)
      const labels = arr.map(v => field.options?.find(o => o.value === v)?.label ?? v)
      return <p className={cn(readCls, !labels.length && 'text-muted-foreground')}>{labels.join(', ') || '—'}</p>
    }
    if (field.type === 'select') {
      const lbl = field.options?.find(o => o.value === value)?.label
      return <p className={cn(readCls, !lbl && 'text-muted-foreground')}>{lbl || '—'}</p>
    }
    return <p className={cn(readCls, !value && 'text-muted-foreground')}>{value || '—'}</p>
  }

  const ph = field.placeholder
  switch (field.type) {
    case 'textarea':
      return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={ph} rows={3}
        className={cn(inputCls, 'h-auto py-1.5 resize-y')} maxLength={field.validation?.maxLength} />
    case 'number':
      return <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        min={field.validation?.min} max={field.validation?.max} className={inputCls} />
    case 'currency':
      return (
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
          <input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder={ph} className={cn(inputCls, 'pl-8')} />
        </div>
      )
    case 'date':     return <input type="date" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    case 'time':     return <input type="time" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    case 'datetime': return <input type="datetime-local" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    case 'email':    return <input type="email" value={value} onChange={e => onChange(e.target.value)} placeholder={ph} className={inputCls} />
    case 'phone':    return <input type="tel" value={value} onChange={e => onChange(e.target.value)} placeholder={ph} className={inputCls} />
    case 'select':
      return (
        <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
          <option value="">Selecione...</option>
          {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    case 'multiselect': {
      const arr = safeArr(value)
      const toggle = (v: string) => {
        const next = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
        onChange(JSON.stringify(next))
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {field.options?.map(o => (
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className={cn('px-2 h-6 rounded-md border text-[11px] transition-colors',
                arr.includes(o.value) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
              {o.label}
            </button>
          ))}
          {!field.options?.length && <span className="text-[11px] text-muted-foreground">Sem opções</span>}
        </div>
      )
    }
    case 'checkbox':
      return (
        <div className="flex items-center gap-2 h-7">
          <input type="checkbox" checked={value === '1'} onChange={e => onChange(e.target.checked ? '1' : '')}
            className="h-3.5 w-3.5 accent-primary" />
          <span className="text-xs text-muted-foreground">{field.placeholder || 'Marcar'}</span>
        </div>
      )
    default:
      return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        maxLength={field.validation?.maxLength} className={inputCls} />
  }
}

function safeArr(v: string): string[] {
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] }
}
