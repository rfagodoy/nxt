'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X, GripVertical,
  Lock, MoreHorizontal, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveScreen } from '@/hooks/use-screens'
import {
  SUBJECT_LABELS, STATUS_LABELS, FIELD_TYPE_LABELS, slug,
  type Screen, type ScreenSection, type ScreenField, type ScreenSubject, type ScreenStatus,
} from '@/lib/screen-types'
import { buildNativeSeed, reconcileNative } from '@/lib/screen-native-structure'
import { ScreenRenderer } from './screen-renderer'
import { ScreenFieldEditor } from './screen-field-editor'

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

/* dados de exemplo para a prévia parecer um formulário de verdade */
const SAMPLE: Record<string, string> = {
  razao_social: 'Alfatel Jundiaí Comércio de Telecom. Ltda', cnpj: 'M0.W63.GNB/0001-63', cpf: '123.456.789-00',
  codigo: 'INT-88213', nome_fantasia: 'Alfatel', data_abertura: '14/03/2012',
  natureza_juridica: '206-2 — Sociedade Empresária Limitada', ie: '110.042.490.114', im: '1.234.567',
  end_cidade: 'Jundiaí', end_estado: 'SP', end_cep: '13.201-005', con_nome: 'Fernando Sabino',
  con_email: 'contato@alfatel.com.br', con_telefone: '(11) 4527-8890', cnae_principal: '4652-4/00 — Comércio de componentes',
}
const sampleNative = (k: string) => SAMPLE[k] ?? ''

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

const iconBtn = 'h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'

const blank = (subjectType: ScreenSubject): Screen => {
  const seed = buildNativeSeed(subjectType)
  return { id: '', name: '', description: '', subjectType, status: 'DRAFT', isDefault: false, ...seed }
}

