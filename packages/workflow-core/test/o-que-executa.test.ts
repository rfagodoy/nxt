import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { assinaturaDoQueExecuta, fluxoQueExecuta } from '../src/o-que-executa'

/* O que a API compara para decidir se a gravação devolve um workflow ATIVO a rascunho
   (`mudaOFluxo`); o editor usa a mesma conta para avisar antes. */

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const desenho: DesenhoV2 = {
  versao: 2,
  formas: [F('start', 'start'), F('a1', 'userTask', { nome: 'Revisar' }), F('end', 'end')],
  setas: [S('start', 'a1'), S('a1', 'end')],
  posicoes: { a1: { x: 100, y: 80 } }, raias: [{ id: 'r1', nome: 'Jurídico', altura: 160 } as DesenhoV2['raias'][number]],
}
const steps = [{ stepId: 'a1', stepName: 'Revisar', stepType: 'userTask', fields: [], executor: { tipo: 'papel', papel: 'juridico' } }]
const fs = { steps, desenho, graph: { nodes: [], edges: [] }, quemInicia: { modo: 'TODOS' } }

describe('assinaturaDoQueExecuta', () => {
  const a = assinaturaDoQueExecuta(fs)
  it('posições, raias, layout, rótulo de seta comum, nome do Início e grafo não contam', () => {
    const d2: DesenhoV2 = {
      ...desenho,
      formas: desenho.formas.map((f) => (f.id === 'start' ? { ...f, nome: 'Pedido' } : f)),
      setas: desenho.setas.map((s) => (s.id === 's_a1_end' ? { ...s, rotulo: 'pronto' } : s)),
      posicoes: { a1: { x: 300, y: 200 } }, raias: [],
      layout: { orientacao: 'vertical', fases: [], piscinasExternas: [], fluxosMensagem: [], tamanhos: {} },
    }
    expect(assinaturaDoQueExecuta({ ...fs, desenho: d2, graph: { nodes: [1], edges: [] }, laneOrder: ['x'] })).toBe(a)
  })
  it('a ordem das chaves não conta', () => {
    expect(assinaturaDoQueExecuta({ quemInicia: fs.quemInicia, graph: fs.graph, desenho, steps })).toBe(a)
  })
  it('o executor de uma etapa (vindo da raia) conta', () => {
    expect(assinaturaDoQueExecuta({ ...fs, steps: [{ ...steps[0], executor: { tipo: 'papel', papel: 'compras' } }] })).not.toBe(a)
  })
  it('uma etapa a mais conta', () => {
    const d2: DesenhoV2 = { ...desenho, formas: [...desenho.formas, F('a2')], setas: [S('start', 'a1'), S('a1', 'a2'), S('a2', 'end')] }
    expect(assinaturaDoQueExecuta({ ...fs, desenho: d2 })).not.toBe(a)
  })
  it('desenho que não fecha: null (a API conta como mudança)', () => {
    expect(assinaturaDoQueExecuta({ ...fs, desenho: { ...desenho, setas: [] } })).toBeNull()
    expect(fluxoQueExecuta({ desenho: { versao: 2 } })).toBe('invalido')
  })
  it('sem desenho v2: os blocos gravados', () => {
    const blocos = { versao: 1, inicioId: 'start', fimId: 'end', itens: [{ kind: 'atividade', id: 'a1', tipo: 'userTask' }] }
    expect(fluxoQueExecuta({ blocos })).toEqual(blocos)
    expect(fluxoQueExecuta({})).toBeNull()
  })
})
