'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X,
  MoreHorizontal, Star, Lock, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveScreen } from '@/hooks/use-screens'
import {
  SUBJECT_LABELS, STATUS_LABELS, FIELD_TYPE_LABELS, PARTNER_CATEGORIES, slug,
  type Screen, type ScreenField, type ScreenSubject, type ScreenStatus, type PartnerCategory,
} from '@/lib/screen-types'
import { buildNativeSeed, reconcileNative } from '@/lib/screen-native-structure'
import { fieldAppliesTo, fieldVisibleFor, requiredFor } from '@/lib/screen-partner-categories'
import { PARTNER_BLOCK_SECTIONS } from '@/lib/screen-partner-layout'
import { ScreenRenderer } from './screen-renderer'
import { ScreenFieldEditor } from './screen-field-editor'

const ALL_CATEGORIES = PARTNER_CATEGORIES.map(c => c.value)

/** Migra o modelo antigo (visible=false global) para o modelo POR TIPO: um nativo
 *  desligado vira "oculto em todos os tipos aplicáveis". Só para telas de Fornecedor. */
function normalizePartner(screen: Screen): Screen {
  if (screen.subjectType !== 'FORNECEDOR') return screen
  return {
    ...screen,
    fields: screen.fields.map(f => {
      if (f.visible !== false) return f
      const applicable = ALL_CATEGORIES.filter(c => fieldAppliesTo(f, c))
      const hidden = Array.from(new Set([...(f.hiddenCategories ?? []), ...applicable]))
      return { ...f, visible: true, hiddenCategories: hidden }
    }),
  }
}

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const iconBtn  = 'h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'

/* O construtor NUNCA mostra dados de fornecedor: os campos aparecem sempre vazios
   (o cadastro de telas é um molde, não a exibição de um registro real). */
const emptyNative = () => ''

/* campos nativos longos → largura total (título e campos de texto extensos) */
const FULL_WIDTH_KEYS = new Set(['razao_social', 'con_email', 'con_website', 'end_logradouro', 'end_address1', 'end_address2', 'ban_pix'])
const isFullWidth = (f: ScreenField) =>
  f.type === 'textarea' || (f.source === 'NATIVE' && FULL_WIDTH_KEYS.has(f.nativeKey ?? ''))

/* interruptor de visibilidade */
function Switch({ on, onClick, title, sm }: { on: boolean; onClick: () => void; title?: string; sm?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} title={title}
      className={cn('relative inline-flex shrink-0 items-center rounded-full transition-colors',
        sm ? 'h-[17px] w-[30px]' : 'h-[19px] w-[34px]',
        on ? 'bg-primary' : 'bg-muted-foreground/25 hover:bg-muted-foreground/40')}>
      <span className={cn('inline-block rounded-full bg-white shadow-sm transition-transform',
        sm ? 'h-[13px] w-[13px]' : 'h-[15px] w-[15px]',
        on ? (sm ? 'translate-x-[15px]' : 'translate-x-[17px]') : 'translate-x-[2px]')} />
    </button>
  )
}

const blank = (subjectType: ScreenSubject): Screen => {
  const seed = buildNativeSeed(subjectType)
  return { id: '', name: '', description: '', subjectType, status: 'DRAFT', isDefault: false, ...seed }
}

