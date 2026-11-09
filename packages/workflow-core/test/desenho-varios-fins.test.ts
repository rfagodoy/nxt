import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { atributosNoDesenho, blocosParaDesenho, desenhoParaBlocos, type ProblemaDoDesenho } from '../src/desenho-livre'
import {
  adicionarCaminho, atualizarCaminho, blocosParaGrafo, grafoParaMotor, inserirItem, removerCaminho, removerItem, validarBlocos,
  type FluxoBlocos,
} from '../src/blocos'
import { compileBpmn } from '../src/compile'
import { generateBpmn } from '../src/generate'
import { completeToken, makeCounterRuntime, startProcess } from '../src/interpreter'
import { assinaturaDoQueExecuta } from '../src/o-que-executa'
import type { WfGraph } from '../src/types'

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
/** Início, as formas, o Fim `end` e, depois dele, os outros Fins passados em `formas`. */
const desenho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 => ({
  versao: 2,
  formas: [F('start', 'start'), ...formas.filter((f) => f.tipo !== 'end'), F('end', 'end'), ...formas.filter((f) => f.tipo === 'end')],
  setas, posicoes: {}, raias: [],
})
const fluxoDe = (d: DesenhoV2): FluxoBlocos => {
  const c = desenhoParaBlocos(d)
  if (!c.ok) throw new Error(c.problemas[0].mensagem)
  return c.fluxo
}
const problemas = (d: DesenhoV2): ProblemaDoDesenho[] => {
  const c = desenhoParaBlocos(d)
  if (c.ok) throw new Error('deveria recusar')
  return c.problemas
}
const para = (d: DesenhoV2, de: string) => d.setas.filter((s) => s.de === de).map((s) => s.para)

const COND = { x: 'valor > 100', y: 'valor <= 100' }
const comUmFimPorCaminho = (): DesenhoV2 => desenho([F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('end2', 'end')], [
  S('start', 'e'), S('e', 'a1', { condition: COND.x }), S('e', 'a2', { condition: COND.y }), S('a1', 'end'), S('a2', 'end2'),
])
/** Depois de uma tarefa, para a condição ler o que ela grava. */
const escolhaDiretoAosFins = (segunda: Partial<SetaDesenho>): DesenhoV2 => desenho([F('a0'), F('e', 'exclusiveGateway'), F('end2', 'end')], [
  S('start', 'a0'), S('a0', 'e'), S('e', 'end', { condition: COND.x }), S('e', 'end2', segunda),
])
/** Roda do início até o fim, com a variável `valor` gravada pela tarefa a0. */
const rodar = (g: WfGraph, valor: number) => {
  const inicio = startProcess(g, {}, makeCounterRuntime()).state
  expect(inicio.tokens.map((t) => t.nodeId)).toEqual(['a0'])
  return completeToken(g, inicio, inicio.tokens[0].id, { valor }, makeCounterRuntime('c')).state
}

