import { describe, it, expect } from 'vitest'
import { isValidCPF, isValidCNPJ, isDocumentoValido } from './doc-validation'

describe('isValidCPF', () => {
  it('aceita CPF válido (com e sem máscara)', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true)
    expect(isValidCPF('52998224725')).toBe(true)
  })
  it('rejeita dígito verificador errado', () => {
    expect(isValidCPF('529.982.247-24')).toBe(false)
  })
  it('rejeita sequências repetidas (passam no DV mas são inválidas)', () => {
    expect(isValidCPF('111.111.111-11')).toBe(false)
    expect(isValidCPF('000.000.000-00')).toBe(false)
  })
  it('rejeita tamanho errado', () => {
    expect(isValidCPF('529.982.247-2')).toBe(false)
    expect(isValidCPF('')).toBe(false)
  })
})

describe('isValidCNPJ — numérico', () => {
  it('aceita CNPJ válido (Banco do Brasil, GOLDNET)', () => {
    expect(isValidCNPJ('00.000.000/0001-91')).toBe(true)
    expect(isValidCNPJ('01.536.701/0001-02')).toBe(true)
  })
  it('rejeita DV errado', () => {
    expect(isValidCNPJ('00.000.000/0001-92')).toBe(false)
  })
  it('rejeita base toda igual e tamanho errado', () => {
    expect(isValidCNPJ('00.000.000/0000-00')).toBe(false)
    expect(isValidCNPJ('123')).toBe(false)
  })
})

describe('isValidCNPJ — alfanumérico (Reforma 2026)', () => {
  it('aceita o exemplo oficial 12.ABC.345/01DE-35', () => {
    expect(isValidCNPJ('12.ABC.345/01DE-35')).toBe(true)
    expect(isValidCNPJ('12ABC34501DE35')).toBe(true)
  })
  it('rejeita DV errado no alfanumérico', () => {
    expect(isValidCNPJ('12ABC34501DE34')).toBe(false)
  })
  it('rejeita DV não-numérico (as 2 últimas posições têm de ser dígitos)', () => {
    expect(isValidCNPJ('12ABC34501DEA5')).toBe(false)
  })
})

describe('isDocumentoValido (por categoria)', () => {
  it('PJ_BR valida CNPJ; PF_BR valida CPF', () => {
    expect(isDocumentoValido('PJ_BR', '00.000.000/0001-91')).toBe(true)
    expect(isDocumentoValido('PJ_BR', '00.000.000/0001-92')).toBe(false)
    expect(isDocumentoValido('PF_BR', '529.982.247-25')).toBe(true)
    expect(isDocumentoValido('PF_BR', '111.111.111-11')).toBe(false)
  })
  it('vazio é aceito (obrigatoriedade é tratada à parte)', () => {
    expect(isDocumentoValido('PJ_BR', '')).toBe(true)
    expect(isDocumentoValido('PF_BR', '   ')).toBe(true)
  })
  it('estrangeiro não tem dígito verificador → aceita qualquer', () => {
    expect(isDocumentoValido('PJ_EST', 'ABC-123')).toBe(true)
    expect(isDocumentoValido('PF_EST', 'X99')).toBe(true)
  })
})
