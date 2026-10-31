import { describe, it, expect } from 'vitest'
import type { GrafoGerado } from '@nxt/workflow-core'
import type { DesenhoBpmn } from '@nxt/types'
import { nodeSize } from './flow-layout'
import {
  GRADE, RAIA_ALTURA_PADRAO, RAIA_ALTURA_MINIMA, RAIA_ALTURA_MAXIMA, desenhoInicial, organizar, completarPosicoes, raiaNaAltura, avisoDeRaia, setaSobPonto, polilinhaDaSeta,
  adicionarRaia, renomearRaia, redimensionarRaia, moverRaia, removerRaia, abrirEspaco, larguraDaInsercao, formasDoItem, posicoesAoMover,
} from './desenho-bpmn'

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
  it('decide a raia pelo CENTRO da forma (como o canvas), não pelo topo', () => {
    const g = cadeia('A', 'B')
    const r = (id: string) => ({ A: 'RH', B: 'Contas' })[id]
    const base = desenhoInicial(g, r)
    const hA = nodeSize({ id: 'A', type: 'userTask' }, 0, 0).h
    // topo ainda na raia 0, centro já na raia 1
    const y = base.raias[0].altura - hA / 2 + 4
    const o = organizar(g, { ...base, posicoes: { ...base.posicoes, A: { x: 500, y } } }, r)
    expect(raiaNaAltura(o.raias, o.posicoes.A.y + hA / 2)).toBe(1)
  })
  it('duas raias com o MESMO nome continuam separadas', () => {
    const g = cadeia('A', 'B')
    const d: DesenhoBpmn = {
      versao: 1,
      raias: [{ id: 'r1', nome: 'RH', altura: 160 }, { id: 'r2', nome: 'RH', altura: 160 }],
      posicoes: { start: { x: 0, y: 40 }, A: { x: 100, y: 40 }, B: { x: 300, y: 200 }, end: { x: 500, y: 200 } },
    }
    const o = organizar(g, d, () => 'RH')
    const h = (id: string) => nodeSize({ id, type: id === 'start' || id === 'end' ? id : 'userTask' }, 0, 0).h
    expect(raiaNaAltura(o.raias, o.posicoes.A.y + h('A') / 2)).toBe(0)
    expect(raiaNaAltura(o.raias, o.posicoes.B.y + h('B') / 2)).toBe(1)
    expect(o.raias.map((x) => x.id)).toEqual(['r1', 'r2'])
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

describe('edição das raias', () => {
  const base = (): DesenhoBpmn => ({
    versao: 1,
    posicoes: { A: { x: 32, y: 48 }, B: { x: 240, y: 176 } },
    raias: [{ id: 'r1', nome: 'RH', altura: 140 }, { id: 'r2', nome: 'Contas', altura: 160 }],
  })

  it('adicionarRaia acrescenta "Nova raia" no fim, com id novo e altura padrão', () => {
    const d = adicionarRaia(base())
    expect(d.raias).toHaveLength(3)
    const nova = d.raias[2]
    expect(nova).toMatchObject({ nome: 'Nova raia', altura: RAIA_ALTURA_PADRAO })
    expect(['r1', 'r2']).not.toContain(nova.id)
    expect(nova.id).toMatch(/^raia_/)
    expect(d.posicoes).toEqual(base().posicoes)
    const outra = adicionarRaia(d)
    expect(new Set(outra.raias.map((r) => r.id)).size).toBe(4)
  })

  it('adicionarRaia nunca repete um id que já existe', () => {
    const d = adicionarRaia(base(), () => 'r1')
    expect(new Set(d.raias.map((r) => r.id)).size).toBe(3)
  })

  it('renomearRaia troca só o nome (sem espaços nas pontas)', () => {
    const d = renomearRaia(base(), 'r2', '  Financeiro ')
    expect(d.raias.map((r) => r.nome)).toEqual(['RH', 'Financeiro'])
    expect(d.raias[1].altura).toBe(160)
  })

  it('renomearRaia com o mesmo nome ou id desconhecido devolve o mesmo desenho', () => {
    const b = base()
    expect(renomearRaia(b, 'r1', 'RH')).toBe(b)
    expect(renomearRaia(b, 'x', 'Y')).toBe(b)
  })

  it('renomearRaia com nome em branco é cancelar: devolve o mesmo desenho', () => {
    const b = base()
    expect(renomearRaia(b, 'r1', '')).toBe(b)
    expect(renomearRaia(b, 'r1', '   ')).toBe(b)
  })

  it('redimensionarRaia prende ao mínimo e à grade', () => {
    const b = base()
    expect(redimensionarRaia(b, 'r1', 10).raias[0].altura).toBe(RAIA_ALTURA_MINIMA)
    expect(RAIA_ALTURA_MINIMA).toBe(64)
    expect(RAIA_ALTURA_PADRAO).toBe(144)
    expect(RAIA_ALTURA_MINIMA % GRADE).toBe(0)
    expect(RAIA_ALTURA_PADRAO % GRADE).toBe(0)
    expect(redimensionarRaia(b, 'r1', 99999).raias[0].altura).toBe(RAIA_ALTURA_MAXIMA)
    expect(RAIA_ALTURA_MAXIMA % GRADE).toBe(0)
    expect(redimensionarRaia(b, 'r1', 203).raias[0].altura).toBe(208)
    expect(redimensionarRaia(b, 'r1', 203).raias[0].altura % GRADE).toBe(0)
    expect(redimensionarRaia(b, 'r2', 160)).toBe(b)
    expect(redimensionarRaia(b, 'r1', 140).raias[0].altura).toBe(144)
  })

  it('redimensionarRaia leva junto as formas das raias de baixo (pelo centro); as da própria raia ficam', () => {
    // A centro 48+20=68 (r1: 0–140); B centro 176+20=196 (r2: 140–300); C centro 310 (abaixo de tudo)
    const b: DesenhoBpmn = { ...base(), posicoes: { ...base().posicoes, C: { x: 0, y: 290 } } }
    const h = () => 40
    const d = redimensionarRaia(b, 'r1', 208, h) // +68
    expect(d.posicoes.A).toEqual(b.posicoes.A)
    expect(d.posicoes.B).toEqual({ x: 240, y: 176 + 68 })
    expect(d.posicoes.C).toEqual({ x: 0, y: 290 + 68 })
    // encolher puxa para cima
    expect(redimensionarRaia(b, 'r1', 96, h).posicoes.B.y).toBe(176 - 44)
    // a forma que COMEÇA na raia de cima mas tem o centro na de baixo é da de baixo
    const cruza: DesenhoBpmn = { ...base(), posicoes: { X: { x: 0, y: 130 } } }
    expect(redimensionarRaia(cruza, 'r1', 208, h).posicoes.X.y).toBe(130 + 68)
  })

  it('moverRaia leva as formas das duas raias trocadas (pelo centro); as outras ficam', () => {
    const b: DesenhoBpmn = { ...base(), posicoes: { ...base().posicoes, C: { x: 0, y: 400 } } }
    const d = moverRaia(b, 'r1', 1, () => 40)
    expect(d.raias.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(d.posicoes.A).toEqual({ x: 32, y: 48 + 160 }) // r1 desce a altura de r2
    expect(d.posicoes.B).toEqual({ x: 240, y: 176 - 140 }) // r2 sobe a altura de r1
    expect(d.posicoes.C).toEqual(b.posicoes.C)
  })

  it('removerRaia sobe as formas das raias de baixo pela altura dela; as de dentro ficam', () => {
    const d = removerRaia(base(), 'r1', () => 40)
    expect(d.posicoes.A).toEqual(base().posicoes.A)
    expect(d.posicoes.B).toEqual({ x: 240, y: 176 - 140 })
  })

  it('moverRaia troca a ordem com a vizinha; nas pontas não faz nada', () => {
    const b = base()
    expect(moverRaia(b, 'r2', -1).raias.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(moverRaia(b, 'r1', 1).raias.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(moverRaia(b, 'r1', -1)).toBe(b)
    expect(moverRaia(b, 'r2', 1)).toBe(b)
  })

  it('removerRaia tira a raia; id desconhecido devolve o mesmo desenho', () => {
    const b = base()
    expect(removerRaia(b, 'r1').raias.map((r) => r.id)).toEqual(['r2'])
    expect(removerRaia(b, 'x')).toBe(b)
  })
})

describe('abrirEspaco', () => {
  const d: DesenhoBpmn = { versao: 1, raias: [], posicoes: { start: { x: 0, y: 32 }, A: { x: 96, y: 16 }, end: { x: 320, y: 32 }, B: { x: 320, y: 200 } } }
  it('empurra para a direita, pela largura na grade, tudo que começa em x ≥ o limite; o y fica', () => {
    const r = abrirEspaco(d, 300, 250)
    expect(r.posicoes.end).toEqual({ x: 320 + 256, y: 32 })
    expect(r.posicoes.B).toEqual({ x: 320 + 256, y: 200 })
    expect(r.posicoes.A).toEqual(d.posicoes.A)
    expect(r.posicoes.start).toEqual(d.posicoes.start)
  })
  it('não mexe nas raias nem no desenho original', () => {
    const comRaia: DesenhoBpmn = { ...d, raias: [{ id: 'r', nome: 'RH', altura: 144 }] }
    const r = abrirEspaco(comRaia, 0, 32)
    expect(r.raias).toBe(comRaia.raias)
    expect(comRaia.posicoes.A).toEqual({ x: 96, y: 16 })
  })
  it('largura zero ou negativa devolve o mesmo desenho', () => {
    expect(abrirEspaco(d, 0, 0)).toBe(d)
    expect(abrirEspaco(d, 0, -10)).toBe(d)
  })
  it('poupa os ids pedidos (a forma nova já posicionada)', () => {
    const r = abrirEspaco(d, 300, 64, new Set(['B']))
    expect(r.posicoes.B).toEqual(d.posicoes.B)
    expect(r.posicoes.end.x).toBe(384)
  })
})

describe('larguraDaInsercao', () => {
  it('tarefa: a caixa dela mais a folga; bloco: divisão, reencontro e folga, sempre na grade', () => {
    const tarefa = nodeSize({ id: 'x', type: 'userTask' }, 0, 0).w
    expect(larguraDaInsercao('userTask')).toBe(Math.ceil((tarefa + 3 * GRADE) / GRADE) * GRADE)
    expect(larguraDaInsercao('escolha') % GRADE).toBe(0)
    expect(larguraDaInsercao('escolha')).toBeGreaterThanOrEqual(200 + 56 + 3 * GRADE)
    expect(larguraDaInsercao('paralelo')).toBe(larguraDaInsercao('escolha'))
  })
})

describe('formasDoItem', () => {
  it('atividade: só ela', () => {
    expect(formasDoItem({ kind: 'atividade', id: 'a1', tipo: 'userTask' })).toEqual(['a1'])
  })
  it('escolha: ela, o reencontro e o que mora nos caminhos', () => {
    const ids = formasDoItem({
      kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', itens: [{ kind: 'atividade', id: 'a2', tipo: 'userTask' }], fim: { tipo: 'segue' } }],
      casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } },
    })
    expect(new Set(ids)).toEqual(new Set(['e1', 'e1__fim', 'a2']))
  })
})

describe('posicoesAoMover', () => {
  const d: DesenhoBpmn = { versao: 1, raias: [], posicoes: { a1: { x: 0, y: 0 }, a2: { x: 100, y: 0 }, e1: { x: 200, y: 0 }, e1__fim: { x: 300, y: 0 } } }
  it('tira só as posições dos itens movidos (e do reencontro deles)', () => {
    expect(Object.keys(posicoesAoMover(d, ['e1']).posicoes).sort()).toEqual(['a1', 'a2'])
  })
  it('as outras posições ficam iguais', () => {
    expect(posicoesAoMover(d, ['a2']).posicoes.a1).toEqual({ x: 0, y: 0 })
  })
  it('sem ids, devolve igual', () => {
    expect(posicoesAoMover(d, []).posicoes).toEqual(d.posicoes)
  })
})
