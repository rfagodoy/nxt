import { describe, it, expect } from 'vitest'
import type { WfGraph, WfEffect } from '../src/types'
import {
  startProcess, completeToken, returnToken, returnTargets,
  makeCounterRuntime, WfError,
} from '../src/interpreter'

const kinds = (effects: WfEffect[]) => effects.map((e) => e.kind)
const firstToken = (effects: WfEffect[]) => {
  const e = effects.find((x) => x.kind === 'createTask' || x.kind === 'runService')
  if (!e || (e.kind !== 'createTask' && e.kind !== 'runService')) throw new Error('sem token no efeito')
  return e.token.id
}
const tokenAt = (state: { tokens: Array<{ id: string; nodeId: string }> }, nodeId: string) => {
  const t = state.tokens.find((x) => x.nodeId === nodeId)
  if (!t) throw new Error(`sem token em ${nodeId}`)
  return t.id
}

/* start → A(Preencher) → B(Aprovar) → end */
const linear: WfGraph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start' },
    A: { id: 'A', type: 'userTask', name: 'Preencher' },
    B: { id: 'B', type: 'userTask', name: 'Aprovar' },
    end: { id: 'end', type: 'end' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'A' },
    { id: 'e2', from: 'A', to: 'B' },
    { id: 'e3', from: 'B', to: 'end' },
  ],
}

describe('devolver — fluxo linear', () => {
  it('oferece a atividade anterior como alvo (e não a própria)', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(linear, {}, rt)
    const r1 = completeToken(linear, r0.state, firstToken(r0.effects), {}, rt)
    const alvos = returnTargets(linear, r1.state, firstToken(r1.effects))
    expect(alvos).toEqual([{ nodeId: 'A', name: 'Preencher' }])
  })

  it('devolve para a etapa anterior recriando a tarefa e preservando os dados', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(linear, {}, rt)
    const r1 = completeToken(linear, r0.state, firstToken(r0.effects), { numero: 'CCT-1' }, rt)
    const r2 = returnToken(linear, r1.state, firstToken(r1.effects), 'A', rt)

    expect(r2.state.tokens.map((t) => t.nodeId)).toEqual(['A'])
    // a tarefa de Aprovar é cancelada e a de Preencher recriada
    expect(kinds(r2.effects)).toEqual(['cancelTask', 'createTask'])
    // dados preenchidos NÃO se perdem — a pessoa corrige o que já existe
    expect(r2.state.variables.numero).toBe('CCT-1')
    expect(r2.state.status).toBe('running')
  })

  it('segue normalmente depois de devolvido (refaz e conclui)', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(linear, {}, rt)
    const r1 = completeToken(linear, r0.state, firstToken(r0.effects), {}, rt)
    const r2 = returnToken(linear, r1.state, firstToken(r1.effects), 'A', rt)
    const r3 = completeToken(linear, r2.state, tokenAt(r2.state, 'A'), { numero: 'CCT-2' }, rt)
    expect(r3.state.tokens.map((t) => t.nodeId)).toEqual(['B'])
    const r4 = completeToken(linear, r3.state, tokenAt(r3.state, 'B'), {}, rt)
    expect(r4.state.status).toBe('completed')
  })

  it('recusa alvo que não é anterior no fluxo', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(linear, {}, rt)
    expect(() => returnToken(linear, r0.state, firstToken(r0.effects), 'B', rt)).toThrow(WfError)
  })

  it('recusa devolver para algo que não é atividade humana', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(linear, {}, rt)
    const r1 = completeToken(linear, r0.state, firstToken(r0.effects), {}, rt)
    expect(() => returnToken(linear, r1.state, firstToken(r1.effects), 'start', rt)).toThrow(/atividade humana/)
  })
})

/* start → A → fork ⇉ (B1, B2) ⇉ join → C → end
   O caso que trava o motor se for tratado ingenuamente. */
