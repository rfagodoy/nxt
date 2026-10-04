import { describe, it, expect } from 'vitest'
import { religarVinculos, senaoParaCaminho, removerItem, validarBlocos, gruposDeVinculo, blocosParaGrafo, type FluxoBlocos } from '../index'

const fluxo = (): FluxoBlocos => ({
  versao: 1, inicioId: 'start', fimId: 'end',
  itens: [
    { kind: 'paralelo', id: 'par', caminhos: [
      { id: 'p1', itens: [{ kind: 'atividade', id: 'a', tipo: 'userTask', nome: 'Parecer' }] },
      { id: 'p2', itens: [{ kind: 'atividade', id: 'b', tipo: 'userTask', vinculoDe: 'a' }] },
      { id: 'p3', itens: [{ kind: 'atividade', id: 'c', tipo: 'userTask', vinculoDe: 'a' }] },
    ] },
  ],
})

describe('atividade vinculada', () => {
  it('cada vinculada é um nó próprio no grafo (cada frente gera sua tarefa)', () => {
    const ids = blocosParaGrafo(fluxo()).nodes.filter((n) => n.type === 'userTask').map((n) => n.id)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(gruposDeVinculo(fluxo()).get('a')).toEqual(['b', 'c'])
  })
  it('remover a origem promove a primeira vinculada e religa as outras', () => {
    const { fluxo: f, promovidas } = religarVinculos(removerItem(fluxo(), 'a'))
    expect(promovidas).toEqual([{ de: 'a', para: 'b' }])
    expect(gruposDeVinculo(f).get('b')).toEqual(['c'])
  })
  it('sem órfão, nada muda', () => {
    const f = fluxo()
    expect(religarVinculos(f).fluxo).toBe(f)
  })
})

describe('Senão descontinuado', () => {
  const comSenao = (): FluxoBlocos => ({
    versao: 1, inicioId: 'start', fimId: 'end',
    itens: [{ kind: 'escolha', id: 'e', pergunta: 'Ok?', caminhos: [{ id: 'c1', condition: 'ok == true', itens: [], fim: { tipo: 'segue' } }],
      casoContrario: { id: 'cc', itens: [{ kind: 'atividade', id: 'rev', tipo: 'userTask' }], fim: { tipo: 'encerra' } } }],
  })
  it('vira caminho comum sem filtro: a ativação passa a pedir a condição, não mais o Senão', () => {
    const f = senaoParaCaminho(comSenao(), 'e', 'novo')
    const tipos = validarBlocos(f).map((p) => p.tipo)
    expect(tipos).toContain('caminho-sem-condicao')
    expect(tipos).not.toContain('senao-descontinuado')
  })
})
