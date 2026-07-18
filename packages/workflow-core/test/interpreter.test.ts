import { describe, it, expect } from 'vitest'
import type { WfGraph, WfEffect } from '../src/types'
import { startProcess, completeToken, cancelProcess, makeCounterRuntime, WfError } from '../src/interpreter'

// helper: pega o token criado pelo 1º efeito createTask/runService
const firstToken = (effects: WfEffect[]) => {
  const e = effects.find((x) => x.kind === 'createTask' || x.kind === 'runService')
  if (!e || (e.kind !== 'createTask' && e.kind !== 'runService')) throw new Error('sem token no efeito')
  return e.token.id
}
const kinds = (effects: WfEffect[]) => effects.map((e) => e.kind)

describe('interpretador — fluxo linear', () => {
  // start → A(userTask) → B(userTask) → end
  const graph: WfGraph = {
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

  it('inicia parando na primeira userTask (cria tarefa)', () => {
    const rt = makeCounterRuntime()
    const { state, effects } = startProcess(graph, {}, rt)
    expect(state.status).toBe('running')
    expect(state.tokens).toHaveLength(1)
    expect(state.tokens[0].nodeId).toBe('A')
    expect(kinds(effects)).toEqual(['createTask'])
  })

  it('avança tarefa a tarefa e conclui no fim', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    const r1 = completeToken(graph, r0.state, firstToken(r0.effects), { nome: 'Contrato X' }, rt)
    expect(r1.state.tokens[0].nodeId).toBe('B')
    expect(kinds(r1.effects)).toEqual(['createTask'])

    const r2 = completeToken(graph, r1.state, firstToken(r1.effects), { aprovado: true }, rt)
    expect(r2.state.status).toBe('completed')
    expect(r2.state.tokens).toHaveLength(0)
    expect(kinds(r2.effects)).toEqual(['completed'])
    // variáveis acumulam de todas as etapas
    expect(r2.state.variables).toEqual({ nome: 'Contrato X', aprovado: true })
  })

  it('não muta o estado anterior (pureza)', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    const snapshot = JSON.stringify(r0.state)
    completeToken(graph, r0.state, firstToken(r0.effects), { x: 1 }, rt)
    expect(JSON.stringify(r0.state)).toBe(snapshot)
  })
})

describe('interpretador — gateway exclusivo', () => {
  // start → G → [valor>100000 → aprovarDiretor → end] / [default → end]
  const graph: WfGraph = {
    startId: 'start',
    nodes: {
      start: { id: 'start', type: 'start' },
      preencher: { id: 'preencher', type: 'userTask' },
      G: { id: 'G', type: 'exclusiveGateway' },
      aprovarDiretor: { id: 'aprovarDiretor', type: 'userTask', name: 'Aprovar (diretor)' },
      end: { id: 'end', type: 'end' },
    },
    edges: [
      { id: 'e1', from: 'start', to: 'preencher' },
      { id: 'e2', from: 'preencher', to: 'G' },
      { id: 'e3', from: 'G', to: 'aprovarDiretor', condition: 'valor > 100000' },
      { id: 'e4', from: 'G', to: 'end', isDefault: true },
    ],
  }

  it('valor alto → cai no ramo de aprovação do diretor', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    const r1 = completeToken(graph, r0.state, firstToken(r0.effects), { valor: 250000 }, rt)
    expect(r1.state.tokens[0].nodeId).toBe('aprovarDiretor')
    expect(kinds(r1.effects)).toEqual(['createTask'])
  })

  it('valor baixo → default vai direto ao fim', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    const r1 = completeToken(graph, r0.state, firstToken(r0.effects), { valor: 5000 }, rt)
    expect(r1.state.status).toBe('completed')
    expect(kinds(r1.effects)).toEqual(['completed'])
  })

  it('sem condição casando e sem default → erro', () => {
    const bad: WfGraph = {
      startId: 'start',
      nodes: {
        start: { id: 'start', type: 'start' },
        G: { id: 'G', type: 'exclusiveGateway' },
        end: { id: 'end', type: 'end' },
      },
      edges: [
        { id: 'e1', from: 'start', to: 'G' },
        { id: 'e2', from: 'G', to: 'end', condition: 'valor > 100' },
      ],
    }
    expect(() => startProcess(bad, { valor: 1 }, makeCounterRuntime())).toThrow(WfError)
  })
})

