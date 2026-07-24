'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, X, Pencil, Check, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  usePartnerFields, useFieldVisibility, useDefaultColumns,
  SECTION_LABELS, NATIVE_FIELDS, CORE_TABLE_KEYS, BASE_TABLE_COLUMNS, COLUMN_ORDER_RESET_EVENT,
  type CustomField, type FieldType, type SectionKey, type SelectOption,
} from '@/hooks/use-partner-fields'
import { usePartnerSections, type CustomSection } from '@/hooks/use-partner-sections'
import { useScreens } from '@/hooks/use-screens'
import { pickDefaultScreen } from '@/lib/screen-partner-layout'
import { FIELD_TYPE_LABELS } from '@/lib/screen-types'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Texto'           },
  { value: 'number',   label: 'Numérico'        },
  { value: 'currency', label: 'Valor'           },
  { value: 'date',     label: 'Data'            },
  { value: 'time',     label: 'Hora'            },
  { value: 'datetime', label: 'Data/hora'       },
  { value: 'checkbox', label: 'Check-box'       },
  { value: 'select',   label: 'Lista de opções' },
]

export const inputCls = 'flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

function toSlug(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/* ─── Drawer de criação/edição de campo ──────────────────── */

export function FieldDrawer({ targetSection, initialField, onClose, onSave }: {
  targetSection?: string
  initialField?: CustomField
  onClose: () => void
  onSave: (field: CustomField) => void
}) {
  const { fields } = usePartnerFields()
  const { sections: customSections } = usePartnerSections()
  const isEdit = !!initialField

  const defaultSection = targetSection ?? initialField?.section ?? 'identificacao'

  const [type,      setType]      = useState<FieldType>(initialField?.type ?? 'text')
  const [section,   setSection]   = useState<string>(defaultSection)
  const [name,      setName]      = useState(initialField?.name ?? '')
  const [label,     setLabel]     = useState(initialField?.label ?? '')
  const [maxLength, setMaxLength] = useState(initialField?.maxLength != null ? String(initialField.maxLength) : '')
  const [visForm,   setVisForm]   = useState(
    initialField ? (initialField.visible === 'form' || initialField.visible === 'both') : true,
  )
  const [visTable,  setVisTable]  = useState(
    initialField ? (initialField.visible === 'table' || initialField.visible === 'both') : false,
  )
  const [options,   setOptions]   = useState<SelectOption[]>(initialField?.options ?? [])
  const [nameErr,   setNameErr]   = useState('')
  const [labelErr,  setLabelErr]  = useState('')

  const addOption    = () => setOptions(p => [...p, { id: `o_${Date.now()}`, value: '', label: '' }])
  const removeOption = (id: string) => setOptions(p => p.filter(o => o.id !== id))
  const updateOption = (id: string, key: 'value' | 'label', val: string) =>
    setOptions(p => p.map(o => o.id === id ? { ...o, [key]: val } : o))

  const handleSave = () => {
    let ok = true
    if (!name.trim()) {
      setNameErr('Obrigatório'); ok = false
    } else {
      const dup = fields.some(f => f.name === name.trim() && f.id !== initialField?.id)
      if (dup) { setNameErr('Já existe um campo com este nome'); ok = false }
      else setNameErr('')
    }
    if (!label.trim()) { setLabelErr('Obrigatório'); ok = false } else setLabelErr('')
    if (!ok) return

    onSave({
      id:        initialField?.id ?? `cf_${Date.now()}`,
      type,
      section:   targetSection ?? section,
      name,
      label,
      maxLength: maxLength ? Number(maxLength) : undefined,
      visible:   visForm && visTable ? 'both' : visTable ? 'table' : visForm ? 'form' : 'none',
      options:   type === 'select' ? options.filter(o => o.value && o.label) : undefined,
    })
  }

  const sectionOptions = [
    ...(Object.entries(SECTION_LABELS) as [SectionKey, string][]).map(([v, l]) => ({ value: v, label: l })),
    ...customSections.map(s => ({ value: s.id, label: s.label })),
  ]

  return (
    <>
      {/* acima do FieldManagerDrawer (z-50) que o abre: o scrim tapa o vidro do pai p/ o frost não vazar texto */}
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[70] w-96 glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">

        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold">{isEdit ? 'Editar campo' : 'Novo campo'}</h2>
            <p className="text-[11px] text-muted-foreground">
              {isEdit ? `Editando: ${initialField.label}` : 'Defina as propriedades do campo'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {!targetSection && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Seção <span className="text-red-500">*</span></label>
              <select value={section} onChange={e => setSection(e.target.value)}
                className="flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                {sectionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Tipo do campo <span className="text-red-500">*</span></label>
            <select value={type} onChange={e => setType(e.target.value as FieldType)}
              className="flex h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {type === 'select' && (
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/40">
                <p className="text-xs font-semibold">Opções da lista</p>
              </div>
              <div className="p-3 space-y-2">
                {options.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 px-5 mb-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Valor (técnico)</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Rótulo exibido</p>
                  </div>
                )}
                {options.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-4 shrink-0 text-center">{idx + 1}</span>
                    <input value={opt.value}
                      onChange={e => updateOption(opt.id, 'value', toSlug(e.target.value))}
                      placeholder="valor" className={cn(inputCls, 'flex-1')} />
                    <input value={opt.label}
                      onChange={e => updateOption(opt.id, 'label', e.target.value)}
                      placeholder="Rótulo" className={cn(inputCls, 'flex-1')} />
                    <button type="button" onClick={() => removeOption(opt.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {options.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-1">Nenhuma opção adicionada.</p>
                )}
                <button type="button" onClick={addOption}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                  <Plus className="h-3.5 w-3.5" />Adicionar opção
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Nome do campo <span className="text-red-500">*</span></label>
            <input value={name} onChange={e => setName(toSlug(e.target.value))}
              placeholder="ex: numero_contrato" className={inputCls} />
            {nameErr
              ? <p className="text-[11px] text-red-500">{nameErr}</p>
              : <p className="text-[11px] text-muted-foreground">Letras minúsculas, números e _ (sem espaços)</p>
            }
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Descrição do campo <span className="text-red-500">*</span></label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="ex: Número do contrato" className={inputCls} />
            {labelErr && <p className="text-[11px] text-red-500">{labelErr}</p>}
          </div>

          {type === 'text' && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Quantidade de caracteres</label>
              <input type="number" min={1} value={maxLength}
                onChange={e => setMaxLength(e.target.value)}
                placeholder="Sem limite" className={inputCls} />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium">Exibir em</label>
            <div className="space-y-2">
              {([
                { key: 'form',  state: visForm,  set: setVisForm,  label: 'Formulário de cadastro', desc: 'Campo aparece no formulário de novo/edição de parceiro' },
                { key: 'table', state: visTable, set: setVisTable, label: 'Tabela de parceiros',    desc: 'Campo aparece como coluna extra na listagem de parceiros' },
              ] as const).map(opt => (
                <label key={opt.key} className={cn(
                  'flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                  opt.state ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                )}>
                  <input type="checkbox" checked={opt.state}
                    onChange={e => opt.set(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-primary shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between shrink-0">
          <button type="button" onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            {isEdit ? 'Salvar alterações' : 'Adicionar campo'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ─── labels de tipo ─────────────────────────────────────── */

const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto', number: 'Numérico', currency: 'Valor', date: 'Data',
  time: 'Hora', datetime: 'Data/hora', checkbox: 'Check-box', select: 'Lista',
}

/* ─── formulário inline de nova seção ───────────────────── */

function NewSectionRow({ onSave, onCancel, existingLabels }: {
  onSave: (s: CustomSection) => void
  onCancel: () => void
  existingLabels: string[]
}) {
  const [label, setLabel] = useState('')
  const [err,   setErr]   = useState('')

  const save = () => {
    if (!label.trim()) { setErr('Obrigatório'); return }
    const slug = toSlug(label.trim())
    if (existingLabels.some(l => toSlug(l) === slug)) { setErr('Já existe uma seção com esse nome'); return }
    onSave({ id: `cs_${Date.now()}`, label: label.trim(), name: slug })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/20">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
      <div className="flex-1 space-y-1">
        <input value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
          autoFocus placeholder="Nome da seção (ex: Fiscal)" className={inputCls} />
        {err && <p className="text-[11px] text-red-500">{err}</p>}
      </div>
      <button type="button" onClick={save}
        className="shrink-0 text-primary hover:text-primary/80 transition-colors">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onCancel}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/* ─── FieldManagerDrawer ─────────────────────────────────── */

type DrawerTab = 'fields' | 'sections'

/* ─── badge de visibilidade [F] / [T] ───────────────────── */

function VisBadge({ char, active, fixed, title, onClick }: {
  char: string; active: boolean; fixed?: boolean; title: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={fixed ? undefined : onClick}
      title={title}
      className={cn(
        'h-5 w-6 rounded text-[10px] font-bold border transition-colors shrink-0 leading-none',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-transparent text-muted-foreground border-input hover:border-primary/50',
        fixed && 'cursor-default opacity-60',
      )}
    >
      {char}
    </button>
  )
}

/* ─── pílula "padrão" (indica coluna padrão da tabela) ───── */

function PadraoPill({ title }: { title?: string }) {
  return (
    <span
      title={title}
      className="px-1.5 h-5 inline-flex items-center rounded text-[9px] font-semibold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20 shrink-0"
    >
      padrão
    </span>
  )
}

export function FieldManagerDrawer({ onClose }: { onClose: () => void }) {
  const { fields, removeField, addField, updateField }                          = usePartnerFields()
  const { isVisibleInForm, isVisibleInTable, setFieldVisibility }               = useFieldVisibility()
  const { isColumnVisible, toggleColumn }                                       = useDefaultColumns()
  const { sections, sectionOrder, sectionDefaultOpen, addSection, removeSection, updateSection, reorderSections, setSectionDefaultOpen } = usePartnerSections()

  const [tab,           setTab]           = useState<DrawerTab>('fields')
  const [adding,        setAdding]        = useState(false)
  const [editing,       setEditing]       = useState<CustomField | null>(null)
  const [addingSection, setAddingSection] = useState(false)

  /* estado de drag das seções */
  const [dragFrom,   setDragFrom]   = useState<number | null>(null)
  const [dragOver,   setDragOver]   = useState<number | null>(null)

  /* estado de edição inline de seção custom */
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editLabel,  setEditLabel]  = useState('')
  const [editErr,    setEditErr]    = useState('')

  /* ordem resolvida: sectionOrder + ids ainda não incluídos (nativas + socios + novas custom) */
  const nativeIds  = [...Object.keys(SECTION_LABELS), 'socios', 'historico']
  const customIds  = sections.map(s => s.id)
  const allIds     = [...nativeIds, ...customIds]
  const resolvedOrder = [
    ...sectionOrder.filter(id => allIds.includes(id)),
    ...allIds.filter(id => !sectionOrder.includes(id)),
  ]

  /* drag handlers */
  const clearDrag = () => { setDragFrom(null); setDragOver(null) }
  const handleSectionDrop = (toIdx: number) => {
    if (dragFrom === null || dragFrom === toIdx) { clearDrag(); return }
    const newOrder = [...resolvedOrder]
    const [moved] = newOrder.splice(dragFrom, 1)
    newOrder.splice(toIdx, 0, moved)
    reorderSections(newOrder)
    clearDrag()
  }

  /* edição inline de seção custom */
  const startEdit  = (s: CustomSection) => { setEditingId(s.id); setEditLabel(s.label); setEditErr('') }
  const cancelEdit = () => { setEditingId(null); setEditLabel(''); setEditErr('') }
  const saveEdit   = () => {
    if (!editLabel.trim()) { setEditErr('Obrigatório'); return }
    const s = sections.find(sec => sec.id === editingId)
    if (!s) return
    updateSection(s.id, { ...s, label: editLabel.trim(), name: toSlug(editLabel.trim()) })
    cancelEdit()
  }

  /* campos agrupados por seção (nativos + personalizados) */
  const allSectionLabels: Record<string, string> = {
    ...(Object.fromEntries((Object.entries(SECTION_LABELS) as [SectionKey, string][]))),
    socios:    'Quadro de Sócios',
    historico: 'Histórico',
    ...Object.fromEntries(sections.map(s => [s.id, s.label])),
  }
  const sectionFieldGroups = Object.entries(allSectionLabels).map(([id, label]) => ({
    id,
    label,
    nativeFields: NATIVE_FIELDS.filter(f => f.section === id),
    customFields: fields.filter(f => f.section === id),
  }))

  const handleAdd    = (field: CustomField) => { addField(field);              setAdding(false)  }
  const handleUpdate = (field: CustomField) => { updateField(field.id, field); setEditing(null)  }
  const handleRemoveSection = (sectionId: string) => {
    fields.filter(f => f.section === sectionId).forEach(f => removeField(f.id))
    removeSection(sectionId)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-96 glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">

        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Configurar campos</h2>
            <p className="text-[11px] text-muted-foreground">Campos e seções personalizados</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b bg-muted/30 shrink-0">
          {([['fields', 'Campos'], ['sections', 'Seções']] as [DrawerTab, string][]).map(([key, lbl]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors border-b-2',
                tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>
              {lbl}
            </button>
          ))}
        </div>

        {/* ─── tab: campos ─── */}
        {tab === 'fields' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-5 items-center justify-center rounded bg-primary text-primary-foreground text-[9px] font-bold">F</span>
                  Formulário
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-5 items-center justify-center rounded bg-primary text-primary-foreground text-[9px] font-bold">T</span>
                  Tabela
                </span>
                <span className="text-muted-foreground/50">— clique para alternar</span>
              </div>

              {/* colunas padrão da tabela */}
              <div className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b">
                  <p className="text-xs font-semibold">Colunas padrão da tabela</p>
                  <p className="text-[11px] text-muted-foreground">
                    Oculte da listagem o que não quiser exibir. Continuam disponíveis em filtros e exportação.
                  </p>
                </div>
                <div className="divide-y">
                  {BASE_TABLE_COLUMNS.map(col => {
                    const visible = isColumnVisible(col.key)
                    return (
                      <div key={col.key} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="text-xs font-medium truncate">{col.label}</p>
                          <PadraoPill />
                        </div>
                        <VisBadge char="T" active={visible} fixed={false}
                          title={visible ? 'Ocultar da tabela' : 'Exibir na tabela'}
                          onClick={() => toggleColumn(col.key)} />
                      </div>
                    )
                  })}
                </div>
              </div>

              {sectionFieldGroups.map(({ id, label, nativeFields, customFields }) => {
                if (nativeFields.length === 0 && customFields.length === 0) return null
                return (
                  <div key={id} className="rounded-lg border overflow-hidden">
                    <div className="px-3 py-2 bg-muted/40 border-b">
                      <p className="text-xs font-semibold">{label}</p>
                    </div>
                    <div className="divide-y">
                      {/* campos nativos */}
                      {nativeFields.map(nf => {
                        const inForm  = isVisibleInForm(nf.key)
                        const inTable = isVisibleInTable(nf.key)
                        const coreT   = CORE_TABLE_KEYS.has(nf.key)
                        return (
                          <div key={nf.key} className="flex items-center gap-2 px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{nf.label}</p>
                              {nf.hint && <p className="text-[11px] text-muted-foreground">{nf.hint}</p>}
                            </div>
                            <VisBadge char="F" active={inForm}  fixed={false} title={inForm  ? 'Ocultar do formulário' : 'Exibir no formulário'}
                              onClick={() => setFieldVisibility(nf.key, { form: !inForm })} />
                            {coreT
                              ? <PadraoPill title="Coluna padrão — gerencie em “Colunas padrão da tabela”" />
                              : <VisBadge char="T" active={inTable} fixed={false} title={inTable ? 'Remover da tabela' : 'Adicionar na tabela'}
                                  onClick={() => setFieldVisibility(nf.key, { table: !inTable })} />
                            }
                          </div>
                        )
                      })}
                      {/* campos personalizados */}
                      {customFields.map(field => {
                        const inForm  = field.visible === 'form'  || field.visible === 'both'
                        const inTable = field.visible === 'table' || field.visible === 'both'
                        const nextVisible = (f: boolean, t: boolean) =>
                          f && t ? 'both' : t ? 'table' : f ? 'form' : 'none'
                        return (
                          <div key={field.id} className="flex items-center gap-2 px-3 py-2.5 group/row">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{field.label}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {TYPE_LABEL[field.type]}
                                {field.maxLength ? ` · máx ${field.maxLength}` : ''}
                                {field.options?.length ? ` · ${field.options.length} opções` : ''}
                              </p>
                            </div>
                            <VisBadge char="F" active={inForm}  fixed={false} title={inForm  ? 'Ocultar do formulário' : 'Exibir no formulário'}
                              onClick={() => updateField(field.id, { ...field, visible: nextVisible(!inForm, inTable) })} />
                            <VisBadge char="T" active={inTable} fixed={false} title={inTable ? 'Remover da tabela'     : 'Adicionar na tabela'}
                              onClick={() => updateField(field.id, { ...field, visible: nextVisible(inForm, !inTable) })} />
                            <button type="button" onClick={() => setEditing(field)}
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/row:opacity-100">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => removeField(field.id)}
                              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/row:opacity-100">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-4 py-3 border-t bg-muted/30 shrink-0">
              <button type="button" onClick={() => setAdding(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-3.5 w-3.5" />Adicionar campo
              </button>
            </div>
          </>
        )}

        {/* ─── tab: seções ─── */}
        {tab === 'sections' && (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-lg border overflow-hidden">
                {resolvedOrder.length === 0 ? (
                  <p className="px-3 py-4 text-[11px] text-muted-foreground text-center">Nenhuma seção.</p>
                ) : (
                  <div className="divide-y">
                    {resolvedOrder.map((id, idx) => {
                      const isNative      = (id in SECTION_LABELS) || id === 'socios'
                      const nativeLabel   = id in SECTION_LABELS
                        ? SECTION_LABELS[id as SectionKey]
                        : id === 'socios'    ? 'Quadro de Sócios'
                        : id === 'historico' ? 'Histórico'
                        : null
                      const customSection = !isNative ? sections.find(s => s.id === id) : null
                      const label         = nativeLabel ?? customSection?.label ?? id
                      const nativeSubtitle =
                        id === 'socios'    ? 'Somente PJ' :
                        id === 'historico' ? 'Histórico de atividades' :
                        'Seção padrão'
                      const sysDefault    = id === 'identificacao'
                      const isDefaultOpen = sectionDefaultOpen[id] ?? sysDefault
                      const isEditing     = editingId === id

                      return (
                        <div key={id} draggable
                          onDragStart={() => setDragFrom(idx)}
                          onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleSectionDrop(idx)}
                          onDragEnd={clearDrag}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2.5 group/row transition-all select-none',
                            dragFrom === idx && 'opacity-40',
                            dragOver === idx && dragOver !== dragFrom && 'border-l-2 border-primary bg-primary/5',
                          )}>
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab shrink-0" />

                          {isEditing && customSection ? (
                            <div className="flex-1 space-y-1" onClick={e => e.stopPropagation()}>
                              <input value={editLabel}
                                onChange={e => setEditLabel(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                                autoFocus className={inputCls} />
                              {editErr && <p className="text-[11px] text-red-500">{editErr}</p>}
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{label}</p>
                              {isNative && <p className="text-[11px] text-muted-foreground">{nativeSubtitle}</p>}
                            </div>
                          )}

                          {/* toggle visível/oculto por padrão */}
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => setSectionDefaultOpen(id, !isDefaultOpen)}
                              title={isDefaultOpen ? 'Expandida por padrão — clique para recolher' : 'Recolhida por padrão — clique para expandir'}
                              className="shrink-0 transition-colors opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-foreground"
                            >
                              {isDefaultOpen
                                ? <Eye className="h-3.5 w-3.5 text-primary" />
                                : <EyeOff className="h-3.5 w-3.5" />
                              }
                            </button>
                          )}

                          {isEditing && customSection ? (
                            <>
                              <button type="button" onClick={saveEdit}
                                className="shrink-0 text-primary hover:text-primary/80 transition-colors">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={cancelEdit}
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : !isNative && customSection ? (
                            <>
                              <button type="button" onClick={() => startEdit(customSection)}
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/row:opacity-100">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => handleRemoveSection(customSection.id)}
                                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/row:opacity-100">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
                {addingSection && (
                  <NewSectionRow
                    existingLabels={sections.map(s => s.label)}
                    onSave={s => { addSection(s); setAddingSection(false) }}
                    onCancel={() => setAddingSection(false)}
                  />
                )}
              </div>
              <div className="mt-2 px-1 space-y-0.5">
                <p className="text-[11px] text-muted-foreground">Arraste para reordenar. Passe o mouse sobre uma seção para ver os controles.</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3 text-primary inline" /> expandida por padrão ·
                  <EyeOff className="h-3 w-3 inline" /> recolhida por padrão
                </p>
              </div>
            </div>

            {!addingSection && (
              <div className="px-4 py-3 border-t bg-muted/30 shrink-0">
                <button type="button" onClick={() => setAddingSection(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Plus className="h-3.5 w-3.5" />Nova seção
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {adding && (
        <FieldDrawer onClose={() => setAdding(false)} onSave={handleAdd} />
      )}
      {editing && (
        <FieldDrawer initialField={editing} onClose={() => setEditing(null)} onSave={handleUpdate} />
      )}
    </>
  )
}

/* ─── toggle de visibilidade (olho) ──────────────────────── */

function EyeToggle({ visible, title, onClick }: {
  visible: boolean; title: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'h-6 w-6 inline-flex items-center justify-center rounded border transition-colors shrink-0',
        visible
          ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
          : 'bg-transparent text-muted-foreground border-input hover:border-primary/50',
      )}
    >
      {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
    </button>
  )
}

/* ─── SettingsDrawer ─────────────────────────────────────── */
/* Rotina enxuta: define apenas a visibilidade das colunas na tabela.
   A criação/edição de campos e seções foi preservada em FieldManagerDrawer
   (acima), para reuso em outra rotina. */

export function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const { fields, updateField, setAllTableVisible }        = usePartnerFields()
  const { isVisibleInTable, setFieldVisibility, setTableForKeys } = useFieldVisibility()
  const { isColumnVisible, toggleColumn, setAllColumns }   = useDefaultColumns()
  const { sections }                                       = usePartnerSections()

  /* campos nativos togglgáveis na tabela (todos os não-CORE exibidos no drawer) */
  const nativeKeys = NATIVE_FIELDS.filter(f => !CORE_TABLE_KEYS.has(f.key)).map(f => f.key)

  /* campos personalizados das TELAS (Marco 3b): colunas disponíveis a partir da tela
     padrão do Fornecedor; togglados como coluna pelo mesmo store dos nativos (por id). */
  const { screens: fornecedorScreens } = useScreens('FORNECEDOR')
  const defaultScreen = useMemo(() => pickDefaultScreen(fornecedorScreens), [fornecedorScreens])
  const screenCustom = useMemo(
    () => (defaultScreen?.fields ?? []).filter(f => f.source === 'CUSTOM').sort((a, b) => a.order - b.order),
    [defaultScreen],
  )
  const screenCustomKeys = screenCustom.map(f => f.id)
  const screenGroups = useMemo(() => {
    const labelOf = new Map((defaultScreen?.sections ?? []).map(s => [s.id, s.label]))
    const by = new Map<string, typeof screenCustom>()
    for (const f of screenCustom) {
      const k = f.sectionId ?? '__loose__'
      const arr = by.get(k) ?? []; arr.push(f); by.set(k, arr)
    }
    return [...by.entries()].map(([id, gfields]) => ({
      id, label: labelOf.get(id) ?? 'Sem seção', fields: gfields,
    }))
  }, [screenCustom, defaultScreen])

  /* estado agregado: todas as colunas exibidas estão visíveis? */
  const allVisible =
    BASE_TABLE_COLUMNS.every(c => isColumnVisible(c.key)) &&
    nativeKeys.every(k => isVisibleInTable(k)) &&
    fields.every(f => f.visible === 'table' || f.visible === 'both') &&
    screenCustomKeys.every(k => isVisibleInTable(k))

  const setAll = (visible: boolean) => {
    setAllColumns(visible)
    setTableForKeys([...nativeKeys, ...screenCustomKeys], visible)
    setAllTableVisible(visible)
  }

  const restoreDefault = () => {
    setAllColumns(true)                                        // colunas padrão visíveis
    setTableForKeys([...nativeKeys, ...screenCustomKeys], false) // nativas/custom fora da tabela
    setAllTableVisible(false)                                  // personalizadas (Sistema A) fora da tabela
    window.dispatchEvent(new Event(COLUMN_ORDER_RESET_EVENT))  // ordem original
  }

  /* rótulos de seção (nativas + personalizadas) para agrupar a lista */
  const allSectionLabels: Record<string, string> = {
    identificacao: SECTION_LABELS.identificacao,
    cnae:          'CNAE — Atividades Econômicas', // logo após Identificação, como no formulário
    contato:       SECTION_LABELS.contato,
    endereco:      SECTION_LABELS.endereco,
    bancario:      SECTION_LABELS.bancario,
    socios:        'Quadro de Sócios',
    historico:     'Histórico',
    ...Object.fromEntries(sections.map(s => [s.id, s.label])),
  }
  const sectionFieldGroups = Object.entries(allSectionLabels).map(([id, label]) => ({
    id,
    label,
    baseColumns:  BASE_TABLE_COLUMNS.filter(c => c.section === id),
    /* campos CORE são representados pela coluna padrão — não repetir na lista */
    nativeFields: NATIVE_FIELDS.filter(f => f.section === id && !CORE_TABLE_KEYS.has(f.key)),
    customFields: fields.filter(f => f.section === id),
  }))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-96 glass-panel border-l border-white/15 dark:border-white/10 shadow-xl flex flex-col">

        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Configurações</h2>
            <p className="text-[11px] text-muted-foreground">Visibilidade das colunas na tabela</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5 text-primary" /> visível na tabela
            </span>
            <span className="flex items-center gap-1">
              <EyeOff className="h-3.5 w-3.5" /> oculta
            </span>
            <span className="text-muted-foreground/50">— clique para alternar</span>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Colunas marcadas com <span className="font-semibold text-primary">padrão</span> são do sistema;
            mesmo ocultas, continuam disponíveis em filtros e exportação.
          </p>

          {/* campos agrupados por seção — colunas padrão no topo, depois os demais */}
          {sectionFieldGroups.map(({ id, label, baseColumns, nativeFields, customFields }) => {
            if (baseColumns.length === 0 && nativeFields.length === 0 && customFields.length === 0) return null
            return (
              <div key={id} className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b">
                  <p className="text-xs font-semibold">{label}</p>
                </div>
                <div className="divide-y">
                  {/* colunas padrão da tabela */}
                  {baseColumns.map(col => {
                    const visible = isColumnVisible(col.key)
                    return (
                      <div key={col.key} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="text-xs font-medium truncate">{col.label}</p>
                          <PadraoPill />
                        </div>
                        <EyeToggle visible={visible}
                          title={visible ? 'Ocultar da tabela' : 'Exibir na tabela'}
                          onClick={() => toggleColumn(col.key)} />
                      </div>
                    )
                  })}
                  {/* campos nativos (não-CORE) */}
                  {nativeFields.map(nf => {
                    const inTable = isVisibleInTable(nf.key)
                    return (
                      <div key={nf.key} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{nf.label}</p>
                          {nf.hint && <p className="text-[11px] text-muted-foreground">{nf.hint}</p>}
                        </div>
                        <EyeToggle visible={inTable} title={inTable ? 'Remover da tabela' : 'Adicionar na tabela'}
                          onClick={() => setFieldVisibility(nf.key, { table: !inTable })} />
                      </div>
                    )
                  })}
                  {/* campos personalizados */}
                  {customFields.map(field => {
                    const inForm  = field.visible === 'form'  || field.visible === 'both'
                    const inTable = field.visible === 'table' || field.visible === 'both'
                    const nextVisible = (f: boolean, t: boolean) =>
                      f && t ? 'both' : t ? 'table' : f ? 'form' : 'none'
                    return (
                      <div key={field.id} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{field.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {TYPE_LABEL[field.type]}
                            {field.maxLength ? ` · máx ${field.maxLength}` : ''}
                            {field.options?.length ? ` · ${field.options.length} opções` : ''}
                          </p>
                        </div>
                        <EyeToggle visible={inTable} title={inTable ? 'Remover da tabela' : 'Adicionar na tabela'}
                          onClick={() => updateField(field.id, { ...field, visible: nextVisible(inForm, !inTable) })} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* campos personalizados vindos das TELAS (Marco 3b) */}
          {screenGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-border" />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Campos das Telas</p>
                <div className="h-px flex-1 bg-border" />
              </div>
              {screenGroups.map(({ id, label, fields: gfields }) => (
                <div key={id} className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 border-b">
                    <p className="text-xs font-semibold">{label}</p>
                  </div>
                  <div className="divide-y">
                    {gfields.map(f => {
                      const inTable = isVisibleInTable(f.id)
                      return (
                        <div key={f.id} className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{f.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {FIELD_TYPE_LABELS[f.type]}
                              {f.options?.length ? ` · ${f.options.length} opções` : ''}
                            </p>
                          </div>
                          <EyeToggle visible={inTable} title={inTable ? 'Remover da tabela' : 'Adicionar na tabela'}
                            onClick={() => setFieldVisibility(f.id, { table: !inTable })} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 shrink-0">
          <button type="button" onClick={restoreDefault}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <RotateCcw className="h-3.5 w-3.5" />Restaurar padrão
          </button>
          <button type="button" onClick={() => setAll(!allVisible)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {allVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {allVisible ? 'Ocultar todas' : 'Exibir todas'}
          </button>
        </div>
      </div>
    </>
  )
}
