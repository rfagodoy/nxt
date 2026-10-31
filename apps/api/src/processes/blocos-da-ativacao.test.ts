import { describe, it, expect } from 'vitest'
import { blocosDaAtivacao } from './blocos-da-ativacao'

const formas = [{ id: 'start', tipo: 'start' }, { id: 'a1', tipo: 'userTask' }, { id: 'a2', tipo: 'userTask' }, { id: 'end', tipo: 'end' }]

describe('blocosDaAtivacao', () => {
  it('desenho v2 que converte: devolve os blocos', () => {
    const r = blocosDaAtivacao({
      steps: [], desenho: { versao: 2, formas, setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 'a2' }, { id: 's3', de: 'a2', para: 'end' }], posicoes: {}, raias: [] },
    })
    expect(r && 'fluxo' in r && r.fluxo.itens.map((i) => i.id)).toEqual(['a1', 'a2'])
  })
  it('desenho v2 que não converte: devolve a frase, com o nome da etapa', () => {
    const r = blocosDaAtivacao({
      steps: [{ stepId: 'a1', stepName: 'Analisar' }],
      desenho: { versao: 2, formas, setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 'a2' }, { id: 's3', de: 'a1', para: 'end' }, { id: 's4', de: 'a2', para: 'end' }], posicoes: {}, raias: [] },
    })
    expect(r && 'erro' in r && r.erro).toBe('Saem 2 setas de "Analisar". Para decidir entre elas, use uma Escolha; para fazer as duas, um Ao mesmo tempo.')
  })
  it('desenho v2 que não converte: devolve também os culpados (formas e setas), para o editor destacar', () => {
    const r = blocosDaAtivacao({
      steps: [], desenho: { versao: 2, formas, setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 'a2' }, { id: 's3', de: 'a1', para: 'end' }, { id: 's4', de: 'a2', para: 'end' }], posicoes: {}, raias: [] },
    })
    expect(r && 'erro' in r && r.problemas.map(({ tipo, formas: f, setas }) => ({ tipo, formas: f, setas }))).toEqual([{ tipo: 'saidas-multiplas', formas: ['a1'], setas: ['s2', 's3'] }])
  })
  it('desenho que diz ser v2 mas não se lê: recusa, em vez de cair nos blocos gravados', () => {
    const r = blocosDaAtivacao({ steps: [], desenho: { versao: 2, formas: [{ id: 'start', tipo: 'start' }, { id: 'start', tipo: 'end' }], setas: [], posicoes: {}, raias: [] } })
    expect(r && 'erro' in r && r.erro).toBe('O desenho gravado deste workflow está corrompido. Abra-o no editor, confira e salve de novo antes de ativar.')
  })
  it('sem desenho v2 (workflow em blocos ou antigo): segue o caminho de hoje', () => {
    expect(blocosDaAtivacao({ steps: [], desenho: { versao: 1, posicoes: {}, raias: [] } })).toBeNull()
    expect(blocosDaAtivacao({ steps: [] })).toBeNull()
  })
})
