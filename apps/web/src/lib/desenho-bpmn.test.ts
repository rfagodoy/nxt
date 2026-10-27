import { describe, it, expect } from 'vitest'
import type { GrafoGerado } from '@nxt/workflow-core'
import type { DesenhoBpmn } from '@nxt/types'
import { nodeSize } from './flow-layout'
import { GRADE, desenhoInicial, organizar, completarPosicoes, raiaNaAltura, avisoDeRaia, setaSobPonto, polilinhaDaSeta } from './desenho-bpmn'

const no = (id: string, type: string) => ({ id, type }) as GrafoGerado['nodes'][number]
const seta = (from: string, to: string) => ({ id: `${from}>${to}`, from, to }) as GrafoGerado['edges'][number]
const cadeia = (...ids: string[]): GrafoGerado => {
  const nodes = [no('start', 'start'), ...ids.map((i) => no(i, 'userTask')), no('end', 'end')]
  const seq = ['start', ...ids, 'end']
  return { nodes, edges: seq.slice(1).map((id, i) => seta(seq[i], id)) } as GrafoGerado
}

describe('desenhoInicial', () => {
  const resp: Record<string, string> = { A: 'RH', B: 'Contas' }
  it('cria uma raia por responsável e põe cada nó dentro da sua', () => {
    const g = cadeia('A', 'B')
    const d = desenhoInicial(g, (id) => resp[id])
    expect(d.versao).toBe(1)
    expect(d.raias.map((r) => r.nome)).toEqual(['RH', 'Contas'])
    for (const n of g.nodes) expect(d.posicoes[n.id]).toBeDefined()
    expect(raiaNaAltura(d.raias, d.posicoes.A.y)).toBe(0)
    expect(raiaNaAltura(d.raias, d.posicoes.B.y)).toBe(1)
  })
  it('sem responsável vira raia de nome vazio', () => {
    const d = desenhoInicial(cadeia('A'), () => undefined)
    expect(d.raias).toHaveLength(1)
    expect(d.raias[0].nome).toBe('')
  })
})

describe('organizar', () => {
  it('mantém o nó na raia em que já está', () => {
    const g = cadeia('A', 'B')
    const base = desenhoInicial(g, (id) => ({ A: 'RH', B: 'Contas' })[id])
    const d: DesenhoBpmn = { ...base, posicoes: { ...base.posicoes, A: { x: 500, y: base.raias[0].altura + 20 } } }
    const o = organizar(g, d, (id) => ({ A: 'RH', B: 'Contas' })[id])
    expect(raiaNaAltura(o.raias, o.posicoes.A.y)).toBe(1)
  })
  it('x cresce estritamente e tudo cai na grade', () => {
    const g = cadeia('A', 'B', 'C')
    const r = (id: string) => ({ A: 'RH', B: 'RH', C: 'RH' })[id]
    const o = organizar(g, desenhoInicial(g, r), r)
    const xs = ['start', 'A', 'B', 'C', 'end'].map((i) => o.posicoes[i].x)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
    for (const p of Object.values(o.posicoes)) { expect(p.x % GRADE).toBe(0); expect(p.y % GRADE).toBe(0) }
  })
})

describe('organizar com ramos paralelos', () => {
  it('A e B na mesma raia não se sobrepõem e ficam dentro dela', () => {
    const g = { nodes: [no('start', 'start'), no('g', 'exclusiveGateway'), no('A', 'userTask'), no('B', 'userTask'), no('gf', 'exclusiveGateway'), no('end', 'end')],
      edges: [seta('start', 'g'), seta('g', 'A'), seta('g', 'B'), seta('A', 'gf'), seta('B', 'gf'), seta('gf', 'end')] } as GrafoGerado
    const r = () => 'RH'
    const o = organizar(g, desenhoInicial(g, r), r)
    const caixa = (id: string) => ({ ...o.posicoes[id], ...nodeSize({ id, type: g.nodes.find((n) => n.id === id)!.type as never }, 1, 1) })
    const a = caixa('A'), b = caixa('B')
    expect(a.y).not.toBe(b.y)
    expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
    for (const c of [a, b]) {
      expect(raiaNaAltura(o.raias, c.y)).toBe(0)
      expect(c.y + c.h).toBeLessThanOrEqual(o.raias[0].altura)
    }
  })
})

