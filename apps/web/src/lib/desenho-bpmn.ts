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

/** Y (topo do nó) que o centraliza na raia, na grade e sem sair dela. */
function yNaRaia(raias: RaiaDesenho[], i: number, h: number): number {
  const top = topos(raias)[i]
  const alt = raias[i].altura
  const y = naGrade(top + (alt - h) / 2)
  return Math.min(Math.max(y, top), Math.max(top, top + alt - GRADE))
}

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
    posicoes[n.id] = { x: naGrade(p.x), y: Math.min(Math.max(y, topo), topo + raias[i].altura - GRADE) }
  }
  return { versao: 1, posicoes, raias }
}

export function organizar(g: GrafoGerado, d: DesenhoBpmn, responsavelDe: Responsavel): DesenhoBpmn {
  if (d.raias.length === 0) return desenhoInicial(g, responsavelDe)
  const r = layoutGraph(paraFlow(g, responsavelDe, false))
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const n of g.nodes) {
    const p = r.nodes[n.id]
    let i = d.posicoes[n.id] ? raiaNaAltura(d.raias, d.posicoes[n.id].y) : -1
    if (i === -1) {
      i = d.raias.findIndex((x) => x.nome === (responsavelDe(n.id) ?? ''))
      if (i === -1) i = 0
    }
    posicoes[n.id] = { x: naGrade(p.x), y: yNaRaia(d.raias, i, p.h) }
  }
  return { ...d, posicoes }
}

export function completarPosicoes(g: GrafoGerado, d: DesenhoBpmn, perto?: { x: number; y: number }): DesenhoBpmn {
  const posicoes = { ...d.posicoes }
  let usouPerto = false
  for (const n of g.nodes) {
    if (posicoes[n.id]) continue
    if (perto && !usouPerto) { usouPerto = true; posicoes[n.id] = { x: naGrade(perto.x), y: naGrade(perto.y) }; continue }
    const ant = g.edges.map((e) => (e.to === n.id ? posicoes[e.from] : undefined)).find(Boolean)
    const suc = g.edges.map((e) => (e.from === n.id ? posicoes[e.to] : undefined)).find(Boolean)
    if (ant) posicoes[n.id] = { x: ant.x + PASSO_X, y: ant.y }
    else if (suc) posicoes[n.id] = { x: Math.max(0, suc.x - PASSO_X), y: suc.y }
    else posicoes[n.id] = { x: 0, y: 0 }
  }
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
