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
   - y = faixa × espaçamento (grande o bastante para nunca sobrepor); cada faixa tem um
     EIXO e todo nó é centrado nele, para a seta entre formas de alturas diferentes
     (losango de 56px × cartão de ~130px) sair reta. */

export type FlowNodeType = 'start' | 'end' | 'userTask' | 'serviceTask' | 'exclusiveGateway' | 'parallelGateway'

/** `lane` = RAIA (swimlane) do nó: o papel de quem executa. Quem calcula é o editor
 *  (só ele conhece executor/papel); aqui ela só posiciona. Vazia em evento/gateway —
 *  esses HERDAM a raia do vizinho no fluxo (ver `resolveBands`). */
/** `metaLines` = quantas linhas de rodapé a atividade mostra (executor, unidade, prazo).
 *  Varia por cartão, então a ALTURA acompanha — sem isto, ou o cartão sobra espaço vazio
 *  quando há pouca informação, ou corta a última linha quando há muita. */
export interface FlowNode { id: string; type: FlowNodeType; name?: string; lane?: string; metaLines?: number }
export interface FlowEdge { id: string; from: string; to: string; condition?: string; isDefault?: boolean; label?: string }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[]; startId: string }

export interface PositionedNode { id: string; x: number; y: number; w: number; h: number; rank: number; lane: number }
/** Banda horizontal de uma raia, já posicionada (a tela e o exportador só desenham). */
export interface LaneBand { key: string; label: string; y: number; h: number }
export interface LayoutResult { nodes: Record<string, PositionedNode>; width: number; height: number; lanes?: LaneBand[] }

const COL_GAP = 72          // espaço horizontal entre colunas
const BRANCH_GAP = 168      // distância vertical entre faixas (≥ altura do card MAIS ALTO + folga)
const MARGIN = 40

/* ─── Raias ────────────────────────────────────────────────────────────────────
   A raia é uma VISTA do que já está configurado (o papel do executor), nunca um
   agrupamento à parte — senão o desenho poderia contradizer quem o motor de fato
   aciona. Por isso não há campo "raia" para preencher: ela é derivada.
   Ligada, o layout é automático e as posições MANUAIS são ignoradas (o nó tem de
   ficar dentro da banda dele). Desligada, o canvas é o de sempre. */
export const LANE_HEADER_W = 132 // coluna do rótulo da raia, à esquerda do desenho
export const LANE_PAD = 16       // folga interna da banda
/** Raia das atividades ainda sem executor. Durante a autoria é a maioria — ver o bloco
 *  crescer é diagnóstico de configuração incompleta, não estorvo. */
export const LANE_SEM_RESPONSAVEL = 'Sem responsável'

/* Card da atividade: altura DINÂMICA pela descrição (nome). O restante do card
   (acento + ícone/rótulo + 2 linhas de meta = executor/ação + prazo + paddings) é
   fixo; cada linha do título soma. Assim a caixa "acompanha a descrição" e o prazo
   nunca é cortado. Estimativa determinística (sem medir o DOM) → layout puro/testável. */
const TASK_W = 190
const TITLE_CHARS_PER_LINE = 20 // ~largura útil do título (170px) / ~8.5px por char (13px semibold)
const TITLE_MAX_LINES = 3
const CARD_SHELL_H = 68         // acento + ícone/rótulo + paddings (sem título e sem meta)
const CARD_LINE_H = 17          // altura de cada linha do título
const CARD_META_H = 14          // altura de cada linha de meta (executor, unidade, prazo)
export const CARD_META_PADRAO = 2 // quantas linhas de meta um cartão tem por padrão

/** Nº de linhas que a descrição da atividade ocupa no card (1..MAX). Compartilhado
 *  entre o layout (altura da caixa) e o card (line-clamp) para casarem exatamente. */
export function titleLineCount(name: string | undefined): number {
  const len = (name ?? '').trim().length || 1
  return Math.min(TITLE_MAX_LINES, Math.max(1, Math.ceil(len / TITLE_CHARS_PER_LINE)))
}

/* Eventos e gateways seguem a NOTAÇÃO BPMN: forma de tamanho fixo (círculo / losango) com
   o nome FORA dela, embaixo — como no Bizagi. Por isso o fork ("Decisão") e a junção têm
   exatamente a mesma caixa: o que distingue os dois é o rótulo, não o tamanho. */
