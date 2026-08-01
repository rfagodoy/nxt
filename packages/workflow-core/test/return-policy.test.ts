import { describe, it, expect } from 'vitest'
import type { WfGraph, WfEffect, WfNode } from '../src/types'
import {
  startProcess, completeToken, returnToken, returnTargets,
  makeCounterRuntime, WfError,
} from '../src/interpreter'

const firstToken = (effects: WfEffect[]) => {
  const e = effects.find((x) => x.kind === 'createTask' || x.kind === 'runService')
  if (!e || (e.kind !== 'createTask' && e.kind !== 'runService')) throw new Error('sem token no efeito')
  return e.token.id
}

/* start → A(Preencher) → B(Conferir) → C(Aprovar) → end */
const tresEtapas: WfGraph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start' },
    A: { id: 'A', type: 'userTask', name: 'Preencher' },
    B: { id: 'B', type: 'userTask', name: 'Conferir' },
    C: { id: 'C', type: 'userTask', name: 'Aprovar' },
    end: { id: 'end', type: 'end' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'A' },
    { id: 'e2', from: 'A', to: 'B' },
    { id: 'e3', from: 'B', to: 'C' },
    { id: 'e4', from: 'C', to: 'end' },
  ],
}

/** Leva o processo até C e devolve o token que está lá. */
function ateC(graph: WfGraph) {
  const rt = makeCounterRuntime()
  const r0 = startProcess(graph, {}, rt)
  const r1 = completeToken(graph, r0.state, firstToken(r0.effects), {}, rt)
  const r2 = completeToken(graph, r1.state, firstToken(r1.effects), {}, rt)
  return { rt, state: r2.state, token: firstToken(r2.effects) }
}

const comPolitica = (nodeId: string, returnPolicy: WfNode['returnPolicy']): WfGraph => ({
  ...tresEtapas,
  nodes: { ...tresEtapas.nodes, [nodeId]: { ...tresEtapas.nodes[nodeId], returnPolicy } },
})

describe('política de devolução por atividade', () => {
  it('sem política configurada, oferece TODAS as anteriores (comportamento de antes)', () => {
    const { state, token } = ateC(tresEtapas)
    const alvos = returnTargets(tresEtapas, state, token).map((t) => t.nodeId).sort()
    expect(alvos).toEqual(['A', 'B'])
  })

  it('mode ANY é o mesmo que não configurar', () => {
    const g = comPolitica('C', { mode: 'ANY' })
    const { state, token } = ateC(g)
    expect(returnTargets(g, state, token).map((t) => t.nodeId).sort()).toEqual(['A', 'B'])
  })

  it('SELECTED oferece só as etapas marcadas', () => {
    const g = comPolitica('C', { mode: 'SELECTED', nodeIds: ['A'] })
    const { state, token } = ateC(g)
    expect(returnTargets(g, state, token)).toEqual([{ nodeId: 'A', name: 'Preencher' }])
  })

  it('NONE não oferece nenhum destino — o botão some para quem executa', () => {
    const g = comPolitica('C', { mode: 'NONE' })
    const { state, token } = ateC(g)
    expect(returnTargets(g, state, token)).toEqual([])
  })

  it('a política é da atividade de ORIGEM, não do destino', () => {
    // A política está em B; devolver a partir de C não deve ser afetada.
    const g = comPolitica('B', { mode: 'NONE' })
    const { state, token } = ateC(g)
    expect(returnTargets(g, state, token).map((t) => t.nodeId).sort()).toEqual(['A', 'B'])
  })

  it('o motor RECUSA devolver para etapa fora da política', () => {
    const g = comPolitica('C', { mode: 'SELECTED', nodeIds: ['A'] })
    const { rt, state, token } = ateC(g)
    expect(() => returnToken(g, state, token, 'B', rt)).toThrow(WfError)
  })

  it('devolver para etapa DENTRO da política funciona normalmente', () => {
    const g = comPolitica('C', { mode: 'SELECTED', nodeIds: ['A'] })
    const { rt, state, token } = ateC(g)
    const r = returnToken(g, state, token, 'A', rt)
    expect(r.state.tokens.map((t) => t.nodeId)).toEqual(['A'])
  })

  it('SELECTED com lista vazia não oferece nada (não vira "qualquer uma")', () => {
    const g = comPolitica('C', { mode: 'SELECTED', nodeIds: [] })
    const { state, token } = ateC(g)
    expect(returnTargets(g, state, token)).toEqual([])
  })
})

/* start → A(Preencher) → S(ação automática) → B(Aprovar) → end
   S bloqueia a devolução (onReturn padrão = BLOCK). */
const comAcaoAutomatica: WfGraph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start' },
    A: { id: 'A', type: 'userTask', name: 'Preencher' },
    S: { id: 'S', type: 'serviceTask', name: 'Registrar aditivo', connector: 'contracts.aditivo' },
    B: { id: 'B', type: 'userTask', name: 'Aprovar' },
    end: { id: 'end', type: 'end' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'A' },
    { id: 'e2', from: 'A', to: 'S' },
    { id: 'e3', from: 'S', to: 'B' },
    { id: 'e4', from: 'B', to: 'end' },
  ],
}

describe('a política só ESTREITA — nunca desbloqueia o que o motor bloqueou', () => {
  const ateB = (graph: WfGraph) => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    // A → S (ação automática) → B: concluir A dispara o serviço, concluir o serviço abre B
    const r1 = completeToken(graph, r0.state, firstToken(r0.effects), {}, rt)
    const r2 = completeToken(graph, r1.state, firstToken(r1.effects), {}, rt)
    return { rt, state: r2.state, token: firstToken(r2.effects) }
  }

  it('escolher explicitamente uma etapa bloqueada NÃO a libera', () => {
    const g: WfGraph = {
      ...comAcaoAutomatica,
      nodes: { ...comAcaoAutomatica.nodes, B: { ...comAcaoAutomatica.nodes.B, returnPolicy: { mode: 'SELECTED', nodeIds: ['A'] } } },
    }
    const { rt, state, token } = ateB(g)
    // A continua listada, mas COM o motivo do bloqueio
    const alvos = returnTargets(g, state, token)
    expect(alvos).toEqual([{ nodeId: 'A', name: 'Preencher', blockedBy: 'Registrar aditivo' }])
    // e devolver para ela segue recusado pelo motor
    expect(() => returnToken(g, state, token, 'A', rt)).toThrow(WfError)
  })
})
