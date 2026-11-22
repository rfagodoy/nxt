import { describe, it, expect } from 'vitest'
import { destinosDoCampo, type GrafoDaInstancia } from './destino-do-campo'

const C = 'contrato.sf_erros'
/** Analisar → escolha "Possui erros?" → Sim: Corrigir / caso contrário: Validar */
const grafo: GrafoDaInstancia = {
  nodes: {
    A: { type: 'userTask', name: 'Analisar situação cadastral/fiscal' },
    g: { type: 'exclusiveGateway', name: 'Possui erros?' },
    corrigir: { type: 'userTask', name: 'Corrigir dados cadastrais' },
    validar: { type: 'userTask', name: 'Validar a contratação' },
    fim: { type: 'end' },
  },
  edges: [
    { from: 'A', to: 'g' },
    { from: 'g', to: 'corrigir', condition: `${C} == 'SIM'` },
    { from: 'g', to: 'validar', isDefault: true },
    { from: 'corrigir', to: 'A' },
    { from: 'validar', to: 'fim' },
  ],
}

describe('destinosDoCampo', () => {
  it('cada resposta diz a próxima etapa (com o caso contrário)', () => {
    expect(Object.fromEntries(destinosDoCampo(grafo, 'A', C, ['SIM', 'NAO'])!)).toEqual({
      SIM: 'Corrigir dados cadastrais', NAO: 'Validar a contratação',
    })
  })

  it('atravessa losango de uma saída e aponta o fim do processo', () => {
    const g: GrafoDaInstancia = {
      nodes: { ...grafo.nodes, p: { type: 'exclusiveGateway' } },
      edges: [{ from: 'A', to: 'p' }, { from: 'p', to: 'g' }, { from: 'g', to: 'fim', condition: `${C} == 'NAO'` }, { from: 'g', to: 'corrigir', isDefault: true }],
    }
    expect(destinosDoCampo(g, 'A', C, ['NAO'])?.get('NAO')).toBe('o fim do processo')
  })

  it('filtro que testa outro campo junto: não promete destino', () => {
    const g = { ...grafo, edges: grafo.edges.map((e) => (e.to === 'corrigir' && e.from === 'g' ? { ...e, condition: `${C} == 'SIM' && contrato.valorTotal > 10` } : e)) }
    expect(destinosDoCampo(g, 'A', C, ['SIM'])).toBeNull()
  })

  it('escolha que testa outro campo, ou sem escolha logo à frente: nada', () => {
    expect(destinosDoCampo(grafo, 'A', 'contrato.outro', ['SIM'])).toBeNull()
    expect(destinosDoCampo(grafo, 'validar', C, ['SIM'])).toBeNull()
    expect(destinosDoCampo(null, 'A', C, ['SIM'])).toBeNull()
  })

  it('texto entre aspas não é confundido com variável', () => {
    const g = { ...grafo, edges: grafo.edges.map((e) => (e.to === 'corrigir' && e.from === 'g' ? { ...e, condition: `${C} == 'contrato.x'` } : e)) }
    expect(destinosDoCampo(g, 'A', C, ['contrato.x'])?.get('contrato.x')).toBe('Corrigir dados cadastrais')
  })
})
