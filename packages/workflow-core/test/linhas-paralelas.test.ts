import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { atividadesFimDeLinha, blocosParaGrafo, grafoParaMotor, lerFluxoBlocos, pendenciasDosBlocos, type FluxoBlocos } from '../src/blocos'
import { bloqueantes, avisos, validarDesenho } from '../src/activation-guard'
import { desenhoParaBlocos, blocosParaDesenho } from '../src/desenho-livre'
import { ligacaoPermitida } from '../src/desenho'
import { compileBpmn } from '../src/compile'
import { generateBpmn } from '../src/generate'
import { completeToken, makeCounterRuntime, returnTargets, returnToken, startProcess, WfSemCaminho } from '../src/interpreter'
import type { WfGraph, WfState } from '../src/types'

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const escolha = (id: string) => F(id, 'exclusiveGateway', { modo: 'primeiro', pergunta: `${id}?` })
const desenho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 => ({
  versao: 2, formas: [F('start', 'start'), F('end', 'end'), ...formas], setas, posicoes: {}, raias: [],
})
const sim = (campo: string) => ({ condition: `${campo} == 'sim'` })
const nao = (campo: string) => ({ condition: `${campo} == 'nao'` })

/** O "Solicitação de contratos" sem os losangos de junção. */
const simplificado = () => desenho(
  [F('preencher'), F('par', 'parallelGateway'), escolha('patrimonio'), F('ciencia'), escolha('rh'), F('validar1'), F('validar2'),
    F('analisar'), escolha('erros'), F('corrigir'), F('contabil'), F('retorno')],
  [S('start', 'preencher'), S('preencher', 'par'), S('par', 'patrimonio'), S('par', 'rh'), S('par', 'analisar'),
    S('patrimonio', 'ciencia', sim('patrimonio')),
    S('rh', 'validar1', sim('rh')), S('validar1', 'validar2'),
    S('analisar', 'erros'), S('erros', 'corrigir', sim('erros')), S('corrigir', 'analisar'), S('erros', 'contabil', nao('erros')),
    S('contabil', 'retorno'), S('retorno', 'end')],
)

const fluxoDe = (d: DesenhoV2): FluxoBlocos => {
  const c = desenhoParaBlocos(d)
  if (!c.ok) throw new Error(c.problemas.map((p) => p.mensagem).join(' | '))
  return c.fluxo
}
const recusa = (d: DesenhoV2): string[] => {
  const c = desenhoParaBlocos(d)
  if (c.ok) throw new Error('deveria recusar')
  return c.problemas.map((p) => p.tipo)
}
/** O que a ativação grava: passa pelo BPMN gerado e compilado. */
const grafoDe = (f: FluxoBlocos): WfGraph => {
  const g = blocosParaGrafo(f)
  return compileBpmn(generateBpmn(grafoParaMotor({ ...g, nodes: g.nodes.map((n) => (n.type === 'userTask' && !n.name ? { ...n, name: n.id } : n)) })))
}
function rodar(g: WfGraph, vars: Record<string, unknown>) {
  const rt = makeCounterRuntime()
  let state: WfState = startProcess(g, {}, rt).state
  const concluir = (id: string, dados: Record<string, unknown> = {}) => {
    const t = state.tokens.find((x) => x.nodeId === id)
    if (!t) throw new Error(`sem tarefa em "${id}" (abertas: ${abertas().join(', ')})`)
    state = completeToken(g, state, t.id, dados, rt).state
  }
  const abertas = () => state.tokens.map((t) => t.nodeId).sort()
  concluir('preencher', vars)
  return { concluir, abertas, status: () => state.status, estado: () => state, devolver: (de: string, para: string) => {
    const t = state.tokens.find((x) => x.nodeId === de)!
    state = returnToken(g, state, t.id, para, rt).state
  }, alvos: (de: string) => returnTargets(g, state, state.tokens.find((x) => x.nodeId === de)!.id).map((a) => a.nodeId) }
}

