import { describe, expect, it } from 'vitest'
import { validarExecutoresFixos, bloqueantes, type PapelDoCatalogo } from '../index'

const PAPEIS: PapelDoCatalogo[] = [{ id: 'coord', label: 'Coordenador', referencia: 'PESSOA', origem: 'UNIDADE' }]
const fixo = (over: Record<string, unknown> = {}) => ({ papelId: 'coord', entityType: 'UNIDADE', mode: 'FIXA', entityId: 'u1', ...over })
const ocup = (pessoas: number) => new Map([['a', { pessoas, onde: 'Gerência de Suprimentos' }]])

describe('validarExecutoresFixos (PO, 11/10/2026)', () => {
  it('papel ocupado na unidade → nada a dizer', () => {
    expect(validarExecutoresFixos([{ stepId: 'a', stepName: 'Validar', executor: fixo() }], PAPEIS, ocup(2))).toEqual([])
  })
  it('ninguém ocupa o papel → recusa dizendo papel, lugar e onde atribuir', () => {
    const r = validarExecutoresFixos([{ stepId: 'a', stepName: 'Validar', executor: fixo() }], PAPEIS, ocup(0))
    expect(r.map((p) => p.tipo)).toEqual(['executor-vago'])
    expect(bloqueantes(r)).toHaveLength(1)
    expect(r[0].mensagem).toContain('Coordenador em Gerência de Suprimentos')
    expect(r[0].mensagem).toContain('Estrutura organizacional')
  })
  it('papel de unidade sem a unidade escolhida → recusa (antes virava tarefa aberta)', () => {
    const r = validarExecutoresFixos([{ stepId: 'a', stepName: 'Validar', executor: fixo({ entityId: undefined }) }], PAPEIS, new Map())
    expect(r.map((p) => p.tipo)).toEqual(['executor-sem-entidade'])
    expect(r[0].mensagem).toContain('qual unidade')
  })
  it('"Quem iniciou", "Da variável" e atividade sem executor ficam com as regras próprias', () => {
    const steps = [
      { stepId: 'a', executor: { papelId: '@iniciador', entityType: 'ORG', mode: 'FIXA' } },
      { stepId: 'b', executor: { papelId: 'coord', entityType: 'UNIDADE', mode: 'VARIAVEL', stakeholder: '3' } },
      { stepId: 'c', executor: null },
    ]
    expect(validarExecutoresFixos(steps, PAPEIS, new Map([['a', { pessoas: 0, onde: 'x' }], ['b', { pessoas: 0, onde: 'x' }]]))).toEqual([])
  })
  it('papel da organização inteira sem ninguém → também recusa', () => {
    const r = validarExecutoresFixos([{ stepId: 'a', executor: { papelId: 'coord', entityType: 'ORG', mode: 'FIXA' } }], PAPEIS,
      new Map([['a', { pessoas: 0, onde: 'toda a organização' }]]))
    expect(r.map((p) => p.tipo)).toEqual(['executor-vago'])
  })
})
