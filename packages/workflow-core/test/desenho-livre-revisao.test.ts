import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { atributosNoDesenho, blocosParaDesenho, desenhoParaBlocos } from '../src/desenho-livre'
import type { FluxoBlocos, ItemFluxo, CaminhoCondicional } from '../src/blocos'

/* Casos achados na revisão final (30/10/2026): configurações que o Roteiro já oferece e
   que a ida e volta blocos → desenho → blocos perdia ou recusava. */

const at = (id: string): ItemFluxo => ({ kind: 'atividade', id, tipo: 'userTask' })
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })
const cam = (id: string, itens: ItemFluxo[], fim: CaminhoCondicional['fim'] = { tipo: 'segue' }, condition = `c_${id}`): CaminhoCondicional =>
  ({ id, ...(condition ? { condition } : {}), itens, fim })
const escolha = (id: string, caminhos: CaminhoCondicional[], modo: 'primeiro' | 'todos' = 'primeiro'): ItemFluxo =>
  ({ kind: 'escolha', id, modo, caminhos, casoContrario: { id: `${id}_cc`, itens: [], fim: { tipo: 'segue' } } }) as ItemFluxo

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
const idaEVolta = (f: FluxoBlocos) => {
  const c = desenhoParaBlocos(blocosParaDesenho(f))
  if (!c.ok) throw new Error(c.problemas.map((p) => p.mensagem).join(' | '))
  expect(normalizar(c.fluxo)).toEqual(normalizar(f))
}

describe('revisão: ida e volta que se perdia', () => {
  it('escolha de UM caminho vazio ("todos"), como nasce pelo Roteiro', () =>
    idaEVolta(fluxo([at('a0'), escolha('E', [cam('c1', [], { tipo: 'segue' }, '')], 'todos'), at('a9')])))
  it('escolha de UM caminho com condição: a etapa continua condicional', () =>
    idaEVolta(fluxo([escolha('E', [cam('c1', [at('x')])]), at('a9')])))
  it('escolha de um caminho dentro do caminho de outra escolha', () =>
    idaEVolta(fluxo([escolha('G', [cam('g1', [escolha('E', [cam('c1', [at('x')])])]), cam('g2', [at('b')])]), at('a9')])))
  it('ao mesmo tempo de UM caminho', () =>
    idaEVolta(fluxo([{ kind: 'paralelo', id: 'P', caminhos: [{ id: 'C1', itens: [at('a')] }] } as ItemFluxo, at('a9')])))
  it('volta para uma etapa de dentro de uma escolha anterior', () => idaEVolta(fluxo([
    at('T0'), escolha('G1', [cam('c1', [at('a')]), cam('c2', [at('b')])]), at('T3'),
    escolha('G2', [cam('ok', [], { tipo: 'encerra' }), cam('back', [], { tipo: 'volta', alvoId: 'a' })]),
  ])))
  it('bloco aninhado em que todos os caminhos encerram', () => idaEVolta(fluxo([
    escolha('G1', [cam('c1', [escolha('G2', [cam('x', [at('x1')], { tipo: 'encerra' }), cam('y', [at('y1')], { tipo: 'encerra' })])]), cam('c2', [at('b')])]),
    at('T'),
  ])))
  it('ao mesmo tempo com o 1º caminho vazio: cada caminho mantém o seu id', () =>
    idaEVolta(fluxo([{ kind: 'paralelo', id: 'P', caminhos: [{ id: 'C1', itens: [] }, { id: 'C2', itens: [at('a')] }] } as ItemFluxo])))
})

describe('revisão: papel do losango de uma saída', () => {
  const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
  const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
  const desenho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 =>
    ({ versao: 2, formas: [F('start', 'start'), ...formas, F('end', 'end')], setas, posicoes: {}, raias: [] })
  it('blocosParaDesenho marca os losangos que juntam', () => {
    const d = blocosParaDesenho(fluxo([escolha('E', [cam('c1', [at('x')]), cam('c2', [at('y')])]), at('a9')]))
    expect(d.formas.find((f) => f.id === 'E')?.junta).toBeUndefined()
    expect(d.formas.find((f) => f.id === 'E__fim')?.junta).toBe(true)
  })
  it('losango que divide com uma saída só é uma escolha de um caminho', () => {
    const c = desenhoParaBlocos(desenho([F('a1'), F('L', 'exclusiveGateway'), F('a2')], [S('start', 'a1'), S('a1', 'L'), S('L', 'a2', { condition: 'x' }), S('a2', 'end')]))
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    expect(c.fluxo.itens.map((i) => i.kind)).toEqual(['atividade', 'escolha'])
  })
})

describe('revisão: atributosNoDesenho (painel do bloco não reescreve o desenho)', () => {
  const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
  const S = (id: string, de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id, de, para, ...extra })
  // desenho à mão: reencontro implícito numa etapa e setas com ids do editor
  const d: DesenhoV2 = {
    versao: 2, posicoes: {}, raias: [],
    formas: [F('start', 'start'), F('e1', 'exclusiveGateway', { modo: 'primeiro', pergunta: 'Ok?' }), F('a1'), F('a2'), F('a3'), F('end', 'end')],
    setas: [S('Seta_1', 'start', 'e1'), S('c1', 'e1', 'a1', { condition: 'x' }), S('c2', 'e1', 'a2', { condition: 'y' }), S('Seta_2', 'a1', 'a3'), S('Seta_3', 'a2', 'a3'), S('Seta_4', 'a3', 'end')],
  }
  const conv = desenhoParaBlocos(d)
  if (!conv.ok) throw new Error(conv.problemas[0].mensagem)
  const f = conv.fluxo
  const mudar = (fn: (e: Extract<ItemFluxo, { kind: 'escolha' }>) => void): FluxoBlocos => {
    const g = JSON.parse(JSON.stringify(f)) as FluxoBlocos
    fn(g.itens[0] as Extract<ItemFluxo, { kind: 'escolha' }>)
    return g
  }
  it('condição e rótulo do caminho vão para a seta; o resto do desenho fica igual', () => {
    const r = atributosNoDesenho(d, f, mudar((e) => { e.caminhos[0].condition = 'z'; e.caminhos[0].rotulo = 'Sim' }))
    expect(r?.setas.find((s) => s.id === 'c1')).toEqual(S('c1', 'e1', 'a1', { condition: 'z', rotulo: 'Sim' }))
    expect(r?.setas.map((s) => s.id)).toEqual(d.setas.map((s) => s.id))
    expect(r?.formas.map((x) => x.id)).toEqual(d.formas.map((x) => x.id))
  })
  it('pergunta e modo vão para o losango', () => {
    const r = atributosNoDesenho(d, f, mudar((e) => { e.pergunta = 'Aprovado?'; e.modo = 'todos' }))
    expect(r?.formas.find((x) => x.id === 'e1')).toMatchObject({ pergunta: 'Aprovado?', modo: 'todos' })
  })
  it('mudança de estrutura (um caminho a mais): null — quem chama refaz o desenho', () => {
    expect(atributosNoDesenho(d, f, mudar((e) => { e.caminhos.push({ id: 'c3', itens: [], fim: { tipo: 'segue' } }) }))).toBeNull()
  })
})
