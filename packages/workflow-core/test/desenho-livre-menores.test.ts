import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { blocosParaDesenho, desenhoParaBlocos, semIdsReservados } from '../src/desenho-livre'
import { inserirItem, moverItem, removerItem, validarBlocos, type CaminhoCondicional, type FluxoBlocos, type ItemFluxo } from '../src/blocos'

/* Problemas menores da revisão final (30/10/2026), consertados em 31/10/2026. */

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const desenho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 =>
  ({ versao: 2, formas: [F('start', 'start'), ...formas, F('end', 'end')], setas, posicoes: {}, raias: [] })

const at = (id: string): ItemFluxo => ({ kind: 'atividade', id, tipo: 'userTask' })
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })
const cam = (id: string, itens: ItemFluxo[], fim: CaminhoCondicional['fim'] = { tipo: 'segue' }): CaminhoCondicional => ({ id, condition: `c_${id}`, itens, fim })
const escolha = (id: string, caminhos: CaminhoCondicional[]): ItemFluxo =>
  ({ kind: 'escolha', id, modo: 'primeiro', caminhos, casoContrario: { id: `${id}_cc`, itens: [], fim: { tipo: 'segue' } } }) as ItemFluxo

describe('losango de passagem antes de uma volta', () => {
  // T0 → L → T1 → G → [ok → Fim, volta → L]: L só junta a volta com o caminho de ida
  const d = desenho([F('T0'), F('L', 'exclusiveGateway'), F('T1'), F('G', 'exclusiveGateway', { modo: 'primeiro' })], [
    S('start', 'T0'), S('T0', 'L'), S('L', 'T1'), S('T1', 'G'), S('G', 'end', { condition: 'ok' }), S('G', 'L', { condition: 'volta' }),
  ])
  it('a volta para o losango vira volta para a etapa seguinte a ele', () => {
    const c = desenhoParaBlocos(d)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    expect(c.fluxo.itens.map((i) => i.id)).toEqual(['T0', 'T1', 'G'])
    const g = c.fluxo.itens[2]
    expect(g.kind === 'escolha' && g.caminhos.map((x) => x.fim)).toEqual([{ tipo: 'encerra' }, { tipo: 'volta', alvoId: 'T1' }])
  })
  it('com duas entradas o losango junta de verdade: sem o aviso de "uma entrada e uma saída"', () => {
    const c = desenhoParaBlocos(d)
    expect(c.ok && c.avisos).toEqual([])
  })
})

describe('escolha em que todos os caminhos encerram ou voltam, com etapas depois dela', () => {
  // o Roteiro deixa chegar aqui (último caminho passa a encerrar): é pendência, não desenho solto
  const f = fluxo([at('T0'), escolha('G', [cam('ok', [], { tipo: 'encerra' }), cam('volta', [], { tipo: 'volta', alvoId: 'T0' })]), at('T9')])
  it('o desenho converte nos mesmos blocos, e a pendência é "trecho-inalcancavel"', () => {
    const c = desenhoParaBlocos(blocosParaDesenho(f))
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    expect(c.fluxo.itens.map((i) => i.id)).toEqual(['T0', 'G', 'T9'])
    expect(validarBlocos(c.fluxo).map((p) => p.tipo)).toContain('trecho-inalcancavel')
  })
  it('sem nada depois (dentro de um caminho), o losango que junta não aparece solto', () => {
    const d = blocosParaDesenho(fluxo([escolha('G1', [cam('c1', [escolha('G2', [cam('x', [], { tipo: 'encerra' }), cam('y', [], { tipo: 'encerra' })])]), cam('c2', [at('b')])]), at('T')]))
    expect(d.formas.map((x) => x.id)).not.toContain('G2__fim')
  })
})

describe('ids que a ativação chamaria de "desenho corrompido" viram pendência no editor', () => {
  const escolhaCom = (s1: string, s2: string) => desenho([F('E', 'exclusiveGateway', { modo: 'primeiro' }), F('a1'), F('a2')], [
    S('start', 'E'), { id: s1, de: 'E', para: 'a1', condition: 'x' }, { id: s2, de: 'E', para: 'a2', condition: 'y' }, S('a1', 'end'), S('a2', 'end'),
  ])
  const problema = (d: DesenhoV2) => {
    const c = desenhoParaBlocos(d)
    if (c.ok) throw new Error('deveria recusar')
    return c.problemas[0]
  }
  it('duas setas com o mesmo id', () => {
    const p = problema(escolhaCom('c', 'c'))
    expect(p.tipo).toBe('id-invalido')
    expect(p.setas).toEqual(['c'])
  })
  it('seta de caminho com id terminando no sufixo do losango que junta', () => {
    const p = problema(escolhaCom('c1', 'x__fim'))
    expect(p.tipo).toBe('id-invalido')
    expect(p.setas).toEqual(['x__fim'])
  })
  it('setas repetidas fora de uma escolha também', () => {
    const p = problema(desenho([F('a1')], [{ id: 's', de: 'start', para: 'a1' }, { id: 's', de: 'a1', para: 'end' }]))
    expect(p.tipo).toBe('id-invalido')
    expect(p.setas).toEqual(['s'])
  })
})

