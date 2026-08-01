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

/* ─── DEVOLVER (retorno a uma etapa anterior) ────────────────────────────────
   O motor nunca teve direção: `propagate` só segue arestas. O que faltava era a
   PESSOA poder mandar o processo de volta sem que isso estivesse desenhado.

   `returnToken` reposiciona o token numa atividade anterior. A regra que mantém o
   estado consistente é UMA só:

     ao devolver para T, descarte todo token no sub-grafo alcançável a partir de T
     e zere o joinCounts de toda junção nesse sub-grafo; depois ponha um token em T.

   É ela que resolve o caso paralelo: devolver de um ramo cancela o ramo IRMÃO e
   destrava a junção — que senão ficaria esperando para sempre um ramo que deixou
   de existir. As variáveis são preservadas (a pessoa reabre o formulário
   preenchido e corrige). */

/** Política efetiva de um nó ao devolver atravessando-o. Ausente = BLOCK.
 *  - IDEMPOTENT: reexecutar não causa dano → liberado.
 *  - COMPENSATE: tem inversa (o backend a roda na devolução) → liberado.
 *  - BLOCK (padrão): bloqueia.
 *  O motor confia na flag; a garantia de que existe uma inversa para COMPENSATE é
 *  validada na ATIVAÇÃO do processo (backend), não aqui. */
const crossingBlocked = (n: WfNode): boolean =>
  n.type === 'serviceTask' && (n.onReturn ?? 'BLOCK') === 'BLOCK'

export interface WfReturnTarget {
  nodeId: string
  name?: string
  /** Quando presente, o alvo NÃO pode ser usado; explica o porquê. */
  blockedBy?: string
}

/** Alvos de devolução a partir do token atual: atividades humanas ANTERIORES.
 *
 *  Ancestral = nó a partir do qual o nó atual é alcançável. A busca é para trás
 *  com guarda de visitados — obrigatória, porque o grafo PODE TER CICLO (um laço
 *  de reprovação desenhado); sem ela isto não terminaria.
 *
 *  Conservador de propósito: se EXISTE algum caminho do alvo até aqui que cruza
 *  uma ação automática bloqueante, o alvo é recusado — seguir em frente de novo
 *  poderia reexecutá-la e duplicar a operação de domínio. */
export function returnTargets(graph: WfGraph, state: WfState, tokenId: string): WfReturnTarget[] {
  const token = state.tokens.find((t) => t.id === tokenId)
  if (!token) throw new WfError(`Token "${tokenId}" não está ativo nesta instância`)

  const clean = new Set<string>()
  const blocked = new Map<string, string>()
  const seen = new Set<string>()
  const queue: Array<{ id: string; crossed: boolean; blocker?: string }> = [{ id: token.nodeId, crossed: false }]

  while (queue.length > 0) {
    const cur = queue.shift() as { id: string; crossed: boolean; blocker?: string }
    const key = `${cur.id}|${cur.crossed ? 1 : 0}`
    if (seen.has(key)) continue
    seen.add(key)

    for (const e of incoming(graph, cur.id)) {
      const p = graph.nodes[e.from]
      if (!p) continue
      // cruzar uma ação automática bloqueante contamina tudo que vem ANTES dela
      const crossed = cur.crossed || crossingBlocked(p)
      const blocker = crossingBlocked(p) ? (p.name ?? p.id) : cur.blocker
      if (p.type === 'userTask' && p.id !== token.nodeId) {
        if (crossed) { if (!blocked.has(p.id)) blocked.set(p.id, blocker as string) }
        else clean.add(p.id)
      }
      queue.push({ id: p.id, crossed, blocker })
    }
  }

  const out: WfReturnTarget[] = []
  for (const id of clean) if (!blocked.has(id)) out.push({ nodeId: id, name: graph.nodes[id]?.name })
  for (const [id, blocker] of blocked) out.push({ nodeId: id, name: graph.nodes[id]?.name, blockedBy: blocker })
  return aplicarPolitica(out, graph.nodes[token.nodeId])
}

