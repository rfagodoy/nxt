import { describe, it, expect } from 'vitest'
import { mudaOFluxo } from './processes.service'
import { blocosParaDesenho, desenhoParaBlocos } from '@nxt/workflow-core'

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

describe('mudaOFluxo — desenho v2 (desenho livre)', () => {
  const v2 = (setas: Array<{ id: string; de: string; para: string }>, posA = { x: 1, y: 1 }) => ({
    versao: 2, formas: [{ id: 'i', tipo: 'start' }, { id: 'a', tipo: 'userTask' }, { id: 'f', tipo: 'end' }],
    setas, posicoes: { a: posA }, raias: [],
  })
  const setas = [{ id: 's1', de: 'i', para: 'a' }, { id: 's2', de: 'a', para: 'f' }]
  const comV2 = { ...base, desenho: v2(setas) }
  const antesV2 = { bpmnXml: '<x/>', formSchema: comV2 }

  it('só mover formas no v2 NÃO muda o fluxo', () => {
    expect(mudaOFluxo(antesV2, { formSchema: { ...comV2, desenho: v2(setas, { x: 500, y: 300 }) } })).toBe(false)
  })
  it('mudar uma seta do v2 MUDA o fluxo', () => {
    expect(mudaOFluxo(antesV2, { formSchema: { ...comV2, desenho: v2([setas[0]]) } })).toBe(true)
  })
})

describe('mudaOFluxo — 1º salvamento de um ativo em blocos que abriu como desenho v2', () => {
  /* Revisão final (30/10/2026): o editor migra o workflow em blocos para o desenho v2 ao
     abrir; o 1º salvamento traz o desenho v2, um grafo com o losango que junta e o id do
     "senão" vazio regenerado. Nada disso muda o que o motor executa. */
  const fluxoAntes = {
    versao: 1, inicioId: 'i', fimId: 'f', itens: [
      { kind: 'atividade', id: 'a', tipo: 'userTask' },
      { kind: 'escolha', id: 'e', modo: 'primeiro', caminhos: [{ id: 'c1', condition: 'x', itens: [{ kind: 'atividade', id: 'b', tipo: 'userTask' }], fim: { tipo: 'segue' } }],
        casoContrario: { id: 'cc_antigo', itens: [], fim: { tipo: 'segue' } } },
    ],
  }
  const steps = [{ stepId: 'a', stepName: 'A', stepType: 'userTask', fields: [] }, { stepId: 'b', stepName: 'B', stepType: 'userTask', fields: [] }]
  const antigo = { bpmnXml: '<x/>', formSchema: { steps, blocos: fluxoAntes, graph: { nodes: [], edges: [] }, desenho: { versao: 1, posicoes: { a: { x: 0, y: 0 } }, raias: [] } } }
  const migrado = (condicao: string) => {
    const desenho = blocosParaDesenho(fluxoAntes as never, { posicoes: { a: { x: 40, y: 0 } }, raias: [] })
    desenho.setas = desenho.setas.map((s) => (s.id === 'c1' ? { ...s, condition: condicao } : s))
    const c = desenhoParaBlocos(desenho)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    return { steps, blocos: c.fluxo, graph: { nodes: [{ id: 'e__fim' }], edges: [] }, desenho }
  }
  it('só abrir e mover uma forma: continua ativo', () => {
    expect(mudaOFluxo(antigo, { formSchema: migrado('x') })).toBe(false)
  })
  it('mudar a condição de um caminho: volta a rascunho', () => {
    expect(mudaOFluxo(antigo, { formSchema: migrado('y') })).toBe(true)
  })
})
