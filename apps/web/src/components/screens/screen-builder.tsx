'use client'

import { Fragment, useRef, useState } from 'react'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X,
  MoreHorizontal, Star, Lock, Eye, AlertTriangle, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { gravarTela, useScreens, useUsoDasTelas } from '@/hooks/use-screens'
import {
  SUBJECT_LABELS, STATUS_LABELS, FIELD_TYPE_LABELS, PARTNER_CATEGORIES, slug,
  fieldValueKey, mesmoNomeDeTela,
  type Screen, type ScreenField, type ScreenSection, type ScreenSubject, type ScreenStatus, type PartnerCategory,
} from '@/lib/screen-types'
import { buildNativeSeed, reconcileNative } from '@/lib/screen-native-structure'
import { fieldAppliesTo, fieldVisibleFor, requiredFor } from '@/lib/screen-partner-categories'
import { PARTNER_BLOCK_SECTIONS } from '@/lib/screen-partner-layout'
import { CONTRACT_BLOCK_SECTIONS } from '@/lib/screen-contract-layout'
import { pendenciasDeTrava, fraseDaPendencia } from '@/lib/screen-locks'
import { nativoObrigatorioConfiguravel } from '@/lib/campos-obrigatorios'
import { ScreenRenderer } from './screen-renderer'
import { ScreenFieldEditor } from './screen-field-editor'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ESTADOS, ROTULO_DO_ESTADO, aplicarEstado, estadoDoCampo, type EstadoDoCampo } from '@/lib/estado-do-campo'

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
const iconBtn  = 'h-[var(--lista-acao)] w-[var(--lista-acao)] inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'

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

const blank = (subjectType: ScreenSubject): Screen => {
  const seed = buildNativeSeed(subjectType)
  return { id: '', name: '', description: '', subjectType, status: 'DRAFT', isDefault: false, ...seed }
}