export const SYMBOL = 56   // lado do círculo (evento) e do losango (gateway)
export const LABEL_W = 120 // largura do rótulo que fica FORA da forma
export const LABEL_H = 34  // 2 linhas + folga

/** Dimensões de cada tipo de nó. A caixa é a FORMA — o rótulo externo não entra nela
 *  (senão as setas deixariam de encostar na ponta do losango / na borda do círculo). */
export function nodeSize(node: FlowNode, _outDeg: number, _inDeg: number): { w: number; h: number } {
  switch (node.type) {
    case 'start':
    case 'end':
    case 'exclusiveGateway':
    case 'parallelGateway':
      return { w: SYMBOL, h: SYMBOL }
    case 'userTask':
    case 'serviceTask':
      return {
        w: TASK_W,
        h: CARD_SHELL_H + titleLineCount(node.name) * CARD_LINE_H + (node.metaLines ?? CARD_META_PADRAO) * CARD_META_H,
      }
  }
}

/** Quanto o RÓTULO EXTERNO transborda a caixa (só eventos/gateways com nome). Entra apenas
 *  na extensão do desenho — a caixa (e as âncoras das setas) continua sendo a forma. */
function labelOverflow(node: FlowNode): { x: number; y: number } {
  if (node.type === 'userTask' || node.type === 'serviceTask' || !node.name) return { x: 0, y: 0 }
  return { x: Math.max(0, (LABEL_W - SYMBOL) / 2), y: LABEL_H }
}

/** Raia de CADA nó. Atividade traz a sua; evento e gateway HERDAM — primeiro do
 *  antecessor (ordem topológica), depois do sucessor. Assim o losango fica na banda
 *  de quem decide, em vez de atravessar o desenho para uma faixa neutra. */
function resolveBands(nodes: FlowNode[], topo: string[], inEdges: Record<string, FlowEdge[]>, outEdges: Record<string, FlowEdge[]>): Record<string, string> {
  const band: Record<string, string> = {}
  for (const n of nodes) if (n.lane) band[n.id] = n.lane
  for (const id of topo) {
    if (band[id]) continue
    for (const e of inEdges[id] ?? []) if (band[e.from]) { band[id] = band[e.from]; break }
  }
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i]
    if (band[id]) continue
    for (const e of outEdges[id] ?? []) if (band[e.to]) { band[id] = band[e.to]; break }
  }
  // fluxo ainda sem nenhuma atividade (só início/fim): tudo numa banda só
  for (const n of nodes) band[n.id] ??= LANE_SEM_RESPONSAVEL
  return band
}

