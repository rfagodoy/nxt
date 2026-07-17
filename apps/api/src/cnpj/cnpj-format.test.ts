import { describe, it, expect } from 'vitest'
import { formatCnae, formatNatureza } from './cnpj.service'

describe('formatCnae — recupera zero à esquerda (CNAEs da Seção A / agro)', () => {
  it('CNAE numérico da BrasilAPI com zero perdido → formatado e válido no catálogo', () => {
    expect(formatCnae(115600)).toBe('0115-6/00')  // soja
    expect(formatCnae(111302)).toBe('0111-3/02')
    expect(formatCnae(116402)).toBe('0116-4/02')
    expect(formatCnae(161099)).toBe('0161-0/99')  // apoio à agricultura (SLC Agrícola)
  })
  it('CNAE de 7 dígitos (sem zero à esquerda) intacto', () => {
    expect(formatCnae(6201501)).toBe('6201-5/01')
    expect(formatCnae('6422100')).toBe('6422-1/00')
  })
  it('vazio/nulo → ""', () => {
    expect(formatCnae(undefined)).toBe('')
    expect(formatCnae('')).toBe('')
  })
})

describe('formatNatureza', () => {
  it('4 dígitos → XXX-X', () => {
    expect(formatNatureza(2062)).toBe('206-2')
    expect(formatNatureza(2038)).toBe('203-8')
  })
  it('recupera zero à esquerda defensivamente', () => {
    expect(formatNatureza(101)).toBe('010-1')
  })
  it('vazio → ""', () => {
    expect(formatNatureza(undefined)).toBe('')
  })
})
