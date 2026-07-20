import { describe, it, expect } from 'vitest'
import { nativeAppliesTo, fieldAppliesTo, fieldVisibleFor, requiredFor } from './screen-partner-categories'
import type { ScreenField } from './screen-types'

/** Helper: monta um ScreenField mínimo para os testes. */
const field = (over: Partial<ScreenField>): ScreenField => ({
  id: over.id ?? 'f1', name: over.name ?? 'x', label: over.label ?? 'X',
  type: 'text', source: 'NATIVE', mode: 'VIEW', required: false, order: 0, ...over,
})

describe('nativeAppliesTo — aplicabilidade intrínseca por tipo', () => {
  it('CNPJ só em PJ Brasileira', () => {
    expect(nativeAppliesTo('cnpj', 'PJ_BR')).toBe(true)
    expect(nativeAppliesTo('cnpj', 'PJ_EST')).toBe(false)
    expect(nativeAppliesTo('cnpj', 'PF_BR')).toBe(false)
    expect(nativeAppliesTo('cnpj', 'PF_EST')).toBe(false)
  })
  it('CPF só em PF Brasileira; Código nas estrangeiras', () => {
    expect(nativeAppliesTo('cpf', 'PF_BR')).toBe(true)
    expect(nativeAppliesTo('cpf', 'PJ_BR')).toBe(false)
    expect(nativeAppliesTo('codigo', 'PJ_EST')).toBe(true)
    expect(nativeAppliesTo('codigo', 'PF_EST')).toBe(true)
    expect(nativeAppliesTo('codigo', 'PJ_BR')).toBe(false)
  })
  it('Natureza Jurídica / IE / CNAE só em PJ Brasileira', () => {
    for (const k of ['natureza_juridica', 'ie', 'im', 'cnae_principal', 'cnaes_secundarios']) {
      expect(nativeAppliesTo(k, 'PJ_BR')).toBe(true)
      expect(nativeAppliesTo(k, 'PJ_EST')).toBe(false)
      expect(nativeAppliesTo(k, 'PF_BR')).toBe(false)
    }
  })
  it('RG / Órgão Expedidor só em PF Brasileira', () => {
    expect(nativeAppliesTo('rg', 'PF_BR')).toBe(true)
    expect(nativeAppliesTo('rg', 'PF_EST')).toBe(false)
    expect(nativeAppliesTo('orgao_expedidor', 'PF_BR')).toBe(true)
  })
  it('Nome Fantasia / Data de Abertura / Sócios só em PJ (BR e Est)', () => {
    for (const k of ['nome_fantasia', 'data_abertura', 'soc_nome', 'soc_participacao']) {
      expect(nativeAppliesTo(k, 'PJ_BR')).toBe(true)
      expect(nativeAppliesTo(k, 'PJ_EST')).toBe(true)
      expect(nativeAppliesTo(k, 'PF_BR')).toBe(false)
      expect(nativeAppliesTo(k, 'PF_EST')).toBe(false)
    }
  })
  it('País de Origem em todos menos PJ Brasileira', () => {
    expect(nativeAppliesTo('pais_origem', 'PJ_BR')).toBe(false)
    expect(nativeAppliesTo('pais_origem', 'PF_BR')).toBe(true)
    expect(nativeAppliesTo('pais_origem', 'PJ_EST')).toBe(true)
    expect(nativeAppliesTo('pais_origem', 'PF_EST')).toBe(true)
  })
  it('Endereço: logradouro/número/bairro só nacional; address1/país só internacional', () => {
    expect(nativeAppliesTo('end_logradouro', 'PJ_BR')).toBe(true)
    expect(nativeAppliesTo('end_logradouro', 'PJ_EST')).toBe(false)
    expect(nativeAppliesTo('end_address1', 'PJ_EST')).toBe(true)
    expect(nativeAppliesTo('end_address1', 'PJ_BR')).toBe(false)
    // cidade/estado/cep valem para todos os tipos
    expect(nativeAppliesTo('end_cidade', 'PF_EST')).toBe(true)
  })
  it('campos comuns (contato/bancário/razão social) valem para todos', () => {
    for (const k of ['razao_social', 'con_email', 'ban_banco']) {
      for (const c of ['PJ_BR', 'PJ_EST', 'PF_BR', 'PF_EST'] as const) {
        expect(nativeAppliesTo(k, c)).toBe(true)
      }
    }
  })
  it('chave desconhecida = aplica a todos (fail-safe)', () => {
    expect(nativeAppliesTo('campo_inexistente', 'PF_EST')).toBe(true)
  })
})