describe('interpretador — gateway paralelo (fork/join)', () => {
  // start → F(fork) → [A, B] → J(join) → end
  const graph: WfGraph = {
    startId: 'start',
    nodes: {
      start: { id: 'start', type: 'start' },
      F: { id: 'F', type: 'parallelGateway' },
      A: { id: 'A', type: 'userTask', name: 'Jurídico' },
      B: { id: 'B', type: 'userTask', name: 'Financeiro' },
      J: { id: 'J', type: 'parallelGateway' },
      end: { id: 'end', type: 'end' },
    },
    edges: [
      { id: 'e1', from: 'start', to: 'F' },
      { id: 'e2', from: 'F', to: 'A' },
      { id: 'e3', from: 'F', to: 'B' },
      { id: 'e4', from: 'A', to: 'J' },
      { id: 'e5', from: 'B', to: 'J' },
      { id: 'e6', from: 'J', to: 'end' },
    ],
  }

  it('bifurca em duas tarefas simultâneas', () => {
    const r0 = startProcess(graph, {}, makeCounterRuntime())
    expect(r0.state.tokens.map((t) => t.nodeId).sort()).toEqual(['A', 'B'])
    expect(kinds(r0.effects)).toEqual(['createTask', 'createTask'])
  })

  it('join só dispara quando os dois ramos chegam', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    const tokA = r0.state.tokens.find((t) => t.nodeId === 'A')!.id
    const tokB = r0.state.tokens.find((t) => t.nodeId === 'B')!.id

    // conclui só o ramo A → join aguarda, processo continua rodando
    const r1 = completeToken(graph, r0.state, tokA, { juridico: 'ok' }, rt)
    expect(r1.state.status).toBe('running')
    expect(r1.state.tokens.map((t) => t.nodeId)).toEqual(['B'])
    expect(r1.state.joinCounts['J']).toBe(1)
    expect(kinds(r1.effects)).toEqual([]) // nada de novo ainda

    // conclui o ramo B → join sincroniza e o processo termina
    const r2 = completeToken(graph, r1.state, tokB, { financeiro: 'ok' }, rt)
    expect(r2.state.status).toBe('completed')
    expect(kinds(r2.effects)).toEqual(['completed'])
    expect(r2.state.variables).toEqual({ juridico: 'ok', financeiro: 'ok' })
  })
})

describe('interpretador — service task', () => {
  // start → S(serviceTask) → end
  const graph: WfGraph = {
    startId: 'start',
    nodes: {
      start: { id: 'start', type: 'start' },
      S: { id: 'S', type: 'serviceTask', connector: 'contracts.create' },
      end: { id: 'end', type: 'end' },
    },
    edges: [
      { id: 'e1', from: 'start', to: 'S' },
      { id: 'e2', from: 'S', to: 'end' },
    ],
  }

  it('para no serviceTask emitindo runService (backend executa o conector)', () => {
    const r0 = startProcess(graph, {}, makeCounterRuntime())
    expect(r0.state.tokens[0].nodeId).toBe('S')
    const eff = r0.effects[0]
    expect(eff.kind).toBe('runService')
    if (eff.kind === 'runService') expect(eff.node.connector).toBe('contracts.create')
  })

  it('ao concluir o serviço, o processo segue e termina', () => {
    const rt = makeCounterRuntime()
    const r0 = startProcess(graph, {}, rt)
    const r1 = completeToken(graph, r0.state, firstToken(r0.effects), { contratoId: 'abc' }, rt)
    expect(r1.state.status).toBe('completed')
    expect(r1.state.variables.contratoId).toBe('abc')
  })
})

describe('interpretador — cancelamento e guardas', () => {
  const graph: WfGraph = {
    startId: 'start',
    nodes: {
      start: { id: 'start', type: 'start' },
      A: { id: 'A', type: 'userTask' },
      end: { id: 'end', type: 'end' },
    },
    edges: [
      { id: 'e1', from: 'start', to: 'A' },
      { id: 'e2', from: 'A', to: 'end' },
    ],
  }

  it('cancelar zera tokens e marca canceled', () => {
    const r0 = startProcess(graph, {}, makeCounterRuntime())
    const canceled = cancelProcess(r0.state)
    expect(canceled.status).toBe('canceled')
    expect(canceled.tokens).toHaveLength(0)
  })

  it('completeToken em instância não-running lança erro', () => {
    const r0 = startProcess(graph, {}, makeCounterRuntime())
    const canceled = cancelProcess(r0.state)
    expect(() => completeToken(graph, canceled, 'qualquer', {}, makeCounterRuntime())).toThrow(WfError)
  })

  it('completeToken com token inexistente lança erro', () => {
    const r0 = startProcess(graph, {}, makeCounterRuntime())
    expect(() => completeToken(graph, r0.state, 'nao-existe', {}, makeCounterRuntime())).toThrow(WfError)
  })

  it('laço infinito de gateways sempre-verdadeiros é barrado', () => {
    const loop: WfGraph = {
      startId: 'start',
      nodes: {
        start: { id: 'start', type: 'start' },
        G: { id: 'G', type: 'exclusiveGateway' },
      },
      edges: [
        { id: 'e1', from: 'start', to: 'G' },
        { id: 'e2', from: 'G', to: 'G', isDefault: true },
      ],
    }
    expect(() => startProcess(loop, {}, makeCounterRuntime())).toThrow(WfError)
  })
})
