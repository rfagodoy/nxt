import { describe, it, expect } from 'vitest'
import { effectiveSituacao, normalizeSituacao, terminoVigente, valorVigente } from '../src/derive'
import { cct20260001, comAditivos, reajusteParcelaAplicado } from './fixtures'

describe('normalizeSituacao — legado', () => {
  it('mapeia o modelo antigo', () => {
    expect(normalizeSituacao('ATIVO')).toBe('VIGENTE')
    expect(normalizeSituacao('PENDENTE')).toBe('EM_CADASTRO')
    expect(normalizeSituacao('REVISAO')).toBe('EM_CADASTRO')
    expect(normalizeSituacao('SUSPENSO')).toBe('EM_CADASTRO')
    expect(normalizeSituacao('ENCERRADO')).toBe('ENCERRADO')
  })
})

describe('effectiveSituacao — VENCIDO é derivado, nunca gravado', () => {
  it('VIGENTE com término no passado → VENCIDO', () => {
    expect(effectiveSituacao('VIGENTE', '2020-01-01', '2026-07-09')).toBe('VENCIDO')
  })
  it('VIGENTE com término no futuro continua VIGENTE', () => {
    expect(effectiveSituacao('VIGENTE', '2027-01-01', '2026-07-09')).toBe('VIGENTE')
  })
  it('prazo indeterminado (término vazio) nunca vence', () => {
    expect(effectiveSituacao('VIGENTE', '', '2026-07-09')).toBe('VIGENTE')
    expect(effectiveSituacao('VIGENTE', null, '2026-07-09')).toBe('VIGENTE')
  })
  it('encerrado/rescindido não viram VENCIDO', () => {
    expect(effectiveSituacao('ENCERRADO', '2020-01-01', '2026-07-09')).toBe('ENCERRADO')
    expect(effectiveSituacao('RESCINDIDO', '2020-01-01', '2026-07-09')).toBe('RESCINDIDO')
  })
  it('o término prorrogado manda: renovou, não vence', () => {
    /* CCT_2026_0001: término original 2020-07-22, renovações estendem até 2026-07-22 */
    expect(cct20260001.terminoVigencia).toBe('2020-07-22')
    expect(effectiveSituacao('VIGENTE', cct20260001.terminoVigencia, '2026-07-09')).toBe('VENCIDO')
    expect(effectiveSituacao('VIGENTE', terminoVigente(cct20260001), '2026-07-09')).toBe('VIGENTE')
  })
})

describe('BUG do dashboard: valor vigente ignorava renovações e reajustes', () => {
  /* O dashboard somava `valorTotal + aditivos` e parava aí. Um contrato renovado 6 vezes
     aparecia com o valor ORIGINAL. `valorVigente` soma também o valorPeriodo de cada
     renovação e o delta de cada reajuste aplicado. */
  it('renovações somam valorPeriodo ao total', () => {
    expect(Number(cct20260001.valorTotal)).toBe(210000) // o que o dashboard mostrava
    expect(valorVigente(cct20260001)).toBe(570000)      // 210.000 + 6 × 60.000
  })

  it('reajustes aplicados somam o delta ao total', () => {
    expect(Number(reajusteParcelaAplicado.valorTotal)).toBe(12000)
    expect(valorVigente(reajusteParcelaAplicado)).toBe(12900) // + delta de 900
  })

  it('aditivo ATIVO soma; RASCUNHO não', () => {
    expect(valorVigente(comAditivos)).toBe(17000) // 12.000 + 5.000 (o de 99.999 é rascunho)
  })
})