/** Aplica a política de devolução configurada na atividade de ORIGEM (de onde se volta).
 *  Só ESTREITA o conjunto que o motor calculou: um alvo bloqueado por ação automática
 *  continua bloqueado mesmo que o desenhista o tenha escolhido — quem decide o que é
 *  seguro refazer é o motor, não o desenho. Sem isso, marcar "pode voltar para a etapa 1"
 *  atravessando um aditivo já lançado o lançaria de novo. */
function aplicarPolitica(alvos: WfReturnTarget[], origem?: WfNode): WfReturnTarget[] {
  const pol = origem?.returnPolicy
  if (!pol || pol.mode === 'ANY') return alvos
  if (pol.mode === 'NONE') return []
  const escolhidos = new Set(pol.nodeIds ?? [])
  return alvos.filter((t) => escolhidos.has(t.nodeId))
}

/** Nós alcançáveis a partir de `from` (inclusive) — o sub-grafo DESCARTADO numa
 *  devolução para `from`. Público para o backend saber quais ações compensáveis
 *  precisam ser desfeitas (as que executaram dentro deste sub-grafo). */
export function nodesReachableFrom(graph: WfGraph, from: string): string[] {
  return [...reachableFrom(graph, from)]
}

/** Sub-grafo alcançável a partir de `from` (inclusive). Guarda de visitados
 *  porque o grafo pode ter ciclo. */
function reachableFrom(graph: WfGraph, from: string): Set<string> {
  const seen = new Set<string>([from])
  const queue = [from]
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const e of outgoing(graph, id)) {
      if (seen.has(e.to)) continue
      seen.add(e.to)
      queue.push(e.to)
    }
  }
  return seen
}

/** Devolve o processo para uma atividade anterior. Descarta o que estiver em voo
 *  abaixo do alvo (emitindo `cancelTask`), zera as junções afetadas e recria a
 *  tarefa no alvo. Preserva as variáveis. */
export function returnToken(
  graph: WfGraph,
  prev: WfState,
  tokenId: string,
  targetNodeId: string,
  rt: WfRuntime,
): WfRunResult {
  if (prev.status !== 'running') {
    throw new WfError(`Instância não está em execução (status: ${prev.status})`)
  }

  const target = graph.nodes[targetNodeId]
  if (!target) throw new WfError(`Etapa "${targetNodeId}" não existe no grafo`)
  if (target.type !== 'userTask') throw new WfError('Só é possível devolver para uma atividade humana')

  const allowed = returnTargets(graph, prev, tokenId)
  const chosen = allowed.find((t) => t.nodeId === targetNodeId)
  if (!chosen) throw new WfError('Etapa não é anterior a esta no fluxo')
  if (chosen.blockedBy) {
    throw new WfError(`Não é possível devolver: a ação automática "${chosen.blockedBy}" já foi executada e seria refeita`)
  }

  const state: WfState = structuredClone(prev)
  const effects: WfEffect[] = []

  // 1) descarta TODO token no sub-grafo do alvo (inclui o próprio token atual e,
  //    num fork, os ramos irmãos) — cada um vira um cancelTask para o backend.
  const sub = reachableFrom(graph, targetNodeId)
  const kept: typeof state.tokens = []
  for (const t of state.tokens) {
    if (sub.has(t.nodeId)) effects.push({ kind: 'cancelTask', token: t })
    else kept.push(t)
  }
  state.tokens = kept

  // 2) zera as junções do sub-grafo: chegadas parciais de ramos que acabaram de
  //    ser descartados não podem contar quando o fluxo passar por aqui de novo.
  for (const id of sub) {
    if (graph.nodes[id]?.type === 'parallelGateway') delete state.joinCounts[id]
  }

  // 3) recoloca o processo no alvo (propagate cria o token + o efeito createTask)
  propagate(graph, state, [targetNodeId], rt, effects)
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
