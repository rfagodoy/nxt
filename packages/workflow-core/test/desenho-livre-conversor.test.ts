import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { blocosParaDesenho, desenhoParaBlocos } from '../src/desenho-livre'
import type { FluxoBlocos, ItemFluxo, CaminhoCondicional } from '../src/blocos'

/* ── blocos ── */
const at = (id: string, extra: Record<string, unknown> = {}): ItemFluxo => ({ kind: 'atividade', id, tipo: 'userTask', ...extra }) as ItemFluxo
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })
const cam = (id: string, itens: ItemFluxo[], fim: CaminhoCondicional['fim'] = { tipo: 'segue' }): CaminhoCondicional =>
  ({ id, condition: `c_${id}`, itens, fim })
const escolha = (id: string, caminhos: CaminhoCondicional[], extra: Record<string, unknown> = {}): ItemFluxo =>
  ({ kind: 'escolha', id, modo: 'primeiro', caminhos, casoContrario: { id: `${id}_cc`, itens: [], fim: { tipo: 'segue' } }, ...extra }) as ItemFluxo

/* ── desenho à mão ── */
const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const desenho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 =>
  ({ versao: 2, formas: [F('start', 'start'), ...formas, F('end', 'end')], setas, posicoes: {}, raias: [] })
const blocos = (d: DesenhoV2): FluxoBlocos => {
  const c = desenhoParaBlocos(d)
  if (!c.ok) throw new Error(c.problemas.map((p) => p.mensagem).join(' | '))
  return c.fluxo
}

describe('desenhoParaBlocos — o que aceita', () => {
  it('sequência', () => {
    const f = blocos(desenho([F('a1'), F('a2')], [S('start', 'a1'), S('a1', 'a2'), S('a2', 'end')]))
    expect(f.itens.map((i) => i.id)).toEqual(['a1', 'a2'])
  })
  it('escolha com losango que junta: caminhos com id e condição das setas; juntaId', () => {
    const f = blocos(desenho(
      [F('a0'), F('e1', 'exclusiveGateway', { pergunta: 'Aprovado?' }), F('a1'), F('a2'), F('J', 'exclusiveGateway'), F('a3')],
      [S('start', 'a0'), S('a0', 'e1'), S('e1', 'a1', { id: 'sim', condition: 'x' }), S('e1', 'a2', { id: 'nao', condition: 'y' }),
        S('a1', 'J'), S('a2', 'J'), S('J', 'a3'), S('a3', 'end')],
    ))
    const e = f.itens[1]
    if (e.kind !== 'escolha') throw new Error('escolha')
    expect(e.pergunta).toBe('Aprovado?')
    expect(e.juntaId).toBe('J')
    expect(e.caminhos.map((c) => [c.id, c.condition, c.itens.map((i) => i.id)])).toEqual([['sim', 'x', ['a1']], ['nao', 'y', ['a2']]])
    expect(f.itens[2].id).toBe('a3')
  })
  it('caminhos que se encontram direto numa etapa (reencontro implícito)', () => {
    const f = blocos(desenho([F('e1', 'exclusiveGateway'), F('a1'), F('a2'), F('a3')], [
      S('start', 'e1'), S('e1', 'a1', { condition: 'x' }), S('e1', 'a2', { condition: 'y' }), S('a1', 'a3'), S('a2', 'a3'), S('a3', 'end'),
    ]))
    expect(f.itens.map((i) => i.id)).toEqual(['e1', 'a3'])
    const e = f.itens[0]
    if (e.kind === 'escolha') expect(e.juntaId).toBeUndefined()
  })
  it('caminho que termina no Fim = encerra', () => {
    const f = blocos(desenho([F('e1', 'exclusiveGateway'), F('a1'), F('J', 'exclusiveGateway'), F('a2')], [
      S('start', 'e1'), S('e1', 'a1', { condition: 'x' }), S('e1', 'end', { id: 'fim', condition: 'y' }), S('a1', 'J'), S('J', 'a2'), S('a2', 'end'),
    ]))
    const e = f.itens[0]
    if (e.kind !== 'escolha') throw new Error('escolha')
    expect(e.caminhos[1]).toMatchObject({ id: 'fim', itens: [], fim: { tipo: 'encerra' } })
    expect(f.itens[1].id).toBe('a2')
  })
  it('volta saindo da última etapa do caminho', () => {
    const f = blocos(desenho([F('a1'), F('e1', 'exclusiveGateway'), F('a2'), F('J', 'exclusiveGateway'), F('a3')], [
      S('start', 'a1'), S('a1', 'e1'), S('e1', 'a2', { condition: 'x' }), S('a2', 'a1'), S('e1', 'J', { condition: 'y' }), S('J', 'a3'), S('a3', 'end'),
    ]))
    const e = f.itens[1]
    if (e.kind !== 'escolha') throw new Error('escolha')
    expect(e.caminhos[0]).toMatchObject({ itens: [{ id: 'a2' }], fim: { tipo: 'volta', alvoId: 'a1' } })
  })
  it('volta saindo do próprio losango (caminho vazio)', () => {
    const f = blocos(desenho([F('a1'), F('e1', 'exclusiveGateway'), F('J', 'exclusiveGateway')], [
      S('start', 'a1'), S('a1', 'e1'), S('e1', 'a1', { condition: 'x' }), S('e1', 'J', { condition: 'y' }), S('J', 'end'),
    ]))
    const e = f.itens[1]
    if (e.kind !== 'escolha') throw new Error('escolha')
    expect(e.caminhos[0]).toMatchObject({ itens: [], fim: { tipo: 'volta', alvoId: 'a1' } })
  })
  it('ao mesmo tempo com losango + que junta', () => {
    const f = blocos(desenho([F('p1', 'parallelGateway'), F('a1'), F('a2'), F('P', 'parallelGateway')], [
      S('start', 'p1'), S('p1', 'a1', { id: 'r1' }), S('p1', 'a2', { id: 'r2' }), S('a1', 'P'), S('a2', 'P'), S('P', 'end'),
    ]))
    const p = f.itens[0]
    if (p.kind !== 'paralelo') throw new Error('paralelo')
    expect(p.juntaId).toBe('P')
    expect(p.caminhos.map((c) => [c.id, c.itens.map((i) => i.id)])).toEqual([['r1', ['a1']], ['r2', ['a2']]])
  })
  it('losango que junta com uma entrada e uma saída (fora de bloco): ignorado, com aviso', () => {
    const c = desenhoParaBlocos(desenho([F('a1'), F('L', 'exclusiveGateway', { junta: true }), F('a2')], [S('start', 'a1'), S('a1', 'L'), S('L', 'a2'), S('a2', 'end')]))
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(c.fluxo.itens.map((i) => i.id)).toEqual(['a1', 'a2'])
    expect(c.avisos.map((a) => a.tipo)).toEqual(['losango-sem-efeito'])
  })
})