export function ScreenBuilder({ initial }: { initial?: Screen }) {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>(initial ? normalizePartner(reconcileNative(initial)) : blank('FORNECEDOR'))
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [cat, setCat] = useState<PartnerCategory>('PJ_BR')  // tipo em edição (Fornecedor)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<ScreenField | null>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameLabel, setRenameLabel] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const patch = (p: Partial<Screen>) => setScreen(s => ({ ...s, ...p }))
  const sections = [...screen.sections].sort((a, b) => a.order - b.order)
  const fieldsOf = (sid: string) => screen.fields.filter(f => f.sectionId === sid).sort((a, b) => a.order - b.order)

  const nNative = screen.fields.filter(f => f.source === 'NATIVE').length
  const nCustom = screen.fields.filter(f => f.source === 'CUSTOM').length
  // ocultos: por tipo (Fornecedor, considera só o que se aplica ao tipo) ou global (demais)
  const nHidden = screen.subjectType === 'FORNECEDOR'
    ? screen.fields.filter(f => fieldAppliesTo(f, cat) && !fieldVisibleFor(f, cat)).length
    : screen.fields.filter(f => f.visible === false).length

  // Telas BASE do sistema são imutáveis: sempre ATIVA e sempre padrão. Uma tela não-padrão
  // de um tipo que já tem base do sistema (Fornecedor/Contrato) não pode virar padrão.
  const isSystemScreen  = !!screen.isSystem
  const subjectHasSystem = screen.subjectType === 'FORNECEDOR' || screen.subjectType === 'CONTRATO'
  const defaultLocked   = isSystemScreen || (subjectHasSystem && !isSystemScreen)

  const toggleCollapsed = (sid: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n })
  const jumpTo = (sid: string) => document.getElementById(`sec-${sid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const changeSubject = (subjectType: ScreenSubject) => {
    const seed = buildNativeSeed(subjectType)
    const customSecs = screen.sections.filter(s => s.source !== 'NATIVE').map((s, i) => ({ ...s, order: seed.sections.length + i }))
    const customFields = screen.fields.filter(f => f.source !== 'NATIVE')
    setScreen(s => ({ ...s, subjectType, sections: [...seed.sections, ...customSecs], fields: [...seed.fields, ...customFields] }))
  }

  /* seções */
  const addSection = () => {
    const label = newSectionLabel.trim(); if (!label) return
    patch({ sections: [...screen.sections, { id: `ss_${Date.now()}`, label, name: slug(label), source: 'CUSTOM', visible: true, order: sections.length, defaultOpen: true }] })
    setNewSectionLabel(''); setAddingSection(false)
  }
  const removeSection = (sid: string) => patch({ sections: screen.sections.filter(s => s.id !== sid), fields: screen.fields.filter(f => f.sectionId !== sid) })
  const renameSection = (sid: string) => {
    const label = renameLabel.trim(); if (!label) return
    patch({ sections: screen.sections.map(s => s.id === sid ? { ...s, label, name: slug(label) } : s) }); setRenamingSection(null)
  }
  const moveSection = (sid: string, dir: -1 | 1) => {
    const idx = sections.findIndex(s => s.id === sid); const to = idx + dir
    if (to < 0 || to >= sections.length) return
    const arr = [...sections]; [arr[idx], arr[to]] = [arr[to], arr[idx]]
    patch({ sections: arr.map((s, i) => ({ ...s, order: i })) })
  }
  const toggleDefaultOpen = (sid: string) => patch({ sections: screen.sections.map(s => s.id === sid ? { ...s, defaultOpen: !s.defaultOpen } : s) })
  const toggleSectionVisible = (sid: string) => patch({ sections: screen.sections.map(s => s.id === sid ? { ...s, visible: s.visible === false } : s) })

  /* campos */
  const upsertField = (field: ScreenField) => {
    const exists = screen.fields.some(f => f.id === field.id)
    if (exists) patch({ fields: screen.fields.map(f => f.id === field.id ? field : f) })
    else patch({ fields: [...screen.fields, { ...field, order: fieldsOf(field.sectionId ?? '').length }] })
    setEditingField(null); setAddingToSection(null)
  }
  const removeField = (id: string) => patch({ fields: screen.fields.filter(f => f.id !== id) })
  const toggleFieldVisible = (id: string) => patch({ fields: screen.fields.map(f => f.id === id ? { ...f, visible: f.visible === false } : f) })
  /* liga/desliga todos os campos de uma seção de uma vez */
  const setSectionFields = (sid: string, visible: boolean) => patch({ fields: screen.fields.map(f => f.sectionId === sid ? { ...f, visible } : f) })

  /* ── visibilidade POR TIPO (Fornecedor) ── */
  const isPartner = screen.subjectType === 'FORNECEDOR'
  const setFieldHiddenFor = (id: string, category: PartnerCategory, hidden: boolean) =>
    patch({ fields: screen.fields.map(f => {
      if (f.id !== id) return f
      const hc = new Set(f.hiddenCategories ?? [])
      hidden ? hc.add(category) : hc.delete(category)
      return { ...f, visible: true, hiddenCategories: [...hc] }
    }) })
  const toggleFieldCategory = (id: string, category: PartnerCategory) => {
    const f = screen.fields.find(x => x.id === id)
    // alterna: novo "oculto" = visibilidade ATUAL (visível → oculta; oculto → mostra)
    setFieldHiddenFor(id, category, Boolean(f && fieldVisibleFor(f, category)))
  }
  const setSectionCategoryFields = (sid: string, category: PartnerCategory, visible: boolean) =>
    patch({ fields: screen.fields.map(f =>
      (f.sectionId === sid && fieldAppliesTo(f, category)) ? { ...f, visible: true, hiddenCategories: visible
        ? (f.hiddenCategories ?? []).filter(c => c !== category)
        : Array.from(new Set([...(f.hiddenCategories ?? []), category])) } : f) })

  /* resolvedores usados no canvas: por tipo (Fornecedor) ou globais (demais telas) */
  const fieldApplies  = (f: ScreenField) => isPartner ? fieldAppliesTo(f, cat) : true
  const fieldVisible  = (f: ScreenField) => isPartner ? fieldVisibleFor(f, cat) : f.visible !== false
  const toggleField   = (f: ScreenField) => isPartner ? toggleFieldCategory(f.id, cat) : toggleFieldVisible(f.id)
  const setSectionVis = (sid: string, vis: boolean) => isPartner ? setSectionCategoryFields(sid, cat, vis) : setSectionFields(sid, vis)

  /* salvar */
  const handleSave = async () => {
    if (!screen.name.trim()) { setErr('Dê um nome à tela'); return }
    setSaving(true); setErr('')
    const sortedSections = sections.map((s, i) => ({ id: s.id, label: s.label, name: s.name, source: s.source ?? 'CUSTOM', nativeKey: s.nativeKey, visible: s.visible !== false, order: i, defaultOpen: s.defaultOpen }))
    const normFields = sortedSections.flatMap(s => fieldsOf(s.id).map((f, i) => ({ id: f.id, sectionId: s.id, name: f.name, label: f.label, type: f.type, source: f.source, nativeKey: f.nativeKey, mode: f.mode, visible: f.visible !== false, required: f.required, placeholder: f.placeholder, options: f.options, validation: f.validation, hiddenCategories: f.hiddenCategories ?? [], requiredCategories: f.requiredCategories ?? undefined, order: i })))
    const saved = await saveScreen(screen.id || null, { name: screen.name.trim(), description: screen.description ?? '', subjectType: screen.subjectType, status: screen.status, isDefault: screen.isDefault ?? false, isSystem: screen.isSystem ?? false, sections: sortedSections, fields: normFields })
    setSaving(false)
    if (!saved) { setErr('Falha ao salvar. Tente novamente.'); return }
    router.push('/settings/telas')
  }

  return (
    <div className="max-w-[1240px] mx-auto pb-16">

      {/* ── barra fixa: título editável + padrão + modo + salvar ── */}
      <div className="sticky top-0 z-30 -mt-4 mb-4 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-3 py-2.5">
          <button onClick={() => router.push('/settings/telas')} title="Voltar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <input value={screen.name} onChange={e => { patch({ name: e.target.value }); setErr('') }} placeholder="Nome da tela"
              className="w-full max-w-[560px] rounded-md bg-transparent px-1 -mx-1 text-[15px] font-bold tracking-tight outline-none hover:bg-muted/50 focus:bg-card focus:ring-1 focus:ring-ring transition-colors" />
            <p className="text-[11px] text-muted-foreground mt-0.5">{screen.id ? 'Editando a tela' : 'Nova tela'} — passe o mouse num campo para ligar/desligar ou editar</p>
          </div>

          <button onClick={() => { if (!defaultLocked) patch({ isDefault: !screen.isDefault }) }} disabled={defaultLocked}
            title={isSystemScreen ? 'Tela base do sistema — sempre padrão e ativa'
              : defaultLocked ? 'A tela padrão deste tipo é a base do sistema. Crie uma tela não-padrão para variações (atribuídas por perfil/etapa).'
              : undefined}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors shrink-0',
              screen.isDefault ? 'border-primary/40 bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted',
              defaultLocked && 'cursor-not-allowed opacity-90')}>
            {isSystemScreen && <Lock className="h-3 w-3" />}
            <Star className={cn('h-3.5 w-3.5', screen.isDefault && 'fill-primary')} />{screen.isDefault ? 'Tela padrão' : 'Tornar padrão'}
          </button>

          <div className="inline-flex rounded-lg border overflow-hidden text-xs font-semibold shrink-0">
            <button onClick={() => setMode('edit')} className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors', mode === 'edit' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <Pencil className="h-3.5 w-3.5" />Editando
            </button>
            <button onClick={() => setMode('preview')} className={cn('px-3 py-1.5 flex items-center gap-1.5 border-l transition-colors', mode === 'preview' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <Eye className="h-3.5 w-3.5" />Prévia limpa
            </button>
          </div>

          {err && <span className="text-[11px] text-red-500 shrink-0">{err}</span>}
          <button onClick={() => void handleSave()} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
            {saving ? 'Salvando…' : 'Salvar tela'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-5 items-start">

        {/* ── trilho lateral ── */}
        <aside className="lg:sticky lg:top-[68px] space-y-3.5">
          {/* configurações da tela */}
          <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Configurações da tela</p>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Aplica-se a</label>
              <select value={screen.subjectType} onChange={e => changeSubject(e.target.value as ScreenSubject)} disabled={!!screen.isSystem}
                className={cn(inputCls, 'h-8', screen.isSystem && 'opacity-60 cursor-not-allowed')}>
                {(Object.keys(SUBJECT_LABELS) as ScreenSubject[]).map(v => <option key={v} value={v}>{SUBJECT_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Situação</label>
              <select value={isSystemScreen ? 'ACTIVE' : screen.status} onChange={e => patch({ status: e.target.value as ScreenStatus })}
                disabled={isSystemScreen} className={cn(inputCls, 'h-8', isSystemScreen && 'opacity-60 cursor-not-allowed')}>
                {(Object.keys(STATUS_LABELS) as ScreenStatus[]).map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
              </select>
              {isSystemScreen && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="h-2.5 w-2.5" />Tela base do sistema — sempre ativa e padrão.</p>}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Descrição</label>
              <input value={screen.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="Opcional" className={cn(inputCls, 'h-8')} />
            </div>
          </div>

          {/* navegação de seções */}
          <div className="rounded-xl border bg-card shadow-sm p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Seções</p>
            <div className="space-y-0.5">
              {sections.map(s => {
                const applicable = isPartner ? fieldsOf(s.id).filter(fieldApplies) : fieldsOf(s.id)
                const total = applicable.length
                const vis = applicable.filter(fieldVisible).length
                const naNoTipo = isPartner && s.source === 'NATIVE' && total === 0
                const empty = !naNoTipo && total > 0 && vis === 0 && s.visible !== false
                return (
                  <button key={s.id} onClick={() => jumpTo(s.id)}
                    className={cn('w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium hover:bg-muted transition-colors', naNoTipo && 'opacity-45')}>
                    <span className="truncate flex-1">{s.label}</span>
                    <span className={cn('shrink-0 rounded-full border px-1.5 py-px text-[10px] tabular-nums font-mono',
                      empty ? 'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                      {naNoTipo ? '—' : s.source === 'NATIVE' ? `${vis}/${total}` : `${total}`}
                    </span>
                  </button>
                )
              })}
            </div>
            {addingSection ? (
              <div className="mt-2 flex items-center gap-1.5">
                <input autoFocus value={newSectionLabel} onChange={e => setNewSectionLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setAddingSection(false) }}
                  placeholder="Nome da seção" className={cn(inputCls, 'h-7')} />
                <button onClick={addSection} className="text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setAddingSection(false); setNewSectionLabel('') }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button onClick={() => setAddingSection(true)} className="mt-2 w-full rounded-lg border border-dashed py-2 text-[12px] font-semibold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />Nova seção
              </button>
            )}
          </div>

          {/* estatísticas */}
          <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2">
            {[
              { n: nNative, l: 'campos nativos', c: 'bg-blue-500' },
              { n: nCustom, l: 'personalizados', c: 'bg-primary' },
              { n: nHidden, l: isPartner ? `ocultos em ${PARTNER_CATEGORIES.find(c => c.value === cat)?.short}` : 'ocultos no cadastro', c: 'bg-amber-500' },
            ].map(({ n, l, c }) => (
              <div key={l} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', c)} />
                <b className="text-foreground font-mono tabular-nums">{n}</b> {l}
              </div>
            ))}
          </div>
        </aside>

        {/* ── canvas: o formulário de verdade ── */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-3 px-0.5 flex-wrap">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {mode === 'edit' ? 'Formulário do cadastro' : 'Prévia — como o fornecedor verá'}
            </span>
            {isPartner && (
              <div className="inline-flex rounded-lg border overflow-hidden text-[11px] font-semibold">
                {PARTNER_CATEGORIES.map((c, i) => (
                  <button key={c.value} onClick={() => setCat(c.value)}
                    className={cn('px-2.5 py-1 transition-colors', i > 0 && 'border-l',
                      cat === c.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                    {c.short}
                  </button>
                ))}
              </div>
            )}
            {isPartner && <span className="text-[11px] text-muted-foreground">ajustando os campos de <b className="text-foreground font-semibold">{PARTNER_CATEGORIES.find(c => c.value === cat)?.label}</b></span>}
          </div>

          {mode === 'preview' ? (
            <ScreenRenderer screen={isPartner ? { ...screen, fields: screen.fields.filter(f => fieldVisibleFor(f, cat)) } : screen} nativeValue={emptyNative} />
          ) : sections.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">Crie uma seção para começar.</p>
          ) : (
            sections.map((s, sIdx) => {
              const fs = fieldsOf(s.id)
              const applicable = fs.filter(fieldApplies)          // campos que fazem sentido para o tipo atual
              const visible = applicable.filter(fieldVisible)
              const hidden = applicable.filter(f => !fieldVisible(f))
              const isNativeSec = s.source === 'NATIVE'
              const secHidden = s.visible === false
              const isColl = collapsed.has(s.id)
              // seção-bloco (ex.: Histórico): atômica, aplica a todos os tipos — não é "não se aplica"
              const isBlockSec = isNativeSec && !!s.nativeKey && PARTNER_BLOCK_SECTIONS.has(s.nativeKey)
              const naNoTipo = isPartner && isNativeSec && !isBlockSec && applicable.length === 0  // seção nativa que não se aplica ao tipo
              const allVis = applicable.length > 0 && visible.length === applicable.length
              const allHid = applicable.length > 0 && hidden.length === applicable.length
              const wontShow = !secHidden && !naNoTipo && applicable.length > 0 && visible.length === 0

              return (
                <div key={s.id} id={`sec-${s.id}`} className={cn('scroll-mt-24 rounded-xl border bg-card shadow-sm mb-3.5 overflow-hidden transition-opacity', secHidden && 'opacity-60')}>
                  {/* cabeçalho da seção */}
                  <div className="flex items-center gap-2.5 px-4 py-2.5">
                    <button onClick={() => toggleCollapsed(s.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className={cn('h-4 w-4 transition-transform', isColl && '-rotate-90')} />
                    </button>
                    {renamingSection === s.id ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <input autoFocus value={renameLabel} onChange={e => setRenameLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameSection(s.id); if (e.key === 'Escape') setRenamingSection(null) }} className={cn(inputCls, 'h-7')} />
                        <button onClick={() => renameSection(s.id)} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setRenamingSection(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="font-bold text-sm tracking-tight truncate">{s.label}</span>
                        <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0',
                          isNativeSec ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10')}>
                          {isNativeSec ? 'Nativa' : 'Personalizada'}
                        </span>
                        {isNativeSec && applicable.length > 0 && (
                          <span className={cn('text-[10.5px] font-mono tabular-nums rounded-full border px-2 py-0.5 shrink-0',
                            wontShow ? 'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                            {visible.length} de {applicable.length} visíveis
                          </span>
                        )}
                        {naNoTipo && <span className="text-[10.5px] font-medium text-muted-foreground shrink-0">· não se aplica a este tipo</span>}
                        {wontShow && <span className="text-[10.5px] font-medium text-amber-600 dark:text-amber-400 shrink-0">· não sai no cadastro</span>}

                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          {applicable.length > 0 && (
                            <span className="inline-flex rounded-md border overflow-hidden text-[10.5px] font-bold">
                              <button onClick={() => setSectionVis(s.id, true)} className={cn('px-2 py-0.5 transition-colors', allVis ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>Tudo</button>
                              <button onClick={() => setSectionVis(s.id, false)} className={cn('px-2 py-0.5 border-l transition-colors', allHid ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>Nada</button>
                            </span>
                          )}
                          <button onClick={() => { setRenamingSection(s.id); setRenameLabel(s.label) }} title="Renomear seção" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>
                          <div className="relative">
                            <button onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)} title="Mais" className={iconBtn}><MoreHorizontal className="h-3.5 w-3.5" /></button>
                            {menuOpen === s.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                                <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border bg-card shadow-lg py-1 text-xs">
                                  <button onClick={() => { moveSection(s.id, -1); setMenuOpen(null) }} disabled={sIdx === 0} className="w-full text-left px-3 py-1.5 hover:bg-muted disabled:opacity-40 flex items-center gap-2"><ChevronUp className="h-3.5 w-3.5" />Mover para cima</button>
                                  <button onClick={() => { moveSection(s.id, 1); setMenuOpen(null) }} disabled={sIdx === sections.length - 1} className="w-full text-left px-3 py-1.5 hover:bg-muted disabled:opacity-40 flex items-center gap-2"><ChevronDown className="h-3.5 w-3.5" />Mover para baixo</button>
                                  <button onClick={() => { toggleDefaultOpen(s.id); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2">
                                    {s.defaultOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    {s.defaultOpen ? 'Abre recolhida no cadastro' : 'Abre aberta no cadastro'}
                                  </button>
                                  {!isNativeSec && <button onClick={() => { removeSection(s.id); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" />Excluir seção</button>}
                                </div>
                              </>
                            )}
                          </div>
                          <Switch on={!secHidden} onClick={() => toggleSectionVisible(s.id)} sm title={secHidden ? 'Seção oculta no cadastro' : 'Seção visível no cadastro'} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* corpo: o formulário de verdade + chrome de edição */}
                  {!isColl && (
                    <div className="border-t p-4">
                      {naNoTipo ? (
                        <p className="text-[11px] text-muted-foreground text-center py-2 italic">Não se aplica a {PARTNER_CATEGORIES.find(c => c.value === cat)?.label}.</p>
                      ) : applicable.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-2">Nenhum campo. Adicione um campo personalizado abaixo.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {visible.map(f => {
                            const native = f.source === 'NATIVE'
                            return (
                              <div key={f.id} className={cn('group relative flex flex-col gap-1', isFullWidth(f) && 'sm:col-span-2')}>
                                <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                                  {native ? <Lock className="h-2.5 w-2.5 text-blue-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                                  {f.label}{(isPartner ? requiredFor(f, cat) : f.required) && <span className="text-red-500">*</span>}
                                  {!native && <span className="text-[9px] font-normal text-muted-foreground/60 normal-case">· {FIELD_TYPE_LABELS[f.type]}</span>}
                                </label>
                                {native ? (
                                  <div className="h-8 rounded-md border border-input/70 bg-muted/30 px-2.5" />
                                ) : (
                                  <div className="h-8 rounded-md border border-primary/30 bg-primary/5 px-2.5" />
                                )}
                                {/* controles ao passar o mouse */}
                                <div className="absolute -top-2 right-0 flex gap-0.5 rounded-md border bg-card p-0.5 shadow-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                  {!native && <button onClick={() => setEditingField(f)} title="Editar campo" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>}
                                  {!native && <button onClick={() => removeField(f.id)} title="Excluir campo" className={cn(iconBtn, 'hover:text-destructive')}><Trash2 className="h-3.5 w-3.5" /></button>}
                                  <button onClick={() => toggleField(f)} title={isPartner ? 'Ocultar neste tipo' : 'Ocultar no cadastro'} className={cn(iconBtn, 'text-primary')}><Eye className="h-3.5 w-3.5" /></button>
                                </div>
                              </div>
                            )
                          })}

                          {/* ocultos: linha fininha recuperável */}
                          {hidden.length > 0 && (
                            <div className="sm:col-span-2 mt-1 pt-3 border-t border-dashed">
                              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/60 mb-2">Ocultos nesta seção</p>
                              <div className="flex flex-wrap gap-2">
                                {hidden.map(f => (
                                  <span key={f.id} className="inline-flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-muted-foreground">
                                    {f.source === 'NATIVE' ? <Lock className="h-3 w-3 text-blue-500/70" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />}
                                    <span className="text-xs line-through">{f.label}</span>
                                    <button onClick={() => toggleField(f)} className="rounded bg-primary/10 text-primary text-[11px] font-semibold px-2 py-0.5 hover:bg-primary/20 transition-colors">Mostrar</button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <button onClick={() => setAddingToSection(s.id)} className="sm:col-span-2 mt-1 rounded-lg border border-dashed py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
                            <Plus className="h-3.5 w-3.5" />Adicionar campo personalizado
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {(editingField || addingToSection) && (
        <ScreenFieldEditor sections={sections} subjectType={screen.subjectType} initial={editingField ?? undefined} defaultSectionId={addingToSection ?? undefined}
          onClose={() => { setEditingField(null); setAddingToSection(null) }} onSave={upsertField} />
      )}
    </div>
  )
}
