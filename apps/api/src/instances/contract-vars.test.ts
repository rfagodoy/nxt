import { describe, it, expect } from 'vitest'
import { montarVariavelContrato } from './contract-vars'
import { evalCondition } from '@nxt/workflow-core'

describe('montarVariavelContrato', () => {
  const contrato = {
    situacao: 'EM_CADASTRO', tipo: 'tp1', valorTotal: 250000, prazoIndeterminado: false,
    inicioVigencia: '2026-01-01', terminoVigencia: null,
  }
  const custom = [
    { fieldId: 'fld_patrimonio', value: 'Sim' },
    { fieldId: 'fld_obs', value: null },
  ]

  it('nativos curados + personalizados por fieldId, com defaults seguros', () => {
    const v = montarVariavelContrato(contrato, custom)
    expect(v.valorTotal).toBe(250000)
    expect(v.terminoVigencia).toBe('') // null vira '' — condição compara sem surpresa
    expect(v.fld_patrimonio).toBe('Sim')
    expect(v.fld_obs).toBe('')
  })

  it('mão de obra: booleano + local (defaults seguros quando não informado)', () => {
    const v = montarVariavelContrato({ ...contrato, maoDeObra: true, maoDeObraLocal: 'CONTRATANTE' }, [])
    expect(v.maoDeObra).toBe(true)
    expect(v.maoDeObraLocal).toBe('CONTRATANTE')
    const semResposta = montarVariavelContrato(contrato, [])
    expect(semResposta.maoDeObra).toBe(false)
    expect(semResposta.maoDeObraLocal).toBe('')
    expect(evalCondition("contrato.maoDeObra == true && contrato.maoDeObraLocal == 'CONTRATANTE'", { contrato: v })).toBe(true)
  })

  it('o caso do PO avaliado pelo MOTOR de verdade, via variável contrato', () => {
    const vars = { contrato: montarVariavelContrato(contrato, custom) }
    expect(evalCondition("contrato.fld_patrimonio == 'Sim'", vars)).toBe(true)
    expect(evalCondition('contrato.valorTotal > 100000', vars)).toBe(true)
    expect(evalCondition("contrato.fld_patrimonio == 'Nao'", vars)).toBe(false)
  })
})