describe('dois "Senão" no mesmo losango', () => {
  it('é pendência, com o losango e as setas culpadas (antes, o último vencia em silêncio)', () => {
    const c = desenhoParaBlocos(desenho([F('E', 'exclusiveGateway', { modo: 'primeiro' }), F('a1'), F('a2'), F('a3')], [
      S('start', 'E'), S('E', 'a1', { condition: 'x' }), S('E', 'a2', { padrao: true }), S('E', 'a3', { padrao: true }), S('a1', 'end'), S('a2', 'end'), S('a3', 'end'),
    ]))
    if (c.ok) throw new Error('deveria recusar')
    expect(c.problemas[0]).toEqual({
      tipo: 'senao-repetido', mensagem: 'Um losango tem 2 caminhos "Senão": só um deles seria usado. Apague os que sobram.',
      formas: ['E'], setas: ['s_E_a2', 's_E_a3'],
    })
  })
})

describe('losango sem efeito continua no desenho depois de uma ação do Roteiro', () => {
  const comT2 = (f: FluxoBlocos): FluxoBlocos => {
    const g = JSON.parse(JSON.stringify(f)) as FluxoBlocos
    g.itens.splice(g.itens.findIndex((i) => i.id === 'T1') + 1, 0, at('T2'))
    return g
  }
  const converter = (d: DesenhoV2) => {
    const c = desenhoParaBlocos(d)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    return c
  }
  it('o que junta com uma entrada e uma saída: fica no lugar, com o aviso de sempre', () => {
    const d = { ...desenho([F('T0'), F('L', 'exclusiveGateway', { junta: true }), F('T1')], [S('start', 'T0'), S('T0', 'L'), S('L', 'T1'), S('T1', 'end')]), posicoes: { L: { x: 5, y: 7 } } }
    const r = blocosParaDesenho(comT2(converter(d).fluxo), d)
    expect(r.formas.find((x) => x.id === 'L')).toEqual(F('L', 'exclusiveGateway', { junta: true }))
    expect(r.posicoes.L).toEqual({ x: 5, y: 7 })
    expect(r.setas.filter((s) => s.de === 'L' || s.para === 'L').map((s) => [s.de, s.para])).toEqual([['T0', 'L'], ['L', 'T1']])
    const c = converter(r)
    expect(c.fluxo.itens.map((i) => i.id)).toEqual(['T0', 'T1', 'T2'])
    expect(c.avisos.map((p) => p.formas)).toEqual([['L']])
  })
  it('o que junta a volta com o caminho de ida: a volta continua chegando nele', () => {
    const d = desenho([F('T0'), F('L', 'exclusiveGateway'), F('T1'), F('G', 'exclusiveGateway', { modo: 'primeiro' })], [
      S('start', 'T0'), S('T0', 'L'), S('L', 'T1'), S('T1', 'G'), S('G', 'end', { condition: 'ok' }), { id: 'volta', de: 'G', para: 'L', condition: 'volta' },
    ])
    const r = blocosParaDesenho(comT2(converter(d).fluxo), d)
    expect(r.setas.find((s) => s.id === 'volta')).toEqual({ id: 'volta', de: 'G', para: 'L', condition: 'volta' })
    expect(r.setas.find((s) => s.de === 'L')).toEqual(S('L', 'T1'))
    expect(converter(r).fluxo.itens.map((i) => i.id)).toEqual(['T0', 'T1', 'T2', 'G'])
  })
  it('a escolha de um caminho que o Roteiro apagou não volta', () => {
    const d = desenho([F('T0'), F('E', 'exclusiveGateway', { modo: 'primeiro' }), F('T1')], [S('start', 'T0'), S('T0', 'E'), S('E', 'T1', { condition: 'x' }), S('T1', 'end')])
    const r = blocosParaDesenho(fluxo([at('T0'), at('T1')]), d)
    expect(r.formas.map((x) => x.id)).not.toContain('E')
  })
})

