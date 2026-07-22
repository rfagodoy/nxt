/* ─── Auto-layout do editor de fluxo (Storyboard) ──────────────────────────────
   Recebe o grafo {nós, arestas} e devolve posições IMPECÁVEIS: o fluxo principal
   fica numa linha reta (mesma faixa) e as ramificações abrem simétricas. Puro e
   determinístico (testável) — a tela só desenha o que esta função posiciona.

   Estratégia (layered):
   - COLUNA (x) = maior caminho a partir do início (rank topológico).
   - FAIXA (lane, inteiro) por nó: início na faixa 0; num gateway EXCLUSIVO a saída
     PADRÃO segue reto (faixa 0 relativa) e as condicionais abrem ±1, ±2…; num
     PARALELO todas as saídas abrem simétricas; num nó de junção (várias entradas)
     a faixa volta para a mais próxima do eixo (reencontro no centro).
   - y = faixa × espaçamento (grande o bastante para nunca sobrepor). */

export type FlowNodeType = 'start' | 'end' | 'userTask' | 'serviceTask' | 'exclusiveGateway' | 'parallelGateway'

export interface FlowNode { id: string; type: FlowNodeType; name?: string }
export interface FlowEdge { id: string; from: string; to: string; condition?: string; isDefault?: boolean; label?: string }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[]; startId: string }

export interface PositionedNode { id: string; x: number; y: number; w: number; h: number; rank: number; lane: number }
export interface LayoutResult { nodes: Record<string, PositionedNode>; width: number; height: number }

const COL_GAP = 72          // espaço horizontal entre colunas
const BRANCH_GAP = 150      // distância vertical entre faixas (≥ altura do card + folga)
const MARGIN = 40

/** Dimensões de cada tipo de nó. Gateways: FORK (com rótulo) vs JUNÇÃO (losango pequeno). */
export function nodeSize(node: FlowNode, _outDeg: number, _inDeg: number): { w: number; h: number } {
  switch (node.type) {
    case 'start':
    case 'end':
      return { w: 60, h: 60 }
    case 'userTask':
    case 'serviceTask':
      return { w: 190, h: 108 }
    case 'exclusiveGateway':
    case 'parallelGateway': {
      // com rótulo = pílula (decisão/paralelo); sem rótulo = losango pequeno (junção)
      if (node.name) return { w: node.type === 'exclusiveGateway' ? 156 : 128, h: 46 }
      return { w: 38, h: 38 }
    }
  }
}

