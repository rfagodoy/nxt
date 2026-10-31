'use client'

/* ─── Canvas do desenho BPMN ───────────────────────────────────────────────────
   Projeta o grafo gerado dos blocos + o desenho gravado (posições e raias) em nós e
   setas do React Flow. O canvas não muda o fluxo: mover uma forma só devolve um novo
   `DesenhoBpmn` por `onDesenho`; selecionar avisa `onSelecionar`. As intenções que mudam
   o fluxo só são AVISADAS: soltar uma forma da paleta (`onInserir`), arrastar uma forma
   para cima de uma seta (`onMoverItem`), puxar uma seta à mão (`onLigar`, depois de
   `podeLigar`), arrastar a ponta de uma seta (`onReligar`), apagar a seta selecionada
   (`onApagarSeta`) e as ações rápidas da forma selecionada. Quem muda o fluxo é a página.
   As raias são só visuais: renomear, mudar a altura, subir/descer, remover e "+ raia"
   também saem por `onDesenho` (as formas ficam onde estão). */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type JSX, type KeyboardEvent as TeclaReact } from 'react'
import { useTheme } from 'next-themes'
import { useTema } from '@/lib/temas-provider'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, NodeToolbar, Panel, Position, ViewportPortal, applyNodeChanges,
  type AriaLabelConfig, type Connection, type Edge, type NodeChange, type OnConnectEnd, type OnReconnect,
  type OnNodeDrag, type ReactFlowInstance,
} from '@xyflow/react'
import { Link2, Map as MapIcon, Trash2 } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import type { DesenhoBpmn, DesenhoV2, StepFormSchema } from '@nxt/types'
import {
  SUFIXO_REENCONTRO, acharItem, localDoItem, pontoDaSeta,
  type FluxoBlocos, type GrafoGerado, type ItemFluxo, type PontoDeInsercao,
} from '@nxt/workflow-core'
import {
  GRADE, RAIA_ROTULO_W, adicionarRaia, avisoDeRaia, moverRaia, podeLigar, polilinhaDaSeta, raiaNaAltura, redimensionarRaia, removerRaia,
  renomearRaia, reordenarNoDesenho, setaSobPonto, type LadoDaSeta,
} from '@/lib/desenho-bpmn'
import { nodeSize, type FlowNodeType } from '@/lib/flow-layout'
import type { ExportModel, ExportNode, ExportNodeType } from '@/lib/flow-export'
import { ZOOM_MAX, ZOOM_MIN } from '@/components/processes/flow-shared'
import type { NovoItem } from '@/components/processes/workflow-blocos'
import {
  ContextoRaias, EVENTO_RECUO, FAIXA_PISCINA, MARCADOR_SETA, rotuloDaForma, tiposDeNo, tiposDeSeta,
  type AcoesDeRaia, type NoBpmn, type SetaBpmn, type TipoLosango,
} from './formas'
import { TIPO_ARRASTO_FORMA } from './paleta'

export interface CanvasBpmnProps {
  fluxo: FluxoBlocos; grafo: GrafoGerado; desenho: DesenhoBpmn
  /** O desenho livre (formas e setas como desenhadas): é o que decide se uma seta pode existir. */
  doc: DesenhoV2
  steps: Record<string, StepFormSchema>
  selecionado: string | null
  somenteLeitura?: boolean
  responsavelDe: (id: string) => string | undefined   // "Analista de Central de Contratos"
  prazoDe: (id: string) => string | null               // dueText
  problemasDe: (id: string) => string[]                // mensagens de validação do nó
  onSelecionar: (id: string | null) => void
  onDesenho: (d: DesenhoBpmn) => void
  /** `perto` = canto superior esquerdo sugerido para a forma nova, já na grade
   *  (a página o passa a `completarPosicoes`). */
  onInserir: (ponto: PontoDeInsercao, tipo: NovoItem, perto: { x: number; y: number }) => void
  /** Forma da paleta solta no desenho: sobre uma seta (`sobreSeta`) entra no meio dela; em
   *  área vazia fica solta. Escolha e Ao mesmo tempo chegam como UM losango (sem o par). */
  onSoltar: (tipo: NovoItem, perto: { x: number; y: number }, sobreSeta?: string) => void
  onMoverItem: (id: string, ponto: PontoDeInsercao) => void
  /** Seta desenhada à mão entre duas formas quaisquer (aceita por `podeLigar`). */
  onLigar: (de: string, para: string) => void
  /** A ponta de chegada da seta foi arrastada para outra forma. */
  onReligar: (setaId: string, para: string) => void
  /** A ponta de saída da seta foi arrastada para outra forma (a condição vai junto). */
  onReligarSaida: (setaId: string, de: string) => void
  onApagarSeta: (setaId: string) => void
  /** A seta selecionada mudou (null = nenhuma): a página abre a condição dela. */
  onSelecionarSeta?: (setaId: string | null) => void
  /** Setas culpadas da pendência escolhida na pílula (ficam em vermelho tracejado). */
  setasComProblema?: readonly string[]
  onRemover: (id: string) => void
  /** Nome do processo, na faixa vertical da piscina. */
  nomeDoProcesso?: string
  /** Muda quando o que `responsavelDe`/`prazoDe`/`problemasDe` leem mudar (papéis e rótulos
   *  carregados depois, pendências recalculadas). As funções em si podem trocar de identidade
   *  a cada render sem reprojetar; é esta revisão que manda refazer os cartões e as marcas. */
  revisaoDasConsultas?: unknown
  /** Atividades que podem ser repetidas com a MESMA configuração (vinculadas). Com
   *  `onInserirVinculada`, as ações rápidas ganham "Próxima: mesma configuração de…". */
  vinculaveis?: Array<{ id: string; nome: string }>
  onInserirVinculada?: (ponto: PontoDeInsercao, origemId: string, perto: { x: number; y: number }) => void
  /** Centra a vista nesta forma. `vez` muda a cada pedido (o mesmo id pode ser pedido de novo). */
  focoEm?: { id: string; vez: number } | null
  /** Muda (contador) quando a página quer a vista enquadrada no desenho todo — depois do
   *  "Organizar" e do desenho inicial. O valor da montagem não enquadra (o fitView já faz). */
  enquadrar?: number
}

/** Preferência do usuário para a miniatura (ausente = automática: só quando o desenho não cabe). */
const PREF_MINIATURA = 'nxt:desenho-bpmn:miniatura'

/** Enquadrar deixa folga embaixo para a miniatura e os controles não cobrirem formas. */
const ENQUADRAR = { padding: { top: '48px', left: '48px', right: '48px', bottom: '170px' } } as const
/** Folga à direita da última forma, dentro da raia. */
const FOLGA_RAIA = 160
const LARGURA_MINIMA_RAIA = 640
/** Diferença de altura a partir da qual a seta sai/chega pelo topo ou pela base do losango. */
const DESNIVEL = GRADE / 2

type No = GrafoGerado['nodes'][number]
const ehAtividade = (t: No['type']) => t === 'userTask' || t === 'serviceTask'
const ehLosango = (t: No['type']) => t === 'exclusiveGateway' || t === 'inclusiveGateway' || t === 'parallelGateway'
/** A mesma caixa que o layout reserva (tarefa 190 × altura pelas linhas do nome; símbolos 56). */
const tamanho = (n: No) => nodeSize({ id: n.id, type: n.type as FlowNodeType, name: n.name }, 0, 0)

const TIPO_LOSANGO: Partial<Record<No['type'], TipoLosango>> = {
  exclusiveGateway: 'escolha', inclusiveGateway: 'inclusivo', parallelGateway: 'paralelo',
}