/* ── ida e volta: blocos → desenho → blocos ── */
const SUF = '__fim'
const normalizar = (f: FluxoBlocos): unknown => JSON.parse(JSON.stringify(f, (_k, v) => {
  if (v && typeof v === 'object' && (v.kind === 'escolha' || v.kind === 'paralelo')) {
    const { juntaId, ...resto } = v
    const out = juntaId && juntaId !== v.id + SUF ? { ...resto, juntaId } : resto
    if (v.kind === 'escolha') {
      const cc = v.casoContrario
      const vazio = !cc.itens.length && cc.fim.tipo === 'segue'
      return { ...out, modo: v.modo ?? 'primeiro', casoContrario: vazio ? { itens: [], fim: { tipo: 'segue' } } : cc }
    }
    return out
  }
  return v
}))
const idaEVolta = (f: FluxoBlocos) => expect(normalizar(blocos(blocosParaDesenho(f)))).toEqual(normalizar(f))

describe('desenhoParaBlocos — ida e volta', () => {
  it('escolha "primeiro" com 3 caminhos (um vazio) e etapa depois', () =>
    idaEVolta(fluxo([escolha('e1', [cam('c1', [at('a1')]), cam('c2', [at('a2'), at('a3')]), cam('c3', [])]), at('a4')])))
  it('escolha "todos"', () => idaEVolta(fluxo([at('a0'), escolha('e1', [cam('c1', [at('a1')]), cam('c2', [at('a2')])], { modo: 'todos' })])))
  it('Senão antigo', () => idaEVolta(fluxo([{
    kind: 'escolha', id: 'e1', modo: 'primeiro', caminhos: [cam('c1', [at('a1')])],
    casoContrario: { id: 'senao', itens: [at('a2')], fim: { tipo: 'segue' } },
  } as ItemFluxo, at('a3')])))
  it('etapa vinculada', () => idaEVolta(fluxo([at('a1', { nome: 'Analisar' }), at('a2', { vinculoDe: 'a1' })])))
  it('volta e encerra', () => idaEVolta(fluxo([
    at('a1'), escolha('e1', [cam('c1', [at('a2')], { tipo: 'volta', alvoId: 'a1' }), cam('c2', [], { tipo: 'encerra' }), cam('c3', [at('a3')])]), at('a4'),
  ])))
  it('réplica do "Solicitação de contratos": paralelo com etapa e escolha "todos"', () => idaEVolta(fluxo([
    at('a1'),
    { kind: 'paralelo', id: 'p1', nome: 'Pareceres do RH e Patrimônio', caminhos: [
      { id: 'r1', itens: [at('a2')] },
      { id: 'r2', itens: [escolha('e1', [cam('c1', [at('a3'), at('a4')]), cam('c2', [at('a5')]), cam('c3', [])], { modo: 'todos', pergunta: 'Pareceres necessários' })] },
    ] } as ItemFluxo,
    at('a6'),
  ])))
})
