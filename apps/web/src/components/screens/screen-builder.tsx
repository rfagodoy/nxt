'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X,
  MoreHorizontal, Star, Lock, Eye, Rows3, AlertTriangle,
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
import { CONTRACT_BLOCK_SECTIONS } from '@/lib/screen-contract-layout'
import { pendenciasDeTrava, fraseDaPendencia } from '@/lib/screen-locks'
import { ScreenRenderer } from './screen-renderer'
import { ScreenFieldEditor } from './screen-field-editor'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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

/* Seções-BLOCO: componentes atômicos (Histórico, Pagamentos, Aditivos…). A tela decide
   se o bloco aparece e se ele aceita alteração — não há campo a campo dentro dele. */
const NO_BLOCKS = new Set<string>()
const blockKeysOf = (subject: ScreenSubject) =>
  subject === 'FORNECEDOR' ? PARTNER_BLOCK_SECTIONS
    : subject === 'CONTRATO' ? CONTRACT_BLOCK_SECTIONS
      : NO_BLOCKS

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

/* Célula da matriz: quadradinho marcado / desmarcado / "parte sim, parte não".
   `half` só existe na linha da SEÇÃO — é o resumo dos campos dela. */
function Marca({ on, half, onClick, title, disabled, tone = 'primary' }: {
  on: boolean; half?: boolean; onClick: () => void; title?: string; disabled?: boolean; tone?: 'primary' | 'amber'
}) {
  return (
    <button type="button" role="checkbox" aria-checked={half ? 'mixed' : on} onClick={() => { if (!disabled) onClick() }}
      disabled={disabled} title={title} aria-label={title}
      className={cn('inline-flex h-4 w-4 items-center justify-center rounded border transition-colors',
        on || half ? 'border-primary/50 bg-primary/10 text-primary'
                   : 'border-input bg-background hover:bg-muted',
        disabled && 'cursor-not-allowed opacity-50')}>
      {half ? <span className="h-[1.5px] w-2 rounded-full bg-primary" />
        : on ? <Check className="h-3 w-3" />
          : tone === 'amber' ? <Lock className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" /> : null}
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
  const [mode, setMode] = useState<'config' | 'preview'>('config')
  const [cat, setCat] = useState<PartnerCategory>('PJ_BR')  // tipo em edição (Fornecedor)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<ScreenField | null>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameLabel, setRenameLabel] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  /* campo personalizado é do TIPO: excluir tira de TODAS as telas, então pergunta antes */
  const [excluindoCampo, setExcluindoCampo] = useState<ScreenField | null>(null)
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

  /* Piso vindo de CIMA (tela ou seção): ali o campo não decide sozinho.
     Declarado ANTES do primeiro uso de propósito — `const` não sofre hoisting. */
  const secLocked = (sid?: string) => !!screen.readOnly || (!!sid && !!screen.sections.find(x => x.id === sid)?.locked)
  const isTravado = (f: ScreenField) => secLocked(f.sectionId) || !!f.locked

  const nLocked = screen.fields.filter(f => isTravado(f)).length
  /* obrigatório E travado: ninguém consegue preencher (não impede salvar; é acusado) */
  const pendencias = pendenciasDeTrava(screen)

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

  /* ── trava de edição (campo a campo) ──
     A trava é GLOBAL do campo, não por tipo de parceiro: "quem pode alterar" não muda
     com o tipo, e uma segunda dimensão aqui dobraria a configuração sem caso de uso. */
  const toggleFieldLocked = (id: string) =>
    patch({ fields: screen.fields.map(f => f.id === id ? { ...f, locked: !f.locked } : f) })
  /* A seção é uma camada, não um atalho: `locked` é propriedade DELA e vira o piso dos
     seus campos. Antes isto gravava campo a campo — o que não sobrevivia a um campo novo
     criado depois na mesma seção. */
  const toggleSectionLocked = (sid: string) =>
    patch({ sections: screen.sections.map(sec => sec.id === sid ? { ...sec, locked: !sec.locked } : sec) })
  /* obrigatoriedade pela Lista: por TIPO no Fornecedor, global nas demais telas */
  const toggleFieldRequired = (id: string) => patch({ fields: screen.fields.map(f => {
    if (f.id !== id) return f
    if (!isPartner) return { ...f, required: !f.required }
    const req = new Set(f.requiredCategories ?? (f.required ? ALL_CATEGORIES : []))
    requiredFor(f, cat) ? req.delete(cat) : req.add(cat)
    return { ...f, required: req.size > 0, requiredCategories: [...req] }
  }) })

  /* Obrigatoriedade da SEÇÃO inteira: age só nos campos PERSONALIZADOS — a de um campo
     nativo é do sistema. Não é propriedade da seção, é um atalho sobre os campos dela. */
  const setSectionRequired = (sid: string, req: boolean) => patch({ fields: screen.fields.map(f => {
    if (f.sectionId !== sid || f.source !== 'CUSTOM') return f
    if (!isPartner) return { ...f, required: req }
    if (!fieldAppliesTo(f, cat)) return f
    const set = new Set(f.requiredCategories ?? (f.required ? ALL_CATEGORIES : []))
    req ? set.add(cat) : set.delete(cat)
    return { ...f, required: set.size > 0, requiredCategories: [...set] }
  }) })

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

  /* resolvedores usados na matriz: por tipo (Fornecedor) ou globais (demais telas) */
  const blockKeys     = blockKeysOf(screen.subjectType)
  const fieldRequired = (f: ScreenField) => isPartner ? requiredFor(f, cat) : f.required
  const fieldApplies  = (f: ScreenField) => isPartner ? fieldAppliesTo(f, cat) : true
  const fieldVisible  = (f: ScreenField) => isPartner ? fieldVisibleFor(f, cat) : f.visible !== false
  const toggleField   = (f: ScreenField) => isPartner ? toggleFieldCategory(f.id, cat) : toggleFieldVisible(f.id)
  const setSectionVis = (sid: string, vis: boolean) => isPartner ? setSectionCategoryFields(sid, cat, vis) : setSectionFields(sid, vis)

  /* salvar */
  const handleSave = async () => {
    if (!screen.name.trim()) { setErr('Dê um nome à tela'); return }
    setSaving(true); setErr('')
    const sortedSections = sections.map((s, i) => ({ id: s.id, label: s.label, name: s.name, source: s.source ?? 'CUSTOM', nativeKey: s.nativeKey, visible: s.visible !== false, locked: s.locked ?? false, order: i, defaultOpen: s.defaultOpen }))
    const normFields = sortedSections.flatMap(s => fieldsOf(s.id).map((f, i) => ({ id: f.id, fieldKey: f.fieldKey, sectionId: s.id, name: f.name, label: f.label, type: f.type, source: f.source, nativeKey: f.nativeKey, mode: f.mode, locked: f.locked ?? false, visible: f.visible !== false, required: f.required, placeholder: f.placeholder, options: f.options, validation: f.validation, hiddenCategories: f.hiddenCategories ?? [], requiredCategories: f.requiredCategories ?? undefined, order: i })))
    const saved = await saveScreen(screen.id || null, { name: screen.name.trim(), description: screen.description ?? '', subjectType: screen.subjectType, status: screen.status, isDefault: screen.isDefault ?? false, isSystem: screen.isSystem ?? false, readOnly: screen.readOnly ?? false, sections: sortedSections, fields: normFields })
    setSaving(false)
    if (!saved) { setErr('Falha ao salvar. Tente novamente.'); return }
    router.push('/settings/telas')
  }

  return (
    <div className="max-w-[1240px] mx-auto pb-16">

      {/* ── barra fixa: título editável + padrão + modo + salvar ── */}
      <div className="glass-panel sticky top-0 z-30 -mt-4 mb-4 border-b">
        <div className="flex items-center gap-3 py-2.5">
          <button onClick={() => router.push('/settings/telas')} title="Voltar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <input value={screen.name} onChange={e => { patch({ name: e.target.value }); setErr('') }} placeholder="Nome da tela"
              className="w-full max-w-[560px] rounded-md bg-transparent px-1 -mx-1 text-[15px] font-bold tracking-tight outline-none hover:bg-muted/50 focus:bg-card focus:ring-1 focus:ring-ring transition-colors" />
            <p className="text-[11px] text-muted-foreground mt-0.5">{screen.id ? 'Editando a tela' : 'Nova tela'} — marque o que aparece, o que pode ser alterado e o que é obrigatório</p>
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
            <button onClick={() => setMode('config')} className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors', mode === 'config' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <Rows3 className="h-3.5 w-3.5" />Configuração
            </button>
            <button onClick={() => setMode('preview')} className={cn('px-3 py-1.5 flex items-center gap-1.5 border-l transition-colors', mode === 'preview' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <Eye className="h-3.5 w-3.5" />Prévia
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

            {/* Somente consulta: trava a tela INTEIRA. É o piso — a atividade do
                workflow pode travar mais campos, nunca menos. */}
            <div className="pt-1 border-t space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />Somente consulta
                </label>
                <Switch on={!!screen.readOnly} onClick={() => patch({ readOnly: !screen.readOnly })} sm
                  title={screen.readOnly ? 'Tela em consulta — nenhum campo é editável' : 'Tela permite alterações'} />
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {screen.readOnly
                  ? 'Nenhum campo é editável e nada é gravado por esta tela.'
                  : 'A tela permite alterações. Trave campo a campo pelo cadeado.'}
              </p>
            </div>
          </div>

          {/* pendências: obrigatório E travado — ninguém consegue preencher */}
          {pendencias.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 shadow-sm p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />{pendencias.length === 1 ? '1 campo sem saída' : `${pendencias.length} campos sem saída`}
              </p>
              <div className="space-y-1">
                {pendencias.map(pend => (
                  <button key={pend.fieldId} onClick={() => {
                    setMode('config')
                    if (pend.sectionId) {
                      const sid = pend.sectionId
                      setCollapsed(prev => { const n = new Set(prev); n.delete(sid); return n })
                      setTimeout(() => jumpTo(sid), 0)   // a seção pode estar recolhida: rola depois de abrir
                    }
                  }}
                    className="w-full text-left text-[11px] leading-snug text-foreground/90 rounded px-1.5 py-1 hover:bg-amber-500/10 transition-colors">
                    {fraseDaPendencia(pend)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                Salvar continua liberado: faz sentido quando o valor chega por outra via (importação, ação automática, etapa anterior).
              </p>
            </div>
          )}

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
              { n: screen.readOnly ? nNative + nCustom : nLocked, l: screen.readOnly ? 'travados (tela em consulta)' : 'travados (só consulta)', c: 'bg-slate-500' },
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
              {mode === 'config' ? 'Campos da tela' : 'Prévia — como o usuário verá'}
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
            /* ── a MATRIZ ──
               Uma linha por campo, três colunas de decisão. A linha da SEÇÃO usa as MESMAS
               colunas: é a camada de cima, não um cabeçalho com botões avulsos. */
            /* sem `overflow-*` no container: qualquer overflow aqui viraria o contexto de
               rolagem do `sticky` e o cabeçalho pararia de grudar na barra do topo. */
            <div className="rounded-xl border bg-card shadow-sm">
              <table className="w-full text-xs">
                <thead className="sticky top-[68px] z-20">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground [&_th]:bg-muted [&_th]:border-b">
                    <th className="text-left font-semibold px-3 py-1.5 rounded-tl-xl">Campo</th>
                    <th className="text-left font-semibold px-2 py-1.5 w-36">Tipo</th>
                    <th className="text-center font-semibold px-2 py-1.5 w-24">Aparece</th>
                    <th className="text-center font-semibold px-2 py-1.5 w-28">Pode editar</th>
                    <th className="text-center font-semibold px-2 py-1.5 w-28 rounded-tr-xl">Obrigatório</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((s, sIdx) => {
                    const applicable = fieldsOf(s.id).filter(fieldApplies)
                    const visiveis   = applicable.filter(fieldVisible)
                    const isNativeSec = s.source === 'NATIVE'
                    const isBlockSec  = isNativeSec && !!s.nativeKey && blockKeys.has(s.nativeKey)
                    const naNoTipo    = isPartner && isNativeSec && !isBlockSec && applicable.length === 0
                    const secHidden   = s.visible === false
                    const secTravada  = !!s.locked || !!screen.readOnly
                    const isColl      = collapsed.has(s.id)
                    const wontShow    = !secHidden && !naNoTipo && !isBlockSec && applicable.length > 0 && visiveis.length === 0
                    // obrigatoriedade em lote: só os personalizados têm essa chave
                    const customs = applicable.filter(f => f.source === 'CUSTOM')
                    const allReq  = customs.length > 0 && customs.every(fieldRequired)
                    const someReq = customs.some(fieldRequired)

                    return (
                      <Fragment key={s.id}>
                        {/* ── a seção: a camada de cima, nas mesmas colunas ── */}
                        <tr id={`sec-${s.id}`} className={cn('group/sec scroll-mt-24 border-y bg-muted/25', (secHidden || naNoTipo) && 'opacity-60')}>
                          <td className="px-3 py-1.5">
                            {renamingSection === s.id ? (
                              <div className="flex items-center gap-1.5">
                                <input autoFocus value={renameLabel} onChange={e => setRenameLabel(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') renameSection(s.id); if (e.key === 'Escape') setRenamingSection(null) }}
                                  className={cn(inputCls, 'h-7 max-w-[280px]')} />
                                <button onClick={() => renameSection(s.id)} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setRenamingSection(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button onClick={() => toggleCollapsed(s.id)} disabled={applicable.length === 0}
                                  title={isColl ? 'Mostrar os campos' : 'Recolher os campos'}
                                  className={cn('text-muted-foreground hover:text-foreground transition-colors', applicable.length === 0 && 'invisible')}>
                                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isColl && '-rotate-90')} />
                                </button>
                                <span className="font-bold text-[13px] tracking-tight truncate">{s.label}</span>
                                {applicable.length > 0 && (
                                  <span className={cn('font-mono tabular-nums text-[10px] shrink-0', wontShow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                                    {visiveis.length}/{applicable.length}
                                  </span>
                                )}
                                {wontShow  && <span className="text-[10.5px] font-medium text-amber-600 dark:text-amber-400 shrink-0">· nenhum campo aparece</span>}
                                {naNoTipo  && <span className="text-[10.5px] font-medium text-muted-foreground shrink-0">· não se aplica a este tipo</span>}

                                <span className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover/sec:opacity-100 focus-within:opacity-100 transition-opacity">
                                  <button onClick={() => { setRenamingSection(s.id); setRenameLabel(s.label) }} title="Renomear seção" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>
                                  <div className="relative">
                                    <button onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)} title="Mais" className={iconBtn}><MoreHorizontal className="h-3.5 w-3.5" /></button>
                                    {menuOpen === s.id && (
                                      <>
                                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                                        <div className="glass absolute right-0 top-full mt-1 z-50 w-56 rounded-xl py-1 text-xs">
                                          {applicable.length > 0 && (
                                            <>
                                              <button onClick={() => { setSectionVis(s.id, true); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Eye className="h-3.5 w-3.5" />Mostrar todos os campos</button>
                                              <button onClick={() => { setSectionVis(s.id, false); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Eye className="h-3.5 w-3.5 opacity-40" />Ocultar todos os campos</button>
                                              <div className="my-1 border-t" />
                                            </>
                                          )}
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
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-[10.5px] text-muted-foreground">
                            {isBlockSec ? 'Seção inteira' : isNativeSec ? 'Nativa' : 'Personalizada'}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Marca on={!secHidden} onClick={() => toggleSectionVisible(s.id)}
                              title={secHidden ? 'Seção oculta no cadastro' : 'Seção aparece no cadastro'} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Marca on={!secTravada} tone="amber" disabled={!!screen.readOnly} onClick={() => toggleSectionLocked(s.id)}
                              title={screen.readOnly ? 'A tela inteira está em somente consulta'
                                : secTravada ? 'Seção em somente consulta — clique para permitir alterações'
                                             : 'Seção permite alterações — clique para deixá-la só consulta'} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {customs.length === 0
                              ? <span className="text-muted-foreground/50" title="Só campos criados por você têm obrigatoriedade configurável">—</span>
                              : <Marca on={allReq} half={someReq && !allReq} onClick={() => setSectionRequired(s.id, !allReq)}
                                  title={allReq ? 'Todos os campos desta seção são obrigatórios' : 'Tornar obrigatórios os campos desta seção'} />}
                          </td>
                        </tr>

                        {/* ── os campos ── */}
                        {!isColl && applicable.map(f => {
                          const native    = f.source === 'NATIVE'
                          const vis       = fieldVisible(f)
                          const travado   = isTravado(f)
                          const pisoAcima = secLocked(f.sectionId)
                          return (
                            <tr key={f.id} className={cn('group/f border-b last:border-0 hover:bg-muted/30 transition-colors', !vis && 'opacity-55')}>
                              <td className="px-3 py-1">
                                <span className="flex items-center gap-1.5 pl-[26px]">
                                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', native ? 'bg-blue-500' : 'bg-primary')} />
                                  <span className="truncate">{f.label}</span>
                                  {!native && (
                                    <span className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover/f:opacity-100 focus-within:opacity-100 transition-opacity">
                                      <button onClick={() => setEditingField(f)} title="Editar campo" className={iconBtn}><Pencil className="h-3 w-3" /></button>
                                      <button onClick={() => setExcluindoCampo(f)} title={`Excluir do ${SUBJECT_LABELS[screen.subjectType]} — sai de todas as telas`} className={cn(iconBtn, 'hover:text-destructive')}><Trash2 className="h-3 w-3" /></button>
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-[10.5px] text-muted-foreground truncate">
                                {native ? 'Do sistema' : FIELD_TYPE_LABELS[f.type]}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <Marca on={vis} onClick={() => toggleField(f)}
                                  title={vis ? 'Aparece no cadastro' : 'Oculto no cadastro'} />
                              </td>
                              <td className="px-2 py-1 text-center">
                                {vis
                                  ? <Marca on={!travado} tone="amber" disabled={pisoAcima} onClick={() => toggleFieldLocked(f.id)}
                                      title={screen.readOnly ? 'A tela inteira está em somente consulta'
                                        : pisoAcima ? 'A seção inteira está em somente consulta'
                                          : travado ? 'Travado — só consulta' : 'Editável'} />
                                  : <span className="text-muted-foreground/50" title="Campo oculto — não há o que editar">—</span>}
                              </td>
                              <td className="px-2 py-1 text-center">
                                {!vis
                                  ? <span className="text-muted-foreground/50" title="Campo oculto — não há o que exigir">—</span>
                                  : native
                                    ? <span className="text-muted-foreground/50" title="A obrigatoriedade de um campo do sistema é definida por ele">—</span>
                                    : <Marca on={fieldRequired(f)} onClick={() => toggleFieldRequired(f.id)}
                                        title={isPartner ? `Obrigatório em ${PARTNER_CATEGORIES.find(c => c.value === cat)?.label}` : 'Obrigatório no cadastro'} />}
                              </td>
                            </tr>
                          )
                        })}

                        {/* seção-bloco: não há campo a campo dentro dela */}
                        {!isColl && isBlockSec && (
                          <tr className="border-b last:border-0">
                            <td colSpan={5} className="px-3 py-1 pl-[52px] text-[10.5px] text-muted-foreground italic">
                              Bloco pronto do sistema — a tela decide se ele aparece e se aceita alteração.
                            </td>
                          </tr>
                        )}

                        {!isColl && naNoTipo && (
                          <tr className="border-b last:border-0">
                            <td colSpan={5} className="px-3 py-1 pl-[52px] text-[10.5px] text-muted-foreground italic">
                              Não se aplica a {PARTNER_CATEGORIES.find(c => c.value === cat)?.label}.
                            </td>
                          </tr>
                        )}

                        {!isColl && !isBlockSec && !naNoTipo && (
                          <tr className="border-b last:border-0">
                            <td colSpan={5} className="px-3 py-1">
                              <button onClick={() => setAddingToSection(s.id)}
                                className="ml-[26px] inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline transition-colors">
                                <Plus className="h-3 w-3" />Novo campo nesta seção
                              </button>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>

              <p className="px-3 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground leading-snug">
                <b className="font-semibold text-foreground/80">Tela → seção → campo</b>: cada nível só aperta. Travar a seção trava os campos dela, e destravar o campo não vence a seção.
                {' '}<b className="font-semibold text-foreground/80">Pode editar</b> vale para a tela inteira, em todos os tipos.
                {' '}Campo criado aqui passa a existir em todas as telas de {SUBJECT_LABELS[screen.subjectType]} — <b className="font-semibold text-foreground/80">apagado</b> nas outras, até alguém marcá-lo.
                {isPartner && <> <b className="font-semibold text-foreground/80">Aparece</b> e <b className="font-semibold text-foreground/80">Obrigatório</b> são do tipo em edição ({PARTNER_CATEGORIES.find(c => c.value === cat)?.label}).</>}
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={!!excluindoCampo} tone="danger" title="Excluir campo" confirmLabel="Excluir"
        description={<>Excluir <b>“{excluindoCampo?.label}”</b>? O campo é do {SUBJECT_LABELS[screen.subjectType]}, não desta tela — ele sai de <b>todas</b> as telas, e o que já foi preenchido deixa de ser exibido. Para tirá-lo só daqui, desmarque <b>Aparece</b>.</>}
        onConfirm={() => { if (excluindoCampo) removeField(excluindoCampo.id); setExcluindoCampo(null) }}
        onClose={() => setExcluindoCampo(null)} />

      {(editingField || addingToSection) && (
        <ScreenFieldEditor sections={sections} subjectType={screen.subjectType} initial={editingField ?? undefined} defaultSectionId={addingToSection ?? undefined}
          onClose={() => { setEditingField(null); setAddingToSection(null) }} onSave={upsertField} />
      )}
    </div>
  )
}