describe('linha paralela: caminho de "ao mesmo tempo" que não chega ao Fim', () => {
  it('o desenho sem losangos de junção converte e não tem pendência', () => {
    const f = fluxoDe(simplificado())
    expect(pendenciasDosBlocos(f)).toEqual([])
    const g = blocosParaGrafo(f)
    const nos = g.nodes.map((n) => ({ ...n, name: n.id }))
    expect(bloqueantes(validarDesenho(nos, g.edges))).toEqual([])
  })

  it('a linha principal terminando primeiro não encerra: espera as linhas paralelas', () => {
    const p = rodar(grafoDe(fluxoDe(simplificado())), { patrimonio: 'sim', rh: 'sim', erros: 'nao' })
    expect(p.abertas()).toEqual(['analisar', 'ciencia', 'validar1'])
    p.concluir('analisar'); p.concluir('contabil'); p.concluir('retorno')
    expect(p.status()).toBe('running')
    expect(p.abertas()).toEqual(['ciencia', 'validar1'])
    p.concluir('ciencia'); p.concluir('validar1'); p.concluir('validar2')
    expect(p.status()).toBe('completed')
  })

  it('as linhas paralelas terminando primeiro não encerram: falta a principal', () => {
    const p = rodar(grafoDe(fluxoDe(simplificado())), { patrimonio: 'sim', rh: 'sim', erros: 'nao' })
    p.concluir('ciencia'); p.concluir('validar1'); p.concluir('validar2')
    expect(p.status()).toBe('running')
    p.concluir('analisar'); p.concluir('contabil'); p.concluir('retorno')
    expect(p.status()).toBe('completed')
  })

  it('escolha em linha paralela sem caminho que sirva: só a linha acaba', () => {
    const p = rodar(grafoDe(fluxoDe(simplificado())), { patrimonio: 'nao', rh: 'nao', erros: 'nao' })
    expect(p.abertas()).toEqual(['analisar'])
    p.concluir('analisar'); p.concluir('contabil'); p.concluir('retorno')
    expect(p.status()).toBe('completed')
  })

  it('escolha que leva ao Fim e não tem caminho que sirva continua parando com aviso', () => {
    const g = grafoDe(fluxoDe(simplificado()))
    const p = rodar(g, { patrimonio: 'nao', rh: 'nao' })
    expect(() => p.concluir('analisar', { erros: 'talvez' })).toThrow(WfSemCaminho)
  })

  it('a atividade que encerra a linha é identificada', () => {
    expect(atividadesFimDeLinha(fluxoDe(simplificado())).sort()).toEqual(['ciencia', 'validar2'])
  })

  it('o fluxo com linha paralela sobrevive à leitura de JSON gravado', () => {
    const f = fluxoDe(simplificado())
    expect(lerFluxoBlocos(JSON.parse(JSON.stringify(f)))).not.toBeNull()
  })

  it('voltar dos blocos ao desenho mantém a atividade sem sucessora', () => {
    const d = blocosParaDesenho(fluxoDe(simplificado()), simplificado())
    expect(d.setas.some((s) => s.de === 'ciencia')).toBe(false)
    expect(atividadesFimDeLinha(fluxoDe(d)).sort()).toEqual(['ciencia', 'validar2'])
  })
})

describe('as proteções continuam', () => {
  it('fora de um "ao mesmo tempo", atividade sem saída é recusada', () => {
    expect(recusa(desenho([F('a'), F('b'), escolha('e')], [S('start', 'a'), S('a', 'e'), S('e', 'b', sim('x')), S('e', 'end', nao('x'))]))).toEqual(['sem-saida'])
  })

  it('linha que chega ao Fim precisa chegar por todos os caminhos', () => {
    const d = desenho([F('par', 'parallelGateway'), F('a'), escolha('e'), F('esquecida'), F('b')],
      [S('start', 'par'), S('par', 'a'), S('par', 'b'), S('a', 'e'), S('e', 'esquecida', sim('x')), S('e', 'end', nao('x')), S('b', 'end')])
    const c = desenhoParaBlocos(d)
    expect(c.ok).toBe(false)
    if (!c.ok) {
      expect(c.problemas[0].tipo).toBe('sem-saida')
      expect(c.problemas[0].formas).toEqual(['esquecida'])
    }
  })

  it('nenhuma linha chegando ao Fim impede ativar', () => {
    const f = fluxoDe(desenho([F('par', 'parallelGateway'), F('a'), F('b')], [S('start', 'par'), S('par', 'a'), S('par', 'b')]))
    const g = blocosParaGrafo(f)
    expect(bloqueantes(validarDesenho(g.nodes, g.edges)).map((p) => p.tipo)).toContain('fim-inalcancavel')
  })

  it('escolha cujo caminho abre um paralelo sem Fim impede ativar', () => {
    const nodes = [{ id: 's', type: 'start' }, { id: 'e', type: 'exclusiveGateway' }, { id: 'p', type: 'parallelGateway' }, { id: 'a', type: 'userTask' }, { id: 'b', type: 'userTask' }, { id: 'f', type: 'end' }]
    const edges = [{ from: 's', to: 'e' }, { from: 'e', to: 'p' }, { from: 'e', to: 'f' }, { from: 'p', to: 'a' }, { from: 'p', to: 'b' }]
    expect(bloqueantes(validarDesenho(nodes, edges)).map((p) => p.tipo)).toContain('sem-saida')
  })

  it('o fim de linha aparece como aviso, sem impedir a ativação', () => {
    const f = fluxoDe(simplificado())
    const g = blocosParaGrafo(f)
    const av = avisos(validarDesenho(g.nodes.map((n) => ({ ...n, name: n.id })), g.edges)).filter((p) => p.tipo === 'linha-paralela')
    expect(av.map((p) => p.nodeId).sort()).toEqual(['ciencia', 'validar2'])
    expect(av[0].mensagem).toContain('linha paralela')
  })

  it('atividades em comum depois das linhas continuam exigindo a junção', () => {
    const d = desenho([F('par', 'parallelGateway'), F('a'), F('b'), F('comum')],
      [S('start', 'par'), S('par', 'a'), S('par', 'b'), S('a', 'comum'), S('b', 'comum'), S('comum', 'end')])
    expect(recusa(d)).toEqual(['ramos-sem-juncao'])
  })

  it('o desenho antigo, com junção, continua igual', () => {
    const d = desenho([F('par', 'parallelGateway'), F('a'), F('b'), F('j', 'parallelGateway', { junta: true }), F('depois')],
      [S('start', 'par'), S('par', 'a'), S('par', 'b'), S('a', 'j'), S('b', 'j'), S('j', 'depois'), S('depois', 'end')])
    expect(pendenciasDosBlocos(fluxoDe(d))).toEqual([])
  })
})