describe('desenhoParaBlocos — vários Fins', () => {
  it('Escolha com um Fim por caminho converte, com fimId no primeiro Fim', () => {
    const f = fluxoDe(desenho([F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('end2', 'end')], [
      S('start', 'e'), S('e', 'a1', { condition: 'x' }), S('e', 'a2', { padrao: true }), S('a1', 'end'), S('a2', 'end2'),
    ]))
    expect(f.fimId).toBe('end')
    const escolha = f.itens[0]
    if (escolha.kind !== 'escolha') throw new Error('deveria ser escolha')
    expect(escolha.caminhos[0].fim).toEqual({ tipo: 'encerra' })
    expect(escolha.casoContrario.fim).toEqual({ tipo: 'encerra' })
  })
  it('o fimId é o primeiro Fim na ordem das formas, seja qual for o id', () => {
    const d = comUmFimPorCaminho()
    expect(fluxoDe({ ...d, formas: [...d.formas].reverse() }).fimId).toBe('end2')
  })

  it('Escolha ligada direto a dois Fins converte e conclui por qualquer caminho', () => {
    const f = fluxoDe(escolhaDiretoAosFins({ padrao: true }))
    const g = grafoParaMotor(blocosParaGrafo(f))
    expect(g.edges.filter((e) => e.from === 'e').map((e) => e.to)).toEqual(['end', 'end'])
    for (const valor of [500, 5]) {
      const s = rodar(g, valor)
      expect(s.status).toBe('completed')
      expect(s.reachedEnd).toBe(true)
    }
  })
  it('Escolha direto a dois Fins, os dois com condição: sem pendência, e conclui também pelo BPMN gravado', () => {
    const f = fluxoDe(escolhaDiretoAosFins({ condition: COND.y }))
    expect(validarBlocos(f)).toEqual([])
    const grafo = grafoParaMotor(blocosParaGrafo(f))
    const g = compileBpmn(generateBpmn(grafo))
    expect(g.edges.filter((e) => e.from === 'e').map((e) => [e.id, e.to, e.condition])).toEqual([
      ['f_e__end', 'end', COND.x], ['f_e__end_2', 'end', COND.y],
    ])
    for (const gr of [grafo, g]) {
      expect(rodar(gr, 500).status).toBe('completed')
      expect(rodar(gr, 5).status).toBe('completed')
    }
  })

  it('três Fins convertem', () => {
    const f = fluxoDe(desenho([F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('a3'), F('end2', 'end'), F('end3', 'end')], [
      S('start', 'e'), S('e', 'a1', { condition: 'x' }), S('e', 'a2', { condition: 'y' }), S('e', 'a3', { condition: 'z' }),
      S('a1', 'end'), S('a2', 'end2'), S('a3', 'end3'),
    ]))
    expect(f.fimId).toBe('end')
    const g = blocosParaGrafo(f)
    expect(g.nodes.filter((n) => n.type === 'end').map((n) => n.id)).toEqual(['end'])
    expect(g.edges.filter((e) => e.to === 'end').map((e) => e.from)).toEqual(['a1', 'a2', 'a3'])
  })
  it('três Fins concluem pelo interpretador, por cada caminho', () => {
    const f = fluxoDe(desenho([F('a0'), F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('a3'), F('end2', 'end'), F('end3', 'end')], [
      S('start', 'a0'), S('a0', 'e'), S('e', 'a1', { condition: 'valor > 100' }), S('e', 'a2', { condition: 'valor > 10' }), S('e', 'a3', { condition: 'valor <= 10' }),
      S('a1', 'end'), S('a2', 'end2'), S('a3', 'end3'),
    ]))
    expect(validarBlocos(f)).toEqual([])
    const g = grafoParaMotor(blocosParaGrafo(f))
    for (const [valor, tarefa] of [[500, 'a1'], [50, 'a2'], [5, 'a3']] as const) {
      const s = rodar(g, valor)
      expect(s.tokens.map((t) => t.nodeId)).toEqual([tarefa])
      const fim = completeToken(g, s, s.tokens[0].id, {}, makeCounterRuntime('d')).state
      expect(fim.status).toBe('completed')
      expect(fim.reachedEnd).toBe(true)
    }
  })

  it('um Fim gera exatamente os mesmos blocos de antes', () => {
    const f = fluxoDe(desenho([F('e', 'exclusiveGateway', { pergunta: 'Valor?' }), F('a1', 'userTask', { nome: 'Analisar' }), F('a2', 'serviceTask')], [
      S('start', 'e'), S('e', 'a1', { condition: 'x', rotulo: 'Alto' }), S('e', 'end', { condition: 'y' }), S('a1', 'a2'), S('a2', 'end'),
    ]))
    expect(f).toEqual({
      versao: 1, inicioId: 'start', fimId: 'end',
      itens: [{
        kind: 'escolha', id: 'e', modo: 'primeiro', pergunta: 'Valor?',
        caminhos: [
          { id: 's_e_a1', rotulo: 'Alto', condition: 'x', itens: [{ kind: 'atividade', id: 'a1', tipo: 'userTask', nome: 'Analisar' }, { kind: 'atividade', id: 'a2', tipo: 'serviceTask' }], fim: { tipo: 'encerra' } },
          { id: 's_e_end', condition: 'y', itens: [], fim: { tipo: 'encerra' } },
        ],
        casoContrario: { id: 'e_senao', itens: [], fim: { tipo: 'segue' } },
      }],
    })
  })

  it('ramos de Ao mesmo tempo podem ir direto ao Fim, ao mesmo ou a Fins diferentes (PO, 08/11/2026)', () => {
    const formas = [F('p', 'parallelGateway'), F('a1'), F('a2')]
    const umFim = fluxoDe(desenho(formas, [S('start', 'p'), S('p', 'a1'), S('p', 'a2'), S('a1', 'end'), S('a2', 'end')]))
    const doisFins = fluxoDe(desenho([...formas, F('end2', 'end')], [S('start', 'p'), S('p', 'a1'), S('p', 'a2'), S('a1', 'end'), S('a2', 'end2')]))
    expect(doisFins).toEqual(umFim)
    expect(umFim.itens[0]).toMatchObject({ kind: 'paralelo', caminhos: [{ fim: { tipo: 'encerra' } }, { fim: { tipo: 'encerra' } }] })
  })

  it('Fim sem seta, com mais de um Fim, vira pendência com a frase e a forma', () => {
    const [p] = problemas(desenho([F('a1'), F('end2', 'end', { nome: 'Recusado' })], [S('start', 'a1'), S('a1', 'end')]))
    expect(p).toEqual({ tipo: 'fim-sem-seta', mensagem: 'O Fim "Recusado" não recebe nenhuma seta. Ligue um caminho a ele ou apague-o.', formas: ['end2'], setas: [] })
  })
  it('Fim sem nome e sem seta aparece como "Fim" na frase', () => {
    const [p] = problemas(desenho([F('a1'), F('end2', 'end')], [S('start', 'a1'), S('a1', 'end')]))
    expect(p.mensagem).toBe('O Fim "Fim" não recebe nenhuma seta. Ligue um caminho a ele ou apague-o.')
  })
  it('todos os Fins sem seta aparecem numa só resposta', () => {
    const ps = problemas(desenho([F('a1'), F('end2', 'end', { nome: 'B' }), F('end3', 'end', { nome: 'C' })], [S('start', 'a1'), S('a1', 'end')]))
    expect(ps.map((p) => [p.tipo, p.formas])).toEqual([['fim-sem-seta', ['end2']], ['fim-sem-seta', ['end3']]])
  })
  it('com um Fim só, sem seta, a recusa continua a de sempre', () => {
    expect(problemas(desenho([F('a1')], [S('start', 'a1')]))[0].tipo).toBe('sem-saida')
  })
  it('dois Inícios continuam recusados', () => {
    const ps = problemas(desenho([F('start2', 'start'), F('a1'), F('end2', 'end')], [S('start', 'a1'), S('a1', 'end'), S('start2', 'end2')]))
    expect(ps.map((p) => p.mensagem)).toEqual(['O desenho tem 2 Inícios. O workflow começa por um Início só: apague os outros.'])
  })

  it('Fim com variante removida continua recusado pela frase de não executa', () => {
    const [p] = problemas(desenho([F('a1'), F('end2', 'end', { variante: 'erro', nome: 'Falhou' })], [S('start', 'a1'), S('a1', 'end'), S('a1', 'end2')]))
    expect(p.tipo).toBe('ainda-nao-executa')
    expect(p.mensagem).toBe('"Falhou" é um fim com erro, que não executa. Troque por outro elemento ou deixe o workflow em rascunho.')
  })
})

