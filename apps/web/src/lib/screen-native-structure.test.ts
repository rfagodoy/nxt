import { describe, it, expect } from 'vitest'
import { buildNativeSeed, reconcileNative } from './screen-native-structure'
import type { Screen, ScreenField } from './screen-types'

/** Tela de Contrato salva ANTES da reordenação do catálogo: ordem legada em Dados Gerais. */
function telaLegada(): Screen {
  const seed = buildNativeSeed('CONTRATO')
  const ordemLegada = ['numero', 'natureza', 'tipo', 'situacao', 'titulo', 'descricao', 'objeto', 'data_assinatura', 'mao_de_obra']
  const fields = seed.fields.map(f => {
    const i = ordemLegada.indexOf(f.nativeKey ?? '')
    return i >= 0 ? { ...f, order: i } : f
  })
  return {
    id: 'scr_leg', name: 'Contrato legado', subjectType: 'CONTRATO',
    status: 'ACTIVE', isDefault: true, isSystem: true,
    sections: seed.sections, fields,
  }
}

const ordemDe = (screen: Screen, secKey: string) =>
  screen.fields
    .filter(f => f.sectionId === `nsec_contrato_${secKey}`)
    .sort((a, b) => a.order - b.order)
    .map(f => f.nativeKey ?? f.name)

describe('reconcileNative — normalização de ordem', () => {
  it('tela legada passa a espelhar a ordem do seed (formulário real) em Dados Gerais', () => {
    const rec = reconcileNative(telaLegada())
    expect(ordemDe(rec, 'dados_gerais')).toEqual([
      'natureza', 'numero', 'situacao', 'titulo', 'descricao', 'objeto', 'tipo', 'data_assinatura', 'mao_de_obra',
    ])
  })

  it('customs preservam a ordem relativa, depois dos nativos da seção', () => {
    const base = telaLegada()
    const custom = (id: string, order: number): ScreenField => ({
      id, sectionId: 'nsec_contrato_dados_gerais', name: id, label: id,
      type: 'text', source: 'CUSTOM', mode: 'EDIT', visible: true, required: false, order,
    } as ScreenField)
    base.fields = [...base.fields, custom('fld_b', 5), custom('fld_a', 2)]
    const ordem = ordemDe(reconcileNative(base), 'dados_gerais')
    expect(ordem.slice(-2)).toEqual(['fld_a', 'fld_b']) // fld_a (order 2) antes de fld_b (order 5)
    expect(ordem[0]).toBe('natureza')
  })

  it('idempotente: tela já na ordem do seed volta como o MESMO objeto', () => {
    const rec = reconcileNative(telaLegada())
    expect(reconcileNative(rec)).toBe(rec)
  })
})
