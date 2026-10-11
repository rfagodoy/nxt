import { describe, expect, it } from 'vitest'
import { concentracaoPorParceiro, vencimentosPorMes, type ItemCarteira } from './dashboard-carteira'

const it_ = (o: Partial<ItemCarteira>): ItemCarteira => ({ situacao: 'VIGENTE', termino: '', valor: 0, contraparte: null, ...o })
const HOJE = '2026-10-11'

describe('vencimentosPorMes', () => {
  it('12 meses a partir do mês atual, atravessando o ano', () => {
    const v = vencimentosPorMes([], HOJE)
    expect(v.meses.map((m) => m.mes)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09'])
  })
  it('agrupa vigentes pelo mês de término, somando quantidade e valor', () => {
    const v = vencimentosPorMes([
      it_({ termino: '2026-10-20', valor: 100 }), it_({ termino: '2026-10-31', valor: 50 }), it_({ termino: '2027-03-01', valor: 7 }),
    ], HOJE)
    expect(v.meses[0]).toEqual({ mes: '2026-10', qtd: 2, valor: 150 })
    expect(v.meses[5]).toEqual({ mes: '2027-03', qtd: 1, valor: 7 })
  })
  it('próximos 90 dias e já vencidos em baldes próprios', () => {
    const v = vencimentosPorMes([
      it_({ termino: '2026-12-01', valor: 10 }),            // dentro dos 90 dias
      it_({ termino: '2027-02-01', valor: 20 }),            // fora (113 dias)
      it_({ situacao: 'VENCIDO', termino: '2026-09-01', valor: 5 }),
    ], HOJE)
    expect(v.prox90).toEqual({ qtd: 1, valor: 10 })
    expect(v.vencidos).toEqual({ qtd: 1, valor: 5 })
    expect(v.meses.reduce((s, m) => s + m.qtd, 0)).toBe(2) // vencido não entra nos meses
  })
  it('indeterminado, além de 12 meses e fora de "em mãos" não contam', () => {
    const v = vencimentosPorMes([
      it_({ termino: '', valor: 1 }), it_({ termino: '2028-01-01', valor: 1 }),
      it_({ situacao: 'EM_CADASTRO', termino: '2026-11-01', valor: 1 }), it_({ situacao: 'ENCERRADO', termino: '2026-11-01', valor: 1 }),
    ], HOJE)
    expect(v.meses.every((m) => m.qtd === 0)).toBe(true)
    expect(v.prox90.qtd).toBe(0)
  })
})

describe('concentracaoPorParceiro', () => {
  const p = (id: string) => ({ id, nome: `Parceiro ${id}` })
  it('soma por contraparte, ordena, top 5 + outros, percentuais sobre o total', () => {
    const c = concentracaoPorParceiro([
      it_({ contraparte: p('A'), valor: 40 }), it_({ contraparte: p('A'), valor: 10 }), // A = 50
      it_({ contraparte: p('B'), valor: 20 }), it_({ contraparte: p('C'), valor: 10 }),
      it_({ contraparte: p('D'), valor: 8 }), it_({ contraparte: p('E'), valor: 6 }),
      it_({ contraparte: p('F'), valor: 4 }), it_({ situacao: 'VENCIDO', contraparte: p('G'), valor: 2 }),
    ])
    expect(c.total).toBe(100)
    expect(c.parceiros.map((x) => [x.id, x.pct])).toEqual([['A', 50], ['B', 20], ['C', 10], ['D', 8], ['E', 6]])
    expect(c.outros).toEqual({ qtd: 2, valor: 6, pct: 6 })
    expect(c.top3Pct).toBe(80)
  })
  it('sem parceiro externo fica fora (e é contado); só "em mãos" entra', () => {
    const c = concentracaoPorParceiro([
      it_({ valor: 999 }), it_({ situacao: 'ENCERRADO', contraparte: p('A'), valor: 999 }), it_({ contraparte: p('B'), valor: 10 }),
    ])
    expect(c.semParceiro).toBe(1)
    expect(c.total).toBe(10)
    expect(c.parceiros).toEqual([{ id: 'B', nome: 'Parceiro B', valor: 10, pct: 100 }])
  })
  it('carteira vazia não divide por zero', () => {
    expect(concentracaoPorParceiro([])).toEqual({ total: 0, parceiros: [], outros: { qtd: 0, valor: 0, pct: 0 }, top3Pct: 0, semParceiro: 0 })
  })
})
