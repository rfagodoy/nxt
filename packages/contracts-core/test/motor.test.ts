/* O motor de datas intercala reajuste e renovação por DATA. Reajustar tudo antes de
   renovar tudo produziria um contrato inteiro no preço de hoje: as parcelas dos períodos
   futuros nem existem quando os reajustes rodam. Este teste reproduz o laço do scheduler
   sobre o caso do PO (contrato de 2019, 12 parcelas, IPCA anual, renovação de 12 meses)
   e exige que cada período fique com o preço do SEU ano. */

import { describe, it, expect } from 'vitest'
import { round2 } from '../src/num'
import { parcelaVigente, terminoVigente, somaLancamentos, lancPrevisto } from '../src/derive'
import { valorVigente } from '../src/derive'
import { avancarContrato, renovarUmPeriodoComReajuste } from '../src/motor'

/** Opções mínimas do motor para os testes: série constante, ids estáveis, prazo 12 meses. */
const opts = (today: string) => ({
  serie: () => serie, today, campo: 'pagamentos' as const, prazo: { anos: 0, meses: 12, dias: 0 },
  makeReajusteId: (n: number) => `rr${n}`, makeRenovacaoId: (n: number) => `n${n}`, makeParcelaId: (n: number, i: number) => `l${n}_${i}`,
})

const HOJE = '2026-07-09'
/* 1% ao mês, todo mês, de 2018 a 2027 → acumulado anual = 12,68% */
const serie: Record<string, number> = {}
for (let ano = 2018; ano <= 2027; ano++) for (let m = 1; m <= 12; m++) serie[`${ano}-${String(m).padStart(2, '0')}`] = 1

const contratoBase = () => ({
  natureza: 'DESPESA',
  terminoVigencia: '2020-04-26',
  valorTotal: 60000, valorParcela: 5000, qtdParcelas: 12,
  aditivos: [], renovacoes: [], reajustesRealizados: [], recebimentos: [],
  reajustes: [{ id: 'r1', indice: 'ipca', data: '2019-04-01', periodicidade: 'Anual', aplicacao: 'AUTOMATICA', base: 'parcela' }],
  pagamentos: Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2019, 4 + i, 27))
    return { id: `p${i + 1}`, status: 'previsto', vencimento: d.toISOString().slice(0, 10), data: '', valor: 5000, forma: '' }
  }),
} as any)

/** Avança o contrato pelo motor único do core. Devolve a contagem no formato antigo
 *  do helper (aplicados/renovados) para manter as asserções legíveis. */
function avancar(c: any, today = HOJE) {
  const { reajustes, renovacoes } = avancarContrato(c, opts(today))
  return { aplicados: reajustes, renovados: renovacoes.length }
}

describe('motor: reajuste e renovação intercalados', () => {
  it('sete períodos represados → sete reajustes e sete renovações', () => {
    const c = contratoBase()
    const { aplicados, renovados } = avancar(c)
    expect(aplicados).toHaveLength(7)
    expect(renovados).toBe(7)
    expect(terminoVigente(c)).toBe('2027-04-26')
  })

  it('VENCIDO que NÃO renova: reajuste só até o término, nada no período morto (fix #3)', () => {
    const c = contratoBase()
    const { reajustes, renovacoes } = avancarContrato(c, { ...opts(HOJE), permitirRenovar: false })
    expect(renovacoes).toHaveLength(0) // não renova
    // com o overflow antigo aplicava 7 (2020..2026, no período morto); agora só a de 2020-04 (≤ término)
    expect(reajustes).toHaveLength(1)
  })

  it('cada período fica com o preço do SEU ano — não todos no preço de hoje', () => {
    const c = contratoBase()
    avancar(c)
    /* 1,01^12 − 1 = 12,68% ao ano, composto sobre a parcela vigente */
    const esperado = [5000]
    for (let i = 0; i < 7; i++) esperado.push(round2(esperado[i] * 1.1268))

    const valorEm = (mes: string) => lancPrevisto(c.pagamentos.find((l: any) => l.vencimento.startsWith(mes))!)
    expect(valorEm('2019-05')).toBe(esperado[0]) // antes do 1º reajuste
    expect(valorEm('2020-03')).toBe(esperado[0])
    expect(valorEm('2020-04')).toBe(esperado[1]) // reajuste de abr/2020
    expect(valorEm('2021-03')).toBe(esperado[1])
    expect(valorEm('2021-04')).toBe(esperado[2]) // reajuste de abr/2021
    expect(valorEm('2026-04')).toBe(esperado[7]) // último
    expect(parcelaVigente(c)).toBe(esperado[7])
  })

  it('as parcelas assumem exatamente 8 valores distintos, um por período', () => {
    const c = contratoBase()
    avancar(c)
    expect(c.pagamentos).toHaveLength(96) // 12 + 7 × 12
    expect(new Set(c.pagamentos.map((l: any) => lancPrevisto(l))).size).toBe(8)
  })

  it('o valor vigente do contrato fecha com a soma do cronograma', () => {
    const c = contratoBase()
    avancar(c)
    expect(valorVigente(c)).toBeCloseTo(somaLancamentos(c.pagamentos), 2)
  })

  it('rodar de novo no mesmo dia não aplica nada — idempotente', () => {
    const c = contratoBase()
    avancar(c)
    const snapshot = JSON.stringify(c)
    const segunda = avancar(c)
    expect(segunda.aplicados).toHaveLength(0)
    expect(segunda.renovados).toBe(0)
    expect(JSON.stringify(c)).toBe(snapshot)
  })

  it('linha MANUAL não reajusta — só renova', () => {
    const c = contratoBase()
    c.reajustes[0].aplicacao = 'MANUAL'
    const { aplicados, renovados } = avancar(c)
    expect(aplicados).toHaveLength(0)
    expect(renovados).toBe(7)
    expect(parcelaVigente(c)).toBe(5000) // todas as parcelas no preço original
  })
})