const paralelo: WfGraph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start' },
    A: { id: 'A', type: 'userTask', name: 'Preencher' },
    fork: { id: 'fork', type: 'parallelGateway', name: 'Em paralelo' },
    B1: { id: 'B1', type: 'userTask', name: 'Aprovar jurídico' },
    B2: { id: 'B2', type: 'userTask', name: 'Aprovar financeiro' },
    join: { id: 'join', type: 'parallelGateway' },
    C: { id: 'C', type: 'userTask', name: 'Publicar' },
    end: { id: 'end', type: 'end' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'A' },
    { id: 'e2', from: 'A', to: 'fork' },
    { id: 'e3', from: 'fork', to: 'B1' },
    { id: 'e4', from: 'fork', to: 'B2' },
    { id: 'e5', from: 'B1', to: 'join' },
    { id: 'e6', from: 'B2', to: 'join' },
    { id: 'e7', from: 'join', to: 'C' },
    { id: 'e8', from: 'C', to: 'end' },
  ],
}

describe('devolver — ramo paralelo (a armadilha da junção)', () => {
  it('cancela o ramo IRMÃO ao devolver de dentro do fork', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(paralelo, {}, rt)
    const r1 = completeToken(paralelo, r0.state, firstToken(r0.effects), {}, rt)
    expect(r1.state.tokens.map((t) => t.nodeId).sort()).toEqual(['B1', 'B2'])

    const r2 = returnToken(paralelo, r1.state, tokenAt(r1.state, 'B1'), 'A', rt)
    // sobra UM token, no alvo — as duas tarefas do fork foram canceladas
    expect(r2.state.tokens.map((t) => t.nodeId)).toEqual(['A'])
    expect(kinds(r2.effects).filter((k) => k === 'cancelTask')).toHaveLength(2)
  })

  it('ZERA a junção — senão ela esperaria para sempre um ramo que não existe mais', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(paralelo, {}, rt)
    const r1 = completeToken(paralelo, r0.state, firstToken(r0.effects), {}, rt)
    // um ramo chega na junção e fica aguardando o outro
    const r2 = completeToken(paralelo, r1.state, tokenAt(r1.state, 'B1'), {}, rt)
    expect(r2.state.joinCounts.join).toBe(1)

    // devolve pelo ramo que sobrou
    const r3 = returnToken(paralelo, r2.state, tokenAt(r2.state, 'B2'), 'A', rt)
    expect(r3.state.joinCounts.join ?? 0).toBe(0)

    // e o fluxo volta a funcionar inteiro: refaz, os dois ramos, junta e conclui
    const r4 = completeToken(paralelo, r3.state, tokenAt(r3.state, 'A'), {}, rt)
    const r5 = completeToken(paralelo, r4.state, tokenAt(r4.state, 'B1'), {}, rt)
    const r6 = completeToken(paralelo, r5.state, tokenAt(r5.state, 'B2'), {}, rt)
    expect(r6.state.tokens.map((t) => t.nodeId)).toEqual(['C'])
    const r7 = completeToken(paralelo, r6.state, tokenAt(r6.state, 'C'), {}, rt)
    expect(r7.state.status).toBe('completed')
  })
})

/* start → A → S(serviceTask) → B → end
   Devolver de B para A reexecutaria S — que mexe em contrato/parceiro. */
const comConector: WfGraph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start' },
    A: { id: 'A', type: 'userTask', name: 'Preencher' },
    S: { id: 'S', type: 'serviceTask', name: 'Lançar aditivo', connector: 'contracts.aditivo' },
    B: { id: 'B', type: 'userTask', name: 'Conferir' },
    end: { id: 'end', type: 'end' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'A' },
    { id: 'e2', from: 'A', to: 'S' },
    { id: 'e3', from: 'S', to: 'B' },
    { id: 'e4', from: 'B', to: 'end' },
  ],
}

