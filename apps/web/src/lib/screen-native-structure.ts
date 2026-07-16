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

/* ── Contrato (R3): estrutura completa espelhando o cadastro real ──
   Seções de CAMPOS (dados_gerais, vigencia, valor) têm campos nativos com toggle de
   visibilidade. Seções-BLOCO (partes, pagamentos, recebimentos, reajuste, aditivos,
   documentos, historico) são componentes atômicos: a tela controla só se a seção
   aparece; não há toggle campo a campo (ver CONTRACT_BLOCK_SECTIONS na layout). */
const CONTR_SECTIONS: NativeSectionDef[] = [
  { key: 'dados_gerais', label: 'Dados Gerais', defaultOpen: true },
  { key: 'partes',       label: 'Partes Envolvidas' },
  { key: 'vigencia',     label: 'Vigência' },
  { key: 'valor',        label: 'Valor e Pagamento' },
  { key: 'pagamentos',   label: 'Pagamentos realizados' },
  { key: 'recebimentos', label: 'Recebimentos realizados' },
  { key: 'reajuste',     label: 'Reajuste' },
  { key: 'aditivos',     label: 'Aditivos' },
  { key: 'documentos',   label: 'Documentos do contrato' },
  { key: 'historico',    label: 'Histórico' },
]
const CONTR_FIELDS: NativeStructure['fieldsBySection'] = {
  dados_gerais: [
    { key: 'numero', label: 'Número' }, { key: 'natureza', label: 'Natureza do contrato' },
    { key: 'tipo', label: 'Tipo de contrato' }, { key: 'situacao', label: 'Situação' },
    { key: 'titulo', label: 'Título' }, { key: 'descricao', label: 'Descrição' },
    { key: 'objeto', label: 'Objeto do contrato' }, { key: 'data_assinatura', label: 'Data de assinatura' },
  ],
  vigencia: [
    { key: 'inicio', label: 'Início da vigência' }, { key: 'prazo_indeterminado', label: 'Prazo indeterminado' },
    { key: 'termino', label: 'Término da vigência' }, { key: 'acao_termino', label: 'Ao término da vigência' },
  ],
  valor: [
    { key: 'moeda', label: 'Moeda' }, { key: 'condicao_pagamento', label: 'Condição de pagamento' },
    { key: 'valor_total', label: 'Valor total do contrato' }, { key: 'valor_parcela', label: 'Valor da parcela' },
    { key: 'forma_pagamento', label: 'Forma de pagamento' }, { key: 'qtd_parcelas', label: 'Quantidade de parcelas' },
    { key: 'complemento', label: 'Complemento do valor' },
  ],
  /* seções-bloco: sem campos nativos (o componente é atômico) */
  partes: [], pagamentos: [], recebimentos: [], reajuste: [], aditivos: [], documentos: [], historico: [],
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
  const seedSecKeys = new Set(seed.sections.map(s => s.nativeKey))
  const seedFldKeys = new Set(seed.fields.map(f => f.nativeKey))

  /* Poda seções/campos NATIVOS que não existem mais na estrutura viva (ex.: a estrutura
     do sistema mudou). NUNCA toca em CUSTOM (dado do usuário). Rende o cadastro correto
     mesmo antes de a tela do sistema ser re-salva no banco. */
  const sections = screen.sections.filter(s => s.source !== 'NATIVE' || seedSecKeys.has(s.nativeKey))
  const prunedFields = screen.fields.filter(f => f.source !== 'NATIVE' || seedFldKeys.has(f.nativeKey))

  /* Re-parenta os campos NATIVOS para a seção definida na estrutura viva: o SISTEMA é dono
     do lugar do campo nativo. Conserta drift quando um campo mudou de seção (ex.: a estrutura
     do Contrato foi reorganizada) — preserva a visibilidade (toggle do usuário). */
  const seedFldByKey = new Map(seed.fields.map(f => [f.nativeKey, f]))
  const fields = prunedFields.map(f => {
    if (f.source !== 'NATIVE') return f
    const sf = seedFldByKey.get(f.nativeKey)
    return sf && sf.sectionId !== f.sectionId ? { ...f, sectionId: sf.sectionId } : f
  })
  const reparented = fields.some((f, i) => f !== prunedFields[i])
  const pruned = sections.length !== screen.sections.length || prunedFields.length !== screen.fields.length || reparented

  const secByNative = new Map(sections.filter(s => s.source === 'NATIVE').map(s => [s.nativeKey, s]))
  const fldByNative = new Map(fields.filter(f => f.source === 'NATIVE').map(f => [f.nativeKey, f]))

  const maxSecOrder = sections.reduce((m, s) => Math.max(m, s.order), -1)
  const addSections = seed.sections.filter(s => !secByNative.has(s.nativeKey)).map((s, i) => ({ ...s, order: maxSecOrder + 1 + i }))
  const addFields = seed.fields.filter(f => !fldByNative.has(f.nativeKey))

  if (!pruned && addSections.length === 0 && addFields.length === 0) return screen
  return { ...screen, sections: [...sections, ...addSections], fields: [...fields, ...addFields] }
}
