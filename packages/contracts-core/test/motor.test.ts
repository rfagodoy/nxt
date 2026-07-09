/* O motor de datas intercala reajuste e renovação por DATA. Reajustar tudo antes de
   renovar tudo produziria um contrato inteiro no preço de hoje: as parcelas dos períodos
   futuros nem existem quando os reajustes rodam. Este teste reproduz o laço do scheduler
   sobre o caso do PO (contrato de 2019, 12 parcelas, IPCA anual, renovação de 12 meses)
   e exige que cada período fique com o preço do SEU ano. */

import { describe, it, expect } from 'vitest'
import { num, round2 } from '../src/num'
import { parcelaVigente, terminoVigente, somaLancamentos, lancPrevisto } from '../src/derive'
import { aplicarReajuste, planejarReajuste } from '../src/reajuste'
import { renovarPeriodo } from '../src/renovacao'
import { valorVigente } from '../src/derive'

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

/** Reproduz `avancarContrato` do scheduler. */
function avancar(c: any, today = HOJE) {
  const aplicados: any[] = []
  let renovados = 0
  let guard = 0
  while (guard++ < 200) {
    const termino = terminoVigente(c)
    const venceu = !!termino && termino < today

    let alvo: any = null
    for (const r of c.reajustes) {
      const plano = planejarReajuste(c, r, serie, today)
      if (plano.aplicar && (!alvo || plano.competencia < alvo.plano.competencia)) alvo = { r, plano }
    }

    if (alvo && (!venceu || alvo.plano.competencia <= termino)) {
      const res = aplicarReajuste(c, {
        id: `rr${guard}`, reajusteId: alvo.r.id, competencia: alvo.plano.competencia,
        percentual: alvo.plano.percentual, base: alvo.plano.base,
      })
      c.reajustesRealizados = [...c.reajustesRealizados, res.reajuste]
      c.pagamentos = res.pagamentos
      c.recebimentos = res.recebimentos
      aplicados.push(res.reajuste)
      continue
    }
    if (venceu) {
      const r = renovarPeriodo(c, { campo: 'pagamentos', anos: 0, meses: 12, dias: 0, data: today, automatica: true, id: `n${guard}`, makeId: i => `l${guard}_${i}` })
      if (!r) break
      c.renovacoes = [...c.renovacoes, r.renovacao]
      c.pagamentos = [...c.pagamentos, ...r.lancamentos]
      renovados++
      continue
    }
    break
  }
  return { aplicados, renovados }
}

describe('motor: reajuste e renovação intercalados', () => {
  it('sete períodos represados → sete reajustes e sete renovações', () => {
    const c = contratoBase()
    const { aplicados, renovados } = avancar(c)
    expect(aplicados).toHaveLength(7)
    expect(renovados).toBe(7)
    expect(terminoVigente(c)).toBe('2027-04-26')
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