describe('atributosNoDesenho — vários Fins', () => {
  it('atributosNoDesenho numa Escolha com dois Fins mantém formas e setas', () => {
    const d = escolhaDiretoAosFins({ condition: COND.y })
    const antes = fluxoDe(d)
    const novo = atributosNoDesenho(d, antes, atualizarCaminho(antes, 's_e_end2', { condition: 'valor == 1' }))
    expect(novo).not.toBeNull()
    expect(novo!.formas.map((f) => [f.id, f.tipo])).toEqual(d.formas.map((f) => [f.id, f.tipo]))
    expect(novo!.setas.map((s) => [s.id, s.de, s.para])).toEqual(d.setas.map((s) => [s.id, s.de, s.para]))
    expect(novo!.setas.find((s) => s.id === 's_e_end2')?.condition).toBe('valor == 1')
  })
})

describe('blocosParaDesenho — vários Fins', () => {
  it('blocosParaDesenho depois de ação estrutural devolve as setas aos Fins de antes', () => {
    // a0 sai da Escolha: a seta de a1 (mesma origem) continua indo a end2
    const d = desenho([F('e', 'exclusiveGateway'), F('a0'), F('a1'), F('a2'), F('end2', 'end')], [
      S('start', 'e'), S('e', 'a0', { condition: 'x' }), S('e', 'a2', { condition: 'y' }), S('a0', 'a1'), S('a1', 'end2'), S('a2', 'end'),
    ])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'a0'), d)
    expect(para(r, 'a1')).toEqual(['end2'])
    expect(para(r, 'a2')).toEqual(['end'])
    expect(r.formas.filter((f) => f.tipo === 'end').map((f) => f.id)).toEqual(['end', 'end2'])
    expect(desenhoParaBlocos(r).ok).toBe(true)
  })
  it('o id acha o Fim antes da origem: Escolha direto a dois Fins segue igual depois de outra ação', () => {
    const d = escolhaDiretoAosFins({ condition: COND.y })
    const f = inserirItem(fluxoDe(d), 'raiz', 0, { kind: 'atividade', id: 'novo', tipo: 'userTask' })
    const r = blocosParaDesenho(f, d)
    expect(r.setas.filter((s) => s.de === 'e').map((s) => [s.id, s.para])).toEqual([['s_e_end', 'end'], ['s_e_end2', 'end2']])
    expect(fluxoDe(r)).toEqual(f)
  })
  it('seta nova sem correspondência fica no Fim principal, sem repetir um Fim já ocupado', () => {
    const d = escolhaDiretoAosFins({ condition: COND.y })
    const comOutro = atualizarCaminho(adicionarCaminho(fluxoDe(d), 'e', 'c3'), 'c3', { condition: 'valor == 0', fim: { tipo: 'encerra' } })
    const r = blocosParaDesenho(comOutro, d)
    expect(r.setas.filter((s) => s.de === 'e').map((s) => [s.id, s.para])).toEqual([['s_e_end', 'end'], ['s_e_end2', 'end2'], ['c3', 'end']])
  })
  it('caminho removido deixa o Fim dele no desenho, e a conversão aponta fim-sem-seta', () => {
    const d = desenho([F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('a3'), F('end2', 'end', { nome: 'Recusado' })], [
      S('start', 'e'), S('e', 'a1', { condition: 'x' }), S('e', 'a2', { condition: 'y' }), S('e', 'a3', { condition: 'z' }),
      S('a1', 'end'), S('a2', 'end2'), S('a3', 'end'),
    ])
    const r = blocosParaDesenho(removerCaminho(fluxoDe(d), 'e', 's_e_a2'), d)
    expect(r.formas.some((f) => f.id === 'end2')).toBe(true)
    expect(r.setas.some((s) => s.para === 'end2')).toBe(false)
    expect(problemas(r)).toEqual([{ tipo: 'fim-sem-seta', mensagem: 'O Fim "Recusado" não recebe nenhuma seta. Ligue um caminho a ele ou apague-o.', formas: ['end2'], setas: [] }])
  })
  it('a posição e o nome do Fim preservado continuam', () => {
    const base = comUmFimPorCaminho()
    const d: DesenhoV2 = {
      ...base,
      formas: base.formas.map((f) => (f.id === 'end2' ? { ...f, nome: 'Recusado', config: { avisarQuemIniciou: true } } : f)),
      setas: base.setas.map((s) => (s.id === 's_a2_end2' ? { ...s, rotulo: 'não', entrada: { lado: 'cima', t: 0.5 } } : s)),
      posicoes: { end: { x: 900, y: 40 }, end2: { x: 900, y: 200 } },
      layout: { orientacao: 'horizontal', fases: [], piscinasExternas: [], fluxosMensagem: [{ id: 'm1', de: 'end2', para: 'a1' }], tamanhos: { end2: { largura: 60, altura: 60 } } },
    }
    const f = inserirItem(fluxoDe(d), 'raiz', 0, { kind: 'atividade', id: 'novo', tipo: 'userTask' })
    const r = blocosParaDesenho(f, d)
    expect(r.formas.find((x) => x.id === 'end2')).toEqual({ id: 'end2', tipo: 'end', nome: 'Recusado', config: { avisarQuemIniciou: true } })
    expect(r.posicoes.end2).toEqual({ x: 900, y: 200 })
    expect(r.layout?.tamanhos.end2).toEqual({ largura: 60, altura: 60 })
    expect(r.layout?.fluxosMensagem.map((m) => m.id)).toEqual(['m1'])
    const seta = r.setas.find((s) => s.de === 'a2')
    expect(seta).toMatchObject({ para: 'end2', rotulo: 'não', entrada: { lado: 'cima', t: 0.5 } })
  })
  it('o Fim principal continua o primeiro: a conversão de volta dá o mesmo fimId', () => {
    const d = comUmFimPorCaminho()
    const r = blocosParaDesenho(inserirItem(fluxoDe(d), 'raiz', 0, { kind: 'atividade', id: 'novo', tipo: 'userTask' }), d)
    expect(fluxoDe(r).fimId).toBe('end')
  })
  it('o losango de passagem fica, mesmo com um Fim que ficou sem seta', () => {
    const d = desenho([F('L', 'exclusiveGateway'), F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('a3'), F('end2', 'end')], [
      S('start', 'L'), S('L', 'e'), S('e', 'a1', { condition: 'x' }), S('e', 'a2', { condition: 'y' }), S('e', 'a3', { condition: 'z' }),
      S('a1', 'end'), S('a2', 'end2'), S('a3', 'end'),
    ])
    const r = blocosParaDesenho(removerCaminho(fluxoDe(d), 'e', 's_e_a2'), d)
    expect(r.formas.some((f) => f.id === 'L')).toBe(true)
    expect(para(r, 'L')).toEqual(['e'])
    expect(r.formas.some((f) => f.id === 'end2')).toBe(true)
  })
  it('com um Fim só, nada muda', () => {
    const d = desenho([F('a1'), F('a2')], [S('start', 'a1'), S('a1', 'a2'), S('a2', 'end')])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'a2'), d)
    expect(r.formas.map((f) => f.id)).toEqual(['start', 'a1', 'end'])
    expect(para(r, 'a1')).toEqual(['end'])
  })
})

