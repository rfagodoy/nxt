import { describe, it, expect } from 'vitest'
import { screenBaseFlags } from './screen-policy'

describe('screenBaseFlags — telas base do sistema imutáveis', () => {
  it('tela do sistema: SEMPRE ativa e SEMPRE padrão (ignora o pedido)', () => {
    expect(screenBaseFlags({ isSystem: true, systemExistsForType: false, reqStatus: 'ARCHIVED', reqDefault: false }))
      .toEqual({ status: 'ACTIVE', isDefault: true })
    expect(screenBaseFlags({ isSystem: true, systemExistsForType: true, reqStatus: 'DRAFT', reqDefault: false }))
      .toEqual({ status: 'ACTIVE', isDefault: true })
  })

  it('não-sistema NÃO vira padrão se já existe tela do sistema no tipo', () => {
    expect(screenBaseFlags({ isSystem: false, systemExistsForType: true, reqStatus: 'ACTIVE', reqDefault: true }))
      .toEqual({ status: 'ACTIVE', isDefault: false })
  })

  it('não-sistema PODE ser padrão quando NÃO há tela do sistema no tipo (ex.: GENERICA)', () => {
    expect(screenBaseFlags({ isSystem: false, systemExistsForType: false, reqStatus: 'ACTIVE', reqDefault: true }))
      .toEqual({ status: 'ACTIVE', isDefault: true })
  })

  it('não-sistema respeita a situação pedida (pode arquivar/rascunho)', () => {
    expect(screenBaseFlags({ isSystem: false, systemExistsForType: false, reqStatus: 'ARCHIVED', reqDefault: false }))
      .toEqual({ status: 'ARCHIVED', isDefault: false })
    expect(screenBaseFlags({ isSystem: false, systemExistsForType: true, reqStatus: 'DRAFT', reqDefault: false }))
      .toEqual({ status: 'DRAFT', isDefault: false })
  })
})
