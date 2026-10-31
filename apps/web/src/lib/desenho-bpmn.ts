/* ─── Geometria pura do desenho BPMN ───────────────────────────────────────────
   Posições iniciais, "organizar", raias e acerto de pontos. Sem React: a tela só
   desenha o que estas funções calculam. O desenho é VISUAL; a verdade continua
   sendo o fluxo em blocos. */
import type { DesenhoBpmn, RaiaDesenho } from '@nxt/types'
import { SUFIXO_REENCONTRO, type GrafoGerado, type ItemFluxo } from '@nxt/workflow-core'
import { layoutGraph, nodeSize, LANE_SEM_RESPONSAVEL, type FlowGraph, type FlowNodeType } from '@/lib/flow-layout'

export const GRADE = 16
export const RAIA_ALTURA_PADRAO = 144
export const RAIA_ROTULO_W = 160
/** Menor altura a que a alça deixa encolher uma raia. Alturas sempre múltiplas da GRADE. */
export const RAIA_ALTURA_MINIMA = 64
/** Maior altura que a alça aceita (o separador anuncia mínimo e máximo). */
export const RAIA_ALTURA_MAXIMA = 1600
/** Distância horizontal entre um nó e o que vem depois dele, ao completar posições. */
const PASSO_X = 200

type Responsavel = (id: string) => string | undefined

const naGrade = (v: number) => Math.round(v / GRADE) * GRADE

const paraFlow = (g: GrafoGerado, responsavelDe: Responsavel, comRaias: boolean): FlowGraph => ({
  nodes: g.nodes.map((n) => ({
    id: n.id,
    type: n.type as FlowNodeType,
    name: n.name,
    // só atividade tem raia própria; evento e gateway herdam a do vizinho no layout
    lane: comRaias && (n.type === 'userTask' || n.type === 'serviceTask') ? (responsavelDe(n.id) ?? LANE_SEM_RESPONSAVEL) : undefined,
  })),
  edges: g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label })),
  startId: g.nodes.find((n) => n.type === 'start')?.id ?? g.nodes[0]?.id ?? '',
})

/** Topo (y) de cada raia, acumulado. */
function topos(raias: RaiaDesenho[]): number[] {
  const t: number[] = []
  let y = 0
  for (const r of raias) { t.push(y); y += r.altura }
  return t
}

/** Prende o topo `y` do nó (altura `h`) dentro da raia [top, top+alt). */
const dentroDaRaia = (y: number, top: number, alt: number, h: number) => Math.min(Math.max(y, top), Math.max(top, top + alt - h))

export function desenhoInicial(g: GrafoGerado, responsavelDe: Responsavel): DesenhoBpmn {
  const r = layoutGraph(paraFlow(g, responsavelDe, true), undefined, { swimlanes: true })
  const bandas = r.lanes ?? []
  const raias: RaiaDesenho[] = bandas.map((b, i) => ({
    id: 'raia_' + i,
    nome: b.key === LANE_SEM_RESPONSAVEL ? '' : b.label,
    altura: Math.max(b.h, RAIA_ALTURA_PADRAO),
  }))
  const novoTopo = topos(raias)
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const n of g.nodes) {
    const p = r.nodes[n.id]
    const i = bandas.findIndex((b) => b.key === p.band)
    const b = bandas[i]
    // mantém a linha que o layout deu ao nó dentro da banda, recentrada na raia
    const y = naGrade(novoTopo[i] + (p.y - b.y) + (raias[i].altura - b.h) / 2)
    const topo = novoTopo[i]
    posicoes[n.id] = { x: naGrade(p.x), y: dentroDaRaia(y, topo, raias[i].altura, p.h) }
  }
  return { versao: 1, posicoes, raias }
}