/* O React Flow usa a descrição "keyboardDisabled" justamente quando o teclado está LIGADO
   (é a que fala das setas). Só leitura: as setas não movem nada, então o texto não promete. */
const rotulosAria = (somenteLeitura: boolean): Partial<AriaLabelConfig> => ({
  'node.a11yDescription.default': 'Enter ou espaço seleciona a forma.',
  'node.a11yDescription.keyboardDisabled': somenteLeitura
    ? 'Enter ou espaço seleciona a forma.'
    : 'Enter ou espaço seleciona a forma; depois, as setas do teclado a movem.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `Forma movida para ${direction}. Nova posição: x ${x}, y ${y}.`,
  'edge.a11yDescription.default': 'Seta do fluxo.',
  'controls.ariaLabel': 'Controles do desenho',
  'controls.zoomIn.ariaLabel': 'Aproximar',
  'controls.zoomOut.ariaLabel': 'Afastar',
  'controls.fitView.ariaLabel': 'Enquadrar o desenho',
  'controls.interactive.ariaLabel': 'Travar ou destravar o desenho',
  'minimap.ariaLabel': 'Miniatura do desenho',
  'handle.ariaLabel': 'Ponto de ligação',
})

/* Cores que o React Flow pinta por prop (não aceitam classe `dark:`). */
const CORES = {
  claro: { fundo: 'var(--e-F4F7F4)', ponto: 'rgba(20,36,32,0.13)', mini: '#FFFFFF', miniRaia: 'var(--e-E6EDE8)', miniTarefa: '#075985', miniEscolha: '#5B21B6', miniParalelo: '#9F1239', miniEvento: 'var(--e-11804F)', mascara: 'rgba(20,36,32,0.08)' },
  escuro: { fundo: 'var(--e-0C1511)', ponto: 'rgba(255,255,255,0.07)', mini: 'var(--e-0F1914)', miniRaia: 'rgba(255,255,255,0.06)', miniTarefa: '#7DD3FC', miniEscolha: '#C4B5FD', miniParalelo: '#FDA4B8', miniEvento: 'var(--e-C6F24E)', mascara: 'rgba(0,0,0,0.35)' },
}

/* ─── Projeção: grafo + desenho → nós e setas do React Flow ───────────────── */
type Projecao = Pick<CanvasBpmnProps, 'grafo' | 'desenho' | 'steps' | 'selecionado' | 'responsavelDe' | 'prazoDe' | 'problemasDe' | 'nomeDoProcesso'>

function projetarNos({ grafo, desenho, steps, selecionado, responsavelDe, prazoDe, problemasDe, nomeDoProcesso }: Projecao): NoBpmn[] {
  const pos = (id: string) => desenho.posicoes[id] ?? { x: 0, y: 0 }
  const nos: NoBpmn[] = []

  // piscina + raias: fundo empilhado a partir de y = 0, na ordem de `desenho.raias`. À esquerda
  // do x = 0 ficam a coluna do rótulo das raias e, antes dela, a faixa vertical com o nome do
  // processo. A borda direita fica FOLGA_RAIA (160) depois da forma mais à direita.
  const direita = grafo.nodes.reduce((m, n) => Math.max(m, pos(n.id).x + tamanho(n).w), 0)
  const largura = Math.max(LARGURA_MINIMA_RAIA, RAIA_ROTULO_W + direita + FOLGA_RAIA)
  let topo = 0
  desenho.raias.forEach((r, i) => {
    nos.push({
      id: `raia:${r.id}`, type: 'raia', position: { x: -RAIA_ROTULO_W, y: topo },
      data: { id: r.id, nome: r.nome, largura, altura: r.altura, indice: i, primeira: i === 0, ultima: i === desenho.raias.length - 1 },
      width: largura, height: r.altura, zIndex: -1,
      draggable: false, selectable: false, connectable: false, focusable: false, deletable: false,
      // clique e arrasto passam para o fundo (tirar seleção, mover a vista); só o rótulo e a
      // alça de baixo da raia religam o ponteiro (ver FormaRaia)
      style: { pointerEvents: 'none' },
    })
    topo += r.altura
  })
  if (desenho.raias.length) {
    nos.push({
      id: 'piscina', type: 'piscina', position: { x: -RAIA_ROTULO_W - FAIXA_PISCINA, y: 0 },
      data: { nome: nomeDoProcesso?.trim() ?? '', altura: topo },
      width: FAIXA_PISCINA, height: topo, zIndex: -1,
      draggable: false, selectable: false, connectable: false, focusable: false, deletable: false,
      style: { pointerEvents: 'none' },
    })
  }

  for (const n of grafo.nodes) {
    const { w, h } = tamanho(n)
    const comum = { id: n.id, position: pos(n.id), width: w, height: h, selected: n.id === selecionado, deletable: false }
    const problemas = [...problemasDe(n.id)]
    let no: NoBpmn
    if (ehAtividade(n.type)) {
      const automatica = n.type === 'serviceTask'
      const responsavel = responsavelDe(n.id)
      if (desenho.raias.length) {
        const i = raiaNaAltura(desenho.raias, pos(n.id).y + h / 2)
        const aviso = i === -1 ? null : avisoDeRaia(desenho.raias[i].nome, responsavel)
        if (aviso) problemas.push(aviso)
      }
      const nome = n.name?.trim() || steps[n.id]?.stepName?.trim() || (automatica ? 'Ação automática' : 'Tarefa sem nome')
      const meta = [responsavel ?? (automatica ? 'Automática' : 'Sem responsável'), prazoDe(n.id)].filter(Boolean).join(' · ')
      no = { ...comum, type: 'tarefa', data: { nome, automatica, meta, problemas, largura: w, altura: h } }
    } else if (ehLosango(n.type)) {
      no = { ...comum, type: 'losango', data: { tipo: TIPO_LOSANGO[n.type]!, nome: n.name?.trim() || undefined, reencontro: n.id.endsWith(SUFIXO_REENCONTRO), problemas } }
    } else {
      no = { ...comum, type: 'evento', data: { tipo: n.type === 'start' ? 'inicio' : 'fim', problemas } }
    }
    no.ariaLabel = rotuloDaForma(no)
    nos.push(no)
  }
  return nos
}

function projetarSetas(grafo: GrafoGerado, desenho: DesenhoBpmn, marcador: string): SetaBpmn[] {
  const tipo = new Map(grafo.nodes.map((n) => [n.id, n.type]))
  const caixa = new Map(grafo.nodes.map((n) => [n.id, tamanho(n)]))
  const nomes = new Map(grafo.nodes.map((n) => [n.id, n.name?.trim() || (n.type === 'start' ? 'Início' : n.type === 'end' ? 'Fim' : n.id)]))
  const centro = (id: string) => {
    const p = desenho.posicoes[id] ?? { x: 0, y: 0 }
    const { w, h } = caixa.get(id) ?? { w: 0, h: 0 }
    return { x: p.x + w / 2, y: p.y + h / 2 }
  }
  return grafo.edges.map((e) => {
    const de = centro(e.from), para = centro(e.to)
    let sourceHandle = 's-r', targetHandle = 'e-l'
    if (para.x < de.x - DESNIVEL) {
      // volta: sai e chega por baixo, contornando as formas do meio
      sourceHandle = 's-b'; targetHandle = 'e-b'
    } else {
      // divisão sai pelo topo/base rumo ao ramo; reencontro recebe pelo topo/base
      if (ehLosango(tipo.get(e.from)!) && Math.abs(para.y - de.y) > DESNIVEL) sourceHandle = para.y < de.y ? 's-t' : 's-b'
      if (ehLosango(tipo.get(e.to)!) && Math.abs(de.y - para.y) > DESNIVEL) targetHandle = de.y < para.y ? 'e-t' : 'e-b'
    }
    // só o rótulo do caminho; a expressão do motor (`condition`) nunca vai para a tela
    const rotulo = e.isDefault ? 'senão' : e.label?.trim() || undefined
    return {
      id: e.id, source: e.from, target: e.to, sourceHandle, targetHandle, type: 'seta',
      data: { rotulo, senao: !!e.isDefault }, markerEnd: marcador,
      selectable: false, focusable: false, deletable: false,
      ariaLabel: `Seta de ${nomes.get(e.from)} para ${nomes.get(e.to)}${rotulo ? `: ${rotulo}` : ''}`,
    }
  })
}