describe('completarPosicoes', () => {
  const g: GrafoGerado = { nodes: [no('start', 'start'), no('A', 'userTask'), no('N', 'userTask')], edges: [seta('start', 'A'), seta('A', 'N')] } as GrafoGerado
  const d: DesenhoBpmn = { versao: 1, posicoes: { start: { x: 0, y: 0 }, A: { x: 100, y: 48 } }, raias: [] }
  it('põe o que falta à direita do antecessor', () => {
    const o = completarPosicoes(g, d)
    expect(o.posicoes.N).toEqual({ x: 300, y: 48 })
  })
  it('segue as setas mesmo com a lista fora de ordem', () => {
    const g2 = { nodes: [no('A', 'userTask'), no('N2', 'userTask'), no('N1', 'userTask')], edges: [seta('A', 'N1'), seta('N1', 'N2')] } as GrafoGerado
    const o = completarPosicoes(g2, { versao: 1, posicoes: { A: { x: 64, y: 48 } }, raias: [] })
    expect(o.posicoes.N1).toEqual({ x: 264, y: 48 })
    expect(o.posicoes.N2).toEqual({ x: 464, y: 48 })
  })
  it('com "perto", encaixa na grade', () => {
    expect(completarPosicoes(g, d, { x: 333, y: 107 }).posicoes.N).toEqual({ x: 336, y: 112 })
  })
})

describe('raiaNaAltura', () => {
  const raias = [{ altura: 140 }, { altura: 100 }] as never
  it('acha o índice ou -1', () => {
    expect(raiaNaAltura(raias, 139)).toBe(0)
    expect(raiaNaAltura(raias, 140)).toBe(1)
    expect(raiaNaAltura(raias, 240)).toBe(-1)
    expect(raiaNaAltura(raias, -1)).toBe(-1)
  })
})

describe('avisoDeRaia', () => {
  it('avisa só quando o nome da raia não aparece no responsável', () => {
    expect(avisoDeRaia('RH', 'Analista de RH')).toBeNull()
    expect(avisoDeRaia('Patrimônio', 'Analista de Patrimonio')).toBeNull()
    expect(avisoDeRaia('RH', 'Analista de Fluxo de Contas')).toBe('Está na raia “RH”, mas quem executa é Analista de Fluxo de Contas.')
    expect(avisoDeRaia('', 'X')).toBeNull()
    expect(avisoDeRaia('RH', undefined)).toBeNull()
  })
})

describe('setaSobPonto', () => {
  const setas = [{ id: 's1', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }]
  it('acha a seta dentro da tolerância', () => {
    expect(setaSobPonto(setas, { x: 50, y: 10 })).toBe('s1')
    expect(setaSobPonto(setas, { x: 50, y: 20 })).toBeNull()
  })
})

describe('polilinhaDaSeta', () => {
  it('direita → esquerda para a frente: quebra no meio, como o smoothstep', () => {
    expect(polilinhaDaSeta({ x: 0, y: 0 }, 'direita', { x: 100, y: 40 }, 'esquerda'))
      .toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 40 }])
  })
  it('base → base (volta): desce além da mais baixa e sobe no destino', () => {
    expect(polilinhaDaSeta({ x: 300, y: 50 }, 'base', { x: 0, y: 40 }, 'base'))
      .toEqual([{ x: 300, y: 50 }, { x: 300, y: 70 }, { x: 0, y: 70 }, { x: 0, y: 40 }])
  })
  it('topo/base → esquerda: um cotovelo', () => {
    expect(polilinhaDaSeta({ x: 0, y: 0 }, 'base', { x: 100, y: 80 }, 'esquerda'))
      .toEqual([{ x: 0, y: 0 }, { x: 0, y: 80 }, { x: 100, y: 80 }])
  })
  it('direita → topo: um cotovelo', () => {
    expect(polilinhaDaSeta({ x: 0, y: 0 }, 'direita', { x: 100, y: 80 }, 'topo'))
      .toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }])
  })
  it('o ponto no meio do trecho vertical acha a seta', () => {
    const pontos = polilinhaDaSeta({ x: 0, y: 0 }, 'direita', { x: 100, y: 200 }, 'esquerda')
    expect(setaSobPonto([{ id: 's', pontos }], { x: 52, y: 100 })).toBe('s')
  })
})