export function organizar(g: GrafoGerado, d: DesenhoBpmn, responsavelDe: Responsavel): DesenhoBpmn {
  if (d.raias.length === 0) return desenhoInicial(g, responsavelDe)
  // raia de cada nó: a que já ocupa; sem posição, a sugerida pelo responsável
  const indice: Record<string, number> = {}
  for (const n of g.nodes) {
    // pelo CENTRO, como o canvas: a forma que começa numa raia e cai na de baixo é da de baixo
    const h = nodeSize({ id: n.id, type: n.type as FlowNodeType, name: n.name }, 0, 0).h
    let i = d.posicoes[n.id] ? raiaNaAltura(d.raias, d.posicoes[n.id].y + h / 2) : -1
    if (i === -1) {
      i = d.raias.findIndex((x) => x.nome === (responsavelDe(n.id) ?? ''))
      if (i === -1) i = 0
    }
    indice[n.id] = i
  }
  // a faixa do layout é a RAIA (id): duas raias com o mesmo nome não se fundem
  const chave = (i: number) => d.raias[i].id
  const fg = paraFlow(g, responsavelDe, false)
  for (const n of fg.nodes) n.lane = chave(indice[n.id])
  // o layout com raias empacota ramos paralelos em linhas diferentes dentro da faixa
  const r = layoutGraph(fg, undefined, { swimlanes: true, laneOrder: d.raias.map((_, i) => chave(i)) })
  const bandas = new Map((r.lanes ?? []).map((b) => [b.key, b]))
  // a raia cresce se as linhas empacotadas não cabem na altura que ela tinha
  const raias = d.raias.map((x, i) => ({ ...x, altura: Math.max(x.altura, bandas.get(chave(i))?.h ?? 0) }))
  const topo = topos(raias)
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const n of g.nodes) {
    const p = r.nodes[n.id]
    const i = indice[n.id]
    const b = bandas.get(chave(i))!
    const y = naGrade(topo[i] + (raias[i].altura - b.h) / 2 + (p.y - b.y))
    posicoes[n.id] = { x: naGrade(p.x), y: dentroDaRaia(y, topo[i], raias[i].altura, p.h) }
  }
  return { ...d, raias, posicoes }
}

export function completarPosicoes(g: GrafoGerado, d: DesenhoBpmn, perto?: { x: number; y: number }): DesenhoBpmn {
  const posicoes = { ...d.posicoes }
  const faltam = g.nodes.filter((n) => !posicoes[n.id])
  if (perto && faltam.length) posicoes[faltam[0].id] = { x: naGrade(perto.x), y: naGrade(perto.y) }
  // segue as setas, não a ordem da lista: repete até nada mais mudar
  for (let mudou = true; mudou; ) {
    mudou = false
    for (const n of g.nodes) {
      if (posicoes[n.id]) continue
      // antecessor já posicionado; havendo volta, o de menor x é o que vem "de trás"
      const ants = g.edges.filter((e) => e.to === n.id && posicoes[e.from]).map((e) => posicoes[e.from])
      if (!ants.length) continue
      const ant = ants.reduce((a, b) => (b.x < a.x ? b : a))
      posicoes[n.id] = { x: ant.x + PASSO_X, y: ant.y }
      mudou = true
    }
    if (mudou) continue
    for (const n of g.nodes) {
      if (posicoes[n.id]) continue
      const sucs = g.edges.filter((e) => e.from === n.id && posicoes[e.to]).map((e) => posicoes[e.to])
      if (!sucs.length) continue
      const suc = sucs.reduce((a, b) => (b.x > a.x ? b : a))
      posicoes[n.id] = { x: Math.max(0, suc.x - PASSO_X), y: suc.y }
      mudou = true
      break
    }
  }
  for (const n of g.nodes) posicoes[n.id] ??= { x: 0, y: 0 } // sem nenhum vizinho alcançável
  return { ...d, posicoes }
}

/** Abre espaço para uma inserção: tudo que começa em `x ≥ aPartirDeX` anda `largura` para a
 *  direita (arredondada PARA CIMA na grade), mantendo o y. `exceto` poupa ids (ex.: a forma
 *  nova, já posta no lugar). Raias não mudam. */
export function abrirEspaco(d: DesenhoBpmn, aPartirDeX: number, largura: number, exceto?: ReadonlySet<string>): DesenhoBpmn {
  if (!(largura > 0)) return d
  const passo = Math.ceil(largura / GRADE) * GRADE
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const [id, p] of Object.entries(d.posicoes)) {
    posicoes[id] = p.x >= aPartirDeX && !exceto?.has(id) ? { x: p.x + passo, y: p.y } : p
  }
  return { ...d, posicoes }
}

/** Onde a pílula do caminho fica: logo depois de a seta sair do losango — no começo do
 *  trecho que segue a dobra (ali as setas irmãs já se separaram), ou a um passo da saída
 *  quando a seta é reta. No meio da seta ela caía atrás das formas e sobre as vizinhas.
 *  A mesma regra vale na tela e no arquivo exportado. */