/* ─── Geometria das setas, para achar a seta sob o ponteiro ──────────────── */
type Pt = { x: number; y: number }
type Caixa = { w: number; h: number }
/** Traço aproximado de cada seta, com as pontas (nós) para filtrar. */
type Tracado = { id: string; de: string; para: string; pontos: Pt[] }

const naGrade = (v: number) => Math.round(v / GRADE) * GRADE
/** Ponto do ponteiro na tela, de mouse ou de toque. */
const ponteiro = (e: MouseEvent | TouchEvent | { clientX: number; clientY: number }): { clientX: number; clientY: number } | null =>
  'changedTouches' in e ? e.changedTouches[0] ?? null : e

const LADO_DA_ALCA: Record<string, LadoDaSeta> = {
  's-r': 'direita', 'e-r': 'direita', 's-l': 'esquerda', 'e-l': 'esquerda',
  's-t': 'topo', 'e-t': 'topo', 's-b': 'base', 'e-b': 'base',
}

/** Onde a alça encosta na forma (o evento tem a alça recuada até o círculo). */
function pontoDaAlca(p: Pt, c: Caixa, lado: LadoDaSeta, recuo: number): Pt {
  switch (lado) {
    case 'esquerda': return { x: p.x + recuo, y: p.y + c.h / 2 }
    case 'direita': return { x: p.x + c.w - recuo, y: p.y + c.h / 2 }
    case 'topo': return { x: p.x + c.w / 2, y: p.y + recuo }
    case 'base': return { x: p.x + c.w / 2, y: p.y + c.h - recuo }
  }
}

function geometria(grafo: GrafoGerado, desenho: DesenhoBpmn) {
  const nos = new Map(grafo.nodes.map((n) => [n.id, n]))
  const pos = (id: string): Pt => desenho.posicoes[id] ?? { x: 0, y: 0 }
  const caixa = (id: string): Caixa => { const n = nos.get(id); return n ? tamanho(n) : { w: 0, h: 0 } }
  const alca = (id: string, lado: LadoDaSeta): Pt => {
    const recuo = nos.get(id)?.type === 'start' || nos.get(id)?.type === 'end' ? EVENTO_RECUO : 0
    return pontoDaAlca(pos(id), caixa(id), lado, recuo)
  }
  const posicionado = (id: string) => !!desenho.posicoes[id]
  return { pos, caixa, alca, posicionado }
}

/** Só as setas com as duas pontas já posicionadas: as outras ainda estariam em (0, 0). */
function tracarSetas(setas: SetaBpmn[], g: ReturnType<typeof geometria>): Tracado[] {
  return setas.filter((s) => g.posicionado(s.source) && g.posicionado(s.target)).map((s) => {
    const ladoS = LADO_DA_ALCA[s.sourceHandle ?? 's-r'], ladoT = LADO_DA_ALCA[s.targetHandle ?? 'e-l']
    return { id: s.id, de: s.source, para: s.target, pontos: polilinhaDaSeta(g.alca(s.source, ladoS), ladoS, g.alca(s.target, ladoT), ladoT) }
  })
}

/* ─── Exportação (JPG/PDF) do desenho BPMN ────────────────────────────────── */

/** Textos de cada forma no arquivo (nome, tipo, responsável…) — quem tem os passos é a página. */
export type InfoDaExportacao = (n: No) => Pick<ExportNode, 'name' | 'typeLabel' | 'meta' | 'isFork'>

/** O arquivo exportado é o desenho da TELA: as mesmas posições, raias e setas (o mesmo
 *  traçado em cantos retos). Antes ele saía do layout antigo, de raias por papel, e não
 *  batia com o que a pessoa desenhou. Tudo é deslocado para começar em (0, 0). */
export function modeloDeExportacao(grafo: GrafoGerado, desenho: DesenhoBpmn, info: InfoDaExportacao): ExportModel {
  const posicionados = grafo.nodes.filter((n) => desenho.posicoes[n.id])
  const xs = posicionados.map((n) => desenho.posicoes[n.id].x), ys = posicionados.map((n) => desenho.posicoes[n.id].y)
  const dx = -Math.min(0, ...xs), dy = -Math.min(0, ...ys)
  const nodes: ExportNode[] = posicionados.map((n) => {
    const p = desenho.posicoes[n.id], { w, h } = tamanho(n)
    return { id: n.id, type: n.type as ExportNodeType, x: p.x + dx, y: p.y + dy, w, h, ...info(n) }
  })
  const setas = projetarSetas(grafo, desenho, '')
  const rotulo = new Map(setas.map((s) => [s.id, s.data?.rotulo]))
  const edges = tracarSetas(setas, geometria(grafo, desenho)).filter((t) => t.pontos.length > 1).map((t) => {
    const pontos = t.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    const a = pontos[0], a2 = pontos[1], b = pontos[pontos.length - 1], b2 = pontos[pontos.length - 2]
    const unit = (x: number, y: number) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d } }
    const sai = unit(a2.x - a.x, a2.y - a.y), chega = unit(b2.x - b.x, b2.y - b.y)
    // na tela as setas são todas da mesma cor; o arquivo segue a tela
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, adx: sai.x, ady: sai.y, bdx: chega.x, bdy: chega.y, variant: 'normal' as const, label: rotulo.get(t.id), pontos }
  })
  const direita = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0)
  const fundo = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0)
  let topo = dy
  const lanes = desenho.raias.map((r) => { const l = { key: r.id, label: r.nome, y: topo, h: r.altura }; topo += r.altura; return l })
  return {
    width: lanes.length ? Math.max(LARGURA_MINIMA_RAIA - RAIA_ROTULO_W, direita + FOLGA_RAIA) : direita + 2 * GRADE,
    height: Math.max(topo, fundo + 2 * GRADE),
    nodes, edges, lanes: lanes.length ? lanes : undefined,
  }
}

/** Listas que moram dentro do bloco (um bloco não entra em si mesmo). */
function refsInternas(it: ItemFluxo | undefined): Set<string> {
  const refs = new Set<string>()
  const visitar = (x: ItemFluxo) => {
    if (x.kind === 'escolha') for (const c of [...x.caminhos, x.casoContrario]) { refs.add(c.id); c.itens.forEach(visitar) }
    else if (x.kind === 'paralelo') for (const c of x.caminhos) { refs.add(c.id); c.itens.forEach(visitar) }
  }
  if (it) visitar(it)
  return refs
}

/** Formas do desenho que andam junto quando o item é reordenado: a própria e, num bloco,
 *  tudo de dentro e os reencontros (do bloco e dos caminhos). */
