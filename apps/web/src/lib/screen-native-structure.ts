/**
 * Estrutura NATIVA (seções + campos) de cada tipo de tela. Quando uma tela é criada
 * para Fornecedor/Contrato, o construtor pré-carrega essa estrutura: os nativos entram
 * como seções/campos `source: 'NATIVE'` — no cadastro renderizam com seus WIDGETS REAIS
 * e a tela só controla a VISIBILIDADE (nome/tipo/tamanho são do sistema, não editáveis).
 */
import { NATIVE_FIELDS } from '@/hooks/use-partner-fields'
import type { Screen, ScreenSection, ScreenField, ScreenSubject } from './screen-types'

export interface NativeSectionDef { key: string; label: string; defaultOpen?: boolean }
export interface NativeStructure { sections: NativeSectionDef[]; fieldsBySection: Record<string, { key: string; label: string }[]> }

/* ── Fornecedor: derivado de NATIVE_FIELDS (partner) ── */
const FORN_SECTIONS: NativeSectionDef[] = [
  { key: 'identificacao', label: 'Identificação', defaultOpen: true },
  { key: 'cnae',          label: 'CNAE — Atividades Econômicas' },
  { key: 'contato',       label: 'Contato' },
  { key: 'endereco',      label: 'Endereço' },
  { key: 'bancario',      label: 'Dados Bancários' },
  { key: 'socios',        label: 'Quadro de Sócios' },
]
const FORN_FIELDS: NativeStructure['fieldsBySection'] = FORN_SECTIONS.reduce((acc, s) => {
  acc[s.key] = NATIVE_FIELDS.filter(f => f.section === s.key).map(f => ({ key: f.key, label: f.label }))
  return acc
}, {} as NativeStructure['fieldsBySection'])

/* ── Contrato: estrutura básica (será enriquecida no marco de Contrato) ── */
const CONTR_SECTIONS: NativeSectionDef[] = [
  { key: 'dados_gerais',   label: 'Dados Gerais', defaultOpen: true },
  { key: 'vigencia_valor', label: 'Vigência e Valor' },
]
const CONTR_FIELDS: NativeStructure['fieldsBySection'] = {
  dados_gerais: [
    { key: 'numero', label: 'Número' }, { key: 'titulo', label: 'Título' }, { key: 'tipo', label: 'Tipo' },
    { key: 'natureza', label: 'Natureza' }, { key: 'objeto', label: 'Objeto' }, { key: 'parte_principal', label: 'Parte' },
  ],
  vigencia_valor: [
    { key: 'inicio', label: 'Início' }, { key: 'termino', label: 'Término' }, { key: 'moeda', label: 'Moeda' },
    { key: 'valor_total', label: 'Valor total' }, { key: 'valor_parcela', label: 'Valor da parcela' },
    { key: 'condicao_pagamento', label: 'Condição de pagamento' }, { key: 'data_assinatura', label: 'Data de assinatura' },
  ],
}

export const SUBJECT_NATIVE_STRUCTURE: Record<ScreenSubject, NativeStructure> = {
  FORNECEDOR: { sections: FORN_SECTIONS, fieldsBySection: FORN_FIELDS },
  CONTRATO:   { sections: CONTR_SECTIONS, fieldsBySection: CONTR_FIELDS },
  GENERICA:   { sections: [], fieldsBySection: {} },
}

/** Monta as seções/campos NATIVOS pré-carregados de um tipo (ids determinísticos por chave). */
export function buildNativeSeed(subject: ScreenSubject): { sections: ScreenSection[]; fields: ScreenField[] } {
  const struct = SUBJECT_NATIVE_STRUCTURE[subject]
  const sections: ScreenSection[] = struct.sections.map((s, i) => ({
    id: `nsec_${s.key}`, label: s.label, name: s.key, source: 'NATIVE', nativeKey: s.key,
    visible: true, order: i, defaultOpen: s.defaultOpen ?? (i === 0),
  }))
  const fields: ScreenField[] = struct.sections.flatMap(s =>
    (struct.fieldsBySection[s.key] ?? []).map((f, i) => ({
      id: `nfld_${f.key}`, sectionId: `nsec_${s.key}`, name: f.key, label: f.label,
      type: 'text', source: 'NATIVE', nativeKey: f.key, mode: 'VIEW', visible: true, required: false, order: i,
    } as ScreenField)),
  )
  return { sections, fields }
}

/**
 * Reconcilia uma tela carregada com a estrutura nativa viva: acrescenta seções/campos
 * nativos que ainda não estejam na tela (ex.: o sistema ganhou um campo nativo novo),
 * como VISÍVEIS por padrão, preservando o que já existe (visibilidade/ordem/customs).
 */
export function reconcileNative(screen: Screen): Screen {
  const seed = buildNativeSeed(screen.subjectType)
  const secByNative = new Map(screen.sections.filter(s => s.source === 'NATIVE').map(s => [s.nativeKey, s]))
  const fldByNative = new Map(screen.fields.filter(f => f.source === 'NATIVE').map(f => [f.nativeKey, f]))

  const maxSecOrder = screen.sections.reduce((m, s) => Math.max(m, s.order), -1)
  const addSections = seed.sections.filter(s => !secByNative.has(s.nativeKey)).map((s, i) => ({ ...s, order: maxSecOrder + 1 + i }))
  const addFields = seed.fields.filter(f => !fldByNative.has(f.nativeKey))

  if (addSections.length === 0 && addFields.length === 0) return screen
  return { ...screen, sections: [...screen.sections, ...addSections], fields: [...screen.fields, ...addFields] }
}