export function pontoDoRotuloNaPolilinha(pontos: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } | null {
  // as dobras com raio 0 repetem o ponto do canto: fica um ponto por canto
  const pts: Array<{ x: number; y: number }> = []
  for (const q of pontos) {
    const u = pts[pts.length - 1]
    if (!u || Math.abs(u.x - q.x) > 0.5 || Math.abs(u.y - q.y) > 0.5) pts.push(q)
  }
  if (pts.length < 2) return null
  const passo = (a: { x: number; y: number }, b: { x: number; y: number }, d: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = Math.min(1, d / len) * (d > len ? 0.5 : 1)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  // seta reta (ou quase): a 34 px da saída
  if (pts.length === 2) return passo(pts[0], pts[1], 34)
  // depois da 1ª dobra: 30 px adiante (no meio do trecho, se ele for curto)
  return passo(pts[1], pts[2], 30)
}

/** Reordenar arrastando (PO, 30/10/2026): a forma — ou o bloco inteiro, `ids` — sai de
 *  onde estava e entra antes de `antesDe` (a forma que vem depois da seta de destino).
 *  Na origem o vão FECHA: o que começa depois da forma volta `largura`. No destino ABRE:
 *  como na inserção pela paleta, tudo a partir de `antesDe` anda `largura` e a forma toma
 *  o x que era dele. O y é o de onde a pessoa soltou (`y`, da forma `principal`); as demais
 *  do bloco andam junto e o bloco mantém o desenho dele. Raias não mudam. */
export function reordenarNoDesenho(
  d: DesenhoBpmn, ids: ReadonlySet<string>, principal: string, largura: number, antesDe: string, y: number,
): DesenhoBpmn {
  const daForma = d.posicoes[principal]
  if (!daForma || !d.posicoes[antesDe] || ids.has(antesDe) || !(largura > 0)) return d
  const passo = Math.ceil(largura / GRADE) * GRADE
  const movidas = [...ids].filter((id) => d.posicoes[id])
  const fimDaOrigem = Math.max(...movidas.map((id) => d.posicoes[id].x))
  const fechado: DesenhoBpmn['posicoes'] = {}
  for (const [id, p] of Object.entries(d.posicoes)) {
    fechado[id] = !ids.has(id) && p.x > fimDaOrigem ? { x: p.x - passo, y: p.y } : p
  }
  const destino = fechado[antesDe].x
  // a forma que começa um pouco antes do destino também a cobriria: entra no empurrão
  const aberto = abrirEspaco({ ...d, posicoes: fechado }, destino - 2 * GRADE, passo, ids)
  const dx = destino - daForma.x, dy = naGrade(y) - daForma.y
  const posicoes = { ...aberto.posicoes }
  for (const id of movidas) posicoes[id] = { x: d.posicoes[id].x + dx, y: d.posicoes[id].y + dy }
  return { ...aberto, posicoes }
}

/** Largura que uma forma nova ocupa no desenho, já com a folga até a próxima: a tarefa é a
 *  caixa dela; escolha / "ao mesmo tempo" são a divisão e o reencontro (que
 *  `completarPosicoes` põe um PASSO_X à direita). Sempre na grade. */
export function larguraDaInsercao(tipo: 'userTask' | 'serviceTask' | 'escolha' | 'paralelo'): number {
  const bloco = tipo === 'escolha' || tipo === 'paralelo'
  const w = bloco
    ? PASSO_X + nodeSize({ id: 'x', type: 'exclusiveGateway' }, 0, 0).w
    : nodeSize({ id: 'x', type: tipo }, 0, 0).w
  return Math.ceil((w + 3 * GRADE) / GRADE) * GRADE
}

/** Índice da raia que contém a altura `y`, ou -1 se cai fora de todas. */
export function raiaNaAltura(raias: Array<Pick<RaiaDesenho, 'altura'>>, y: number): number {
  let topo = 0
  for (let i = 0; i < raias.length; i++) {
    if (y >= topo && y < topo + raias[i].altura) return i
    topo += raias[i].altura
  }
  return -1
}

/* ─── Edição das raias ─────────────────────────────────────────────────────────
   As raias são só visuais: nenhuma destas funções mexe em `posicoes`. Sem mudança
   de fato, devolvem o MESMO desenho (o canvas não grava nada). */

const idNovo = () => 'raia_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** Acrescenta "Nova raia" no fim da piscina. `gerarId` só existe para os testes. */
export function adicionarRaia(d: DesenhoBpmn, gerarId: () => string = idNovo): DesenhoBpmn {
  const usados = new Set(d.raias.map((r) => r.id))
  let id = gerarId()
  for (let n = 2; usados.has(id); n++) id = `${gerarId()}_${n}`
  return { ...d, raias: [...d.raias, { id, nome: 'Nova raia', altura: RAIA_ALTURA_PADRAO }] }
}

const trocarRaia = (d: DesenhoBpmn, id: string, muda: (r: RaiaDesenho) => RaiaDesenho): DesenhoBpmn => {
  const i = d.raias.findIndex((r) => r.id === id)
  if (i === -1) return d
  const nova = muda(d.raias[i])
  if (nova.nome === d.raias[i].nome && nova.altura === d.raias[i].altura) return d
  return { ...d, raias: d.raias.map((r, j) => (j === i ? nova : r)) }
}

/** Nome em branco é cancelar: devolve o mesmo desenho (a raia "sem nome" só nasce do layout). */
export function renomearRaia(d: DesenhoBpmn, id: string, nome: string): DesenhoBpmn {
  const limpo = nome.trim()
  if (!limpo) return d
  return trocarRaia(d, id, (r) => ({ ...r, nome: limpo }))
}

/** Altura da forma `id`, para achar o CENTRO dela (o canvas decide a raia pelo centro).
 *  Sem a função, conta o topo. */
type AlturaDe = (id: string) => number

/** Move em y as formas cujo centro está em [de, ate) — `ate` ausente = até o fim. */
function moverFormas(d: DesenhoBpmn, alturaDe: AlturaDe, de: number, ate: number, dy: number): DesenhoBpmn['posicoes'] {
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const [id, p] of Object.entries(d.posicoes)) {
    const c = p.y + alturaDe(id) / 2
    posicoes[id] = dy !== 0 && c >= de && c < ate ? { x: p.x, y: p.y + dy } : p
  }
  return posicoes
}

