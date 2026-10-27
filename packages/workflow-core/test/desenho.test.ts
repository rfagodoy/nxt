import { describe, it, expect } from 'vitest'
import { lerDesenho, podarDesenho, pontoDaSeta, ligacaoPermitida, MSG_LOSANGO, MSG_PARALELO, MSG_ORDEM, MSG_DESTINO } from '../src/desenho'
import type { FluxoBlocos, ItemAtividade } from '../src/blocos'

const at = (id: string): ItemAtividade => ({ kind: 'atividade', id, tipo: 'userTask', nome: id })

const valido = { versao: 1, posicoes: { a: { x: 1, y: 2 } }, raias: [{ id: 'r1', nome: 'RH', altura: 140 }] }

describe('lerDesenho', () => {
  it('aceita um desenho válido', () => { expect(lerDesenho(valido)).toEqual(valido) })
  it('recusa versão diferente de 1', () => { expect(lerDesenho({ ...valido, versao: 2 })).toBeNull() })
  it('recusa posição com NaN', () => { expect(lerDesenho({ ...valido, posicoes: { a: { x: NaN, y: 2 } } })).toBeNull() })
  it('recusa raia com altura menor que 60', () => {
    expect(lerDesenho({ ...valido, raias: [{ id: 'r1', nome: 'RH', altura: 59 }] })).toBeNull()
  })
  it('recusa quando faltam as raias', () => { expect(lerDesenho({ versao: 1, posicoes: {} })).toBeNull() })
})

describe('podarDesenho', () => {
  it('tira as posições de nós que não existem mais e mantém as raias', () => {
    const d = { versao: 1 as const, posicoes: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 } }, raias: valido.raias }
    const p = podarDesenho(d, ['a', 'c'])
    expect(Object.keys(p.posicoes)).toEqual(['a', 'c'])
    expect(p.raias).toEqual(valido.raias)
  })
})

describe('pontoDaSeta', () => {
  const f: FluxoBlocos = {
    versao: 1, inicioId: 'start', fimId: 'end',
    itens: [
      at('A'),
      {
        kind: 'escolha', id: 'E', modo: 'todos',
        caminhos: [
          { id: 'c1', itens: [at('X')], fim: { tipo: 'segue' } },
          { id: 'c2', itens: [], fim: { tipo: 'segue' } },
        ],
        casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } },
      },
      { kind: 'paralelo', id: 'P', caminhos: [{ id: 'f1', itens: [at('Y')] }, { id: 'f2', itens: [at('Z')] }] },
      at('B'),
    ],
  }
  it.each([
    ['start', 'A', 'raiz', 0], ['A', 'E', 'raiz', 1],
    ['E', 'X', 'c1', 0], ['X', 'E__fim', 'c1', 1], ['E', 'E__fim', 'c2', 0],
    ['E__fim', 'P', 'raiz', 2], ['P', 'Y', 'f1', 0], ['Y', 'P__fim', 'f1', 1],
    ['P__fim', 'B', 'raiz', 3], ['B', 'end', 'raiz', 4],
  ])('%s -> %s', (de, para, ref, indice) => {
    expect(pontoDaSeta(f, de, para)).toEqual({ ref, indice })
  })
  it('seta de volta ou inexistente não é vaga', () => {
    expect(pontoDaSeta(f, 'X', 'A')).toBeNull()
    expect(pontoDaSeta(f, 'nada', 'B')).toBeNull()
  })
})

describe('ligacaoPermitida', () => {
  const esc = (): FluxoBlocos['itens'][number] => ({
    kind: 'escolha', id: 'E', modo: 'primeiro',
    caminhos: [{ id: 'c1', itens: [at('X')], fim: { tipo: 'segue' } }],
    casoContrario: { id: 'cc', itens: [at('W')], fim: { tipo: 'segue' } },
  })
  const f: FluxoBlocos = { versao: 1, inicioId: 'start', fimId: 'end', itens: [at('A'), esc(), at('B')] }

  it('última tarefa do caminho -> tarefa anterior = volta', () => {
    expect(ligacaoPermitida(f, 'X', 'A')).toEqual({ ok: true, caminhoId: 'c1', fim: { tipo: 'volta', alvoId: 'A' } })
  })
  it('última tarefa do caminho -> fim = encerra', () => {
    expect(ligacaoPermitida(f, 'X', 'end')).toEqual({ ok: true, caminhoId: 'c1', fim: { tipo: 'encerra' } })
  })
  it('losango como destino é recusado', () => {
    expect(ligacaoPermitida(f, 'X', 'E')).toEqual({ ok: false, motivo: MSG_LOSANGO })
    expect(ligacaoPermitida(f, 'X', 'E__fim')).toEqual({ ok: false, motivo: MSG_LOSANGO })
  })
  it('tarefa depois da escolha não é destino de volta', () => {
    expect(ligacaoPermitida(f, 'X', 'B')).toEqual({ ok: false, motivo: MSG_DESTINO })
  })
  it('origem que não fecha caminho -> ordem', () => {
    expect(ligacaoPermitida(f, 'A', 'B')).toEqual({ ok: false, motivo: MSG_ORDEM })
  })
  it('caso contrário não é origem válida', () => {
    expect(ligacaoPermitida(f, 'W', 'A')).toEqual({ ok: false, motivo: MSG_ORDEM })
  })
  it('escolha dentro de frente de paralelo -> MSG_PARALELO', () => {
    const g: FluxoBlocos = {
      versao: 1, inicioId: 'start', fimId: 'end',
      itens: [at('A'), { kind: 'paralelo', id: 'P', caminhos: [{ id: 'f1', itens: [esc()] }, { id: 'f2', itens: [at('Z')] }] }],
    }
    expect(ligacaoPermitida(g, 'X', 'A')).toEqual({ ok: false, motivo: MSG_PARALELO })
    expect(ligacaoPermitida(g, 'X', 'end')).toEqual({ ok: false, motivo: MSG_PARALELO })
  })
})
