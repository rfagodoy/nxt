import { describe, expect, it } from 'vitest'
import { proximaPeloDesenho } from './tasks-ui'

/* Desenho do PO: Preencher → [paralelo: (escolha todos: Coord→Gerente | Ciência) | Analisar] → Contábil */
const g = {
  nodes: {
    preencher: { type: 'userTask', name: 'Preencher' },
    par: { type: 'parallelGateway' }, esc: { type: 'inclusiveGateway' },
    coord: { type: 'userTask', name: 'Validação (Coordenador)' }, gerente: { type: 'userTask', name: 'Validação (Gerente)' },
    ciencia: { type: 'userTask', name: 'Tomar ciência' }, analisar: { type: 'userTask', name: 'Analisar' },
    esc_fim: { type: 'inclusiveGateway' }, par_fim: { type: 'parallelGateway' },
    contabil: { type: 'userTask', name: 'Validação contábil' }, fim: { type: 'end' },
  },
  edges: [
    { from: 'preencher', to: 'par' }, { from: 'par', to: 'esc' }, { from: 'par', to: 'analisar' },
    { from: 'esc', to: 'coord' }, { from: 'esc', to: 'ciencia' }, { from: 'coord', to: 'gerente' },
    { from: 'gerente', to: 'esc_fim' }, { from: 'ciencia', to: 'esc_fim' }, { from: 'esc_fim', to: 'par_fim' },
    { from: 'analisar', to: 'par_fim' }, { from: 'par_fim', to: 'contabil' }, { from: 'contabil', to: 'fim' },
  ],
}

describe('proximaPeloDesenho', () => {
  it('no mesmo caminho: Coordenador → Gerente (não a tarefa paralela de outro caminho)', () => {
    expect(proximaPeloDesenho(g, 'coord')).toBe('Validação (Gerente)')
  })
  it('atravessa os reencontros até a próxima atividade', () => {
    expect(proximaPeloDesenho(g, 'gerente')).toBe('Validação contábil')
    expect(proximaPeloDesenho(g, 'analisar')).toBe('Validação contábil')
  })
  it('bifurcação logo à frente → não promete', () => {
    expect(proximaPeloDesenho(g, 'preencher')).toBeNull()
  })
  it('última atividade ou grafo ausente → nada', () => {
    expect(proximaPeloDesenho(g, 'contabil')).toBeNull()
    expect(proximaPeloDesenho(null, 'coord')).toBeNull()
  })
})