export function layoutGraph(
  graph: FlowGraph,
  manual?: Record<string, { x: number; y: number }>,
  options?: { swimlanes?: boolean },
): LayoutResult {
  const { nodes, edges, startId } = graph
  const swimlanes = !!options?.swimlanes
  const outEdges: Record<string, FlowEdge[]> = {}
  const inEdges: Record<string, FlowEdge[]> = {}
  for (const n of nodes) { outEdges[n.id] = []; inEdges[n.id] = [] }
  for (const e of edges) { if (outEdges[e.from]) outEdges[e.from].push(e); if (inEdges[e.to]) inEdges[e.to].push(e) }

  /* ── arestas de RETORNO fora do posicionamento ────────────────────────────────
     Devolver para uma etapa anterior é recurso do motor, e cria CICLO no grafo. Kahn
     não alcança nós dentro de um ciclo: todos ficariam no rank 0, empilhados numa
     coluna só. Marca as arestas de volta (DFS: destino ainda na pilha) e posiciona
     apenas o DAG restante. A aresta de retorno continua sendo DESENHADA — ela só não
     manda no rank, na faixa nem em quem é fork/junção. */
  const backEdge = new Set<string>()
  {
    const state: Record<string, 1 | 2> = {}
    const visit = (u: string) => {
      state[u] = 1
      for (const e of outEdges[u] ?? []) {
        if (state[e.to] === 1) { backEdge.add(e.id); continue } // destino na pilha = volta
        if (!state[e.to]) visit(e.to)
      }
      state[u] = 2
    }
    if (outEdges[startId]) visit(startId)
    for (const n of nodes) if (!state[n.id]) visit(n.id)
  }
  const fwdOut: Record<string, FlowEdge[]> = {}
  const fwdIn: Record<string, FlowEdge[]> = {}
  for (const n of nodes) {
    fwdOut[n.id] = outEdges[n.id].filter((e) => !backEdge.has(e.id))
    fwdIn[n.id] = inEdges[n.id].filter((e) => !backEdge.has(e.id))
  }

  // ── rank (coluna) = maior caminho a partir do início (Kahn) ──
  const indeg: Record<string, number> = {}
  for (const n of nodes) indeg[n.id] = fwdIn[n.id].length
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
    for (const e of fwdOut[u]) {
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
    const outs = fwdOut[n.id]
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
    const ins = fwdIn[id]
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

  // raia de cada nó (só importa com swimlanes ligado, mas é barato e deixa o resto puro)
  const band = resolveBands(nodes, topo, fwdIn, fwdOut)

  // ── anti-colisão: nós no MESMO rank não podem dividir a mesma faixa ──
  // Com raias o conflito é por (coluna, RAIA): dois nós na mesma coluna e em bandas
  // diferentes já não se tocam — separá-los aqui só inflaria a altura das bandas.
  const byRank: Record<string, string[]> = {}
  for (const n of nodes) (byRank[swimlanes ? `${rank[n.id]}|${band[n.id]}` : `${rank[n.id]}`] ??= []).push(n.id)
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
  // A faixa tem um EIXO horizontal e todo nó é centrado nele. Sem isso o losango (56px) e o
  // cartão (≈130px) ficariam alinhados pelo TOPO e a seta entre eles sairia torta.
  const rowH = Math.max(...nodes.map((n) => size[n.id].h), 0)
  const offX = swimlanes ? LANE_HEADER_W : 0

  // x de cada nó — precisa vir ANTES do y, porque com raias a linha depende de quem
  // ocupa qual trecho horizontal dentro da banda.
  const xOf: Record<string, number> = {}
  for (const n of nodes) xOf[n.id] = offX + MARGIN + colLeft[rank[n.id]] + (colW[rank[n.id]] - size[n.id].w) / 2

  /* Com RAIAS o y é de duas dimensões: a banda decide o bloco e a LINHA decide onde
     dentro dele. A linha NÃO vem da faixa de ramificação: essa faixa é um offset global
     (±1, ±2, ±3…) que separa ramos ao longo de todo o desenho, e usá-la aqui esparramava
     a banda — "Solicitante" chegava a 6 linhas com os cartões espalhados, cada um numa
     coluna diferente. Dentro de uma banda a vertical não carrega significado (quem
     carrega é a banda), então as linhas são EMPACOTADAS: cada nó vai para a primeira
     linha em que não esbarra horizontalmente em quem já está lá. É o que "justifica" o
     desenho — nós de colunas diferentes dividem a mesma linha.

     A altura da linha também é POR BANDA: o cartão mais alto do fluxo inteiro não tem
     por que esticar a banda que só tem losangos. */
  const alturaDaLinha = (n: FlowNode) => {
    const h = size[n.id].h
    // evento/gateway com nome precisa de espaço para o rótulo que fica FORA da forma
    const rotuloFora = n.type !== 'userTask' && n.type !== 'serviceTask' && !!n.name
    return rotuloFora ? Math.max(h + 22, SYMBOL + 2 * LABEL_H) : h + 22
  }
  const FOLGA_X = 28 // respiro entre dois nós que dividem a linha
  const bandOrder: string[] = []
  const bandTop: Record<string, number> = {}
  const rowOfNode: Record<string, number> = {}
  const bandRowH: Record<string, number> = {}
  const bandList: LaneBand[] = []
  if (swimlanes) {
    for (const id of topo) if (!bandOrder.includes(band[id])) bandOrder.push(band[id]) // ordem de APARIÇÃO no fluxo
    let top = MARGIN
    for (const key of bandOrder) {
      const daBanda = nodes
        .filter((n) => band[n.id] === key)
        // da esquerda para a direita; faixa como desempate, para o resultado ser estável
        .sort((a, b) => xOf[a.id] - xOf[b.id] || (lane[a.id] ?? 0) - (lane[b.id] ?? 0))
      const fimDaLinha: number[] = [] // maior x ocupado em cada linha
      for (const n of daBanda) {
        const over = labelOverflow(n)
        const ini = xOf[n.id] - over.x
        const fim = xOf[n.id] + size[n.id].w + over.x
        let linha = fimDaLinha.findIndex((f) => ini >= f + FOLGA_X)
        if (linha === -1) linha = fimDaLinha.length
        fimDaLinha[linha] = fim
        rowOfNode[n.id] = linha
      }
      bandRowH[key] = Math.max(...daBanda.map(alturaDaLinha), SYMBOL + 22)
      const h = Math.max(1, fimDaLinha.length) * bandRowH[key] + LANE_PAD * 2
      bandTop[key] = top
      bandList.push({ key, label: key, y: top, h })
      top += h
    }
  }

  const positioned: Record<string, PositionedNode> = {}
  let maxX = 0
  let maxY = 0
  for (const n of nodes) {
    const s = size[n.id]
    const r = rank[n.id]
    const over = labelOverflow(n)
    const x = xOf[n.id]
    const b = band[n.id]
    const axis = swimlanes
      ? bandTop[b] + LANE_PAD + (rowOfNode[n.id] + 0.5) * bandRowH[b]
      : MARGIN + rowH / 2 + (lane[n.id] - minLane) * BRANCH_GAP // eixo da faixa
    const y = axis - s.h / 2
    positioned[n.id] = { id: n.id, x, y, w: s.w, h: s.h, rank: r, lane: lane[n.id] ?? 0 }
    maxX = Math.max(maxX, x + s.w + over.x)
    maxY = Math.max(maxY, y + s.h + over.y)
  }

  /* ── posições MANUAIS (override do auto) ──────────────────────────────────────
     Com RAIAS o arrasto continua valendo — organizar o desenho é legítimo —, mas o
     movimento é PRESO À FAIXA do nó: horizontalmente livre, verticalmente limitado
     à banda dele. Soltar um cartão na faixa de outro papel faria o desenho mentir
     sobre quem executa, que é exatamente o que a raia existe para evitar. */
  if (manual) {
    for (const n of nodes) {
      const m = manual[n.id]
      if (!m) continue
      const p = positioned[n.id]
      if (swimlanes) {
        const b = bandList.find((x) => x.key === band[n.id])
        p.x = Math.max(LANE_HEADER_W + 8, m.x)
        if (b) {
          const topo = b.y + LANE_PAD
          const base = b.y + b.h - LANE_PAD - p.h
          p.y = base < topo ? b.y + (b.h - p.h) / 2 : Math.min(Math.max(m.y, topo), base)
        }
      } else {
        p.x = Math.max(MARGIN, m.x)
        p.y = Math.max(MARGIN, m.y)
      }
    }
    maxX = 0; maxY = 0
    for (const n of nodes) {
      const p = positioned[n.id]
      const over = labelOverflow(n)
      maxX = Math.max(maxX, p.x + p.w + over.x)
      maxY = Math.max(maxY, p.y + p.h + over.y)
    }
  }

  // A altura das BANDAS é o piso do desenho — vem delas, não dos nós. Fica depois do
  // bloco manual porque ele recalcula a extensão do zero e apagaria este piso.
  if (swimlanes && bandList.length) {
    const ultima = bandList[bandList.length - 1]
    maxY = Math.max(maxY, ultima.y + ultima.h)
  }

  return { nodes: positioned, width: maxX + MARGIN, height: maxY + MARGIN, lanes: swimlanes ? bandList : undefined }
}

/** Offsets simétricos ao redor do eixo para k saídas: k par → ±1,±2…; k ímpar → 0,±1,±2… */
function symmetricOffset(i: number, k: number): number {
  if (k % 2 === 1) return i - (k - 1) / 2
  // par: pula o 0 → -m,…,-1,1,…,m
  const half = k / 2
  const pos = i < half ? i - half : i - half + 1 // i<half → negativos; senão positivos (pula 0)
  return pos
}