export function layoutGraph(graph: FlowGraph, manual?: Record<string, { x: number; y: number }>): LayoutResult {
  const { nodes, edges, startId } = graph
  const outEdges: Record<string, FlowEdge[]> = {}
  const inEdges: Record<string, FlowEdge[]> = {}
  for (const n of nodes) { outEdges[n.id] = []; inEdges[n.id] = [] }
  for (const e of edges) { if (outEdges[e.from]) outEdges[e.from].push(e); if (inEdges[e.to]) inEdges[e.to].push(e) }

  // ── rank (coluna) = maior caminho a partir do início (Kahn) ──
  const indeg: Record<string, number> = {}
  for (const n of nodes) indeg[n.id] = inEdges[n.id].length
  const rank: Record<string, number> = {}
  for (const n of nodes) rank[n.id] = 0
  const topo: string[] = []
  const q: string[] = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
  // garante o start primeiro
  q.sort((a) => (a === startId ? -1 : 0))
  const indegWork = { ...indeg }
  while (q.length) {
    const u = q.shift()!
    topo.push(u)
    for (const e of outEdges[u]) {
      if (rank[e.to] < rank[u] + 1) rank[e.to] = rank[u] + 1
      if (--indegWork[e.to] === 0) q.push(e.to)
    }
  }
  // nós não alcançados (ciclo/desconexo) entram no fim, rank preservado
  for (const n of nodes) if (!topo.includes(n.id)) topo.push(n.id)

  // eventos de FIM sempre na ÚLTIMA coluna — evita o "Fim" colar no "Início"
  // quando o fluxo fica sem atividades (ambos cairiam no rank 0).
  const endIds = nodes.filter((n) => n.type === 'end').map((n) => n.id)
  if (endIds.length) {
    const maxOther = Math.max(0, ...nodes.filter((n) => n.type !== 'end').map((n) => rank[n.id]))
    for (const id of endIds) rank[id] = Math.max(rank[id], maxOther + 1)
  }

  // ── offset de faixa por aresta de FORK ──
  const edgeOffset: Record<string, number> = {}
  for (const n of nodes) {
    const outs = outEdges[n.id]
    if (outs.length <= 1) { for (const e of outs) edgeOffset[e.id] = 0; continue }
    if (n.type === 'exclusiveGateway') {
      // saída PADRÃO (default, ou sem condição) segue reto; condicionais abrem ±
      const def = outs.find((e) => e.isDefault) ?? outs.find((e) => !e.condition) ?? outs[0]
      let k = 1
      for (const e of outs) {
        if (e === def) { edgeOffset[e.id] = 0; continue }
        edgeOffset[e.id] = k % 2 === 1 ? Math.ceil(k / 2) : -Math.ceil(k / 2) // +1,-1,+2,-2…
        k++
      }
    } else {
      // paralelo (ou fork genérico): todas simétricas ao redor do eixo
      for (let i = 0; i < outs.length; i++) edgeOffset[outs[i].id] = symmetricOffset(i, outs.length)
    }
  }

  // ── faixa (lane) por nó, em ordem topológica ──
  const lane: Record<string, number> = {}
  lane[startId] = 0
  for (const id of topo) {
    if (id === startId) { lane[id] = 0; continue }
    const ins = inEdges[id]
    if (ins.length === 0) { lane[id] = 0; continue }
    if (ins.length === 1) {
      const e = ins[0]
      lane[id] = (lane[e.from] ?? 0) + (edgeOffset[e.id] ?? 0)
    } else {
      // junção: volta para a faixa mais próxima do eixo entre as entradas
      const preds = ins.map((e) => lane[e.from] ?? 0)
      const minAbs = Math.min(...preds.map((v) => Math.abs(v)))
      const tied = preds.filter((v) => Math.abs(v) === minAbs)
      lane[id] = Math.round(tied.reduce((a, b) => a + b, 0) / tied.length)
    }
  }

  // ── anti-colisão: nós no MESMO rank não podem dividir a mesma faixa ──
  const byRank: Record<number, string[]> = {}
  for (const n of nodes) (byRank[rank[n.id]] ??= []).push(n.id)
  for (const ids of Object.values(byRank)) {
    const used = new Set<number>()
    ids.sort((a, b) => (lane[a] ?? 0) - (lane[b] ?? 0))
    for (const id of ids) {
      let L = lane[id] ?? 0
      while (used.has(L)) L += L >= 0 ? 1 : -1
      lane[id] = L
      used.add(L)
    }
  }

  // ── dimensões ──
  const size: Record<string, { w: number; h: number }> = {}
  for (const n of nodes) size[n.id] = nodeSize(n, outEdges[n.id].length, inEdges[n.id].length)

  // ── x por coluna (largura máxima da coluna + gap) ──
  const maxRank = Math.max(0, ...nodes.map((n) => rank[n.id]))
  const colW: number[] = new Array(maxRank + 1).fill(0)
  for (const n of nodes) colW[rank[n.id]] = Math.max(colW[rank[n.id]], size[n.id].w)
  const colLeft: number[] = new Array(maxRank + 1).fill(0)
  for (let r = 1; r <= maxRank; r++) colLeft[r] = colLeft[r - 1] + colW[r - 1] + COL_GAP

  // ── posições ──
  const lanes = nodes.map((n) => lane[n.id] ?? 0)
  const minLane = Math.min(0, ...lanes)
  const positioned: Record<string, PositionedNode> = {}
  let maxX = 0
  let maxY = 0
  for (const n of nodes) {
    const s = size[n.id]
    const r = rank[n.id]
    const x = MARGIN + colLeft[r] + (colW[r] - s.w) / 2 // centralizado na coluna
    const yCenter = MARGIN + (lane[n.id] - minLane) * BRANCH_GAP + s.h / 2 // faixa 0 no topo relativo
    const y = yCenter - s.h / 2
    positioned[n.id] = { id: n.id, x, y, w: s.w, h: s.h, rank: r, lane: lane[n.id] ?? 0 }
    maxX = Math.max(maxX, x + s.w)
    maxY = Math.max(maxY, y + s.h)
  }

  // ── posições MANUAIS (override do auto) ──
  if (manual) {
    for (const n of nodes) {
      const m = manual[n.id]
      if (!m) continue
      const p = positioned[n.id]
      p.x = Math.max(MARGIN, m.x)
      p.y = Math.max(MARGIN, m.y)
    }
    maxX = 0; maxY = 0
    for (const id of Object.keys(positioned)) { const p = positioned[id]; maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h) }
  }

  return { nodes: positioned, width: maxX + MARGIN, height: maxY + MARGIN }
}

/** Offsets simétricos ao redor do eixo para k saídas: k par → ±1,±2…; k ímpar → 0,±1,±2… */
function symmetricOffset(i: number, k: number): number {
  if (k % 2 === 1) return i - (k - 1) / 2
  // par: pula o 0 → -m,…,-1,1,…,m
  const half = k / 2
  const pos = i < half ? i - half : i - half + 1 // i<half → negativos; senão positivos (pula 0)
  return pos
}