describe('devolver — ação automática já executada', () => {
  const chegaEmB = () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(comConector, {}, rt)
    const r1 = completeToken(comConector, r0.state, firstToken(r0.effects), {}, rt) // A → para em S
    const r2 = completeToken(comConector, r1.state, tokenAt(r1.state, 'S'), {}, rt) // S → para em B
    return { rt, state: r2.state }
  }

  it('marca o alvo como bloqueado quando o caminho cruza conector (padrão)', () => {
    const { state } = chegaEmB()
    const alvos = returnTargets(comConector, state, tokenAt(state, 'B'))
    expect(alvos).toEqual([{ nodeId: 'A', name: 'Preencher', blockedBy: 'Lançar aditivo' }])
  })

  it('RECUSA a devolução em vez de arriscar duplicar a operação', () => {
    const { rt, state } = chegaEmB()
    expect(() => returnToken(comConector, state, tokenAt(state, 'B'), 'A', rt)).toThrow(/já foi executada/)
  })

  it('libera quando o conector é declarado IDEMPOTENT', () => {
    const g: WfGraph = { ...comConector, nodes: { ...comConector.nodes, S: { ...comConector.nodes.S, onReturn: 'IDEMPOTENT' } } }
    const rt = makeCounterRuntime()
    const r0 = startProcess(g, {}, rt)
    const r1 = completeToken(g, r0.state, firstToken(r0.effects), {}, rt)
    const r2 = completeToken(g, r1.state, tokenAt(r1.state, 'S'), {}, rt)

    expect(returnTargets(g, r2.state, tokenAt(r2.state, 'B'))).toEqual([{ nodeId: 'A', name: 'Preencher' }])
    const r3 = returnToken(g, r2.state, tokenAt(r2.state, 'B'), 'A', rt)
    expect(r3.state.tokens.map((t) => t.nodeId)).toEqual(['A'])
  })

  it('COMPENSATE ainda bloqueia (compensação é F5 — liberar antes duplicaria em silêncio)', () => {
    const g: WfGraph = { ...comConector, nodes: { ...comConector.nodes, S: { ...comConector.nodes.S, onReturn: 'COMPENSATE' } } }
    const rt = makeCounterRuntime()
    const r0 = startProcess(g, {}, rt)
    const r1 = completeToken(g, r0.state, firstToken(r0.effects), {}, rt)
    const r2 = completeToken(g, r1.state, tokenAt(r1.state, 'S'), {}, rt)
    expect(returnTargets(g, r2.state, tokenAt(r2.state, 'B'))[0].blockedBy).toBe('Lançar aditivo')
  })
})

/* start → A → G(exclusivo) →[Não] volta para A / →[Sim] B → end
   Grafo COM CICLO: o laço de reprovação que já existe no sistema. */
const comCiclo: WfGraph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start' },
    A: { id: 'A', type: 'userTask', name: 'Preencher' },
    G: { id: 'G', type: 'exclusiveGateway', name: 'Necessita de aprovação?' },
    B: { id: 'B', type: 'userTask', name: 'Aprovar' },
    end: { id: 'end', type: 'end' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'A' },
    { id: 'e2', from: 'A', to: 'G' },
    { id: 'e3', from: 'G', to: 'B', condition: 'aprovar == true' },
    { id: 'e4', from: 'G', to: 'A', isDefault: true },
    { id: 'e5', from: 'B', to: 'end' },
  ],
}

describe('devolver — grafo com ciclo (laço de reprovação desenhado)', () => {
  it('a busca de alvos TERMINA e enxerga a atividade anterior', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(comCiclo, {}, rt)
    const r1 = completeToken(comCiclo, r0.state, firstToken(r0.effects), { aprovar: true }, rt)
    expect(r1.state.tokens.map((t) => t.nodeId)).toEqual(['B'])

    const alvos = returnTargets(comCiclo, r1.state, tokenAt(r1.state, 'B'))
    expect(alvos).toEqual([{ nodeId: 'A', name: 'Preencher' }])
  })

  it('devolve dentro do ciclo sem duplicar token', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(comCiclo, {}, rt)
    const r1 = completeToken(comCiclo, r0.state, firstToken(r0.effects), { aprovar: true }, rt)
    const r2 = returnToken(comCiclo, r1.state, tokenAt(r1.state, 'B'), 'A', rt)
    expect(r2.state.tokens.map((t) => t.nodeId)).toEqual(['A'])
  })
})