describe('blocosParaDesenho — o Fim de um passo que saiu ou que ganhou outro depois', () => {
  const NOVO = { kind: 'atividade', id: 'novo', tipo: 'userTask' } as const
  const semPendencia = (d: DesenhoV2) => expect(desenhoParaBlocos(d).ok).toBe(true)
  /** e → a1 → end; e → <o que vier> → end2 */
  const comCaminho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 => desenho([F('e', 'exclusiveGateway'), F('a1'), ...formas, F('end2', 'end')], [
    S('start', 'e'), S('e', 'a1', { condition: 'x' }), S('a1', 'end'), ...setas,
  ])

  it('retirar o último passo antes do Fim, num caminho da Escolha', () => {
    const d = comCaminho([F('a2')], [S('e', 'a2', { condition: 'y' }), S('a2', 'end2')])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'a2'), d)
    expect(r.setas.filter((s) => s.de === 'e').map((s) => [s.id, s.para])).toEqual([['s_e_a1', 'a1'], ['s_e_a2', 'end2']])
    semPendencia(r)
  })
  it('retirar o último passo antes do Fim, numa sequência', () => {
    const d = comCaminho([F('x'), F('a2')], [S('e', 'x', { condition: 'y' }), S('x', 'a2'), S('a2', 'end2')])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'a2'), d)
    expect(para(r, 'x')).toEqual(['end2'])
    semPendencia(r)
  })
  it('inserir no fim de um caminho que vai a um Fim secundário', () => {
    const d = comCaminho([F('a2')], [S('e', 'a2', { condition: 'y' }), S('a2', 'end2')])
    const r = blocosParaDesenho(inserirItem(fluxoDe(d), 's_e_a2', 1, NOVO), d)
    expect(para(r, 'a2')).toEqual(['novo'])
    expect(para(r, 'novo')).toEqual(['end2'])
    expect(para(r, 'a1')).toEqual(['end'])
    semPendencia(r)
  })
  it('inserir num caminho vazio, ligado direto ao Fim secundário: o id do caminho desfaz a dúvida', () => {
    const d = escolhaDiretoAosFins({ condition: COND.y })
    const r = blocosParaDesenho(inserirItem(fluxoDe(d), 's_e_end2', 0, NOVO), d)
    expect(para(r, 'novo')).toEqual(['end2'])
    expect(r.setas.find((s) => s.id === 's_e_end')?.para).toBe('end')
    semPendencia(r)
  })
  it('retirar dois últimos passos, um de cada vez', () => {
    const d = comCaminho([F('x'), F('a2'), F('a3')], [S('e', 'x', { condition: 'y' }), S('x', 'a2'), S('a2', 'a3'), S('a3', 'end2')])
    const um = blocosParaDesenho(removerItem(fluxoDe(d), 'a3'), d)
    const dois = blocosParaDesenho(removerItem(fluxoDe(um), 'a2'), um)
    expect(para(dois, 'x')).toEqual(['end2'])
    semPendencia(dois)
  })
  it('retirar um bloco leva várias formas de uma vez: o caminhar passa por todas até o Fim', () => {
    // x → G; G → p → q → end2; G → w → end2
    const d = comCaminho([F('x'), F('G', 'exclusiveGateway'), F('p'), F('q'), F('w')], [
      S('e', 'x', { condition: 'y' }), S('x', 'G'), S('G', 'p', { condition: 'm' }), S('G', 'w', { condition: 'n' }), S('p', 'q'), S('q', 'end2'), S('w', 'end2'),
    ])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'G'), d)
    expect(r.setas.filter((s) => s.para === 'end2')).toHaveLength(1)
    expect(para(r, 'a1')).toEqual(['end'])
    semPendencia(r)
  })
  it('caminhar que chega a dois Fins não adivinha: fica no principal, e o outro vira pendência', () => {
    // x → G; G → p → end; G → w → end2. Sai o bloco G: x poderia ir a qualquer um
    const d = desenho([F('x'), F('G', 'exclusiveGateway'), F('p'), F('w'), F('end2', 'end', { nome: 'Recusado' })], [
      S('start', 'x'), S('x', 'G'), S('G', 'p', { condition: 'm' }), S('G', 'w', { condition: 'n' }), S('p', 'end'), S('w', 'end2'),
    ])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'G'), d)
    expect(para(r, 'x')).toEqual(['end'])
    expect(problemas(r).map((p) => [p.tipo, p.formas])).toEqual([['fim-sem-seta', ['end2']]])
  })
  it('forma nova depois de caminhos que iam a Fins diferentes não adivinha', () => {
    // os dois caminhos passam a seguir: nasce o losango que junta, e a seta dele poderia ir a qualquer Fim
    const d = desenho([F('e', 'exclusiveGateway'), F('a1'), F('a2'), F('end2', 'end')], [
      S('start', 'e'), S('e', 'a1', { condition: 'x' }), S('e', 'a2', { condition: 'y' }), S('a1', 'end'), S('a2', 'end2'),
    ])
    const f = atualizarCaminho(atualizarCaminho(fluxoDe(d), 's_e_a1', { fim: { tipo: 'segue' } }), 's_e_a2', { fim: { tipo: 'segue' } })
    const r = blocosParaDesenho(f, d)
    expect(r.setas.find((s) => s.de === 'e__fim')?.para).toBe('end')
    expect(problemas(r).map((p) => p.formas)).toEqual([['end2']])
  })
  it('cada seta de antes vale uma vez: dois caminhos novos não dividem o mesmo Fim secundário', () => {
    const d = comCaminho([F('a2')], [S('e', 'a2', { condition: 'y' }), S('a2', 'end2')])
    const f = removerItem(atualizarCaminho(adicionarCaminho(fluxoDe(d), 'e', 'c3'), 'c3', { condition: 'z', fim: { tipo: 'encerra' } }), 'a2')
    const r = blocosParaDesenho(f, d)
    expect(r.setas.filter((s) => s.de === 'e').map((s) => [s.id, s.para])).toEqual([['s_e_a1', 'a1'], ['s_e_a2', 'end2'], ['c3', 'end']])
  })
  it('um Fim só: nenhum caminhar muda nada', () => {
    const d = desenho([F('x'), F('a2')], [S('start', 'x'), S('x', 'a2'), S('a2', 'end')])
    const r = blocosParaDesenho(removerItem(fluxoDe(d), 'a2'), d)
    expect(r.formas.filter((f) => f.tipo === 'end').map((f) => f.id)).toEqual(['end'])
    expect(para(r, 'x')).toEqual(['end'])
    const i = blocosParaDesenho(inserirItem(fluxoDe(d), 'raiz', 2, NOVO), d)
    expect(para(i, 'novo')).toEqual(['end'])
  })
})

