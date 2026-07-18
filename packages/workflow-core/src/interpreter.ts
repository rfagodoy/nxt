/* ─── Interpretador por token ──────────────────────────────────────────────────
   O motor de execução do grafo. É PURO: recebe (grafo, estado, evento) e devolve
   (próximo estado, efeitos). Não toca banco nem domínio — descreve o que precisa
   acontecer via WfEffect, e o backend materializa.

   Modelo de execução (semântica de token, à la BPMN):
   - Um TOKEN representa "o processo está aqui". Nós automáticos (start/gateway/end)
     são atravessados na hora; nós de espera (userTask/serviceTask) fazem o token
     DESCANSAR até um evento externo (pessoa conclui / serviço retorna).
   - `startProcess` coloca um token no start e propaga até os pontos de espera.
   - `completeToken` retoma um token que descansava, mescla os dados coletados nas
     variáveis, e propaga a partir dali.
   - A instância CONCLUI quando não sobra nenhum token descansando. */

import type {
  WfEdge,
  WfEffect,
  WfGraph,
  WfNode,
  WfRunResult,
  WfRuntime,
  WfState,
} from './types'
import { evalCondition } from './conditions'

export class WfError extends Error {}

/** Trava contra laço infinito de nós automáticos (gateway sempre-verdadeiro em
 *  ciclo). Cada passo do worklist consome uma iteração. */
const MAX_STEPS = 10_000

const outgoing = (g: WfGraph, nodeId: string): WfEdge[] => g.edges.filter((e) => e.from === nodeId)
const incoming = (g: WfGraph, nodeId: string): WfEdge[] => g.edges.filter((e) => e.to === nodeId)

/** Escolhe a única saída de um gateway exclusivo: primeira condição verdadeira,
 *  na ordem; se nenhuma casar, o fluxo `default`. Erro se nada casar. */
function pickExclusive(outs: WfEdge[], vars: Record<string, unknown>): WfEdge {
  for (const e of outs) {
    if (e.isDefault) continue
    if (evalCondition(e.condition, vars)) return e
  }
  const def = outs.find((e) => e.isDefault)
  if (def) return def
  throw new WfError('Gateway exclusivo: nenhuma condição casou e não há fluxo default')
}

/** Propaga tokens a partir de uma lista de nós "recém-alcançados". Muta `state`
 *  e `effects` (ambos locais à operação — o chamador já clonou o estado). */
function propagate(
  graph: WfGraph,
  state: WfState,
  arrivals: string[],
  rt: WfRuntime,
  effects: WfEffect[],
): void {
  const queue = [...arrivals]
  let steps = 0

  while (queue.length > 0) {
    if (++steps > MAX_STEPS) {
      throw new WfError('Execução excedeu o limite de passos (possível laço infinito no diagrama)')
    }

    const nodeId = queue.shift() as string
    const node: WfNode | undefined = graph.nodes[nodeId]
    if (!node) throw new WfError(`Nó "${nodeId}" não existe no grafo`)

    switch (node.type) {
      case 'start': {
        for (const e of outgoing(graph, nodeId)) queue.push(e.to)
        break
      }

      case 'end': {
        // token consumido; a checagem de conclusão acontece ao esvaziar a fila
        break
      }

      case 'userTask':
      case 'serviceTask': {
        // ponto de espera: cria token que descansa aqui e emite o efeito
        const token = { id: rt.genId(), nodeId }
        state.tokens.push(token)
        effects.push({
          kind: node.type === 'userTask' ? 'createTask' : 'runService',
          token,
          node,
        })
        break
      }

      case 'exclusiveGateway': {
        const chosen = pickExclusive(outgoing(graph, nodeId), state.variables)
        queue.push(chosen.to)
        break
      }

      case 'parallelGateway': {
        // Semântica BPMN: sincroniza TODAS as entradas, depois ativa TODAS as saídas.
        const need = incoming(graph, nodeId).length
        const have = (state.joinCounts[nodeId] ?? 0) + 1
        if (need > 1 && have < need) {
          state.joinCounts[nodeId] = have // ainda faltam ramos: aguarda
          break
        }
        state.joinCounts[nodeId] = 0 // sincronizou (ou não era join): dispara
        for (const e of outgoing(graph, nodeId)) queue.push(e.to)
        break
      }

      default: {
        const _exhaustive: never = node.type
        throw new WfError(`Tipo de nó não suportado: ${_exhaustive}`)
      }
    }
  }

  // Conclusão: rodando e sem tokens descansando → acabou.
  if (state.status === 'running' && state.tokens.length === 0) {
    state.status = 'completed'
    effects.push({ kind: 'completed' })
  }
}

/** Inicia uma instância: token no start, propaga até os pontos de espera. */
export function startProcess(
  graph: WfGraph,
  initialVars: Record<string, unknown>,
  rt: WfRuntime,
): WfRunResult {
  if (!graph.nodes[graph.startId]) throw new WfError('Grafo sem nó start válido')

  const state: WfState = {
    status: 'running',
    tokens: [],
    variables: { ...initialVars },
    joinCounts: {},
  }
  const effects: WfEffect[] = []
  propagate(graph, state, [graph.startId], rt, effects)
  return { state, effects }
}

/** Retoma um token que descansava (conclusão de userTask ou retorno de
 *  serviceTask), mescla os dados coletados nas variáveis e propaga adiante. */
export function completeToken(
  graph: WfGraph,
  prev: WfState,
  tokenId: string,
  data: Record<string, unknown>,
  rt: WfRuntime,
): WfRunResult {
  if (prev.status !== 'running') {
    throw new WfError(`Instância não está em execução (status: ${prev.status})`)
  }

  const state: WfState = structuredClone(prev)
  const idx = state.tokens.findIndex((t) => t.id === tokenId)
  if (idx === -1) throw new WfError(`Token "${tokenId}" não está ativo nesta instância`)

  const token = state.tokens[idx]
  const node = graph.nodes[token.nodeId]
  if (!node) throw new WfError(`Nó "${token.nodeId}" do token não existe no grafo`)

  // acumula os dados coletados nas variáveis do processo
  state.variables = { ...state.variables, ...data }

  // remove o token que descansava e propaga a partir das saídas do nó
  state.tokens.splice(idx, 1)
  const effects: WfEffect[] = []
  propagate(graph, state, outgoing(graph, token.nodeId).map((e) => e.to), rt, effects)
  return { state, effects }
}

/** Cancela a instância (parada humana). */
export function cancelProcess(prev: WfState): WfState {
  if (prev.status !== 'running') return prev
  return { ...structuredClone(prev), status: 'canceled', tokens: [] }
}

/** Contador simples de ids — útil para o backend e para testes determinísticos. */
export function makeCounterRuntime(prefix = 'tok'): WfRuntime {
  let n = 0
  return { genId: () => `${prefix}-${++n}` }
}
