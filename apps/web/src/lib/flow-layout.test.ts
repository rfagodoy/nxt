import { describe, it, expect } from 'vitest'
import { layoutGraph, type FlowGraph } from './flow-layout'

const g = (nodes: FlowGraph['nodes'], edges: FlowGraph['edges']): FlowGraph => ({ nodes, edges, startId: 'start' })

describe('layoutGraph', () => {
  it('fluxo linear fica numa linha reta (mesma faixa/centro-y)', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'a', type: 'userTask', name: 'A' },
        { id: 'b', type: 'serviceTask', name: 'B' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e1', from: 'start', to: 'a' },
        { id: 'e2', from: 'a', to: 'b' },
        { id: 'e3', from: 'b', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    // todas as faixas iguais → linha reta
    const lanes = Object.values(L.nodes).map((n) => n.lane)
    expect(new Set(lanes).size).toBe(1)
    // colunas crescem da esquerda p/ direita
    expect(L.nodes.a.x).toBeGreaterThan(L.nodes.start.x)
    expect(L.nodes.b.x).toBeGreaterThan(L.nodes.a.x)
    expect(L.nodes.end.x).toBeGreaterThan(L.nodes.b.x)
    // centros y iguais (reta)
    const cy = (n: { y: number; h: number }) => n.y + n.h / 2
    expect(cy(L.nodes.a)).toBeCloseTo(cy(L.nodes.b))
  })

  it('paralelo abre faixas simétricas e a junção volta ao eixo', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'p', type: 'parallelGateway', name: 'Em paralelo' },
        { id: 'x', type: 'userTask', name: 'X' },
        { id: 'y', type: 'userTask', name: 'Y' },
        { id: 'j', type: 'parallelGateway' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'p' },
        { id: 'e1', from: 'p', to: 'x' },
        { id: 'e2', from: 'p', to: 'y' },
        { id: 'e3', from: 'x', to: 'j' },
        { id: 'e4', from: 'y', to: 'j' },
        { id: 'e5', from: 'j', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    // fork e join no eixo (faixa 0)
    expect(L.nodes.p.lane).toBe(0)
    expect(L.nodes.j.lane).toBe(0)
    // ramos simétricos (faixas opostas)
    expect(L.nodes.x.lane).toBe(-L.nodes.y.lane)
    expect(L.nodes.x.lane).not.toBe(0)
    // junção é losango pequeno (sem out>1)
    expect(L.nodes.j.w).toBeLessThan(L.nodes.p.w)
  })

  it('decisão exclusiva: saída PADRÃO segue reto, condicional abre', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'g', type: 'exclusiveGateway', name: 'Valor > 100k?' },
        { id: 'n2', type: 'userTask', name: 'Aprovar' },
        { id: 'm', type: 'exclusiveGateway' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'g' },
        { id: 'e1', from: 'g', to: 'n2', condition: 'valor > 100000' }, // condicional → abre
        { id: 'e2', from: 'g', to: 'm', isDefault: true },              // padrão → reto
        { id: 'e3', from: 'n2', to: 'm' },
        { id: 'e4', from: 'm', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    expect(L.nodes.g.lane).toBe(0)
    expect(L.nodes.m.lane).toBe(0)      // reencontro volta ao eixo (padrão era reto)
    expect(L.nodes.n2.lane).not.toBe(0) // condicional abriu para fora do eixo
  })

  it('Início e Fim não se sobrepõem quando o fluxo fica sem atividades', () => {
    // só start e end, sem aresta (caso: criei atividades e deletei todas)
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'end', type: 'end' } ],
      [],
    )
    const L = layoutGraph(graph)
    // colunas diferentes → não colam
    expect(L.nodes.end.x).toBeGreaterThan(L.nodes.start.x + L.nodes.start.w - 1)
    // sem sobreposição de bounding box
    const overlap = L.nodes.end.x < L.nodes.start.x + L.nodes.start.w && L.nodes.start.x < L.nodes.end.x + L.nodes.end.w
    expect(overlap).toBe(false)
  })

  it('dois nós órfãos no mesmo rank não se sobrepõem', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'a', type: 'userTask' }, { id: 'b', type: 'userTask' }, { id: 'end', type: 'end' } ],
      [ { id: 'e1', from: 'start', to: 'end' } ], // a e b desconectados (rank 0)
    )
    const L = layoutGraph(graph)
    expect(L.nodes.a.lane).not.toBe(L.nodes.b.lane)
  })

  it('posição manual sobrepõe o auto-layout (só do nó informado)', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'a', type: 'userTask' }, { id: 'end', type: 'end' } ],
      [ { id: 'e1', from: 'start', to: 'a' }, { id: 'e2', from: 'a', to: 'end' } ],
    )
    const auto = layoutGraph(graph)
    const L = layoutGraph(graph, { a: { x: 999, y: 777 } })
    expect(L.nodes.a.x).toBe(999)
    expect(L.nodes.a.y).toBe(777)
    // os demais seguem o auto
    expect(L.nodes.start.x).toBe(auto.nodes.start.x)
    // extents crescem para acomodar o nó movido
    expect(L.width).toBeGreaterThanOrEqual(999 + L.nodes.a.w)
  })

  it('não sobrepõe: faixas diferentes ficam distantes o bastante', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'p', type: 'parallelGateway' },
        { id: 'x', type: 'userTask' },
        { id: 'y', type: 'userTask' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'p' },
        { id: 'e1', from: 'p', to: 'x' },
        { id: 'e2', from: 'p', to: 'y' },
        { id: 'e3', from: 'x', to: 'end' },
        { id: 'e4', from: 'y', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    const a = L.nodes.x, b = L.nodes.y
    const gap = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2))
    expect(gap).toBeGreaterThanOrEqual(a.h) // sem sobreposição vertical
  })
})
