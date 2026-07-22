/* ─── Gerador grafo → BPMN mínimo ──────────────────────────────────────────────
   Caminho inverso do compile.ts. A tela de Storyboard edita um grafo {nós, arestas};
   ao salvar, geramos um BPMN 2.0 "semântico" (sem layout/DI — o compilador ignora
   coordenadas) que `compileBpmn` volta a compilar. Assim o Storyboard é a superfície
   de autoria e o motor continua rodando o MESMO pipeline (bpmnXml → compileBpmn →
   grafo). Propriedade central: `compileBpmn(generateBpmn(g))` reproduz `g`
   (estrutura + condições). A config rica por etapa (executor/conector/telas/prazos/
   instruções) NÃO viaja aqui — mora em `formSchema.steps` e é mesclada na ativação. */

import type { WfGraph, WfNodeType } from './types'

/** tipo do motor → localName do elemento BPMN emitido. */
const BPMN_LOCAL_BY_TYPE: Record<WfNodeType, string> = {
  start: 'startEvent',
  end: 'endEvent',
  userTask: 'userTask',
  serviceTask: 'serviceTask',
  exclusiveGateway: 'exclusiveGateway',
  parallelGateway: 'parallelGateway',
}

const escAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Serializa um grafo do motor em BPMN 2.0 mínimo (sem `bpmndi`). O resultado é
 *  estável e determinístico (mesma entrada → mesma saída), útil para diff/versão. */
export function generateBpmn(graph: WfGraph): string {
  const { nodes, edges } = graph
  const L: string[] = []
  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push(
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
      'xmlns:nxt="http://nxt.app/bpmn">',
  )
  L.push('  <bpmn:process id="Process_1" isExecutable="true">')

  for (const id of Object.keys(nodes)) {
    const node = nodes[id]
    const local = BPMN_LOCAL_BY_TYPE[node.type]
    const attrs: string[] = [`id="${escAttr(id)}"`]
    if (node.name) attrs.push(`name="${escAttr(node.name)}"`)
    // extensões nxt: (lidas por readExtensions no compile). A config rica vem do
    // formSchema; aqui só carregamos o que o compilador sabe reler estruturalmente.
    if (node.role) attrs.push(`nxt:role="${escAttr(node.role)}"`)
    if (node.assignee) attrs.push(`nxt:assignee="${escAttr(node.assignee)}"`)
    if (node.formRef) attrs.push(`nxt:form="${escAttr(node.formRef)}"`)
    if (node.connector) attrs.push(`nxt:connector="${escAttr(node.connector)}"`)
    if (typeof node.slaMinutes === 'number') attrs.push(`nxt:sla="${node.slaMinutes}"`)
    // seta default do gateway
    if (node.type === 'exclusiveGateway' || node.type === 'parallelGateway') {
      const def = edges.find((e) => e.from === id && e.isDefault)
      if (def) attrs.push(`default="${escAttr(def.id)}"`)
    }
    L.push(`    <bpmn:${local} ${attrs.join(' ')} />`)
  }

  for (const edge of edges) {
    const attrs = `id="${escAttr(edge.id)}" sourceRef="${escAttr(edge.from)}" targetRef="${escAttr(edge.to)}"`
    if (edge.condition) {
      L.push(`    <bpmn:sequenceFlow ${attrs}>`)
      L.push(`      <bpmn:conditionExpression>${escText(edge.condition)}</bpmn:conditionExpression>`)
      L.push('    </bpmn:sequenceFlow>')
    } else {
      L.push(`    <bpmn:sequenceFlow ${attrs} />`)
    }
  }

  L.push('  </bpmn:process>')
  L.push('</bpmn:definitions>')
  return L.join('\n')
}
