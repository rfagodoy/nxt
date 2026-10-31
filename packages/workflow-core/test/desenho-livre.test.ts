import { describe, it, expect } from 'vitest'
import type { DesenhoV2 } from '@nxt/types'
import { blocosParaDesenho, lerDesenhoV2 } from '../src/desenho-livre'
import type { FluxoBlocos, ItemFluxo, CaminhoCondicional } from '../src/blocos'

const base = (): DesenhoV2 => ({
  versao: 2,
  formas: [{ id: 'start', tipo: 'start' }, { id: 'a1', tipo: 'userTask' }, { id: 'end', tipo: 'end' }],
  setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 'end' }],
  posicoes: { a1: { x: 10, y: 20 } },
  raias: [],
})

describe('lerDesenhoV2', () => {
  it('desenho válido passa inteiro', () => {
    expect(lerDesenhoV2(base())).toEqual(base())
  })
  it('versão 1 não é v2', () => {
    expect(lerDesenhoV2({ versao: 1, posicoes: {}, raias: [] })).toBeNull()
  })
  it('seta que aponta para forma que não existe é descartada', () => {
    const d = base()
    d.setas.push({ id: 's3', de: 'a1', para: 'fantasma' })
    expect(lerDesenhoV2(d)?.setas.map((s) => s.id)).toEqual(['s1', 's2'])
  })
  it('forma repetida invalida o desenho', () => {
    const d = base()
    d.formas.push({ id: 'a1', tipo: 'userTask' })
    expect(lerDesenhoV2(d)).toBeNull()
  })
})

const at = (id: string, extra: Record<string, unknown> = {}): ItemFluxo => ({ kind: 'atividade', id, tipo: 'userTask', ...extra }) as ItemFluxo
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })
const cam = (id: string, itens: ItemFluxo[], fim: CaminhoCondicional['fim'] = { tipo: 'segue' }, extra: Partial<CaminhoCondicional> = {}): CaminhoCondicional =>
  ({ id, condition: `c_${id}`, itens, fim, ...extra })
const escolha = (id: string, caminhos: CaminhoCondicional[], extra: Record<string, unknown> = {}): ItemFluxo =>
  ({ kind: 'escolha', id, modo: 'primeiro', caminhos, casoContrario: { id: `${id}_cc`, itens: [], fim: { tipo: 'segue' } }, ...extra }) as ItemFluxo

describe('blocosParaDesenho', () => {
  it('sequência: formas e setas do início ao fim', () => {
    const d = blocosParaDesenho(fluxo([at('a1'), at('a2')]))
    expect(d.formas.map((f) => [f.id, f.tipo])).toEqual([['start', 'start'], ['a1', 'userTask'], ['a2', 'userTask'], ['end', 'end']])
    expect(d.setas.map((s) => [s.de, s.para])).toEqual([['start', 'a1'], ['a1', 'a2'], ['a2', 'end']])
  })
  it('escolha "todos" vira losango × com modo todos; o que junta também é ×', () => {
    const d = blocosParaDesenho(fluxo([escolha('e1', [cam('c1', [at('a1')]), cam('c2', [at('a2')])], { modo: 'todos', pergunta: 'Pareceres?' })]))
    expect(d.formas.find((f) => f.id === 'e1')).toEqual({ id: 'e1', tipo: 'exclusiveGateway', modo: 'todos', pergunta: 'Pareceres?' })
    // o que junta também leva o modo (só aparência: o losango inclusivo de sempre)
    expect(d.formas.find((f) => f.id === 'e1__fim')).toEqual({ id: 'e1__fim', tipo: 'exclusiveGateway', modo: 'todos', junta: true })
  })
  it('a seta que sai do losango para um caminho tem o id do caminho, com a condição', () => {
    const d = blocosParaDesenho(fluxo([escolha('e1', [cam('c1', [at('a1')]), cam('c2', [])])]))
    const saem = d.setas.filter((s) => s.de === 'e1')
    expect(saem.map((s) => [s.id, s.condition])).toEqual([['c1', 'c_c1'], ['c2', 'c_c2']])
  })
  it('posições: as que existem ficam, formas novas sem posição', () => {
    const d = blocosParaDesenho(fluxo([at('a1'), at('nova')]), { posicoes: { a1: { x: 5, y: 6 }, sumiu: { x: 1, y: 1 } }, raias: [] })
    expect(d.posicoes).toEqual({ a1: { x: 5, y: 6 } })
  })
  it('juntaId aparece como a forma que junta, com o mesmo id', () => {
    const d = blocosParaDesenho(fluxo([escolha('e1', [cam('c1', [at('a1')]), cam('c2', [at('a2')])], { juntaId: 'J1' }), at('a3')]))
    expect(d.formas.map((f) => f.id)).toContain('J1')
    expect(d.setas.some((s) => s.de === 'J1' && s.para === 'a3')).toBe(true)
  })
  it('etapa vinculada leva o vinculoDe e o nome', () => {
    const d = blocosParaDesenho(fluxo([at('a1', { nome: 'Analisar' }), at('a2', { vinculoDe: 'a1' })]))
    expect(d.formas.find((f) => f.id === 'a2')).toEqual({ id: 'a2', tipo: 'userTask', vinculoDe: 'a1' })
    expect(d.formas.find((f) => f.id === 'a1')?.nome).toBe('Analisar')
  })
})
