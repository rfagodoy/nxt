import { describe, it, expect } from 'vitest'
import { applyQuery, computeStats, opMatch, rowText, type ListRow } from './list-query'
import type { CustomFieldMeta } from '../partners/custom-field-query'

const base: Omit<ListRow, 'id' | 'numero' | 'titulo' | 'situacao' | 'termino' | 'valor_total'> = {
  tipo: 'Serviços', parte_principal: 'ACME', inicio: '2026-01-01', documento: '', papel: '',
  data_assinatura: '', moeda: 'BRL', valor_parcela: 0, condicao_pagamento: '', objeto: [],
  contratante_nome: 'ACME LTDA', contratante_doc: '00.000.000/0001-00', contratada_nome: '', contratada_doc: '',
}
const row = (over: Partial<ListRow>): ListRow => ({
  id: 'c1', numero: 'CCT_2026_0001', titulo: 'Contrato A', situacao: 'VIGENTE',
  termino: '2099-12-31', valor_total: 1000, ...base, ...over,
} as ListRow)

const semCustom = { customMeta: new Map<string, CustomFieldMeta>(), customValues: new Map<string, Map<string, string>>() }

describe('rowText — situação compara pela EFETIVA', () => {
  it('VIGENTE com término no passado vira Vencido (código + rótulo)', () => {
    const r = row({ situacao: 'VIGENTE', termino: '2020-01-01' })
    expect(rowText(r, 'situacao')).toContain('VENCIDO')
    expect(rowText(r, 'situacao')).toContain('Vencido')
  })
  it('a coluna Partes abrange contratante e documento', () => {
    expect(rowText(row({}), 'parte_principal')).toContain('ACME LTDA')
    expect(rowText(row({}), 'parte_principal')).toContain('00.000.000/0001-00')
  })
})

describe('opMatch — números comparam como números', () => {
  it('gt numérico: 9 NÃO é maior que 10 (o client-side lexical errava isso)', () => {
    expect(opMatch('9', 'gt', '10')).toBe(false)
    expect(opMatch('1500', 'gt', '200')).toBe(true)
  })
  it('aceita vírgula decimal e milhar pt-BR', () => {
    expect(opMatch('1234.56', 'gte', '1.234,56')).toBe(true)
  })
  it('texto continua lexical/normalizado (sem acento, sem caixa)', () => {
    expect(opMatch('Serviços', 'eq', 'servicos')).toBe(true)
    expect(opMatch('ACME', 'notContains', 'zeta')).toBe(true)
  })
})

describe('applyQuery', () => {
  const rows = [
    row({ id: 'a', numero: 'CCT_0001', titulo: 'Aluguel', valor_total: 500,  situacao: 'VIGENTE', termino: '2099-01-01' }),
    row({ id: 'b', numero: 'CCT_0002', titulo: 'Energia', valor_total: 1500, situacao: 'VIGENTE', termino: '2020-01-01' }), // efetivo: VENCIDO
    row({ id: 'c', numero: 'CCT_0003', titulo: 'Suporte', valor_total: 900,  situacao: 'CANCELADO' }),
  ]

  it('busca global encontra pelo rótulo da situação derivada ("vencido")', () => {
    const out = applyQuery(rows, { search: 'vencido', ...semCustom })
    expect(out.map((r) => r.id)).toEqual(['b'])
  })

  it('filtros E/OU sobre colunas nativas', () => {
    const e = applyQuery(rows, { filters: [{ col: 'valor_total', op: 'gt', value: '600' }, { col: 'titulo', op: 'contains', value: 'ener' }], logic: 'AND', ...semCustom })
    expect(e.map((r) => r.id)).toEqual(['b'])
    const ou = applyQuery(rows, { filters: [{ col: 'valor_total', op: 'lt', value: '600' }, { col: 'titulo', op: 'contains', value: 'suporte' }], logic: 'OR', ...semCustom })
    expect(ou.map((r) => r.id).sort()).toEqual(['a', 'c'])
  })

  it('ordena valor_total numericamente (900 < 1500)', () => {
    const out = applyQuery(rows, { sort: { col: 'valor_total', dir: 'desc' }, ...semCustom })
    expect(out.map((r) => r.valor_total)).toEqual([1500, 900, 500])
  })

  it('campo custom filtra e busca pelo RÓTULO exibido, não pelo código', () => {
    const meta = new Map<string, CustomFieldMeta>([['f1', { type: 'select', options: [{ value: 'opt_a', label: 'Prioritário' }] } as CustomFieldMeta]])
    const values = new Map([['a', new Map([['f1', 'opt_a']])]])
    const filtro = applyQuery(rows, { filters: [{ col: 'f1', op: 'eq', value: 'Prioritário' }], ...semCustom, customMeta: meta, customValues: values })
    expect(filtro.map((r) => r.id)).toEqual(['a'])
    const busca = applyQuery(rows, { search: 'prioritario', ...semCustom, customMeta: meta, customValues: values })
    expect(busca.map((r) => r.id)).toEqual(['a'])
  })
})

describe('computeStats', () => {
  it('conta pela situação efetiva (Vencido derivado entra em VENCIDO, não em VIGENTE)', () => {
    const s = computeStats([
      row({ id: 'a', situacao: 'VIGENTE', termino: '2099-01-01' }),
      row({ id: 'b', situacao: 'VIGENTE', termino: '2020-01-01' }),
      row({ id: 'c', situacao: 'CANCELADO' }),
    ])
    expect(s.total).toBe(3)
    expect(s.byEffective.VIGENTE).toBe(1)
    expect(s.byEffective.VENCIDO).toBe(1)
    expect(s.byEffective.CANCELADO).toBe(1)
  })
})
