/* ─── Geometria pura do desenho BPMN ───────────────────────────────────────────
   Posições iniciais, "organizar", raias e acerto de pontos. Sem React: a tela só
   desenha o que estas funções calculam. O desenho é VISUAL; a verdade continua
   sendo o fluxo em blocos. */
import type { DesenhoBpmn, RaiaDesenho } from '@nxt/types'
import type { GrafoGerado } from '@nxt/workflow-core'
import { layoutGraph, LANE_SEM_RESPONSAVEL, type FlowGraph, type FlowNodeType } from '@/lib/flow-layout'

export const GRADE = 16
export const RAIA_ALTURA_PADRAO = 140
export const RAIA_ROTULO_W = 120
/** Menor altura a que a alça deixa encolher uma raia. */
export const RAIA_ALTURA_MINIMA = 60
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
    let i = d.posicoes[n.id] ? raiaNaAltura(d.raias, d.posicoes[n.id].y) : -1
    if (i === -1) {
      i = d.raias.findIndex((x) => x.nome === (responsavelDe(n.id) ?? ''))
      if (i === -1) i = 0
    }
    indice[n.id] = i
  }
  const chave = (i: number) => d.raias[i].nome || LANE_SEM_RESPONSAVEL
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

export function renomearRaia(d: DesenhoBpmn, id: string, nome: string): DesenhoBpmn {
  return trocarRaia(d, id, (r) => ({ ...r, nome: nome.trim() }))
}

/** Nova altura na grade, nunca abaixo de `RAIA_ALTURA_MINIMA`. */
export function redimensionarRaia(d: DesenhoBpmn, id: string, altura: number): DesenhoBpmn {
  return trocarRaia(d, id, (r) => ({ ...r, altura: Math.max(RAIA_ALTURA_MINIMA, naGrade(altura)) }))
}

/** Troca a raia de lugar com a de cima (-1) ou a de baixo (1). As formas ficam onde estão. */
export function moverRaia(d: DesenhoBpmn, id: string, direcao: -1 | 1): DesenhoBpmn {
  const i = d.raias.findIndex((r) => r.id === id)
  const j = i + direcao
  if (i === -1 || j < 0 || j >= d.raias.length) return d
  const raias = [...d.raias]
  ;[raias[i], raias[j]] = [raias[j], raias[i]]
  return { ...d, raias }
}

/** Tira a raia; as formas que estavam nela ficam onde estão. */
export function removerRaia(d: DesenhoBpmn, id: string): DesenhoBpmn {
  if (!d.raias.some((r) => r.id === id)) return d
  return { ...d, raias: d.raias.filter((r) => r.id !== id) }
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