describe('assinaturaDoQueExecuta — vários Fins', () => {
  const fs = (desenho: DesenhoV2) => ({ steps: [], desenho })
  it('assinaturaDoQueExecuta não muda ao apagar o primeiro Fim nem ao trocar o Fim de uma seta', () => {
    const d = comUmFimPorCaminho()
    const a = assinaturaDoQueExecuta(fs(d))
    expect(a).not.toBeNull()
    const trocado: DesenhoV2 = { ...d, setas: d.setas.map((s) => (s.de === 'a1' ? { ...s, para: 'end2' } : s.de === 'a2' ? { ...s, para: 'end' } : s)) }
    expect(assinaturaDoQueExecuta(fs(trocado))).toBe(a)
    const semOPrimeiro: DesenhoV2 = { ...d, formas: d.formas.filter((f) => f.id !== 'end'), setas: d.setas.map((s) => (s.para === 'end' ? { ...s, para: 'end2' } : s)) }
    expect(assinaturaDoQueExecuta(fs(semOPrimeiro))).toBe(a)
  })
  it('mudar o que executa continua mudando a assinatura', () => {
    const d = comUmFimPorCaminho()
    const outra: DesenhoV2 = { ...d, setas: d.setas.map((s) => (s.de === 'e' && s.para === 'a1' ? { ...s, condition: 'valor > 1' } : s)) }
    expect(assinaturaDoQueExecuta(fs(outra))).not.toBe(assinaturaDoQueExecuta(fs(d)))
  })
})