describe('fieldAppliesTo — campo personalizado aplica a todos os tipos', () => {
  it('CUSTOM sempre aplica', () => {
    const c = field({ source: 'CUSTOM', nativeKey: undefined })
    for (const cat of ['PJ_BR', 'PJ_EST', 'PF_BR', 'PF_EST'] as const) {
      expect(fieldAppliesTo(c, cat)).toBe(true)
    }
  })
})

describe('fieldVisibleFor — visibilidade EFETIVA por tipo', () => {
  it('visível quando aplica, não-desligado e não-oculto no tipo', () => {
    const f = field({ nativeKey: 'nome_fantasia', visible: true })
    expect(fieldVisibleFor(f, 'PJ_BR')).toBe(true)
  })
  it('não aplica ao tipo → invisível mesmo sem hiddenCategories', () => {
    const f = field({ nativeKey: 'cnpj', visible: true })
    expect(fieldVisibleFor(f, 'PF_BR')).toBe(false)  // CNPJ não existe em PF
  })
  it('hiddenCategories oculta APENAS naquele tipo', () => {
    const f = field({ nativeKey: 'nome_fantasia', visible: true, hiddenCategories: ['PJ_EST'] })
    expect(fieldVisibleFor(f, 'PJ_BR')).toBe(true)   // visível em PJ_BR
    expect(fieldVisibleFor(f, 'PJ_EST')).toBe(false) // oculto em PJ_EST
  })
  it('visible=false (master) oculta em todos os tipos aplicáveis', () => {
    const f = field({ nativeKey: 'nome_fantasia', visible: false })
    expect(fieldVisibleFor(f, 'PJ_BR')).toBe(false)
    expect(fieldVisibleFor(f, 'PJ_EST')).toBe(false)
  })
  it('hiddenCategories ausente/vazio = visível onde aplica', () => {
    expect(fieldVisibleFor(field({ nativeKey: 'razao_social', visible: true }), 'PF_EST')).toBe(true)
    expect(fieldVisibleFor(field({ nativeKey: 'razao_social', visible: true, hiddenCategories: [] }), 'PF_EST')).toBe(true)
  })
})

describe('requiredFor — obrigatoriedade EFETIVA por tipo', () => {
  const custom = (over: Partial<ScreenField>) => field({ source: 'CUSTOM', nativeKey: undefined, ...over })

  it('requiredCategories exige APENAS nos tipos listados', () => {
    const f = custom({ requiredCategories: ['PJ_BR', 'PF_BR'] })
    expect(requiredFor(f, 'PJ_BR')).toBe(true)
    expect(requiredFor(f, 'PF_BR')).toBe(true)
    expect(requiredFor(f, 'PJ_EST')).toBe(false)
    expect(requiredFor(f, 'PF_EST')).toBe(false)
  })
  it('requiredCategories vazio = nunca obrigatório (mesmo com required global true)', () => {
    const f = custom({ required: true, requiredCategories: [] })
    for (const c of ['PJ_BR', 'PJ_EST', 'PF_BR', 'PF_EST'] as const) expect(requiredFor(f, c)).toBe(false)
  })
  it('retrocompat: sem requiredCategories, cai no required global (todos os tipos)', () => {
    expect(requiredFor(custom({ required: true }), 'PJ_BR')).toBe(true)
    expect(requiredFor(custom({ required: true }), 'PF_EST')).toBe(true)
    expect(requiredFor(custom({ required: false }), 'PJ_BR')).toBe(false)
  })
  it('campo oculto no tipo NUNCA é exigido nele', () => {
    const f = custom({ requiredCategories: ['PJ_BR', 'PJ_EST'], hiddenCategories: ['PJ_EST'] })
    expect(requiredFor(f, 'PJ_BR')).toBe(true)
    expect(requiredFor(f, 'PJ_EST')).toBe(false)  // exigido na lista, mas oculto → não obriga
  })
  it('campo nativo que não aplica ao tipo não é exigido', () => {
    expect(requiredFor(field({ nativeKey: 'cnpj', required: true }), 'PF_BR')).toBe(false)
  })
})
