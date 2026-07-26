import { describe, it, expect } from 'vitest'
import { planContractCreate, isUntouched, isRevertible, describeRevert } from './process-effects'

/* Estas regras decidem se o sistema pode mexer sozinho num contrato. Um contrato
   assinado marcado como cancelado por engano administrativo é o pior defeito que
   este módulo pode ter — por isso o limite está escrito e testado aqui. */

describe('planContractCreate', () => {
  it('contrato em cadastro e parado: cancela junto, sem perguntar', () => {
    expect(planContractCreate({ situacao: 'EM_CADASTRO', temMovimento: false }))
      .toEqual({ requerConfirmacao: false })
  })

  it('contrato VIGENTE exige confirmação — pode haver acordo assinado', () => {
    const r = planContractCreate({ situacao: 'VIGENTE', temMovimento: false })
    expect(r.requerConfirmacao).toBe(true)
    expect(r.aviso).toMatch(/VIGENTE/)
  })

  it('contrato em cadastro MAS com movimento também exige confirmação', () => {
    // alguém já lançou pagamento/aditivo/documento: o contrato andou por conta própria
    const r = planContractCreate({ situacao: 'EM_CADASTRO', temMovimento: true })
    expect(r.requerConfirmacao).toBe(true)
    expect(r.aviso).toMatch(/aditivo|lançamento|documento/i)
  })

  it('encerrado e rescindido também passam por confirmação', () => {
    expect(planContractCreate({ situacao: 'ENCERRADO', temMovimento: false }).requerConfirmacao).toBe(true)
    expect(planContractCreate({ situacao: 'RESCINDIDO', temMovimento: false }).requerConfirmacao).toBe(true)
  })
})

describe('isUntouched', () => {
  it('igual ao estado deixado pelo cancelamento: pode restaurar', () => {
    expect(isUntouched('CANCELADO', 'CANCELADO')).toBe(true)
  })

  it('alguém mexeu depois: NÃO restaura por cima', () => {
    expect(isUntouched('VIGENTE', 'CANCELADO')).toBe(false)
  })

  it('cancelamento antigo (sem foto) não bloqueia', () => {
    expect(isUntouched('VIGENTE', undefined)).toBe(true)
  })
})

describe('isRevertible', () => {
  it('efeitos em contrato são revertidos', () => {
    expect(isRevertible('CREATE', 'CONTRACT')).toBe(true)
    expect(isRevertible('ADITIVO', 'CONTRACT')).toBe(true)
    expect(isRevertible('DISTRATO', 'CONTRACT')).toBe(true)
  })

  it('ativação de parceiro é revertida, mas CRIAÇÃO de parceiro não', () => {
    // parceiro é cadastro de referência: outros contratos podem estar usando
    expect(isRevertible('ACTIVATE', 'PARTNER')).toBe(true)
    expect(isRevertible('CREATE', 'PARTNER')).toBe(false)
  })
})

describe('describeRevert', () => {
  it('fala de contrato e aditivo, não de conector', () => {
    expect(describeRevert('ADITIVO', 'CONTRACT', 'CCT_2026_0001')).toMatch(/Rascunho/)
    expect(describeRevert('DISTRATO', 'CONTRACT', 'CCT_2026_0001')).toMatch(/Encerramento/)
    expect(describeRevert('CREATE', 'CONTRACT', 'CCT_2026_0001')).toMatch(/Cancelado/)
  })

  it('deixa explícito que criação de parceiro NÃO é revertida', () => {
    expect(describeRevert('CREATE', 'PARTNER', 'ACME')).toMatch(/permanece/)
  })
})