/** Nova altura na grade, entre `RAIA_ALTURA_MINIMA` e `RAIA_ALTURA_MAXIMA`. As formas das
 *  raias de BAIXO (e as abaixo da piscina) andam junto com a borda; as desta raia ficam. */
export function redimensionarRaia(d: DesenhoBpmn, id: string, altura: number, alturaDe: AlturaDe = () => 0): DesenhoBpmn {
  const novo = trocarRaia(d, id, (r) => ({ ...r, altura: Math.min(RAIA_ALTURA_MAXIMA, Math.max(RAIA_ALTURA_MINIMA, naGrade(altura))) }))
  if (novo === d) return d
  const i = d.raias.findIndex((r) => r.id === id)
  const base = topos(d.raias)[i] + d.raias[i].altura
  return { ...novo, posicoes: moverFormas(d, alturaDe, base, Infinity, novo.raias[i].altura - d.raias[i].altura) }
}

/** Troca a raia de lugar com a de cima (-1) ou a de baixo (1), e as formas das duas trocam
 *  de faixa junto (pelo centro). As das outras raias ficam. */
export function moverRaia(d: DesenhoBpmn, id: string, direcao: -1 | 1, alturaDe: AlturaDe = () => 0): DesenhoBpmn {
  const i = d.raias.findIndex((r) => r.id === id)
  const j = i + direcao
  if (i === -1 || j < 0 || j >= d.raias.length) return d
  const raias = [...d.raias]
  ;[raias[i], raias[j]] = [raias[j], raias[i]]
  const cima = Math.min(i, j), baixo = Math.max(i, j)
  const t = topos(d.raias)
  const hCima = d.raias[cima].altura, hBaixo = d.raias[baixo].altura
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const [fid, p] of Object.entries(d.posicoes)) {
    const c = p.y + alturaDe(fid) / 2
    if (c >= t[cima] && c < t[cima] + hCima) posicoes[fid] = { x: p.x, y: p.y + hBaixo }
    else if (c >= t[baixo] && c < t[baixo] + hBaixo) posicoes[fid] = { x: p.x, y: p.y - hCima }
    else posicoes[fid] = p
  }
  return { ...d, raias, posicoes }
}

/** Tira a raia. As formas que estavam nela ficam onde estão; as das raias de baixo sobem a
 *  altura dela (a piscina fecha o buraco). */
export function removerRaia(d: DesenhoBpmn, id: string, alturaDe: AlturaDe = () => 0): DesenhoBpmn {
  const i = d.raias.findIndex((r) => r.id === id)
  if (i === -1) return d
  const base = topos(d.raias)[i] + d.raias[i].altura
  return { ...d, raias: d.raias.filter((r) => r.id !== id), posicoes: moverFormas(d, alturaDe, base, Infinity, -d.raias[i].altura) }
}

const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Aviso quando a atividade está numa raia cujo nome não aparece em quem a executa. */
export function avisoDeRaia(nomeRaia: string, responsavel: string | undefined): string | null {
  if (!nomeRaia.trim() || !responsavel) return null
  if (normaliza(responsavel).includes(normaliza(nomeRaia))) return null
  return `Está na raia “${nomeRaia}”, mas quem executa é ${responsavel}.`
}