export function ScreenBuilder({ initial }: { initial?: Screen }) {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>(initial ? normalizePartner(reconcileNative(initial)) : blank('FORNECEDOR'))
  const [mode, setMode] = useState<'config' | 'preview'>('config')
  const [cat, setCat] = useState<PartnerCategory>('PJ_BR')  // tipo em edição (Fornecedor)
  /* As seções começam fechadas, menos a primeira (opção A do PO): fechada, a seção resume o que tem. */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const ordem = [...(initial?.sections ?? [])].sort((a, b) => a.order - b.order)
    return new Set(ordem.slice(1).map(sec => sec.id))
  })
  const [sobre, setSobre] = useState(false)
  const [editingField, setEditingField] = useState<ScreenField | null>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameLabel, setRenameLabel] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  /** Botão "Mais" da seção com o menu aberto — é nele que o menu flutuante se ancora. */
  const maisAncora = useRef<HTMLButtonElement | null>(null)
  /* campo personalizado é do TIPO: excluir tira de TODAS as telas, então pergunta antes */
  const [excluindoCampo, setExcluindoCampo] = useState<ScreenField | null>(null)
  const [excluindoSecao, setExcluindoSecao] = useState<ScreenSection | null>(null)
  /* CHAVES que o usuário mandou excluir do tipo. O servidor só apaga o que está aqui:
     campo que some do payload por qualquer outro motivo fica onde está. */
  const [removidos, setRemovidos] = useState<string[]>([])
  const marcarRemovido = (fs: ScreenField[]) =>
    setRemovidos(prev => [...new Set([...prev, ...fs.filter(f => f.source === 'CUSTOM').map(fieldValueKey)])])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const patch = (p: Partial<Screen>) => setScreen(s => ({ ...s, ...p }))
  const sections = [...screen.sections].sort((a, b) => a.order - b.order)
  const fieldsOf = (sid: string) => screen.fields.filter(f => f.sectionId === sid).sort((a, b) => a.order - b.order)

  /* Piso vindo de CIMA (tela ou seção): ali o campo não decide sozinho.
     Declarado ANTES do primeiro uso de propósito — `const` não sofre hoisting. */
  const secLocked = (sid?: string) => !!screen.readOnly || (!!sid && !!screen.sections.find(x => x.id === sid)?.locked)
  const isTravado = (f: ScreenField) => secLocked(f.sectionId) || !!f.locked

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
  /* Excluir seção leva os campos personalizados dela junto — e eles são do TIPO, então
     saem de todas as telas. Por isso passa pelo mesmo diálogo do campo avulso: antes isto
     apagava campo de todo mundo em silêncio, sem nem perguntar. */
  const removeSection = (sid: string) => {
    marcarRemovido(screen.fields.filter(f => f.sectionId === sid))
    patch({ sections: screen.sections.filter(s => s.id !== sid), fields: screen.fields.filter(f => f.sectionId !== sid) })
  }
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

  /* campos */
  const upsertField = (field: ScreenField) => {
    const exists = screen.fields.some(f => f.id === field.id)
    if (exists) patch({ fields: screen.fields.map(f => f.id === field.id ? field : f) })
    else patch({ fields: [...screen.fields, { ...field, order: fieldsOf(field.sectionId ?? '').length }] })
    setEditingField(null); setAddingToSection(null)
  }
  const removeField = (id: string) => patch({ fields: screen.fields.filter(f => f.id !== id) })

  /* A marca "Obrigatório" vale para os personalizados e para os nativos do Contrato que a
     aceitam (regra em obrigatorios.ts). Nos demais nativos, quem define é o sistema. */
  const aceitaObrigatorio = (f: ScreenField) => f.source === 'CUSTOM' || nativoObrigatorioConfiguravel(screen.subjectType, f.nativeKey ?? '')

  /* ── visibilidade e obrigatório POR TIPO (Fornecedor); a trava é do campo inteiro ── */
  const isPartner = screen.subjectType === 'FORNECEDOR'
  const blockKeys     = blockKeysOf(screen.subjectType)
  const fieldRequired = (f: ScreenField) => isPartner ? requiredFor(f, cat) : f.required
  const fieldApplies  = (f: ScreenField) => isPartner ? fieldAppliesTo(f, cat) : true
  const fieldVisible  = (f: ScreenField) => isPartner ? fieldVisibleFor(f, cat) : f.visible !== false

  /* ── o estado de cada campo (opção A do PO, 23/11/2026) ── */
  const parceiroCtx = isPartner ? { cat, todas: ALL_CATEGORIES } : undefined
  /* Número e Título o sistema exige em toda gravação de contrato (obrigatorios.ts). */
  const exigidoPeloSistema = (f: ScreenField) => screen.subjectType === 'CONTRATO' && (f.nativeKey === 'numero' || f.nativeKey === 'titulo')
  const obrigatorioDe = (f: ScreenField) => fieldRequired(f) || exigidoPeloSistema(f)
  const estadoDe = (f: ScreenField) => estadoDoCampo(fieldVisible(f), isTravado(f), obrigatorioDe(f))
  const comEstado = (f: ScreenField, e: EstadoDoCampo) =>
    aplicarEstado(f, e === 'OBRIGATORIO' && !aceitaObrigatorio(f) && !fieldRequired(f) ? 'EDITAVEL' : e,
      { aceitaObrigatorio: aceitaObrigatorio(f), parceiro: parceiroCtx })
  const setEstado = (f: ScreenField, e: EstadoDoCampo) => patch({ fields: screen.fields.map(x => x.id === f.id ? comEstado(x, e) : x) })
  /* "Aplicar a todos" da seção: solta as camadas de cima (seção oculta ou travada) e grava
     o estado em cada campo — assim nada fica preso num piso que a lista não mostra. */
  const aplicarNaSecao = (sid: string, e: EstadoDoCampo) => patch({
    sections: screen.sections.map(sec => sec.id === sid ? { ...sec, visible: true, locked: false } : sec),
    fields: screen.fields.map(x => x.sectionId === sid && fieldApplies(x) ? comEstado(x, e) : x),
  })
  /* Bloco do sistema (Partes, Pagamentos…): o estado é da seção inteira. */
  const estadoDoBloco = (s: ScreenSection): EstadoDoCampo => s.visible === false ? 'OCULTO' : (s.locked || screen.readOnly) ? 'LEITURA' : 'EDITAVEL'
  const setEstadoDoBloco = (sid: string, e: EstadoDoCampo) =>
    patch({ sections: screen.sections.map(sec => sec.id === sid ? { ...sec, visible: e !== 'OCULTO', locked: e === 'LEITURA' } : sec) })
  /** Por que uma opção não vale para o campo (vazio = vale). */
  const motivoDoEstado = (f: ScreenField, e: EstadoDoCampo): string => {
    if (e === 'EDITAVEL' || e === 'OBRIGATORIO') {
      if (screen.readOnly) return 'A tela inteira é somente consulta (em Sobre a tela)'
      if (secLocked(f.sectionId)) return 'A seção está só leitura: use "aplicar a todos" na seção'
    }
    if (!aceitaObrigatorio(f)) {
      if (e === 'OBRIGATORIO' && !obrigatorioDe(f)) return 'A obrigatoriedade deste campo é definida pelo sistema'
      if (e === 'EDITAVEL' && obrigatorioDe(f)) return 'O sistema exige este campo'
    }
    return ''
  }
  const resumoDaSecao = (campos: ScreenField[]) => {
    const n = (e: EstadoDoCampo) => campos.filter(f => estadoDe(f) === e).length
    const partes = [`${campos.length} ${campos.length === 1 ? 'campo' : 'campos'}`]
    if (n('OBRIGATORIO')) partes.push(`${n('OBRIGATORIO')} ${n('OBRIGATORIO') === 1 ? 'obrigatório' : 'obrigatórios'}`)
    if (n('LEITURA')) partes.push(`${n('LEITURA')} só leitura`)
    if (n('OCULTO')) partes.push(`${n('OCULTO')} ${n('OCULTO') === 1 ? 'oculto' : 'ocultos'}`)
    return partes.join(' · ')
  }
  const primeiraSecaoDeCampos = sections.find(s => !(s.source === 'NATIVE' && s.nativeKey && blockKeys.has(s.nativeKey)))

  /* salvar */
  const handleSave = async () => {
    if (!screen.name.trim()) { setErr('Dê um nome à tela'); return }
    setSaving(true); setErr('')
    const sortedSections = sections.map((s, i) => ({ id: s.id, sectionKey: s.sectionKey, label: s.label, name: s.name, source: s.source ?? 'CUSTOM', nativeKey: s.nativeKey, visible: s.visible !== false, locked: s.locked ?? false, order: i, defaultOpen: s.defaultOpen }))
    const normFields = sortedSections.flatMap(s => fieldsOf(s.id).map((f, i) => ({ id: f.id, fieldKey: f.fieldKey, sectionId: s.id, name: f.name, label: f.label, type: f.type, source: f.source, nativeKey: f.nativeKey, mode: f.mode, locked: f.locked ?? false, visible: f.visible !== false, required: f.required, placeholder: f.placeholder, options: f.options, validation: f.validation, hiddenCategories: f.hiddenCategories ?? [], requiredCategories: f.requiredCategories ?? undefined, order: i })))
    const r = await gravarTela(screen.id || null, { name: screen.name.trim(), description: screen.description ?? '', subjectType: screen.subjectType, status: screen.status, isDefault: screen.isDefault ?? false, isSystem: screen.isSystem ?? false, readOnly: screen.readOnly ?? false, sections: sortedSections, fields: normFields, removedFieldKeys: removidos })
    setSaving(false)
    if ('erro' in r) { setErr(r.erro); return }
    router.push('/settings/telas')
  }

  const nomeDaCategoria = PARTNER_CATEGORIES.find(c => c.value === cat)?.label

  return (
    <div className="max-w-[1100px] mx-auto pb-16">

      {/* ── topo: nome, o essencial numa linha, e três ações ── */}
      <div className="glass-panel sticky top-0 z-30 mb-4 border-b">
        <div className="flex flex-wrap items-center gap-3 py-2.5">
          <button onClick={() => router.push('/settings/telas')} title="Voltar" aria-label="Voltar para Telas" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <input value={screen.name} onChange={e => { patch({ name: e.target.value }); setErr('') }} placeholder="Nome da tela" aria-label="Nome da tela"
              className="w-full max-w-[560px] rounded-md bg-transparent px-1 -mx-1 text-[15px] font-bold tracking-tight outline-none hover:bg-muted/50 focus:bg-card focus:ring-1 focus:ring-ring transition-colors" />
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {screen.code ? <span className="font-mono text-foreground/80" title="Código da tela, gerado pelo sistema">{screen.code} · </span> : null}
              {SUBJECT_LABELS[screen.subjectType]} · {STATUS_LABELS[isSystemScreen ? 'ACTIVE' : screen.status]}
              {screen.isDefault ? ' · padrão' : ''}
              {screen.readOnly ? ' · somente consulta' : ''}
              {screen.id ? <> · <ResumoDoUso telaId={screen.id} /></> : ' · o código é gerado ao salvar'}
            </p>
            <AvisoDeNomeRepetido telaId={screen.id} nome={screen.name} subjectType={screen.subjectType} />
          </div>

          <button onClick={() => setSobre(true)} aria-haspopup="dialog"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors shrink-0">
            <Settings2 className="h-3.5 w-3.5" />Sobre a tela
          </button>

          <div role="tablist" aria-label="Modo" className="inline-flex rounded-lg border overflow-hidden text-xs font-semibold shrink-0">
            <button role="tab" aria-selected={mode === 'config'} onClick={() => setMode('config')} className={cn('px-3 py-1.5 transition-colors', mode === 'config' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>Campos</button>
            <button role="tab" aria-selected={mode === 'preview'} onClick={() => setMode('preview')} className={cn('px-3 py-1.5 flex items-center gap-1.5 border-l transition-colors', mode === 'preview' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
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

      {/* avisos: só quando existem */}
      {screen.readOnly && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5 shrink-0" />Tela de somente consulta: nenhum campo é editável. Mude em “Sobre a tela”.
        </p>
      )}
      {pendencias.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />{pendencias.length === 1 ? '1 campo obrigatório que ninguém consegue preencher' : `${pendencias.length} campos obrigatórios que ninguém consegue preencher`}
          </p>
          <div className="mt-1 flex flex-col">
            {pendencias.map(pend => (
              <button key={pend.fieldId} onClick={() => {
                setMode('config')
                if (pend.sectionId) {
                  const sid = pend.sectionId
                  setCollapsed(prev => { const n = new Set(prev); n.delete(sid); return n })
                  setTimeout(() => jumpTo(sid), 0)   // a seção pode estar recolhida: rola depois de abrir
                }
              }} className="rounded px-1 py-0.5 text-left text-[11.5px] text-foreground/90 hover:bg-amber-500/10">
                {fraseDaPendencia(pend)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── linha de comando da lista ── */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        {isPartner && (
          <div role="tablist" aria-label="Categoria de parceiro em edição" className="inline-flex rounded-lg border overflow-hidden text-[11px] font-semibold">
            {PARTNER_CATEGORIES.map((c, i) => (
              <button key={c.value} role="tab" aria-selected={cat === c.value} onClick={() => setCat(c.value)}
                className={cn('px-2.5 py-1 transition-colors', i > 0 && 'border-l',
                  cat === c.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                {c.short}
              </button>
            ))}
          </div>
        )}
        <span className="text-[11.5px] text-muted-foreground">
          {mode === 'preview' ? 'Como o usuário verá' : isPartner ? <>Como cada campo fica para <b className="font-semibold text-foreground">{nomeDaCategoria}</b>.</> : 'Para cada campo, escolha como ele fica nesta tela.'}
          {mode === 'config' && <span className="ml-2 inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />campo personalizado</span>}
        </span>
        {mode === 'config' && primeiraSecaoDeCampos && (
          <button onClick={() => setAddingToSection(primeiraSecaoDeCampos.id)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-[11.5px] font-semibold text-primary hover:bg-primary/5 transition-colors">
            <Plus className="h-3.5 w-3.5" />Novo campo
          </button>
        )}
      </div>

      {mode === 'preview' ? (
        <ScreenRenderer screen={isPartner ? { ...screen, fields: screen.fields.filter(f => fieldVisibleFor(f, cat)) } : screen} nativeValue={emptyNative} />
      ) : (
        <div className="space-y-[calc(var(--lista-linha)/3)]">
          {sections.map((s, sIdx) => {
            const applicable  = fieldsOf(s.id).filter(fieldApplies)
            const isNativeSec = s.source === 'NATIVE'
            const isBlockSec  = isNativeSec && !!s.nativeKey && blockKeys.has(s.nativeKey)
            const naNoTipo    = isPartner && isNativeSec && !isBlockSec && applicable.length === 0
            const isColl      = collapsed.has(s.id)
            const camadas     = !isBlockSec && [s.visible === false && 'seção oculta', s.locked && 'seção só leitura'].filter(Boolean).join(' · ')
            return (
              <section key={s.id} id={`sec-${s.id}`} aria-label={s.label} className={cn('group/sec scroll-mt-24 rounded-xl border bg-card overflow-hidden', naNoTipo && 'opacity-60')}>
                <div className="flex min-h-[var(--lista-cab)] flex-wrap items-center gap-2 bg-muted/30 px-3 py-[var(--lista-py)]">
                  {renamingSection === s.id ? (
                    <div className="flex items-center gap-1.5">
                      <input autoFocus value={renameLabel} onChange={e => setRenameLabel(e.target.value)} aria-label="Nome da seção"
                        onKeyDown={e => { if (e.key === 'Enter') renameSection(s.id); if (e.key === 'Escape') setRenamingSection(null) }}
                        className={cn(inputCls, 'h-7 max-w-[280px]')} />
                      <button onClick={() => renameSection(s.id)} aria-label="Confirmar nome" className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setRenamingSection(null)} aria-label="Cancelar" className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => toggleCollapsed(s.id)} aria-expanded={!isColl} disabled={isBlockSec || applicable.length === 0}
                      className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default">
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isColl && '-rotate-90', (isBlockSec || applicable.length === 0) && 'invisible')} />
                      <span className="truncate text-[length:var(--lista-fonte)] font-bold tracking-tight">{s.label}</span>
                      {isColl && applicable.length > 0 && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{resumoDaSecao(applicable)}</span>}
                      {isBlockSec && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">bloco do sistema</span>}
                      {naNoTipo && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">não se aplica a {nomeDaCategoria}</span>}
                      {camadas && <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-400">{camadas}</span>}
                    </button>
                  )}

                  <span className="flex items-center gap-0.5 opacity-0 group-hover/sec:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button onClick={() => { setRenamingSection(s.id); setRenameLabel(s.label) }} title="Renomear seção" aria-label={`Renomear seção ${s.label}`} className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>
                    <button ref={(el) => { if (menuOpen === s.id) maisAncora.current = el }} aria-label={`Mais ações da seção ${s.label}`}
                      onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)} title="Mais" className={iconBtn}><MoreHorizontal className="h-3.5 w-3.5" /></button>
                    {menuOpen === s.id && (
                      <FloatingMenu anchor={maisAncora} onClose={() => setMenuOpen(null)} align="end" className="glass w-56 rounded-xl py-1 text-xs">
                        <button onClick={() => { moveSection(s.id, -1); setMenuOpen(null) }} disabled={sIdx === 0} className="w-full text-left px-3 py-1.5 hover:bg-muted disabled:opacity-40 flex items-center gap-2"><ChevronUp className="h-3.5 w-3.5" />Mover para cima</button>
                        <button onClick={() => { moveSection(s.id, 1); setMenuOpen(null) }} disabled={sIdx === sections.length - 1} className="w-full text-left px-3 py-1.5 hover:bg-muted disabled:opacity-40 flex items-center gap-2"><ChevronDown className="h-3.5 w-3.5" />Mover para baixo</button>
                        <button onClick={() => { toggleDefaultOpen(s.id); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2">
                          {s.defaultOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {s.defaultOpen ? 'No cadastro, começa recolhida' : 'No cadastro, começa aberta'}
                        </button>
                        {!isBlockSec && !naNoTipo && <button onClick={() => { setAddingToSection(s.id); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Plus className="h-3.5 w-3.5" />Novo campo nesta seção</button>}
                        {!isNativeSec && <button onClick={() => { setExcluindoSecao(s); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" />Excluir seção</button>}
                      </FloatingMenu>
                    )}
                  </span>

                  <span className="ml-auto flex items-center gap-2">
                    {isBlockSec ? (
                      <SeletorDeEstado rotulo={`Estado do bloco ${s.label}`} valor={estadoDoBloco(s)} onEscolher={(e) => setEstadoDoBloco(s.id, e)}
                        estados={ESTADOS_DO_BLOCO} motivo={(e) => e === 'EDITAVEL' && screen.readOnly ? 'A tela inteira é somente consulta (em Sobre a tela)' : ''} />
                    ) : !isColl && applicable.length > 0 && (
                      <>
                        <span className="text-[10.5px] text-muted-foreground">aplicar a todos:</span>
                        <SeletorDeEstado rotulo={`Aplicar a todos os campos de ${s.label}`} acao onEscolher={(e) => aplicarNaSecao(s.id, e)}
                          motivo={(e) => (e === 'EDITAVEL' || e === 'OBRIGATORIO') && screen.readOnly ? 'A tela inteira é somente consulta (em Sobre a tela)' : ''} />
                      </>
                    )}
                  </span>
                </div>

                {!isColl && !isBlockSec && applicable.map(f => {
                  const e = estadoDe(f)
                  const doSistema = !aceitaObrigatorio(f) && obrigatorioDe(f)
                  return (
                    <div key={f.id} className={cn('group/f flex min-h-[var(--lista-linha)] flex-wrap items-center gap-2 border-t px-3 py-[var(--lista-py)] pl-9 hover:bg-muted/20', e === 'OCULTO' && 'text-muted-foreground')}>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[length:var(--lista-fonte)] leading-[var(--lista-lh)]" title={FIELD_TYPE_LABELS[f.type]}>
                        <span className="truncate">{f.label}</span>
                        {f.source === 'CUSTOM' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Campo personalizado" aria-label="personalizado" />}
                        {doSistema && <span className="shrink-0 text-[10.5px] text-muted-foreground">exigido pelo sistema</span>}
                        {f.source === 'CUSTOM' && (
                          <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/f:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button onClick={() => setEditingField(f)} title="Editar campo" aria-label={`Editar campo ${f.label}`} className={iconBtn}><Pencil className="h-3 w-3" /></button>
                            <button onClick={() => setExcluindoCampo(f)} title={`Excluir do ${SUBJECT_LABELS[screen.subjectType]} — sai de todas as telas`} aria-label={`Excluir campo ${f.label}`} className={cn(iconBtn, 'hover:text-destructive')}><Trash2 className="h-3 w-3" /></button>
                          </span>
                        )}
                      </span>
                      <SeletorDeEstado rotulo={`Estado de ${f.label}`} valor={e} onEscolher={(novo) => setEstado(f, novo)} motivo={(op) => motivoDoEstado(f, op)} />
                    </div>
                  )
                })}
              </section>
            )
          })}

          {addingSection ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-dashed p-2">
              <input autoFocus value={newSectionLabel} onChange={e => setNewSectionLabel(e.target.value)} aria-label="Nome da nova seção"
                onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setAddingSection(false) }}
                placeholder="Nome da seção" className={cn(inputCls, 'h-7 max-w-[320px]')} />
              <button onClick={addSection} aria-label="Criar seção" className="text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
              <button onClick={() => { setAddingSection(false); setNewSectionLabel('') }} aria-label="Cancelar" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)} className="w-full rounded-xl border border-dashed py-2 text-[12px] font-semibold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />Nova seção
            </button>
          )}
        </div>
      )}

      {/* ── "Sobre a tela": o que se ajusta uma vez ── */}
      {sobre && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setSobre(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSobre(false) }}>
          <div role="dialog" aria-modal="true" aria-label="Sobre a tela" onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-[380px] overflow-y-auto border-l bg-card p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Sobre a tela</p>
              <button autoFocus onClick={() => setSobre(false)} aria-label="Fechar" className={iconBtn}><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-1">
              <label htmlFor="sobre-tipo" className="text-[11px] font-medium text-muted-foreground">Aplica-se a</label>
              {/* tipo fixo depois de criada (PO, 23/11/2026): o código carrega o tipo */}
              <select id="sobre-tipo" value={screen.subjectType} onChange={e => changeSubject(e.target.value as ScreenSubject)} disabled={!!screen.isSystem || !!screen.id}
                className={cn(inputCls, (screen.isSystem || screen.id) && 'opacity-60 cursor-not-allowed')}>
                {(Object.keys(SUBJECT_LABELS) as ScreenSubject[]).map(v => <option key={v} value={v}>{SUBJECT_LABELS[v]}</option>)}
              </select>
              {screen.id && !screen.isSystem && <p className="text-[10.5px] text-muted-foreground">Fixo depois de criada. Para outro tipo, duplique a tela na lista.</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="sobre-situacao" className="text-[11px] font-medium text-muted-foreground">Situação</label>
              <select id="sobre-situacao" value={isSystemScreen ? 'ACTIVE' : screen.status} onChange={e => patch({ status: e.target.value as ScreenStatus })}
                disabled={isSystemScreen} className={cn(inputCls, isSystemScreen && 'opacity-60 cursor-not-allowed')}>
                {(Object.keys(STATUS_LABELS) as ScreenStatus[]).map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="sobre-descricao" className="text-[11px] font-medium text-muted-foreground">Descrição</label>
              <input id="sobre-descricao" value={screen.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="Opcional" className={inputCls} />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium flex items-center gap-1.5"><Star className={cn('h-3.5 w-3.5', screen.isDefault && 'fill-primary text-primary')} />Tela padrão do tipo</p>
                <p className="text-[10.5px] text-muted-foreground">
                  {isSystemScreen ? 'Tela base do sistema: sempre padrão e ativa.' : defaultLocked ? 'A padrão deste tipo é a tela base do sistema.' : 'Usada quando nenhuma outra é indicada.'}
                </p>
              </div>
              <Switch on={!!screen.isDefault} onClick={() => { if (!defaultLocked) patch({ isDefault: !screen.isDefault }) }} sm
                title={defaultLocked ? 'Não pode ser alterado' : screen.isDefault ? 'Deixar de ser padrão' : 'Tornar padrão'} />
            </div>

            {/* Somente consulta: trava a tela INTEIRA. É o piso — a atividade do workflow pode travar mais campos, nunca menos. */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />Somente consulta</p>
                <p className="text-[10.5px] text-muted-foreground">{screen.readOnly ? 'Nenhum campo é editável e nada é gravado por esta tela.' : 'A tela permite alterações.'}</p>
              </div>
              <Switch on={!!screen.readOnly} onClick={() => patch({ readOnly: !screen.readOnly })} sm
                title={screen.readOnly ? 'Permitir alterações' : 'Tornar somente consulta'} />
            </div>

            {screen.id && <UsadaEm telaId={screen.id} />}
          </div>
        </div>
      )}

      <ConfirmDialog open={!!excluindoCampo} tone="danger" title="Excluir campo" confirmLabel="Excluir"
        description={<>Excluir <b>“{excluindoCampo?.label}”</b>? O campo é do {SUBJECT_LABELS[screen.subjectType]}, não desta tela — ele sai de <b>todas</b> as telas, e o que já foi preenchido deixa de ser exibido. Para tirá-lo só daqui, deixe-o <b>Oculto</b>.</>}
        onConfirm={() => { if (excluindoCampo) { marcarRemovido([excluindoCampo]); removeField(excluindoCampo.id) } setExcluindoCampo(null) }}
        onClose={() => setExcluindoCampo(null)} />

      <ConfirmDialog open={!!excluindoSecao} tone="danger" title="Excluir seção" confirmLabel="Excluir"
        description={(() => {
          const n = excluindoSecao ? screen.fields.filter(f => f.sectionId === excluindoSecao.id && f.source === 'CUSTOM').length : 0
          return <>Excluir a seção <b>“{excluindoSecao?.label}”</b>?{n > 0 && <> Os <b>{n === 1 ? '1 campo' : `${n} campos`}</b> dentro dela {n === 1 ? 'é do' : 'são do'} {SUBJECT_LABELS[screen.subjectType]}, não desta tela — {n === 1 ? 'ele sai' : 'eles saem'} de <b>todas</b> as telas, e o que já foi preenchido deixa de ser exibido.</>}</>
        })()}
        onConfirm={() => { if (excluindoSecao) removeSection(excluindoSecao.id); setExcluindoSecao(null) }}
        onClose={() => setExcluindoSecao(null)} />

      {(editingField || addingToSection) && (
        <ScreenFieldEditor sections={sections} subjectType={screen.subjectType} initial={editingField ?? undefined} defaultSectionId={addingToSection ?? undefined}
          onClose={() => { setEditingField(null); setAddingToSection(null) }} onSave={upsertField} />
      )}
    </div>
  )
}

/** "Usada em" (PO, 23/11/2026): os workflows e as atividades que abrem esta tela. */
function UsadaEm({ telaId }: { telaId: string }) {
  const uso = useUsoDasTelas()
  const lista = uso?.[telaId] ?? []
  return (
    <div className="space-y-1.5 border-t pt-4">
      <p className="text-[11px] font-medium text-muted-foreground">Usada em</p>
      {!uso ? <p className="text-[11px] text-muted-foreground">Carregando…</p>
        : !lista.length ? <p className="text-[11px] text-muted-foreground">Nenhum workflow usa esta tela.</p>
        : (
          <ul className="space-y-1.5">
            {lista.map((u) => (
              <li key={u.workflowId} className="text-[11px] leading-snug">
                <Link href={`/workflows/${u.workflowId}/edit`} className="font-semibold hover:text-primary">{u.workflow}</Link>
                {u.status !== 'ACTIVE' && <span className="text-muted-foreground"> · {u.status === 'DRAFT' ? 'rascunho' : 'inativo'}</span>}
                <span className="block text-muted-foreground">{u.atividades.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

/** Nome repetido é permitido (PO, 23/11/2026): o nome é o título que o executor vê, e quem
 *  identifica a tela é o código. Só avisa, para quem escolhe na atividade olhar o código. */
function AvisoDeNomeRepetido({ telaId, nome, subjectType }: { telaId: string; nome: string; subjectType: ScreenSubject }) {
  const { screens } = useScreens(subjectType)
  const outras = screens.filter((t) => t.id !== telaId && mesmoNomeDeTela(t.name, nome))
  if (!outras.length) return null
  return (
    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      Também existe {outras.map((t) => t.code ?? 'outra tela').join(', ')} com este nome. Na atividade, diferencie pelo código.
    </p>
  )
}

/** Resumo do uso para o topo: "usada em 1 workflow". */
function ResumoDoUso({ telaId }: { telaId: string }) {
  const uso = useUsoDasTelas()
  if (!uso) return <span>…</span>
  const n = uso[telaId]?.length ?? 0
  return <span>{n === 0 ? 'nenhum workflow usa' : n === 1 ? 'usada em 1 workflow' : `usada em ${n} workflows`}</span>
}

/** Bloco do sistema não tem obrigatório: só aparece, travado ou não. */
const ESTADOS_DO_BLOCO: readonly EstadoDoCampo[] = ['OCULTO', 'LEITURA', 'EDITAVEL']

const TOM_DO_ESTADO: Record<EstadoDoCampo, string> = {
  OCULTO:      'bg-muted text-muted-foreground',
  LEITURA:     'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  EDITAVEL:    'bg-primary/10 text-primary',
  OBRIGATORIO: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
}

/** Os 4 estados num clique. Com `valor`, é a escolha do campo; com `acao`, aplica a todos. */
function SeletorDeEstado({ rotulo, valor, acao, onEscolher, motivo, estados = ESTADOS }: {
  rotulo: string; valor?: EstadoDoCampo; acao?: boolean; estados?: readonly EstadoDoCampo[]
  onEscolher: (e: EstadoDoCampo) => void; motivo: (e: EstadoDoCampo) => string
}) {
  return (
    <div role={acao ? 'group' : 'radiogroup'} aria-label={rotulo} className="inline-flex shrink-0 overflow-hidden rounded-md border text-[length:var(--lista-fonte)]">
      {estados.map((e, i) => {
        const porque = motivo(e)
        const marcado = valor === e
        return (
          <button key={e} type="button" role={acao ? undefined : 'radio'} aria-checked={acao ? undefined : marcado}
            disabled={!!porque && !marcado} title={porque || (acao ? `${ROTULO_DO_ESTADO[e]} em todos` : undefined)}
            onClick={() => { if (!marcado && !porque) onEscolher(e) }}
            className={cn('h-[var(--lista-acao)] px-2 leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40', i > 0 && 'border-l',
              marcado ? cn('font-semibold', TOM_DO_ESTADO[e]) : 'text-muted-foreground hover:bg-muted')}>
            {ROTULO_DO_ESTADO[e]}
          </button>
        )
      })}
    </div>
  )
}
