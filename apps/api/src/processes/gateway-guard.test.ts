import { describe, it, expect } from 'vitest'
import { validarDecisoes } from './gateway-guard'

const g = (edges: Array<{ from: string; condition?: string; isDefault?: boolean }>) =>
  validarDecisoes([{ id: 'g1', type: 'exclusiveGateway', name: 'Necessita de parecer?' }], edges)

describe('validarDecisoes', () => {
  it('aprova: uma padrão + demais com condição', () => {
    expect(g([
      { from: 'g1', condition: "contrato.x == 'Sim'" },
      { from: 'g1', isDefault: true },
    ])).toBeNull()
  })
  it('recusa sem saída padrão, nomeando o losango', () => {
    expect(g([
      { from: 'g1', condition: "a == 'x'" },
      { from: 'g1', condition: "a == 'y'" },
    ])).toMatch(/Necessita de parecer\?.*sem filtros/)
  })
  it('recusa duas padrão', () => {
    expect(g([
      { from: 'g1', isDefault: true },
      { from: 'g1', isDefault: true },
    ])).toMatch(/2 caminhos/)
  })
  it('recusa saída sem condição que não é a padrão', () => {
    expect(g([
      { from: 'g1', condition: '' },
      { from: 'g1', isDefault: true },
    ])).toMatch(/sem filtros que não é/)
  })
  it('losango com UMA saída não exige nada (passagem)', () => {
    expect(g([{ from: 'g1' }])).toBeNull()
  })
  it('gateway paralelo fica de fora', () => {
    expect(validarDecisoes(
      [{ id: 'p1', type: 'parallelGateway' }],
      [{ from: 'p1' }, { from: 'p1' }],
    )).toBeNull()
  })
})
