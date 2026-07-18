/* ─── Compilador BPMN → grafo ───────────────────────────────────────────────────
   Traduz o XML BPMN 2.0 que o designer (bpmn-js) grava para o grafo normalizado
   que o interpretador executa. É AQUI que o diagrama deixa de ser cosmético: a
   ordem de execução passa a vir dos nós/setas/gateways do desenho, não de um
   array linear de steps. Roda no backend, na ativação/salvamento do processo. */

import type { WfEdge, WfGraph, WfNode, WfNodeType } from './types'
import { parseCondition, ConditionError } from './conditions'
import { parseXml, findByLocal, firstByLocal, type XmlNode } from './xml'

export class CompileError extends Error {}

/** BPMN localName → tipo de nó do motor. */
const NODE_TYPE_BY_LOCAL: Record<string, WfNodeType> = {
  startEvent: 'start',
  endEvent: 'end',
  // atividades humanas
  task: 'userTask',
  userTask: 'userTask',
  manualTask: 'userTask',
  // atividades automáticas (conector de domínio)
  serviceTask: 'serviceTask',
  scriptTask: 'serviceTask',
  businessRuleTask: 'serviceTask',
  sendTask: 'serviceTask',
  // gateways
  exclusiveGateway: 'exclusiveGateway',
  parallelGateway: 'parallelGateway',
}

const FLOW_NODE_LOCALS = Object.keys(NODE_TYPE_BY_LOCAL)

/** Lê atributos da nossa extensão (nxt:role, nxt:form, nxt:sla, nxt:connector),
 *  preservando compat: se o designer ainda não os emite, ficam undefined. */
function readExtensions(el: XmlNode): Partial<WfNode> {
  const a = el.attrs
  const out: Partial<WfNode> = {}
  if (a['nxt:role']) out.role = a['nxt:role']
  if (a['nxt:assignee']) out.assignee = a['nxt:assignee']
  if (a['nxt:form']) out.formRef = a['nxt:form']
  if (a['nxt:connector']) out.connector = a['nxt:connector']
  if (a['nxt:sla']) {
    const n = Number(a['nxt:sla'])
    if (!Number.isNaN(n)) out.slaMinutes = n
  }
  return out
}

/** Compila o XML BPMN em um grafo executável. Lança CompileError com mensagem
 *  clara em qualquer inconsistência (nó desconhecido, seta órfã, sem start…). */
export function compileBpmn(xml: string): WfGraph {
  if (!xml || !xml.trim()) throw new CompileError('BPMN vazio')

  let root: XmlNode
  try {
    root = parseXml(xml)
  } catch (e) {
    throw new CompileError(`XML inválido: ${(e as Error).message}`)
  }

  const process = firstByLocal(root, 'process')
  if (!process) throw new CompileError('BPMN sem elemento <process>')

  // ── nós ────────────────────────────────────────────────────────────────────
  const nodes: Record<string, WfNode> = {}
  const starts: string[] = []

  for (const local of FLOW_NODE_LOCALS) {
    for (const el of findByLocal(process, local)) {
      const id = el.attrs.id
      if (!id) throw new CompileError(`Elemento <${el.name}> sem id`)
      if (nodes[id]) continue // já capturado por outro local (não deve ocorrer)
      const type = NODE_TYPE_BY_LOCAL[local]
      nodes[id] = {
        id,
        type,
        name: el.attrs.name || undefined,
        ...readExtensions(el),
      }
      if (type === 'start') starts.push(id)
    }
  }

  // Rejeita explicitamente construções ainda não suportadas (em vez de ignorar
  // em silêncio, que foi o pecado do BPMN cosmético anterior).
  for (const local of ['inclusiveGateway', 'eventBasedGateway', 'complexGateway', 'subProcess', 'intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent']) {
    const found = findByLocal(process, local)
    if (found.length > 0) {
      throw new CompileError(`Construção BPMN ainda não suportada: <${found[0].name}> (id ${found[0].attrs.id}). Suportados: start/end, task/userTask/manualTask, serviceTask/scriptTask, gateway exclusivo e paralelo.`)
    }
  }

  if (starts.length === 0) throw new CompileError('BPMN sem evento de início (startEvent)')
  if (starts.length > 1) throw new CompileError(`BPMN com ${starts.length} eventos de início — o motor suporta apenas um`)

  // ── raias (lanes) → executor por papel ──────────────────────────────────────
  // Cada <bpmn:lane name="Gestor"> lista os nós que pertencem àquele papel via
  // <bpmn:flowNodeRef>. O papel do nó vira o executor. Um `nxt:role` explícito na
  // atividade tem precedência sobre a raia.
  for (const lane of findByLocal(process, 'lane')) {
    const role = lane.attrs.name
    if (!role) continue
    for (const ref of findByLocal(lane, 'flowNodeRef')) {
      const nodeId = ref.text.trim()
      const node = nodes[nodeId]
      if (node && !node.role) node.role = role
    }
  }

  // ── arestas (sequenceFlow) ──────────────────────────────────────────────────
  const edges: WfEdge[] = []
  for (const el of findByLocal(process, 'sequenceFlow')) {
    const id = el.attrs.id
    const from = el.attrs.sourceRef
    const to = el.attrs.targetRef
    if (!id || !from || !to) throw new CompileError(`sequenceFlow "${id ?? '?'}" sem id/sourceRef/targetRef`)
    if (!nodes[from]) throw new CompileError(`sequenceFlow "${id}" parte de nó inexistente "${from}"`)
    if (!nodes[to]) throw new CompileError(`sequenceFlow "${id}" chega em nó inexistente "${to}"`)

    const condEl = firstByLocal(el, 'conditionExpression')
    const condition = condEl?.text?.trim() || undefined
    if (condition) {
      try {
        parseCondition(condition)
      } catch (e) {
        if (e instanceof ConditionError) {
          throw new CompileError(`Condição inválida na seta "${id}": ${e.message}`)
        }
        throw e
      }
    }

    edges.push({ id, from, to, condition })
  }

  // ── fluxo default dos gateways ──────────────────────────────────────────────
  // O atributo `default="Flow_x"` no gateway marca a seta default.
  for (const local of ['exclusiveGateway', 'parallelGateway']) {
    for (const el of findByLocal(process, local)) {
      const def = el.attrs.default
      if (!def) continue
      const edge = edges.find((e) => e.id === def)
      if (edge) edge.isDefault = true
    }
  }

  // ── validações de integridade ───────────────────────────────────────────────
  for (const id of Object.keys(nodes)) {
    const node = nodes[id]
    const outs = edges.filter((e) => e.from === id)
    if (node.type === 'end') {
      if (outs.length > 0) throw new CompileError(`Evento de fim "${id}" não pode ter saída`)
    } else if (node.type === 'exclusiveGateway') {
      // precisa de uma saída; recomenda-se default para garantir caminho
      if (outs.length === 0) throw new CompileError(`Gateway "${id}" sem saída`)
    } else {
      // start / userTask / serviceTask / parallelGateway — todos precisam de saída
      if (outs.length === 0) {
        throw new CompileError(`Nó "${id}" (${node.type}) não tem saída — o fluxo fica preso`)
      }
    }
  }

  return { nodes, edges, startId: starts[0] }
}