/* O botão "Renovar período" do front chama `renovarUmPeriodoComReajuste`: renova UM
   período aplicando ANTES os reajustes vencidos da vigência atual. É o bug que o PO achou —
   antes a renovação manual gerava o período no preço velho porque não aplicava o reajuste. */
describe('renovação manual: aplica o reajuste vencido antes de gerar o período', () => {
  it('contrato vencido com reajuste devido → 1 reajuste aplicado e o período nasce reajustado', () => {
    const c = contratoBase()
    /* hoje já passou do término (2020-04-26) e da 1ª competência (2020-04): o reajuste vence */
    const res = renovarUmPeriodoComReajuste(c, opts('2020-05-01'))!
    expect(res).not.toBeNull()

    const esperada = round2(5000 * 1.1268) // 12,68% ao ano sobre a parcela vigente
    expect(res.reajustes).toHaveLength(1)
    expect(Number(res.reajustes[0].parcelaNova)).toBe(esperada)

    /* as 12 parcelas do novo período nascem no preço JÁ reajustado */
    expect(res.lancamentos).toHaveLength(12)
    expect(res.lancamentos.every(l => lancPrevisto(l) === esperada)).toBe(true)

    expect(parcelaVigente(c)).toBe(esperada)
    expect(terminoVigente(c)).toBe('2021-04-26')
  })

  it('sem reajuste vencido (hoje antes do término) → só renova, no preço vigente', () => {
    const c = contratoBase()
    const res = renovarUmPeriodoComReajuste(c, opts('2019-06-01'))! // antes de qualquer competência
    expect(res.reajustes).toHaveLength(0)
    expect(res.lancamentos).toHaveLength(12)
    expect(res.lancamentos.every(l => lancPrevisto(l) === 5000)).toBe(true)
    expect(parcelaVigente(c)).toBe(5000)
  })

  it('dois cliques seguidos reajustam cada período no seu ano — não os dois no mesmo preço', () => {
    const c = contratoBase()
    renovarUmPeriodoComReajuste(c, opts('2020-05-01'))          // aplica 2020-04, renova → 2021-04-26
    const p1 = round2(5000 * 1.1268)
    const res2 = renovarUmPeriodoComReajuste(c, opts('2021-05-01'))! // aplica 2021-04, renova → 2022-04-26
    const p2 = round2(p1 * 1.1268)
    expect(res2.reajustes).toHaveLength(1)
    expect(Number(res2.reajustes[0].parcelaNova)).toBe(p2)
    expect(res2.lancamentos.every(l => lancPrevisto(l) === p2)).toBe(true)
    expect(terminoVigente(c)).toBe('2022-04-26')
    /* o valor vigente fecha com a soma do cronograma: 12×5000 + 12×p1 + 12×p2 */
    expect(valorVigente(c)).toBeCloseTo(somaLancamentos(c.pagamentos), 2)
  })

  it('linha de reajuste MANUAL não é aplicada pela renovação manual — quem aplica é a pessoa', () => {
    const c = contratoBase()
    c.reajustes[0].aplicacao = 'MANUAL'
    const res = renovarUmPeriodoComReajuste(c, opts('2020-05-01'))!
    expect(res.reajustes).toHaveLength(0)
    expect(res.lancamentos.every(l => lancPrevisto(l) === 5000)).toBe(true)
  })
})
