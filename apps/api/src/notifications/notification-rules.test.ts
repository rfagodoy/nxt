import { describe, it, expect } from 'vitest'
import { recipientsOf, fanOutTargets, dedupKeyFor, shouldEmail } from './notification-rules'

/* Estas regras decidem se um aviso chega à pessoa certa e se o mesmo fato vira um
   aviso ou dez. São testadas sem banco de propósito: é o que precisa continuar
   verdadeiro mesmo quando ninguém está rodando o sistema à mão. */

describe('recipientsOf', () => {
  it('o POOL do executor manda quando existe', () => {
    expect(recipientsOf({ assignees: ['u1', 'u2'], assignee: 'u9' })).toEqual(['u1', 'u2'])
  })

  it('sem pool, vale o responsável direto (modelo antigo)', () => {
    expect(recipientsOf({ assignees: [], assignee: 'u9' })).toEqual(['u9'])
    expect(recipientsOf({ assignee: 'u9' })).toEqual(['u9'])
  })

  it('sem ninguém, a tarefa está ABERTA', () => {
    expect(recipientsOf({ assignees: [], assignee: null })).toEqual([])
    expect(recipientsOf({})).toEqual([])
  })

  it('tolera o campo JSON cru e valores vazios (leitura defensiva do Prisma)', () => {
    expect(recipientsOf({ assignees: '["u1"]' as unknown as string[] })).toEqual([])
    expect(recipientsOf({ assignees: ['', 'u1'] })).toEqual(['u1'])
  })
})

describe('fanOutTargets', () => {
  it('um alvo por destinatário, sem repetir', () => {
    expect(fanOutTargets(['u1', 'u2', 'u1'])).toEqual(['u1', 'u2'])
  })

  it('tarefa aberta vira UM aviso sem dono — nunca zero', () => {
    expect(fanOutTargets([])).toEqual([null])
  })
})

describe('dedupKeyFor', () => {
  it('mesma tarefa e mesma pessoa = mesma chave (a varredura não duplica)', () => {
    expect(dedupKeyFor('vence', 't1', 'u1')).toBe(dedupKeyFor('vence', 't1', 'u1'))
  })

  it('pessoas diferentes recebem avisos diferentes', () => {
    expect(dedupKeyFor('tarefa', 't1', 'u1')).not.toBe(dedupKeyFor('tarefa', 't1', 'u2'))
  })

  it('tipos diferentes não se sobrescrevem', () => {
    expect(dedupKeyFor('vence', 't1', 'u1')).not.toBe(dedupKeyFor('vencida', 't1', 'u1'))
  })

  it('sem dono, a chave é da organização', () => {
    expect(dedupKeyFor('tarefa', 't1', null)).toContain(':org')
  })

  it('o REAVISO do dia seguinte é um aviso novo, não a mesma linha', () => {
    const dia1 = dedupKeyFor('vencida', 't1', 'u1', '2026-07-26')
    const dia2 = dedupKeyFor('vencida', 't1', 'u1', '2026-07-27')
    expect(dia1).not.toBe(dia2)
    expect(dia1).not.toBe(dedupKeyFor('vencida', 't1', 'u1'))
  })
})

describe('shouldEmail', () => {
  it('aviso pessoal de workflow vira e-mail', () => {
    expect(shouldEmail('TAREFA_ATRIBUIDA', 'u1')).toBe(true)
    expect(shouldEmail('TAREFA_VENCIDA', 'u1')).toBe(true)
  })

  it('aviso sem dono NÃO vira e-mail (iria para a organização inteira)', () => {
    expect(shouldEmail('TAREFA_ATRIBUIDA', null)).toBe(false)
  })

  it('aviso de contrato não entra neste canal', () => {
    expect(shouldEmail('VIGENCIA', 'u1')).toBe(false)
  })
})