function formasDoItem(it: ItemFluxo): Set<string> {
  const ids = new Set<string>()
  const visitar = (x: ItemFluxo) => {
    ids.add(x.id)
    if (x.kind === 'atividade') return
    ids.add(x.id + SUFIXO_REENCONTRO)
    const caminhos = x.kind === 'escolha' ? [...x.caminhos, x.casoContrario] : x.caminhos
    for (const c of caminhos) { ids.add(c.id + SUFIXO_REENCONTRO); c.itens.forEach(visitar) }
  }
  visitar(it)
  return ids
}

const TIPOS_NOVOS: readonly NovoItem[] =['userTask', 'serviceTask', 'escolha', 'paralelo']
const ehNovoItem = (x: string): x is NovoItem => (TIPOS_NOVOS as readonly string[]).includes(x)
/** Caixa que a forma nova vai ocupar (para centrá-la no ponto de soltar). */
const caixaNova = (tipo: NovoItem): Caixa =>
  nodeSize({ id: 'nova', type: tipo === 'escolha' ? 'exclusiveGateway' : tipo === 'paralelo' ? 'parallelGateway' : tipo }, 0, 0)

/** Tempo que o aviso de seta recusada fica na tela. */
const RECUSA_MS = 4000
/** Distância (px na tela) até a qual o ponteiro "está sobre" a seta; limites em unidades do fluxo. */
const TOLERANCIA_TELA = 12
const TOLERANCIA_MIN = 6
const TOLERANCIA_MAX = 40
const COR_RECUSA = '#D64535'

type Recusa = { motivo: string; pontos: Pt[]; vez: number }

