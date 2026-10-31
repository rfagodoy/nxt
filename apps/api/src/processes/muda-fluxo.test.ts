import { describe, it, expect } from 'vitest'
import { mudaOFluxo } from './processes.service'

/* Decisão do PO (30/10/2026): arrumar o DESENHO de um workflow ativo (posições, raias,
   ordem das raias) não o devolve a rascunho. Só o que muda o que o motor executa conta. */

const blocos = { versao: 1, inicioId: 'i', fimId: 'f', itens: [{ id: 'a', tipo: 'atividade' }] }
const base = {
  steps: [{ stepId: 'a', stepName: 'Revisar', stepType: 'userTask', fields: [] }],
  graph: { nodes: [{ id: 'a', type: 'userTask', name: 'Revisar' }], edges: [{ id: 'e1', from: 'i', to: 'a' }] },
  blocos,
  desenho: { versao: 1, posicoes: { a: { x: 100, y: 80 } }, raias: [{ id: 'r1', nome: 'Jurídico', altura: 160 }] },
}
const antes = { bpmnXml: '<definitions>gerado na ativação</definitions>', formSchema: base }

describe('mudaOFluxo', () => {
  it('mover formas, redimensionar ou renomear raia NÃO muda o fluxo', () => {
    const novo = { ...base, desenho: { versao: 1, posicoes: { a: { x: 340, y: 210 } }, raias: [{ id: 'r1', nome: 'Jurídico interno', altura: 220 }] } }
    expect(mudaOFluxo(antes, { formSchema: novo, bpmnXml: '<definitions>gerado no editor</definitions>' })).toBe(false)
  })

  it('posições do editor antigo e ordem das raias também são só visuais', () => {
    const novo = { ...base, positions: { a: { x: 1, y: 2 } }, positionsRaia: { a: { x: 3, y: 4 } }, laneOrder: ['Jurídico', 'Compras'] }
    expect(mudaOFluxo(antes, { formSchema: novo })).toBe(false)
  })

  it('a ordem das chaves no JSON gravado não conta como mudança', () => {
    const { desenho, blocos: b, graph, steps } = base
    expect(mudaOFluxo(antes, { formSchema: { desenho, blocos: b, graph, steps } })).toBe(false)
  })

  it('mudar uma etapa, uma seta ou quem pode iniciar MUDA o fluxo', () => {
    expect(mudaOFluxo(antes, { formSchema: { ...base, steps: [{ ...base.steps[0], stepName: 'Aprovar' }] } })).toBe(true)
    expect(mudaOFluxo(antes, { formSchema: { ...base, graph: { ...base.graph, edges: [] } } })).toBe(true)
    expect(mudaOFluxo(antes, { formSchema: { ...base, quemInicia: { modo: 'PAPEIS', regras: [] } } })).toBe(true)
  })

  it('sem blocos (editor antigo), o BPMN enviado é o fluxo: XML diferente muda', () => {
    const { blocos: _b, ...semBlocos } = base
    const antigo = { bpmnXml: '<a/>', formSchema: semBlocos }
    expect(mudaOFluxo(antigo, { formSchema: semBlocos, bpmnXml: '<a/>' })).toBe(false)
    expect(mudaOFluxo(antigo, { formSchema: semBlocos, bpmnXml: '<b/>' })).toBe(true)
  })

  it('gravação sem diagrama nem campos (só renomear) não muda o fluxo', () => {
    expect(mudaOFluxo(antes, {})).toBe(false)
  })
})
