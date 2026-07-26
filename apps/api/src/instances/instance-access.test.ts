import { describe, it, expect } from 'vitest'
import { canCancelInstance, isCancelable } from './instance-access'

describe('isCancelable', () => {
  it('em execução e em ERRO podem ser cancelados', () => {
    expect(isCancelable('RUNNING')).toBe(true)
    // instância travada num conector ficava presa para sempre antes disso
    expect(isCancelable('ERROR')).toBe(true)
  })

  it('processo encerrado não se cancela de novo', () => {
    expect(isCancelable('COMPLETED')).toBe(false)
    expect(isCancelable('CANCELLED')).toBe(false)
  })
})

describe('canCancelInstance', () => {
  const inst = { status: 'RUNNING', startedById: 'dono' }

  it('admin cancela qualquer processo', () => {
    expect(canCancelInstance(inst, 'outro', true)).toBe(true)
  })

  it('quem iniciou cancela o próprio processo', () => {
    expect(canCancelInstance(inst, 'dono', false)).toBe(true)
  })

  it('terceiro não cancela processo alheio', () => {
    expect(canCancelInstance(inst, 'outro', false)).toBe(false)
  })

  it('instância antiga sem dono registrado fica com o admin', () => {
    const antiga = { status: 'RUNNING', startedById: null }
    expect(canCancelInstance(antiga, 'qualquer', false)).toBe(false)
    expect(canCancelInstance(antiga, 'qualquer', true)).toBe(true)
  })
})
