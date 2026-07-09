import { describe, it, expect } from 'vitest'
import { num } from '../src/num'
import { gerarParcelas, parcelaNaComp, parcelaProvisoria, totaisAVencer } from '../src/parcelas'
import { aplicarReajuste } from '../src/reajuste'
import { cct20260001, despesaComReajuste, despesaSimples, reajusteParcelaAplicado } from './fixtures'

const makeId = (i: number) => `l${i + 1}`

describe('gerarParcelas', () => {
  it('projeta N parcelas mensais a partir do início', () => {
    const p = gerarParcelas(despesaSimples, { inicio: '2027-01-15', qtd: 3, valorBase: 1000, makeId })
    expect(p.map(l => l.vencimento)).toEqual(['2027-01-15', '2027-02-15', '2027-03-15'])
    expect(p.every(l => l.status === 'previsto')).toBe(true)
    expect(p.every(l => num(l.valor) === 1000)).toBe(true)
  })

  it('usa o reajuste já conhecido do mês da parcela, quando existe', () => {
    const p = gerarParcelas(reajusteParcelaAplicado, { inicio: '2026-06-10', qtd: 2, valorBase: 1000, makeId })
    expect(num(p[0].valor)).toBe(1100) // reajuste de 2026-01 já vale
  })

  it('parcelaNaComp devolve 0 quando não há reajuste até o mês', () => {
    expect(parcelaNaComp(despesaSimples, '2026-06')).toBe(0)
    expect(parcelaNaComp(reajusteParcelaAplicado, '2025-12')).toBe(0)
    expect(parcelaNaComp(reajusteParcelaAplicado, '2026-01')).toBe(1100)
  })
})

describe('parcelaProvisoria — derivada, nunca gravada', () => {
  it('contrato SEM linha de reajuste: nenhuma parcela é provisória', () => {
    for (const l of despesaSimples.pagamentos) expect(parcelaProvisoria(despesaSimples, l)).toBe(false)
  })

  it('o CCT_2026_0001 não tem reajuste — logo, nada provisório hoje', () => {
    for (const l of cct20260001.pagamentos) expect(parcelaProvisoria(cct20260001, l)).toBe(false)
  })

  it('parcela paga nunca é provisória — é fato consumado', () => {
    const paga = despesaComReajuste.pagamentos[0]
    expect(paga.status).toBe('pago')
    expect(parcelaProvisoria(despesaComReajuste, paga)).toBe(false)
  })

  it('parcela que vence ANTES do próximo reajuste é firme; a partir dele, provisória', () => {
    /* próxima data de reajuste = 2027-01-01 */
    const antes = { id: 'x', status: 'previsto', vencimento: '2026-12-31', valor: 1000 }
    const noDia = { id: 'y', status: 'previsto', vencimento: '2027-01-01', valor: 1000 }
    const depois = { id: 'z', status: 'previsto', vencimento: '2027-06-01', valor: 1000 }
    expect(parcelaProvisoria(despesaComReajuste, antes)).toBe(false)
    expect(parcelaProvisoria(despesaComReajuste, noDia)).toBe(true)
    expect(parcelaProvisoria(despesaComReajuste, depois)).toBe(true)
  })

  it('provisória ≡ será reprecificada: o conjunto bate com parcelasAlvo do próximo reajuste', () => {
    const c = { ...despesaComReajuste, pagamentos: [...despesaComReajuste.pagamentos, { id: 'p13', status: 'previsto', vencimento: '2027-03-10', valor: 1000 }] }
    const provisorias = c.pagamentos.filter((l: any) => parcelaProvisoria(c, l)).map((l: any) => l.id)
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'parcela' })
    const reprecificadas = r.pagamentos.filter(l => num(l.valor) !== 1000).map(l => l.id)
    expect(provisorias).toEqual(reprecificadas)
  })

  it('a MESMA parcela deixa de ser provisória e volta a ser, após um reajuste — por isso não é flag', () => {
    const distante = { id: 'far', status: 'previsto', vencimento: '2028-06-10', valor: 1000 }
    const c1 = { ...despesaComReajuste, pagamentos: [...despesaComReajuste.pagamentos, distante] }
    expect(parcelaProvisoria(c1, distante)).toBe(true) // alcançada pelo reajuste de 2027-01

    /* aplica o reajuste de 2027-01: a parcela é reprecificada, mas o PRÓXIMO reajuste
       (2028-01) volta a alcançá-la — o valor de 2028-06 ainda vai mudar */
    const r = aplicarReajuste(c1, { id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'parcela' })
    const c2 = { ...c1, pagamentos: r.pagamentos, reajustesRealizados: [r.reajuste] }
    const aindaDistante = c2.pagamentos.find(l => l.id === 'far')!
    expect(num(aindaDistante.valor)).toBe(1100)
    expect(parcelaProvisoria(c2, aindaDistante)).toBe(true)
  })

  it('reajuste vencido e não aplicado torna provisórias as parcelas alcançadas, mesmo já vencidas', () => {
    /* data base 2020-01 + anual → próxima 2021-01, muito antes de hoje */
    const c = { ...despesaSimples, reajustes: [{ id: 'r1', indice: '1', data: '2020-01-01', periodicidade: 'Anual' }] }
    const vencidaNaoPaga = c.pagamentos[5]
    expect(vencidaNaoPaga.status).toBe('previsto')
    expect(parcelaProvisoria(c, vencidaNaoPaga)).toBe(true)
  })
})

describe('totaisAVencer', () => {
  it('separa vencido, firme e provisório sem dupla contagem', () => {
    const c = despesaComReajuste
    const t = totaisAVencer(c, c.pagamentos, '2026-07-01')
    /* 3 pagas (jan..mar); vencidas: abr..jun = 3 × 1000; a vencer jul..dez = 6 × 1000,
       todas ANTES de 2027-01 → firmes */
    expect(t.vencido).toBe(3000)
    expect(t.firme).toBe(6000)
    expect(t.provisorio).toBe(0)
  })

  it('parcelas além do próximo reajuste contam como provisórias', () => {
    const c = { ...despesaComReajuste, pagamentos: [...despesaComReajuste.pagamentos, { id: 'p13', status: 'previsto', vencimento: '2027-03-10', valor: 1000 }] }
    const t = totaisAVencer(c, c.pagamentos, '2026-07-01')
    expect(t.provisorio).toBe(1000)
    expect(t.firme).toBe(6000)
  })
})
