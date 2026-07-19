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
  { key: 'historico',     label: 'Histórico' }, // seção-bloco (auditoria): só liga/desliga, só no detalhe
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
  { key: 'vigencia',     label: 'Vigência' },
  { key: 'valor',        label: 'Valor e Pagamento' },
  { key: 'pagamentos',   label: 'Pagamentos realizados' },
  { key: 'recebimentos', label: 'Recebimentos realizados' },
  { key: 'reajuste',     label: 'Reajuste' },
  { key: 'aditivos',     label: 'Aditivos' },
  { key: 'documentos',   label: 'Documentos do contrato' },
  { key: 'partes',       label: 'Partes Envolvidas' }, // logo antes do Histórico (convenção)
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

/** Monta as seções/campos NATIVOS pré-carregados de um tipo. Os ids são ESCOPADOS por
 *  subject (`nsec_<subject>_<key>`), porque uma mesma chave (ex.: `historico`) pode existir
 *  em telas de tipos diferentes — ids globais por chave colidiriam entre telas. */
export function buildNativeSeed(subject: ScreenSubject): { sections: ScreenSection[]; fields: ScreenField[] } {
  const struct = SUBJECT_NATIVE_STRUCTURE[subject]
  const p = subject.toLowerCase()
  const sections: ScreenSection[] = struct.sections.map((s, i) => ({
    id: `nsec_${p}_${s.key}`, label: s.label, name: s.key, source: 'NATIVE', nativeKey: s.key,
    visible: true, order: i, defaultOpen: s.defaultOpen ?? (i === 0),
  }))
  const fields: ScreenField[] = struct.sections.flatMap(s =>
    (struct.fieldsBySection[s.key] ?? []).map((f, i) => ({
      id: `nfld_${p}_${f.key}`, sectionId: `nsec_${p}_${s.key}`, name: f.key, label: f.label,
      type: 'text', source: 'NATIVE', nativeKey: f.key, mode: 'VIEW', visible: true, required: false, order: i,
    } as ScreenField)),
  )
  return { sections, fields }
}

/**
 * Reconcilia uma tela carregada com a estrutura nativa viva: acrescenta seções/campos
 * nativos que faltam (VISÍVEIS por padrão), poda os órfãos e re-parenta os campos nativos
 * para a seção certa — tudo por `nativeKey`, robusto a ids legados. Preserva CUSTOM e a
 * visibilidade (toggle do usuário).
 */
export function reconcileNative(screen: Screen): Screen {
  const seed = buildNativeSeed(screen.subjectType)
  const seedSecKeys = new Set(seed.sections.map(s => s.nativeKey))
  const seedFldKeys = new Set(seed.fields.map(f => f.nativeKey))
  const seedSecKeyById   = new Map(seed.sections.map(s => [s.id, s.nativeKey ?? '']))
  const seedFieldSecKey  = new Map(seed.fields.map(f => [f.nativeKey ?? '', seedSecKeyById.get(f.sectionId ?? '') ?? '']))

  /* Poda seções/campos NATIVOS fora da estrutura viva (nunca toca CUSTOM). */
  const prunedSections = screen.sections.filter(s => s.source !== 'NATIVE' || seedSecKeys.has(s.nativeKey))
  const prunedFields   = screen.fields.filter(f => f.source !== 'NATIVE' || seedFldKeys.has(f.nativeKey))

  /* Acrescenta as seções nativas que faltam (id do seed, escopado por subject). */
  const secByNative = new Map(prunedSections.filter(s => s.source === 'NATIVE').map(s => [s.nativeKey, s]))
  const maxSecOrder = prunedSections.reduce((m, s) => Math.max(m, s.order), -1)
  const addSections = seed.sections.filter(s => !secByNative.has(s.nativeKey)).map((s, i) => ({ ...s, order: maxSecOrder + 1 + i }))

  /* id REAL de cada seção nativa por nativeKey (existente com id legado OU recém-acrescentada). */
  const secIdByKey = new Map(
    [...prunedSections, ...addSections].filter(s => s.source === 'NATIVE').map(s => [s.nativeKey ?? '', s.id]),
  )
  /* Re-parenta todo campo nativo para a seção com o nativeKey certo (o sistema é dono do lugar). */
  const reparent = (f: ScreenField): ScreenField => {
    if (f.source !== 'NATIVE') return f
    const secKey   = seedFieldSecKey.get(f.nativeKey ?? '')
    const targetId = secKey ? secIdByKey.get(secKey) : undefined
    return targetId && targetId !== f.sectionId ? { ...f, sectionId: targetId } : f
  }
  const fldByNative = new Map(prunedFields.filter(f => f.source === 'NATIVE').map(f => [f.nativeKey, f]))
  const fields   = prunedFields.map(reparent)
  const addFields = seed.fields.filter(f => !fldByNative.has(f.nativeKey)).map(reparent)

  const changed = prunedSections.length !== screen.sections.length
    || prunedFields.length !== screen.fields.length
    || addSections.length > 0 || addFields.length > 0
    || fields.some((f, i) => f !== prunedFields[i])
  if (!changed) return screen
  return { ...screen, sections: [...prunedSections, ...addSections], fields: [...fields, ...addFields] }
}
