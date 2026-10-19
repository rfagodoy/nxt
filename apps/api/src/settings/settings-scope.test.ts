import { describe, it, expect } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { escopoDaChave, USER_PREF_PREFIX } from './settings.controller'

describe('escopo da configuração', () => {
  it('chave comum é da organização', () => {
    expect(escopoDaChave('nxt:columns:contratos', 'u1')).toBe('')
  })
  it('preferência pessoal usa o usuário do token', () => {
    expect(escopoDaChave(`${USER_PREF_PREFIX}densidade`, 'u1')).toBe('u1')
  })
  it('preferência pessoal sem usuário é recusada (não cai na organização)', () => {
    expect(() => escopoDaChave(`${USER_PREF_PREFIX}densidade`, '')).toThrow(ForbiddenException)
  })
})