/* ─── Componente ──────────────────────────────────────────────────────────── */
export function CanvasBpmn(props: CanvasBpmnProps): JSX.Element {
  const {
    fluxo, grafo, desenho, doc, steps, selecionado, nomeDoProcesso, revisaoDasConsultas, somenteLeitura = false,
    onSelecionar, onDesenho, onInserir, onSoltar, onMoverItem, onLigar, onReligar, onReligarSaida, onApagarSeta, onSelecionarSeta, setasComProblema, onRemover, vinculaveis, onInserirVinculada, focoEm, enquadrar,
  } = props
  const { resolvedTheme } = useTheme()
  const escuro = resolvedTheme === 'dark'
  /* O React Flow (fundo, miniatura) precisa de cor RESOLVIDA: as `var(--e-…)` do tema viram o
     valor da hora — e de novo a cada troca de tema. */
  const { tema } = useTema()
  const cor = useMemo(() => {
    const base = escuro ? CORES.escuro : CORES.claro
    if (typeof document === 'undefined') return base
    const cs = getComputedStyle(document.documentElement)
    const resolver = (v: string) => (v.startsWith('var(') ? cs.getPropertyValue(v.slice(4, -1)).trim() || v : v)
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, resolver(v)])) as typeof base
  }, [escuro, tema]) // eslint-disable-line react-hooks/exhaustive-deps -- `tema` não é lido: é o sinal de que as variáveis do <html> mudaram
  const sufixoId = useId().replace(/:/g, '')
  const marcador = `${MARCADOR_SETA}-${sufixoId}`
  const marcadorRecusa = `${MARCADOR_SETA}-recusa-${sufixoId}`
  const instancia = useRef<ReactFlowInstance<NoBpmn, SetaBpmn> | null>(null)

  /* As funções de consulta costumam nascer a cada render do pai: ficam numa ref (sempre a
     mais nova, atribuída no render para a projeção nunca ler uma antiga) e a projeção só
     refaz quando os DADOS mudam (grafo deriva do fluxo) ou quando `revisaoDasConsultas` muda. */
  const consultas = useRef({ responsavelDe: props.responsavelDe, prazoDe: props.prazoDe, problemasDe: props.problemasDe })
  consultas.current = { responsavelDe: props.responsavelDe, prazoDe: props.prazoDe, problemasDe: props.problemasDe }
  /** Altura provisória da raia enquanto a alça é arrastada (só na tela; grava ao soltar). */
  const [previa, setPrevia] = useState<{ id: string; altura: number } | null>(null)
  // a raia da prévia sumiu ou o desenho virou só leitura: descarta (ajuste durante o render)
  if (previa && (somenteLeitura || !desenho.raias.some((r) => r.id === previa.id))) setPrevia(null)
  /** Altura de cada forma: as edições de raia levam as formas pelo CENTRO delas. */
  const alturaDe = useMemo(() => {
    const h = new Map(grafo.nodes.map((n) => [n.id, tamanho(n).h]))
    return (id: string) => h.get(id) ?? 0
  }, [grafo])
  const desenhoVisto = useMemo(() => (previa ? redimensionarRaia(desenho, previa.id, previa.altura, alturaDe) : desenho), [desenho, previa, alturaDe])
  const projetados = useMemo(
    () => projetarNos({ grafo, desenho: desenhoVisto, steps, selecionado, nomeDoProcesso, ...consultas.current }),
    // revisaoDasConsultas não é lida aqui: só sinaliza que as consultas passaram a responder outra coisa
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revisão intencional (ver CanvasBpmnProps)
    [grafo, desenhoVisto, steps, selecionado, nomeDoProcesso, revisaoDasConsultas],
  )
  const setas = useMemo(() => projetarSetas(grafo, desenho, marcador), [grafo, desenho, marcador])
  const geo = useMemo(() => geometria(grafo, desenho), [grafo, desenho])
  const tracados = useMemo(() => tracarSetas(setas, geo), [setas, geo])

  /* Cópia local dos nós só para o arrasto ficar fluido; a cada nova projeção ela é
     substituída (ajuste durante o render, sem efeito) — nunca no meio de um arrasto. */
  const [nos, setNos] = useState(projetados)
  const [base, setBase] = useState(projetados)
  const [arrastando, setArrastando] = useState(false)
  if (base !== projetados && !arrastando) { setBase(projetados); setNos(projetados) }

  /** Seta sob o ponteiro durante um arrasto (paleta ou forma): é onde a forma entraria. */
  const [destaque, setDestaque] = useState<string | null>(null)
  /** Seta selecionada (clique): Delete ou "Apagar seta" a remove. */
  const [setaSel, setSetaSel] = useState<string | null>(null)
  // a seta sumiu ou o desenho virou só leitura: descarta (ajuste durante o render)
  if (setaSel && (somenteLeitura || !setas.some((s) => s.id === setaSel))) setSetaSel(null)
  const avisarSeta = useRef(onSelecionarSeta)
  avisarSeta.current = onSelecionarSeta
  useEffect(() => { avisarSeta.current?.(setaSel) }, [setaSel])
  const setasVistas = useMemo(() => setas.map((s) => ({
    ...s,
    // a seta é escolhida pelo clique e qualquer das pontas pode ser arrastada para outra forma
    selectable: !somenteLeitura, focusable: !somenteLeitura, selected: s.id === setaSel,
    reconnectable: !somenteLeitura,
    ...(s.id === destaque ? { data: { ...s.data!, destacada: true } } : {}),
    ...(setasComProblema?.includes(s.id) ? { data: { ...s.data!, problema: true } } : {}),
  })), [setas, destaque, setaSel, somenteLeitura, setasComProblema])

  /** O que há sob o ponto: `vaga` = a seta mais próxima, se ela for uma vaga do fluxo;
   *  `sobreSeta` = o ponto está em cima de alguma seta (vaga ou não — volta, encerra).
   *  `sem` = forma arrastada (as setas dela andam junto e um bloco não entra em si mesmo).
   *  A tolerância é de 12 px NA TELA: no fluxo ela cresce quando o desenho está afastado. */
  const alvoNoPonto = useCallback((p: Pt, sem?: string): { vaga: { setaId: string; ponto: PontoDeInsercao; antesDe: string } | null; sobreSeta: boolean } => {
    const internas = refsInternas(sem ? acharItem(fluxo, sem) : undefined)
    const candidatas = sem
      ? tracados.filter((t) => t.de !== sem && t.para !== sem && t.de !== sem + SUFIXO_REENCONTRO && t.para !== sem + SUFIXO_REENCONTRO)
      : tracados
    const zoom = instancia.current?.getZoom() ?? 1
    const tolerancia = Math.min(TOLERANCIA_MAX, Math.max(TOLERANCIA_MIN, TOLERANCIA_TELA / zoom))
    const setaId = setaSobPonto(candidatas, p, tolerancia)
    const t = setaId ? candidatas.find((x) => x.id === setaId) : undefined
    const ponto = t ? pontoDaSeta(fluxo, t.de, t.para) : null
    return { vaga: t && ponto && !internas.has(ponto.ref) ? { setaId: t.id, ponto, antesDe: t.para } : null, sobreSeta: !!t }
  }, [fluxo, tracados])

  /** Qualquer seta sob o ponto (a paleta pode entrar no meio de qualquer uma). */
  const setaNoPonto = useCallback((p: Pt): string | null => {
    const zoom = instancia.current?.getZoom() ?? 1
    return setaSobPonto(tracados, p, Math.min(TOLERANCIA_MAX, Math.max(TOLERANCIA_MIN, TOLERANCIA_TELA / zoom)))
  }, [tracados])

  const noFluxo = useCallback((e: Parameters<typeof ponteiro>[0]): Pt | null => {
    const q = ponteiro(e)
    return q && instancia.current ? instancia.current.screenToFlowPosition({ x: q.clientX, y: q.clientY }) : null
  }, [])

  /** Grava a posição; não faz nada se a forma ficou onde estava (clique sem mover). */
  const gravar = useCallback((id: string, p: { x: number; y: number }) => {
    const antes = desenho.posicoes[id]
    if (antes && antes.x === p.x && antes.y === p.y) return
    onDesenho({ ...desenho, posicoes: { ...desenho.posicoes, [id]: { x: p.x, y: p.y } } })
  }, [desenho, onDesenho])

  /* ─── Reordenar: arrastar uma atividade/bloco para cima de uma seta ─────── */
  /** Só atividades e blocos mudam de lugar no fluxo; início, fim e reencontro só andam. */
  const reordenavel = useCallback((id: string) => !!acharItem(fluxo, id), [fluxo])

  /** O desenho depois de pôr o item na vaga — o mesmo para a prévia e para a gravação.
   *  A largura é a do item (a caixa ou o bloco inteiro) mais a folga da inserção. */
  const desenhoReordenado = useCallback((id: string, antesDe: string, y: number): DesenhoBpmn => {
    const item = acharItem(fluxo, id)
    if (!item) return desenho
    const ids = formasDoItem(item)
    const caixas = [...ids].filter((i) => desenho.posicoes[i]).map((i) => ({ x: desenho.posicoes[i].x, w: geo.caixa(i).w }))
    if (!caixas.length) return desenho
    const largura = Math.max(...caixas.map((c) => c.x + c.w)) - Math.min(...caixas.map((c) => c.x)) + 3 * GRADE
    return reordenarNoDesenho(desenho, ids, id, largura, antesDe, y)
  }, [fluxo, desenho, geo])

  /* Prévia ao vivo (PO, 30/10/2026): com a forma sobre uma vaga, as OUTRAS já vão para onde
     ficariam — o vão abre ali e fecha na origem. A arrastada (e o resto do bloco dela) fica
     com o ponteiro. Só se recalcula quando a vaga muda, para o desenho não tremer. */
  const vagaDaPrevia = useRef<string | null>(null)
  const mostrarPrevia = useCallback((id: string, vaga: { setaId: string; antesDe: string } | null, y: number) => {
    const chave = vaga?.setaId ?? null
    if (chave === vagaDaPrevia.current) return
    vagaDaPrevia.current = chave
    const alvo = vaga ? desenhoReordenado(id, vaga.antesDe, y) : desenho
    const ficam = formasDoItem(acharItem(fluxo, id)!)
    setNos((atual) => atual.map((n) => (ficam.has(n.id) || !alvo.posicoes[n.id] ? n : { ...n, position: alvo.posicoes[n.id] })))
  }, [desenhoReordenado, desenho, fluxo])

  const onNodeDragStart = useCallback<OnNodeDrag<NoBpmn>>(() => { vagaDaPrevia.current = null; setArrastando(true) }, [])
  const onNodeDrag = useCallback<OnNodeDrag<NoBpmn>>((e, no) => {
    if (!reordenavel(no.id)) return
    const p = noFluxo(e)
    const vaga = p ? alvoNoPonto(p, no.id).vaga : null
    setDestaque(vaga?.setaId ?? null)
    mostrarPrevia(no.id, vaga, no.position.y)
  }, [noFluxo, reordenavel, alvoNoPonto, mostrarPrevia])
  const onNodeDragStop = useCallback<OnNodeDrag<NoBpmn>>((e, no) => {
    setArrastando(false) // o render seguinte ressincroniza, se a projeção mudou durante o arrasto
    setDestaque(null)
    const tevePrevia = vagaDaPrevia.current !== null
    vagaDaPrevia.current = null
    if (no.type === 'raia' || no.type === 'piscina') return
    const p = reordenavel(no.id) ? noFluxo(e) : null
    const vaga = p ? alvoNoPonto(p, no.id).vaga : null
    if (!vaga) {
      if (tevePrevia) setNos(projetados) // a prévia saiu de cima da vaga: as outras voltam
      gravar(no.id, no.position)
      return
    }
    // abre e fecha o espaço (a posição) e muda a ordem (o fluxo): as duas valem juntas
    onDesenho(desenhoReordenado(no.id, vaga.antesDe, no.position.y))
    onMoverItem(no.id, vaga.ponto)
  }, [gravar, noFluxo, onMoverItem, onDesenho, reordenavel, alvoNoPonto, desenhoReordenado, projetados])

  /* ─── Soltar da paleta ─────────────────────────────────────────────────── */
  const aceitaArrasto = (e: DragEvent) => !somenteLeitura && e.dataTransfer.types.includes(TIPO_ARRASTO_FORMA)
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!aceitaArrasto(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const p = noFluxo(e)
    setDestaque(p ? setaNoPonto(p) : null)
  }
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDestaque(null)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!aceitaArrasto(e)) return
    e.preventDefault()
    setDestaque(null)
    const tipo = e.dataTransfer.getData(TIPO_ARRASTO_FORMA)
    const p = noFluxo(e)
    if (!ehNovoItem(tipo) || !p) return
    // em cima de uma seta entra no meio dela; em área vazia fica solta, para ligar à mão
    const c = caixaNova(tipo)
    onSoltar(tipo, { x: naGrade(p.x - c.w / 2), y: naGrade(p.y - c.h / 2) }, setaNoPonto(p) ?? undefined)
  }

  /* ─── Setas à mão ──────────────────────────────────────────────────────── */
  const [recusa, setRecusa] = useState<Recusa | null>(null)
  useEffect(() => {
    if (!recusa) return
    const t = setTimeout(() => setRecusa(null), RECUSA_MS)
    return () => clearTimeout(t)
  }, [recusa])

  /** Traço da seta recusada: sai pela direita rumo à frente, por baixo quando volta. */
  const tracoRecusado = useCallback((de: string, para: string): Pt[] => {
    const volta = geo.pos(para).x < geo.pos(de).x
    const ladoS: LadoDaSeta = volta ? 'base' : 'direita', ladoT: LadoDaSeta = volta ? 'base' : 'esquerda'
    return polilinhaDaSeta(geo.alca(de, ladoS), ladoS, geo.alca(para, ladoT), ladoT)
  }, [geo])

  const recusar = useCallback((motivo: string, de: string, para: string) =>
    setRecusa((antes) => ({ motivo, pontos: tracoRecusado(de, para), vez: (antes?.vez ?? 0) + 1 })), [tracoRecusado])
  /* Qualquer forma liga a qualquer outra: o traço só é recusado no que nunca faz sentido (seta
     no Início, saída do Fim, laço na mesma forma, seta repetida). O resto — uma etapa com duas
     saídas, um caminho sem fim — vira pendência do desenho, não bloqueio do traço. */
  const tentarLigar = useCallback((de: string, para: string) => {
    if (somenteLeitura || de === para) return
    const motivo = podeLigar(doc, de, para)
    if (motivo) recusar(motivo, de, para)
    else { setRecusa(null); onLigar(de, para) }
  }, [doc, onLigar, somenteLeitura, recusar])

  const isValidConnection = useCallback((c: Edge | Connection) => !podeLigar(doc, c.source, c.target), [doc])
  const onConnect = useCallback((c: Connection) => tentarLigar(c.source, c.target), [tentarLigar])
  /** Arrastou uma das pontas de uma seta para outra forma (só uma muda por vez). */
  const onReconnect = useCallback<OnReconnect<SetaBpmn>>((velha, nova) => {
    if (somenteLeitura) return
    const mudouSaida = nova.source !== velha.source, mudouChegada = nova.target !== velha.target
    if (mudouSaida === mudouChegada) return
    const motivo = podeLigar({ ...doc, setas: doc.setas.filter((s) => s.id !== velha.id) }, nova.source, nova.target)
    if (motivo) { recusar(motivo, nova.source, nova.target); return }
    setRecusa(null)
    if (mudouSaida) onReligarSaida(velha.id, nova.source)
    else onReligar(velha.id, nova.target)
  }, [doc, onReligar, onReligarSaida, somenteLeitura, recusar])
  const apagarSetaSel = useCallback(() => {
    if (!setaSel || somenteLeitura) return
    onApagarSeta(setaSel)
    setSetaSel(null)
  }, [setaSel, somenteLeitura, onApagarSeta])
  const onEdgeClick = useCallback((_e: unknown, s: SetaBpmn) => {
    if (somenteLeitura) return
    setSetaSel(s.id)
    onSelecionar(null)
  }, [somenteLeitura, onSelecionar])
  /** Soltou fora de uma alça válida: se caiu numa forma, julga a ligação (aceita ou explica). */
  const onConnectEnd = useCallback<OnConnectEnd>((e, estado) => {
    if (estado.isValid || !estado.fromNode) return
    let alvo = estado.toNode?.id ?? null
    if (!alvo) {
      const q = ponteiro(e)
      const el = q ? document.elementFromPoint(q.clientX, q.clientY) : null
      alvo = el?.closest('.react-flow__node')?.getAttribute('data-id') ?? null
    }
    if (alvo && !alvo.startsWith('raia:') && alvo !== 'piscina') tentarLigar(estado.fromNode.id, alvo)
  }, [tentarLigar])

  /* "Ligar com seta" nas ações rápidas: a próxima forma escolhida (clique ou teclado) é o destino. */
  const [ligandoDe, setLigandoDe] = useState<string | null>(null)
  useEffect(() => {
    if (!ligandoDe) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setLigandoDe(null) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ligandoDe])
  // só leitura desliga o modo (ajuste durante o render, como a cópia dos nós)
  if (somenteLeitura && ligandoDe) setLigandoDe(null)
  const onPaneClick = useCallback(() => { setLigandoDe(null); setSetaSel(null) }, [])
  /* Clicar (ou Enter/espaço) na forma que JÁ está selecionada: o React Flow não emite mudança
     de seleção, mas a pessoa quer a gaveta de volta (fechada pelo X, por exemplo). */
  const ehForma = (id: string | null | undefined) => !!id && !id.startsWith('raia:') && id !== 'piscina'
  const onNodeClick = useCallback((_e: unknown, n: NoBpmn) => {
    if (n.id === selecionado && ehForma(n.id) && !ligandoDe) onSelecionar(n.id)
  }, [selecionado, ligandoDe, onSelecionar])
  const teclaNaForma = (e: TeclaReact<HTMLDivElement>) => {
    const campo = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')
    if ((e.key === 'Delete' || e.key === 'Backspace') && setaSel && !campo) { e.preventDefault(); apagarSetaSel(); return }
    if (e.key !== 'Enter' && e.key !== ' ') return
    const id = (e.target as HTMLElement).closest?.('.react-flow__node')?.getAttribute('data-id')
    if (id && id === selecionado && ehForma(id) && !ligandoDe) onSelecionar(id)
  }

  const onNodesChange = useCallback((mudancas: NodeChange<NoBpmn>[]) => {
    // seleção é controlada por fora: só repassa a intenção
    const sel = mudancas.filter((m) => m.type === 'select')
    const escolhido = sel.find((m) => m.selected)
    // no modo "Ligar com seta", escolher uma forma (clique, ou Enter/espaço no teclado) é o destino
    if (ligandoDe && escolhido) { setLigandoDe(null); tentarLigar(ligandoDe, escolhido.id) }
    if (escolhido) { setSetaSel(null); onSelecionar(escolhido.id) }
    else if (sel.length) onSelecionar(null)
    // mover pelo teclado não passa por onNodeDragStop: grava aqui
    if (!arrastando) {
      for (const m of mudancas) if (m.type === 'position' && m.position && !m.dragging) gravar(m.id, m.position)
    }
    const resto = mudancas.filter((m) => m.type === 'position' || m.type === 'dimensions')
    if (resto.length) setNos((atual) => applyNodeChanges(resto, atual))
  }, [arrastando, gravar, ligandoDe, onSelecionar, tentarLigar])

  /* ─── Ações rápidas da forma selecionada ───────────────────────────────── */
  const itemSel = selecionado ? acharItem(fluxo, selecionado) : undefined
  const acoes = !somenteLeitura && !arrastando && itemSel ? itemSel : null
  /* Ligar e excluir valem para QUALQUER forma do desenho (losango solto, o que junta, e
     também com o desenho incompleto); "Próxima: …" precisa do lugar no fluxo (`acoes`). */
  const formaSel = selecionado ? doc.formas.find((f) => f.id === selecionado) : undefined
  const editavelSel = !somenteLeitura && !arrastando && formaSel && formaSel.tipo !== 'start' && formaSel.tipo !== 'end' ? formaSel : null
  const podeLigarDaqui = !!editavelSel
  /** Vaga logo depois do item selecionado e o lugar da forma nova: à direita do item (do
   *  reencontro, se for um bloco), centrada na altura dele. */
  const depoisDoSelecionado = (tipo: NovoItem): { ponto: PontoDeInsercao; perto: Pt } | null => {
    if (!acoes) return null
    const local = localDoItem(fluxo, acoes.id)
    if (!local) return null
    const ancora = acoes.kind === 'atividade' ? acoes.id : acoes.id + SUFIXO_REENCONTRO
    const p = geo.pos(ancora), c = geo.caixa(ancora), nova = caixaNova(tipo)
    return { ponto: { ref: local.ref, indice: local.indice + 1 }, perto: { x: naGrade(p.x + c.w + 3 * GRADE), y: naGrade(p.y + c.h / 2 - nova.h / 2) } }
  }
  const proxima = (tipo: NovoItem) => {
    const v = depoisDoSelecionado(tipo)
    if (v) onInserir(v.ponto, tipo, v.perto)
  }

  /* "Próxima: mesma configuração de…": menu com as atividades que podem ser repetidas. */
  /* aberto PARA uma forma: selecionar outra fecha o menu */
  const [menuVinculoDe, setMenuVinculoDe] = useState<string | null>(null)
  const podeVincular = !!onInserirVinculada && !!vinculaveis?.length
  const menuVinculo = !!acoes && podeVincular && menuVinculoDe === acoes.id
  const setMenuVinculo = (v: boolean | ((x: boolean) => boolean)) => {
    const novo = typeof v === 'function' ? v(menuVinculo) : v
    setMenuVinculoDe(novo && acoes ? acoes.id : null)
  }
  const vincular = (origemId: string) => {
    setMenuVinculo(false)
    const v = depoisDoSelecionado('userTask')
    if (v && onInserirVinculada) onInserirVinculada(v.ponto, origemId, v.perto)
  }
  const listaVinculo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (menuVinculo) listaVinculo.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [menuVinculo])
  const teclasDoVinculo = (e: TeclaReact<HTMLDivElement>) => {
    const itens = Array.from(listaVinculo.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = itens.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); setMenuVinculo(false)
      document.querySelector<HTMLElement>(`[data-vinculo-de="${sufixoId}"]`)?.focus()
    } else if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); itens[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); itens[itens.length - 1]?.focus() }
  }

  /* ─── Centrar numa forma (ex.: item da saúde clicado) ──────────────────── */
  useEffect(() => {
    const i = instancia.current
    if (!focoEm || !i) return
    const p = geo.pos(focoEm.id), c = geo.caixa(focoEm.id)
    void i.setCenter(p.x + c.w / 2, p.y + c.h / 2, { zoom: Math.max(i.getZoom(), 0.8), duration: 300 })
    // só o pedido manda; mudar o desenho depois não recentraliza
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoEm])

  /* ─── Enquadrar a pedido (Organizar) ─────────────────────────────────── */
  const enquadrarVisto = useRef(enquadrar)
  useEffect(() => {
    if (enquadrar === enquadrarVisto.current) return
    enquadrarVisto.current = enquadrar
    // um quadro depois: o React Flow já recebeu as posições novas
    const raf = requestAnimationFrame(() => { void instancia.current?.fitView({ ...ENQUADRAR, duration: 300 }) })
    return () => cancelAnimationFrame(raf)
  }, [enquadrar])

  /* ─── Miniatura: automática (só quando o desenho não cabe na tela) ou a escolha do usuário */
  const [miniaturaPref, setMiniaturaPref] = useState<boolean | null>(null)
  const [naoCabe, setNaoCabe] = useState(false)
  useEffect(() => {
    try { const v = localStorage.getItem(PREF_MINIATURA); if (v === '1' || v === '0') setMiniaturaPref(v === '1') } catch { /* sem storage */ }
  }, [])
  const miniatura = miniaturaPref ?? naoCabe
  const alternarMiniatura = () => {
    const v = !miniatura
    setMiniaturaPref(v)
    try { localStorage.setItem(PREF_MINIATURA, v ? '1' : '0') } catch { /* sem storage */ }
  }

  /* ─── Edição das raias (só o desenho; nenhuma forma sai do lugar) ──────── */
  const acoesDeRaia = useMemo<AcoesDeRaia>(() => {
    // as funções puras devolvem o mesmo desenho quando nada muda: aí não grava
    const aplicar = (novo: DesenhoBpmn) => { if (novo !== desenho) onDesenho(novo) }
    return {
      editavel: !somenteLeitura,
      renomear: (id, nome) => aplicar(renomearRaia(desenho, id, nome)),
      redimensionar: (id, altura) => aplicar(redimensionarRaia(desenho, id, altura, alturaDe)),
      previa: (id, altura) => setPrevia(altura === null ? null : { id, altura }),
      mover: (id, direcao) => aplicar(moverRaia(desenho, id, direcao, alturaDe)),
      remover: (id) => aplicar(removerRaia(desenho, id, alturaDe)),
      adicionar: () => onDesenho(adicionarRaia(desenho)),
    }
  }, [desenho, onDesenho, somenteLeitura, alturaDe])

  const rotulosDeAcesso = useMemo(() => rotulosAria(somenteLeitura), [somenteLeitura])

  const corNoMini = useCallback((n: NoBpmn) => {
    if (n.type === 'raia' || n.type === 'piscina') return cor.miniRaia
    if (n.type === 'tarefa') return cor.miniTarefa
    if (n.type === 'evento') return cor.miniEvento
    return n.data.tipo === 'paralelo' ? cor.miniParalelo : cor.miniEscolha
  }, [cor])

  const ACAO = 'flex h-[22px] w-[26px] items-center justify-center rounded-md border-0 bg-transparent hover:bg-[rgba(20,36,32,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:hover:bg-white/5 dark:focus-visible:outline-spark'

  return (
    <div className="desenho-bpmn relative h-full w-full font-sans [--bpmn-seta:var(--e-5E6F66)] [--bpmn-seta-destaque:var(--e-11804F)] dark:[--bpmn-seta:var(--e-7B8F84)] dark:[--bpmn-seta-destaque:var(--e-C6F24E)]"
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onKeyDown={teclaNaForma}>
      {/* pontas das setas, uma vez por canvas; a cor vem da mesma variável do traço */}
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <marker id={marcador} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--bpmn-seta)' }} />
          </marker>
          <marker id={marcadorRecusa} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={COR_RECUSA} />
          </marker>
        </defs>
      </svg>
      <ContextoRaias.Provider value={acoesDeRaia}>
        <ReactFlow<NoBpmn, SetaBpmn>
          nodes={nos}
          edges={setasVistas}
          nodeTypes={tiposDeNo}
          edgeTypes={tiposDeSeta}
          onInit={(i) => {
            instancia.current = i
            // depois do enquadramento inicial: abaixo de 85% o desenho não cabe — a miniatura ajuda
            requestAnimationFrame(() => setNaoCabe(i.getZoom() < 0.85))
          }}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          onEdgeClick={onEdgeClick}
          nodesDraggable={!somenteLeitura}
          nodesConnectable={!somenteLeitura}
          edgesReconnectable={!somenteLeitura}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          snapToGrid
          snapGrid={[GRADE, GRADE]}
          fitView
          fitViewOptions={ENQUADRAR}
          minZoom={ZOOM_MIN}
          maxZoom={ZOOM_MAX}
          colorMode={escuro ? 'dark' : 'light'}
          ariaLabelConfig={rotulosDeAcesso}
        >
          <Background variant={BackgroundVariant.Dots} gap={GRADE} size={1.2} color={cor.ponto} bgColor={cor.fundo} />
          {miniatura && (
            <MiniMap<NoBpmn> pannable zoomable nodeColor={corNoMini} nodeStrokeWidth={0} maskColor={cor.mascara} bgColor={cor.mini}
              style={{ width: 168, height: 108, marginBottom: 44 }}
              className="!rounded-lg shadow-[0_0_0_1px_rgba(20,36,32,0.12)] dark:shadow-[0_0_0_1px_var(--e-2A3B32)]" />
          )}
          <Panel position="bottom-right">
            <button type="button" onClick={alternarMiniatura} aria-pressed={miniatura}
              title={miniatura ? 'Esconder a miniatura' : 'Mostrar a miniatura do desenho'}
              className="flex h-7 items-center gap-1.5 rounded-md bg-white px-2 font-sans text-[11px] font-bold text-[var(--e-2E3E36)] shadow-[0_0_0_1px_rgba(20,36,32,0.12)] hover:bg-[var(--e-F2F6F1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:bg-[var(--e-0F1914)] dark:text-[var(--e-C9D6CE)] dark:shadow-[0_0_0_1px_var(--e-2A3B32)] dark:hover:bg-white/5 dark:focus-visible:outline-spark">
              <MapIcon aria-hidden className="h-3.5 w-3.5" />Miniatura
            </button>
          </Panel>
          <Controls showInteractive={false} position="bottom-left" />
          {setaSel && !somenteLeitura && (
            <Panel position="top-left">
              <div role="toolbar" aria-label="Seta selecionada"
                className="flex items-center gap-2 rounded-[10px] bg-white py-1 pl-3 pr-1 font-sans text-[11.5px] text-[var(--e-2E3E36)] shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:text-[var(--e-C9D6CE)] dark:shadow-[0_0_0_1px_var(--e-2A3B32)]">
                Seta selecionada · arraste uma das pontas para religar
                <button type="button" onClick={apagarSetaSel}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 font-bold text-[#B42318] hover:bg-[rgba(180,35,24,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:text-[#FDA29B] dark:hover:bg-white/5">
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />Apagar seta
                </button>
              </div>
            </Panel>
          )}
          {recusa && (
            <ViewportPortal>
              <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
                <path d={'M' + recusa.pontos.map((q) => `${q.x} ${q.y}`).join(' L')} fill="none" stroke={COR_RECUSA}
                  strokeWidth={2} strokeDasharray="6 5" markerEnd={`url(#${marcadorRecusa})`} />
              </svg>
            </ViewportPortal>
          )}
          <NodeToolbar nodeId={editavelSel?.id} isVisible={!!editavelSel} position={Position.Right} offset={14}>
            <div role="toolbar" aria-label="Ações rápidas" aria-orientation="vertical"
              className="flex flex-col gap-1 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:shadow-[0_0_0_1px_var(--e-2A3B32),0_12px_24px_-12px_rgba(0,0,0,0.7)]">
              {acoes && (
                <>
                  <button type="button" title="Próxima: tarefa" aria-label="Próxima: tarefa" className={ACAO} onClick={() => proxima('userTask')}>
                    <span aria-hidden className="box-border h-[11px] w-4 rounded-[3px] border-[1.5px] border-[#0369A1] bg-[#E0F2FE] dark:border-[#7DD3FC] dark:bg-[rgba(56,189,248,0.12)]" />
                  </button>
                  <button type="button" title="Próxima: escolha" aria-label="Próxima: escolha" className={ACAO} onClick={() => proxima('escolha')}>
                    <span aria-hidden className="box-border h-2.5 w-2.5 rotate-45 border-[1.5px] border-[#6D28D9] bg-[#EDE9FE] dark:border-[#C4B5FD] dark:bg-[rgba(167,139,250,0.14)]" />
                  </button>
                </>
              )}
              {acoes && podeVincular && (
                <button type="button" title="Próxima: mesma configuração de…" aria-label="Próxima: mesma configuração de…"
                  aria-haspopup="menu" aria-expanded={menuVinculo} data-vinculo-de={sufixoId}
                  className={`${ACAO} text-[#0369A1] dark:text-[#7DD3FC] ${menuVinculo ? 'bg-[rgba(20,36,32,0.08)] dark:bg-white/10' : ''}`}
                  onClick={() => setMenuVinculo((v) => !v)}>
                  <Link2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
              {podeLigarDaqui && (
                <button type="button" title="Ligar com seta" aria-label="Ligar com seta" aria-pressed={ligandoDe === editavelSel?.id}
                  className={`${ACAO} text-[13px] text-[var(--e-142420)] dark:text-white ${ligandoDe === editavelSel?.id ? 'bg-[rgba(198,242,78,0.35)] dark:bg-[rgba(198,242,78,0.14)]' : ''}`}
                  onClick={() => setLigandoDe((x) => (x === editavelSel?.id ? null : editavelSel?.id ?? null))}>
                  <span aria-hidden>→</span>
                </button>
              )}
              <button type="button" title="Excluir" aria-label="Excluir" className={`${ACAO} text-[#B42318] dark:text-[#FDA29B]`}
                onClick={() => editavelSel && onRemover(editavelSel.id)}>
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
            {menuVinculo && podeVincular && (
              <div ref={listaVinculo} role="menu" aria-label="Repetir com a mesma configuração de" onKeyDown={teclasDoVinculo}
                className="absolute left-full top-0 ml-2 max-h-[260px] w-[240px] overflow-y-auto rounded-[10px] bg-white p-1 font-sans shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:shadow-[0_0_0_1px_var(--e-2A3B32),0_12px_24px_-12px_rgba(0,0,0,0.7)]">
                <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--e-5E6F66)] dark:text-[var(--e-9DB0A5)]">Mesma configuração de</p>
                {vinculaveis!.map((v) => (
                  <button key={v.id} type="button" role="menuitem" tabIndex={-1} onClick={() => vincular(v.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-[var(--e-142420)] hover:bg-[rgba(20,36,32,0.06)] focus-visible:bg-[rgba(20,36,32,0.06)] focus-visible:outline-none dark:text-[var(--e-E3ECE6)] dark:hover:bg-white/5 dark:focus-visible:bg-white/5">
                    <Link2 aria-hidden className="h-3 w-3 shrink-0 text-[#0369A1] dark:text-[#7DD3FC]" />
                    <span className="truncate">{v.nome}</span>
                  </button>
                ))}
              </div>
            )}
          </NodeToolbar>
        </ReactFlow>
      </ContextoRaias.Provider>
      {ligandoDe && (
        <p role="status" className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-[10px] bg-white px-3 py-2 text-xs font-semibold text-[var(--e-2E3E36)] shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:text-[var(--e-C9D6CE)] dark:shadow-[0_0_0_1px_var(--e-2A3B32)]">
          Clique na forma para onde a seta vai. Esc cancela.
        </p>
      )}
      {recusa && (
        <div role="alert" className="absolute left-1/2 top-3 z-10 w-[300px] max-w-[calc(100%-32px)] -translate-x-1/2">
          <button type="button" onClick={() => setRecusa(null)} title="Fechar"
            className="flex w-full gap-2 rounded-[10px] border-0 bg-[#FFF1EF] px-[11px] py-[9px] text-left font-sans text-xs leading-[1.4] text-[#7A1E10] shadow-[0_0_0_1px_#F2B8AF,0_14px_30px_-14px_rgba(12,20,16,0.4)] dark:bg-[#2A1412] dark:text-[#FFD2CC] dark:shadow-[0_0_0_1px_rgba(214,69,53,0.6),0_14px_30px_-14px_rgba(0,0,0,0.7)]">
            <span aria-hidden className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#D64535] text-[11px] font-extrabold text-white">✕</span>
            <span><b>Essa seta não pode ser criada.</b> {recusa.motivo}</span>
          </button>
        </div>
      )}
    </div>
  )
}
