import { describe, it, expect } from 'vitest'
import { generateBpmn } from '../src/generate'
import { compileBpmn } from '../src/compile'
import type { WfGraph } from '../src/types'

/** Grafo linear: start → tarefa → serviço → fim. */
const linear: WfGraph = {
  startId: 'Start_1',
  nodes: {
    Start_1: { id: 'Start_1', type: 'start', name: 'Início' },
    Task_1: { id: 'Task_1', type: 'userTask', name: 'Preencher dados', role: 'Analista', slaMinutes: 2880 },
    Svc_1: { id: 'Svc_1', type: 'serviceTask', name: 'Cadastrar', connector: 'contracts.create' },
    End_1: { id: 'End_1', type: 'end', name: 'Fim' },
  },
  edges: [
    { id: 'Flow_1', from: 'Start_1', to: 'Task_1' },
    { id: 'Flow_2', from: 'Task_1', to: 'Svc_1' },
    { id: 'Flow_3', from: 'Svc_1', to: 'End_1' },
  ],
}

/** Grafo com decisão exclusiva: condição + default (ramificação). */
const branched: WfGraph = {
  startId: 'Start_1',
  nodes: {
    Start_1: { id: 'Start_1', type: 'start' },
    Fill: { id: 'Fill', type: 'userTask', name: 'Preencher' },
    Gw: { id: 'Gw', type: 'exclusiveGateway', name: 'Valor > 100 mil?' },
    Approve: { id: 'Approve', type: 'userTask', name: 'Aprovar', role: 'Gerente jurídico' },
    End_1: { id: 'End_1', type: 'end' },
  },
  edges: [
    { id: 'F1', from: 'Start_1', to: 'Fill' },
    { id: 'F2', from: 'Fill', to: 'Gw' },
    { id: 'F3', from: 'Gw', to: 'Approve', condition: 'valor > 100000' },
    { id: 'F4', from: 'Gw', to: 'End_1', isDefault: true },
    { id: 'F5', from: 'Approve', to: 'End_1' },
  ],
}

describe('generateBpmn', () => {
  it('gera XML que o compilador aceita (linear)', () => {
    const xml = generateBpmn(linear)
    const g = compileBpmn(xml)
    expect(g.startId).toBe('Start_1')
    expect(Object.keys(g.nodes).sort()).toEqual(['End_1', 'Start_1', 'Svc_1', 'Task_1'])
    expect(g.nodes.Task_1.type).toBe('userTask')
    expect(g.nodes.Task_1.role).toBe('Analista')
    expect(g.nodes.Task_1.slaMinutes).toBe(2880)
    expect(g.nodes.Svc_1.connector).toBe('contracts.create')
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['Start_1>Task_1', 'Task_1>Svc_1', 'Svc_1>End_1'])
  })

  it('preserva condição, default e nomes com "<"/">" na ida-e-volta (ramificado)', () => {
    const xml = generateBpmn(branched)
    const g = compileBpmn(xml)
    // nome com ">" sobrevive ao escape/parse
    expect(g.nodes.Gw.name).toBe('Valor > 100 mil?')
    const cond = g.edges.find((e) => e.id === 'F3')
    expect(cond?.condition).toBe('valor > 100000')
    const def = g.edges.find((e) => e.id === 'F4')
    expect(def?.isDefault).toBe(true)
    // o gateway realmente tem duas saídas
    expect(g.edges.filter((e) => e.from === 'Gw')).toHaveLength(2)
  })

  it('é determinístico (mesmo grafo → mesmo XML)', () => {
    expect(generateBpmn(branched)).toBe(generateBpmn(branched))
  })
})