type Pt = { x: number; y: number }

function distanciaAoSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Id da seta mais próxima do ponto, se estiver a `tolerancia` px ou menos. */
export function setaSobPonto(setas: Array<{ id: string; pontos: Pt[] }>, p: Pt, tolerancia = 12): string | null {
  let melhor: string | null = null
  let menor = Infinity
  for (const s of setas) {
    for (let i = 1; i < s.pontos.length; i++) {
      const d = distanciaAoSegmento(p, s.pontos[i - 1], s.pontos[i])
      if (d <= tolerancia && d < menor) { menor = d; melhor = s.id }
    }
  }
  return melhor
}

export type LadoDaSeta = 'esquerda' | 'direita' | 'topo' | 'base'

/** Polilinha ortogonal que aproxima o traço da seta (o mesmo desenho "smoothstep" do canvas),
 *  boa o bastante para achar a seta sob o ponteiro. `desvio` é o quanto ela sai da forma
 *  antes de dobrar quando os lados não se encaram. */
export function polilinhaDaSeta(s: Pt, ladoS: LadoDaSeta, t: Pt, ladoT: LadoDaSeta, desvio = 20): Pt[] {
  const horizontal = (l: LadoDaSeta) => l === 'esquerda' || l === 'direita'
  const passo = (p: Pt, l: LadoDaSeta): Pt => ({
    x: p.x + (l === 'direita' ? desvio : l === 'esquerda' ? -desvio : 0),
    y: p.y + (l === 'base' ? desvio : l === 'topo' ? -desvio : 0),
  })
  if (horizontal(ladoS) && horizontal(ladoT)) {
    const frente = ladoS === 'direita' ? t.x >= s.x : t.x <= s.x
    if (ladoS !== ladoT && frente) {
      const mx = (s.x + t.x) / 2
      return [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t]
    }
    const s1 = passo(s, ladoS), t1 = passo(t, ladoT)
    const x = ladoS === ladoT ? (ladoS === 'direita' ? Math.max(s1.x, t1.x) : Math.min(s1.x, t1.x)) : null
    if (x !== null) return [s, { x, y: s.y }, { x, y: t.y }, t]
    const my = (s.y + t.y) / 2
    return [s, s1, { x: s1.x, y: my }, { x: t1.x, y: my }, t1, t]
  }
  if (!horizontal(ladoS) && !horizontal(ladoT)) {
    if (ladoS === ladoT) {
      const y = ladoS === 'base' ? Math.max(s.y, t.y) + desvio : Math.min(s.y, t.y) - desvio
      return [s, { x: s.x, y }, { x: t.x, y }, t]
    }
    const frente = ladoS === 'base' ? t.y >= s.y : t.y <= s.y
    if (frente) {
      const my = (s.y + t.y) / 2
      return [s, { x: s.x, y: my }, { x: t.x, y: my }, t]
    }
    const s1 = passo(s, ladoS), t1 = passo(t, ladoT), mx = (s.x + t.x) / 2
    return [s, s1, { x: mx, y: s1.y }, { x: mx, y: t1.y }, t1, t]
  }
  // um lado vertical e o outro horizontal: um cotovelo
  return horizontal(ladoS) ? [s, { x: t.x, y: s.y }, t] : [s, { x: s.x, y: t.y }, t]
}

/** As formas do desenho que pertencem a um item do fluxo: ele, o reencontro (escolha /
 *  ao mesmo tempo) e tudo que mora nos caminhos dele. */
export function formasDoItem(it: ItemFluxo): string[] {
  if (it.kind === 'atividade') return [it.id]
  const caminhos = it.kind === 'escolha' ? [...it.caminhos, it.casoContrario] : it.caminhos
  return [it.id, it.id + SUFIXO_REENCONTRO, ...caminhos.flatMap((c) => c.itens.flatMap(formasDoItem))]
}

/** Item movido pela lista do Roteiro: perde a posição antiga (e o reencontro dela) para
 *  `completarPosicoes` colocá-lo perto do novo lugar. Os outros não se mexem. */
export function posicoesAoMover(d: DesenhoBpmn, ids: Iterable<string>): DesenhoBpmn {
  const fora = new Set<string>()
  for (const id of ids) { fora.add(id); fora.add(id + SUFIXO_REENCONTRO) }
  if (!fora.size) return d
  return { ...d, posicoes: Object.fromEntries(Object.entries(d.posicoes).filter(([id]) => !fora.has(id))) }
}