describe('revisão: ação do Roteiro num desenho com losango de passagem dá os blocos do Roteiro', () => {
  // T0 → L → T1 → G[ok → Fim, volta → L]
  const d = desenho([F('T0'), F('L', 'exclusiveGateway'), F('T1'), F('G', 'exclusiveGateway', { modo: 'primeiro' })], [
    S('start', 'T0'), S('T0', 'L'), S('L', 'T1'), S('T1', 'G'), S('G', 'end', { condition: 'ok' }), { id: 'volta', de: 'G', para: 'L', condition: 'volta' },
  ])
  const c0 = desenhoParaBlocos(d)
  if (!c0.ok) throw new Error(c0.problemas[0].mensagem)
  const f0 = c0.fluxo
  const SUF = '__fim'
  const normalizar = (f: FluxoBlocos): unknown => JSON.parse(JSON.stringify(f, (_k, v) => {
    if (v && typeof v === 'object' && (v.kind === 'escolha' || v.kind === 'paralelo')) {
      const { juntaId, ...resto } = v
      const out = juntaId && juntaId !== v.id + SUF ? { ...resto, juntaId } : resto
      if (v.kind !== 'escolha') return out
      const cc = v.casoContrario
      return { ...out, modo: v.modo ?? 'primeiro', casoContrario: !cc.itens.length && cc.fim.tipo === 'segue' ? null : cc }
    }
    return v
  }))
  const mesmosBlocos = (f: FluxoBlocos) => {
    const r = blocosParaDesenho(f, d)
    const c = desenhoParaBlocos(r)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    expect(normalizar(c.fluxo)).toEqual(normalizar(f))
    return r
  }
  it('apagar T0: o losango fica, e o Início chega nele', () => {
    const r = mesmosBlocos(removerItem(f0, 'T0'))
    expect(r.setas.filter((s) => s.para === 'L').map((s) => s.de).sort()).toEqual(['G', 'start'])
  })
  it('inserir uma etapa entre T0 e T1', () => {
    const r = mesmosBlocos(inserirItem(f0, 'raiz', 1, at('N')))
    expect(r.setas.filter((s) => s.para === 'L').map((s) => s.de).sort()).toEqual(['G', 'N'])
  })
  it('mover T0 para o fim', () => { mesmosBlocos(moverItem(f0, 'T0', 'raiz', 3)) })
  it('apagar T1 (a etapa depois do losango): o losango sai junto', () => {
    const r = mesmosBlocos(removerItem(f0, 'T1'))
    expect(r.formas.map((x) => x.id)).not.toContain('L')
  })
})

describe('revisão: o losango que junta, gerado pelo Roteiro, passa a dividir', () => {
  // E (a: T1 segue; b: encerra) e depois T2: o Roteiro gera o losango que junta "E__fim";
  // a pessoa desenha uma segunda saída, com condição, dele
  const base = blocosParaDesenho(fluxo([escolha('E', [cam('a', [at('T1')]), cam('b', [], { tipo: 'encerra' })]), at('T2')]))
  const d: DesenhoV2 = {
    ...base, formas: [...base.formas, F('X')], posicoes: { E__fim: { x: 1, y: 2 } },
    setas: [...base.setas, { id: 'Seta_9', de: 'E__fim', para: 'X', condition: 'x' }, { id: 'Seta_10', de: 'X', para: 'end' }],
  }
  it('semIdsReservados troca o id dele (formas, setas e posição) e o desenho converte', () => {
    const r = semIdsReservados(d)
    expect(r.formas.map((x) => x.id)).not.toContain('E__fim')
    expect(r.formas.map((x) => x.id)).toContain('E_divide')
    expect(r.setas.filter((s) => s.de === 'E_divide').map((s) => s.para).sort()).toEqual(['T2', 'X'])
    expect(r.setas.find((s) => s.para === 'E_divide')?.de).toBe('T1')
    expect(r.posicoes).toEqual({ E_divide: { x: 1, y: 2 } })
    const c = desenhoParaBlocos(r)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    expect(semIdsReservados(r)).toBe(r) // estável: nada mais a trocar
  })
  it('o losango que só junta fica como está', () => { expect(semIdsReservados(base)).toBe(base) })
})

describe('revisão: blocos que a ativação não lê por outro motivo que não os ids', () => {
  it('frase genérica, sem falar em identificação', () => {
    // dado antigo: nome que não é texto
    const c = desenhoParaBlocos(desenho([F('a1', 'userTask', { nome: 5 as unknown as string })], [S('start', 'a1'), S('a1', 'end')]))
    if (c.ok) throw new Error('deveria recusar')
    expect(c.problemas[0]).toEqual({
      tipo: 'desenho-ilegivel', formas: [], setas: [],
      mensagem: 'O desenho tem dados que o motor não consegue ler (desenho corrompido). Desfaça a última mudança ou refaça as formas alteradas por último.',
    })
  })
})