describe('várias linhas chegando ao Fim', () => {
  const duasAoFim = () => desenho([F('p0'), F('par', 'parallelGateway'), F('a'), F('b')],
    [S('start', 'p0'), S('p0', 'par'), S('par', 'a'), S('par', 'b'), S('a', 'end'), S('b', 'end')])

  it('dispensa a junção e só encerra quando todas terminam', () => {
    const f = fluxoDe(duasAoFim())
    expect(pendenciasDosBlocos(f)).toEqual([])
    const g = grafoDe(f)
    const rt = makeCounterRuntime()
    let st = startProcess(g, {}, rt).state
    const fim = (id: string) => { st = completeToken(g, st, st.tokens.find((t) => t.nodeId === id)!.id, {}, rt).state }
    fim('p0'); fim('a')
    expect(st.status).toBe('running')
    fim('b')
    expect(st.status).toBe('completed')
  })

  it('uma escolha pode levar ao Fim de dentro da linha', () => {
    const f: FluxoBlocos = fluxoDe(desenho([F('par', 'parallelGateway'), F('a'), escolha('e'), F('b'), F('c')],
      [S('start', 'par'), S('par', 'a'), S('par', 'c'), S('a', 'e'), S('e', 'b', sim('x')), S('e', 'end', nao('x')), S('b', 'end')]))
    expect(pendenciasDosBlocos(f)).toEqual([])
  })

  it('seta desenhada à mão até o Fim vale dentro da frente', () => {
    const f: FluxoBlocos = { versao: 1, inicioId: 'start', fimId: 'end', itens: [
      { kind: 'paralelo', id: 'par', caminhos: [
        { id: 'p1', itens: [{ kind: 'escolha', id: 'e', caminhos: [{ id: 'c1', condition: 'x', itens: [{ kind: 'atividade', id: 'a', tipo: 'userTask' }], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } }] },
        { id: 'p2', itens: [] },
      ] },
    ] }
    expect(ligacaoPermitida(f, 'a', 'end')).toEqual({ ok: true, caminhoId: 'c1', fim: { tipo: 'encerra' } })
  })
})

describe('devolução em linha paralela', () => {
  it('só oferece atividades da própria linha', () => {
    const p = rodar(grafoDe(fluxoDe(simplificado())), { patrimonio: 'sim', rh: 'sim', erros: 'nao' })
    expect(p.alvos('ciencia')).toEqual([])
    p.concluir('validar1')
    expect(p.alvos('validar2')).toEqual(['validar1'])
  })

  it('a linha principal segue podendo devolver para antes do +, e tudo reinicia', () => {
    const p = rodar(grafoDe(fluxoDe(simplificado())), { patrimonio: 'sim', rh: 'sim', erros: 'nao' })
    p.concluir('ciencia')
    expect(p.alvos('analisar')).toContain('preencher')
    p.devolver('analisar', 'preencher')
    expect(p.abertas()).toEqual(['preencher'])
    p.concluir('preencher', { patrimonio: 'sim', rh: 'nao', erros: 'nao' })
    expect(p.abertas()).toEqual(['analisar', 'ciencia'])
  })

  it('devolver para antes do + depois de uma linha chegar ao Fim exige passar pelo Fim de novo', () => {
    const d = desenho([F('p0'), F('par', 'parallelGateway'), F('a'), F('b')],
      [S('start', 'p0'), S('p0', 'par'), S('par', 'a'), S('par', 'b'), S('a', 'end'), S('b', 'end')])
    const g = grafoDe(fluxoDe(d))
    const rt = makeCounterRuntime()
    let st = startProcess(g, {}, rt).state
    const t = (id: string) => st.tokens.find((x) => x.nodeId === id)!.id
    st = completeToken(g, st, t('p0'), {}, rt).state
    st = completeToken(g, st, t('a'), {}, rt).state
    expect(st.reachedEnd).toBe(true)
    st = returnToken(g, st, t('b'), 'p0', rt).state
    expect(st.reachedEnd).toBe(false)
  })
})
