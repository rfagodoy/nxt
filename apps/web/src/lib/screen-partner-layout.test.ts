import { describe, it, expect } from 'vitest'
import { resolvePartnerSections } from './screen-partner-layout'
import type { Screen, ScreenField, ScreenSection, PartnerCategory } from './screen-types'

/* ── construtor de uma tela mínima para os testes ── */
const sec = (nativeKey: string, over: Partial<ScreenSection> = {}): ScreenSection => ({
  id: `nsec_${nativeKey}`, name: nativeKey, label: nativeKey, source: 'NATIVE', nativeKey,
  visible: true, order: 0, defaultOpen: true, ...over,
})
const nf = (nativeKey: string, over: Partial<ScreenField> = {}): ScreenField => ({
  id: `nfld_${nativeKey}`, sectionId: over.sectionId ?? `nsec_${nativeKey.split('_')[0]}`,
  name: nativeKey, label: nativeKey, type: 'text', source: 'NATIVE', nativeKey,
  mode: 'VIEW', visible: true, required: false, order: 0, ...over,
})
const cf = (id: string, sectionId: string, over: Partial<ScreenField> = {}): ScreenField => ({
  id, sectionId, name: id, label: id, type: 'text', source: 'CUSTOM',
  mode: 'EDIT', visible: true, required: false, order: 5, ...over,
})

/** Tela de Fornecedor com identificação + CNAE + sócios + contato e um custom. */
function makeScreen(fields: ScreenField[], sections?: ScreenSection[]): Screen {
  return {
    id: 's1', name: 'Tela', subjectType: 'FORNECEDOR', status: 'ACTIVE', isDefault: true, isSystem: true,
    sections: sections ?? [
      sec('identificacao', { order: 0 }),
      sec('cnae',          { order: 1 }),
      sec('contato',       { order: 2 }),
      sec('socios',        { order: 3 }),
    ],
    fields,
  }
}
const keys = (r: ReturnType<typeof resolvePartnerSections>) => r.map(s => s.key)

describe('resolvePartnerSections — gating de seção por tipo', () => {
  const fields = [
    nf('razao_social', { sectionId: 'nsec_identificacao' }),
    nf('cnpj',         { sectionId: 'nsec_identificacao' }),
    nf('cnae_principal', { sectionId: 'nsec_cnae' }),
    nf('con_email',    { sectionId: 'nsec_contato' }),
    nf('soc_nome',     { sectionId: 'nsec_socios' }),
  ]
  it('PJ Brasileira: mostra CNAE e Sócios', () => {
    const r = keys(resolvePartnerSections(makeScreen(fields), 'PJ_BR'))
    expect(r).toContain('cnae')
    expect(r).toContain('socios')
  })
  it('PJ Estrangeira: some CNAE (só PJ_BR), mantém Sócios', () => {
    const r = keys(resolvePartnerSections(makeScreen(fields), 'PJ_EST'))
    expect(r).not.toContain('cnae')
    expect(r).toContain('socios')
  })
  it('PF Brasileira: some CNAE e Sócios', () => {
    const r = keys(resolvePartnerSections(makeScreen(fields), 'PF_BR'))
    expect(r).not.toContain('cnae')
    expect(r).not.toContain('socios')
    expect(r).toContain('identificacao')
    expect(r).toContain('contato')
  })
})

describe('resolvePartnerSections — seção esvaziada não aparece', () => {
  it('seção nativa com todos os campos ocultos no tipo é omitida', () => {
    // contato com o único campo oculto em PJ_BR → seção some em PJ_BR, aparece em PJ_EST
    const fields = [
      nf('razao_social', { sectionId: 'nsec_identificacao' }),
      nf('con_email',    { sectionId: 'nsec_contato', hiddenCategories: ['PJ_BR'] }),
    ]
    const screen = makeScreen(fields, [sec('identificacao', { order: 0 }), sec('contato', { order: 1 })])
    expect(keys(resolvePartnerSections(screen, 'PJ_BR'))).not.toContain('contato')
    expect(keys(resolvePartnerSections(screen, 'PJ_EST'))).toContain('contato')
  })

  it('seção nativa vazia por tipo REAPARECE se tiver campo personalizado visível', () => {
    const fields = [
      nf('con_email', { sectionId: 'nsec_contato', hiddenCategories: ['PJ_BR'] }),
      cf('c_extra', 'nsec_contato'),  // custom aplica a todos
    ]
    const screen = makeScreen(fields, [sec('contato', { order: 0 })])
    expect(keys(resolvePartnerSections(screen, 'PJ_BR'))).toContain('contato')
  })
})

describe('resolvePartnerSections — campos personalizados por tipo', () => {
  it('custom oculto num tipo não entra em customFields daquele tipo', () => {
    const fields = [
      nf('razao_social', { sectionId: 'nsec_identificacao' }),
      cf('c1', 'nsec_identificacao', { hiddenCategories: ['PF_BR'] }),
    ]
    const screen = makeScreen(fields, [sec('identificacao', { order: 0 })])
    const idSecBR = resolvePartnerSections(screen, 'PJ_BR').find(s => s.key === 'identificacao')!
    const idSecPF = resolvePartnerSections(screen, 'PF_BR').find(s => s.key === 'identificacao')!
    expect(idSecBR.customFields.map(f => f.id)).toContain('c1')
    expect(idSecPF.customFields.map(f => f.id)).not.toContain('c1')
  })
})

describe('resolvePartnerSections — screenVis reflete a visibilidade por tipo', () => {
  it('screenVis(campo) respeita hiddenCategories do tipo resolvido', () => {
    const fields = [
      nf('razao_social', { sectionId: 'nsec_identificacao' }),
      nf('nome_fantasia', { sectionId: 'nsec_identificacao', hiddenCategories: ['PJ_EST'] }),
    ]
    const screen = makeScreen(fields, [sec('identificacao', { order: 0 })])
    const brVis = resolvePartnerSections(screen, 'PJ_BR').find(s => s.key === 'identificacao')!.screenVis
    const estVis = resolvePartnerSections(screen, 'PJ_EST').find(s => s.key === 'identificacao')!.screenVis
    expect(brVis('nome_fantasia')).toBe(true)
    expect(estVis('nome_fantasia')).toBe(false)
  })
})

describe('resolvePartnerSections — seção oculta pela tela', () => {
  it('seção com visible=false não aparece em nenhum tipo', () => {
    const fields = [nf('razao_social', { sectionId: 'nsec_identificacao' })]
    const screen = makeScreen(fields, [sec('identificacao', { order: 0, visible: false })])
    const _c: PartnerCategory = 'PJ_BR'
    expect(keys(resolvePartnerSections(screen, _c))).not.toContain('identificacao')
  })
})