export function ScreenBuilder({ initial }: { initial?: Screen }) {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>(initial ? reconcileNative(initial) : blank('FORNECEDOR'))
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
  const nHidden = screen.fields.filter(f => f.visible === false).length + screen.sections.filter(s => s.visible === false).length

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
  const moveField = (sid: string, id: string, dir: -1 | 1) => {
    const list = fieldsOf(sid); const idx = list.findIndex(f => f.id === id); const to = idx + dir
    if (to < 0 || to >= list.length) return
    const arr = [...list]; [arr[idx], arr[to]] = [arr[to], arr[idx]]
    patch({ fields: [...screen.fields.filter(f => f.sectionId !== sid), ...arr.map((f, i) => ({ ...f, order: i }))] })
  }

  /* salvar */
  const handleSave = async () => {
    if (!screen.name.trim()) { setErr('Dê um nome à tela'); return }
    setSaving(true); setErr('')
    const sortedSections = sections.map((s, i) => ({ id: s.id, label: s.label, name: s.name, source: s.source ?? 'CUSTOM', nativeKey: s.nativeKey, visible: s.visible !== false, order: i, defaultOpen: s.defaultOpen }))
    const normFields = sortedSections.flatMap(s => fieldsOf(s.id).map((f, i) => ({ id: f.id, sectionId: s.id, name: f.name, label: f.label, type: f.type, source: f.source, nativeKey: f.nativeKey, mode: f.mode, visible: f.visible !== false, required: f.required, placeholder: f.placeholder, options: f.options, validation: f.validation, order: i })))
    const saved = await saveScreen(screen.id || null, { name: screen.name.trim(), description: screen.description ?? '', subjectType: screen.subjectType, status: screen.status, isDefault: screen.isDefault ?? false, isSystem: screen.isSystem ?? false, sections: sortedSections, fields: normFields })
    setSaving(false)
    if (!saved) { setErr('Falha ao salvar. Tente novamente.'); return }
    router.push('/settings/telas')
  }

  return (
    <div className="max-w-[1180px] mx-auto space-y-3">
      {/* cabeçalho */}
      <div className="flex items-center gap-2.5">
        <button onClick={() => router.push('/settings/telas')} title="Voltar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold tracking-tight">{screen.id ? 'Editar tela' : 'Nova tela'}</h1>
          <p className="text-[11px] text-muted-foreground">Nativos você só liga ou desliga. Personalizados você cria e edita. A prévia é como o fornecedor verá.</p>
        </div>
        {err && <span className="text-[11px] text-red-500">{err}</span>}
        <button onClick={() => void handleSave()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? 'Salvando…' : 'Salvar tela'}
        </button>
      </div>

      {/* meta */}
      <div className="rounded-xl border bg-card shadow-sm p-3.5 grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <div className="space-y-1 md:col-span-2">
          <label className="text-[11px] font-semibold text-muted-foreground">Nome da tela <span className="text-red-500">*</span></label>
          <input value={screen.name} onChange={e => { patch({ name: e.target.value }); setErr('') }} placeholder="ex: Cadastro de Fornecedor — Compras" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground">Aplica-se a</label>
          <select value={screen.subjectType} onChange={e => changeSubject(e.target.value as ScreenSubject)} disabled={!!screen.isSystem} className={cn(inputCls, screen.isSystem && 'opacity-60 cursor-not-allowed')}>
            {(Object.keys(SUBJECT_LABELS) as ScreenSubject[]).map(v => <option key={v} value={v}>{SUBJECT_LABELS[v]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground">Situação</label>
          <select value={screen.status} onChange={e => patch({ status: e.target.value as ScreenStatus })} className={inputCls}>
            {(Object.keys(STATUS_LABELS) as ScreenStatus[]).map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
          </select>
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="text-[11px] font-semibold text-muted-foreground">Descrição</label>
          <input value={screen.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="Para que serve esta tela (opcional)" className={inputCls} />
        </div>
        <label className="flex items-end gap-2.5 pb-1.5 cursor-pointer md:col-span-1" title="A tela padrão é a usada no cadastro deste tipo.">
          <input type="checkbox" checked={screen.isDefault ?? false} onChange={e => patch({ isDefault: e.target.checked })} className="mt-0.5 h-4 w-4 accent-primary shrink-0" />
          <span className="leading-tight">
            <span className="text-xs font-medium flex items-center gap-1"><Star className={cn('h-3 w-3', screen.isDefault ? 'text-primary fill-primary' : 'text-muted-foreground')} />Tela padrão do cadastro</span>
            <span className="text-[10px] text-muted-foreground">É a que aparece ao cadastrar</span>
          </span>
        </label>
      </div>

      {/* resumo */}
      <div className="flex flex-wrap gap-2">
        {[
          { n: nNative, l: 'campos nativos', c: 'bg-blue-500' },
          { n: nCustom, l: 'personalizados', c: 'bg-emerald-500' },
          { n: nHidden, l: 'ocultos no cadastro', c: 'bg-muted-foreground/50' },
          { n: sections.length, l: 'seções', c: '' },
        ].map(({ n, l, c }) => (
          <span key={l} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {c && <span className={cn('h-1.5 w-1.5 rounded-full', c)} />}<b className="text-foreground tabular-nums">{n}</b> {l}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── ESTRUTURA ── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Estrutura</p>
            <button onClick={() => setAddingSection(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"><Plus className="h-3.5 w-3.5" />Nova seção</button>
          </div>

          {addingSection && (
            <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
              <input autoFocus value={newSectionLabel} onChange={e => setNewSectionLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setAddingSection(false) }} placeholder="Nome da seção (ex: Compliance)" className={inputCls} />
              <button onClick={addSection} className="text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
              <button onClick={() => { setAddingSection(false); setNewSectionLabel('') }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          )}

          {sections.map((s, sIdx) => {
            const fs = fieldsOf(s.id)
            const isNativeSec = s.source === 'NATIVE'
            const secHidden = s.visible === false
            return (
              <div key={s.id} className={cn('rounded-xl border bg-card shadow-sm overflow-hidden transition-opacity', secHidden && 'opacity-60')}>
                {/* cabeçalho da seção */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
                  {renamingSection === s.id ? (
                    <div className="flex-1 flex items-center gap-1.5">
                      <input autoFocus value={renameLabel} onChange={e => setRenameLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameSection(s.id); if (e.key === 'Escape') setRenamingSection(null) }} className={inputCls} />
                      <button onClick={() => renameSection(s.id)} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setRenamingSection(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-[13px] tracking-tight truncate">{s.label}</span>
                      <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', isNativeSec ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10')}>
                        {isNativeSec ? 'Nativa' : 'Personalizada'}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button onClick={() => toggleDefaultOpen(s.id)} title="Como a seção abre no cadastro"
                          className="text-[10.5px] font-semibold text-muted-foreground bg-muted/60 border rounded-full px-2 py-0.5 hover:text-foreground transition-colors">
                          {s.defaultOpen ? '▾ Aberta' : '▸ Recolhida'}
                        </button>
                        <Switch on={!secHidden} onClick={() => toggleSectionVisible(s.id)} sm title={secHidden ? 'Seção oculta no cadastro' : 'Seção visível no cadastro'} />
                        <button onClick={() => { setRenamingSection(s.id); setRenameLabel(s.label) }} title="Renomear seção" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>
                        <div className="relative">
                          <button onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)} title="Mais" className={iconBtn}><MoreHorizontal className="h-3.5 w-3.5" /></button>
                          {menuOpen === s.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border bg-card shadow-lg py-1 text-xs">
                                <button onClick={() => { moveSection(s.id, -1); setMenuOpen(null) }} disabled={sIdx === 0} className="w-full text-left px-3 py-1.5 hover:bg-muted disabled:opacity-40 flex items-center gap-2"><ChevronUp className="h-3.5 w-3.5" />Mover para cima</button>
                                <button onClick={() => { moveSection(s.id, 1); setMenuOpen(null) }} disabled={sIdx === sections.length - 1} className="w-full text-left px-3 py-1.5 hover:bg-muted disabled:opacity-40 flex items-center gap-2"><ChevronDown className="h-3.5 w-3.5" />Mover para baixo</button>
                                {!isNativeSec && <button onClick={() => { removeSection(s.id); setMenuOpen(null) }} className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" />Excluir seção</button>}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* campos */}
                <div>
                  {fs.map((f, fIdx) => {
                    const isNativeF = f.source === 'NATIVE'
                    const fHidden = f.visible === false
                    return (
                      <div key={f.id} className={cn('flex items-center gap-2.5 px-3 py-2 border-b border-border/50 last:border-0 group/row transition-opacity', fHidden && 'opacity-50')}>
                        <span className="w-4 grid place-items-center shrink-0">
                          {isNativeF ? <Lock className="h-3 w-3 text-blue-500" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs font-medium truncate', fHidden && 'line-through text-muted-foreground')}>{f.label}{f.required && <span className="text-red-500"> *</span>}</p>
                          {!isNativeF && <p className="text-[10px] text-muted-foreground">{FIELD_TYPE_LABELS[f.type]}{f.options?.length ? ` · ${f.options.length} itens` : ''}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          {!isNativeF && (
                            <span className="flex items-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                              <button onClick={() => moveField(s.id, f.id, -1)} disabled={fIdx === 0} className={cn(iconBtn, 'disabled:opacity-30')}><ChevronUp className="h-3.5 w-3.5" /></button>
                              <button onClick={() => moveField(s.id, f.id, 1)} disabled={fIdx === fs.length - 1} className={cn(iconBtn, 'disabled:opacity-30')}><ChevronDown className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingField(f)} title="Editar" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => removeField(f.id)} title="Excluir" className={cn(iconBtn, 'hover:text-destructive')}><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          )}
                          <Switch on={!fHidden} onClick={() => toggleFieldVisible(f.id)} title={fHidden ? 'Oculto — clique para exibir' : 'Visível — clique para ocultar'} />
                        </div>
                      </div>
                    )
                  })}
                  {fs.length === 0 && <p className="px-3 py-2.5 text-[11px] text-muted-foreground">Sem campos.</p>}
                </div>

                <button onClick={() => setAddingToSection(s.id)} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary border-t border-dashed hover:bg-primary/5 transition-colors">
                  <Plus className="h-3.5 w-3.5" />Adicionar campo personalizado
                </button>
              </div>
            )
          })}

          {sections.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Crie uma seção para começar.</p>}
        </div>

        {/* ── PRÉVIA ── */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-0.5">Prévia — como o fornecedor verá</p>
          <div className="rounded-xl border bg-muted/25 p-3 lg:sticky lg:top-3">
            <ScreenRenderer screen={screen} nativeValue={sampleNative} />
          </div>
        </div>
      </div>

      {(editingField || addingToSection) && (
        <ScreenFieldEditor sections={sections} initial={editingField ?? undefined} defaultSectionId={addingToSection ?? undefined}
          onClose={() => { setEditingField(null); setAddingToSection(null) }} onSave={upsertField} />
      )}
    </div>
  )
}
