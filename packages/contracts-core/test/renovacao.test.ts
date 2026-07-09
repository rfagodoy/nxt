/* Renovação: motor de datas e botão "Gerar próximo período" usam a MESMA função
   (`renovarPeriodo`). Este teste fixa a projeção de parcelas (idêntica ao laço antigo
   do scheduler) e o cálculo do novo término, que era onde a versão manual divergia. */

import { describe, it, expect } from 'vitest'
import { addMesesISO } from '../src/dates'
import { gerarParcelas } from '../src/parcelas'
import { parcelaVigente, terminoVigente } from '../src/derive'
import { campoRenovacao, renovarPeriodo } from '../src/renovacao'
import { cct20260001, despesaSimples, receita } from './fixtures'
import { renovacaoLegacy } from './legacy'

const STAMP = 1783557369390 // Date.now() congelado
const GUARD = 1
const makeId = (i: number) => `l_${STAMP}_${GUARD}_${i + 1}`

const renovar = (c: any, over: any = {}) =>
  renovarPeriodo(c, { campo: campoRenovacao(c.natureza), anos: 0, meses: 12, dias: 0, data: '2026-07-09', automatica: true, id: 'r1', makeId, ...over })

describe('renovarPeriodo: projeção de parcelas idêntica ao laço antigo', () => {
  const casos: Array<[string, string, number, number]> = [
    ['12 parcelas a partir de 2020-06-23', '2020-06-23', 12, 5000],
    ['6 parcelas com virada de ano',       '2025-11-30', 6, 1234.56],
    ['1 parcela',                          '2026-01-31', 1, 100],
    ['24 parcelas (dois períodos)',        '2024-02-29', 24, 999.99],
  ]

  for (const [nome, ultimoVenc, qtd, parcelaVig] of casos) {
    it(nome, () => {
      const legado = renovacaoLegacy(ultimoVenc, qtd, parcelaVig, STAMP, GUARD)
      const core = gerarParcelas(cct20260001, { inicio: addMesesISO(ultimoVenc, 1), qtd, valorBase: parcelaVig, ignorarReajustes: true, makeId })
      expect(core).toEqual(legado.lancs)
      expect(addMesesISO(ultimoVenc, qtd)).toBe(legado.ultimoVenc)
    })
  }
})

describe('novo término = término vigente + PRAZO de renovação', () => {
  /* REGRESSÃO: a renovação manual usava a data do ÚLTIMO VENCIMENTO gerado como novo
     término. Num contrato SEM cronograma, ela projetava as parcelas a partir do início
     da vigência, a última caía um dia depois do término e a vigência era estendida por
     UM DIA. Reproduz o CCT_2026_0001 do PO: 27/04/2019 → 26/04/2020, renovar por 12 meses. */
  const semCrono = { ...despesaSimples, terminoVigencia: '2020-04-26', pagamentos: [], qtdParcelas: 12, valorParcela: 5000 }

  it('sem cronograma, estende 12 meses — não um dia', () => {
    const r = renovar(semCrono)!
    expect(r.renovacao.terminoAnterior).toBe('2020-04-26')
    expect(r.renovacao.novoTermino).toBe('2021-04-26')
    expect(r.lancamentos).toEqual([])
    expect(r.renovacao.valorPeriodo).toBe(0) // sem cronograma o total não cresce
  })

  it('com cronograma, estende pelo prazo E projeta as parcelas', () => {
    const r = renovar({ ...despesaSimples, terminoVigencia: '2026-12-10' })!
    expect(r.renovacao.novoTermino).toBe('2027-12-10')
    expect(r.lancamentos).toHaveLength(12)
    expect(r.lancamentos[0].vencimento).toBe('2027-01-10') // mês seguinte ao último vencimento
    expect(r.renovacao.valorPeriodo).toBe(12000)
  })

  it('o término anterior é o VIGENTE (considera renovações já registradas)', () => {
    const r = renovar(cct20260001)!
    expect(terminoVigente(cct20260001)).toBe('2026-07-22')
    expect(r.renovacao.terminoAnterior).toBe('2026-07-22')
    expect(r.renovacao.novoTermino).toBe('2027-07-22')
  })

  it('recusa quando não há prazo de renovação', () => {
    expect(renovar(despesaSimples, { anos: 0, meses: 0, dias: 0 })).toBeNull()
  })

  it('recusa quando o prazo não avança a data (evita laço infinito)', () => {
    expect(renovar(despesaSimples, { anos: 0, meses: 0, dias: -1 })).toBeNull()
  })

  it('recusa quando não há término de vigência', () => {
    expect(renovar({ ...despesaSimples, terminoVigencia: '', renovacoes: [] })).toBeNull()
  })
})

describe('campoRenovacao: a renovação alimenta o lado da natureza', () => {
  it('DESPESA e AMBOS → pagamentos; RECEITA → recebimentos', () => {
    expect(campoRenovacao('DESPESA')).toBe('pagamentos')
    expect(campoRenovacao('AMBOS')).toBe('pagamentos')
    expect(campoRenovacao('RECEITA')).toBe('recebimentos')
  })

  it('contrato de RECEITA projeta em recebimentos', () => {
    const r = renovar({ ...receita, terminoVigencia: '2026-12-31' })!
    expect(r.lancamentos).toHaveLength(12)
    expect(parcelaVigente(receita)).toBe(500)
    expect(r.renovacao.valorPeriodo).toBe(6000)
  })
})

describe('laço do motor: períodos represados renovam até passar de hoje', () => {
  it('CCT_2026_0001 do PO — 2020-04-26, 12 meses, sem cronograma, hoje = 2026-07-09', () => {
    const hoje = '2026-07-09'
    let cur: any = { ...despesaSimples, terminoVigencia: '2020-04-26', pagamentos: [], renovacoes: [], qtdParcelas: 12, valorParcela: 5000 }
    const renos: any[] = []
    let guard = 0
    while (guard++ < 120) {
      const t = terminoVigente(cur)
      if (!t || t >= hoje) break
      const r = renovarPeriodo(cur, { campo: 'pagamentos', anos: 0, meses: 12, dias: 0, data: hoje, automatica: true, id: `r${guard}`, makeId })
      if (!r) break
      renos.push(r.renovacao)
      cur = { ...cur, renovacoes: renos }
    }
    expect(renos).toHaveLength(7)
    expect(renos.map(r => r.novoTermino)).toEqual([
      '2021-04-26', '2022-04-26', '2023-04-26', '2024-04-26', '2025-04-26', '2026-04-26', '2027-04-26',
    ])
    expect(terminoVigente(cur)).toBe('2027-04-26')
  })
})
