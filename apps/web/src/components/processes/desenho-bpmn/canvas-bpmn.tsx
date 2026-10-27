'use client'

/* ─── Canvas do desenho BPMN ───────────────────────────────────────────────────
   Projeta o grafo gerado dos blocos + o desenho gravado (posições e raias) em nós e
   setas do React Flow. O canvas não muda o fluxo: mover uma forma só devolve um novo
   `DesenhoBpmn` por `onDesenho`; selecionar avisa `onSelecionar`. As intenções que mudam
   o fluxo só são AVISADAS: soltar uma forma da paleta (`onInserir`), arrastar uma forma
   para cima de uma seta (`onMoverItem`), puxar uma seta à mão (`onLigar`, depois de
   `ligacaoPermitida`) e as ações rápidas da forma selecionada. Quem muda o fluxo é a página. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type JSX } from 'react'
import { useTheme } from 'next-themes'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, NodeToolbar, Position, ViewportPortal, applyNodeChanges,
  type AriaLabelConfig, type Connection, type Edge, type NodeChange, type OnConnectEnd,
  type OnNodeDrag, type ReactFlowInstance,
} from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import type { DesenhoBpmn, StepFormSchema } from '@nxt/types'
import {
  SUFIXO_REENCONTRO, acharItem, ligacaoPermitida, localDoItem, pontoDaSeta,
  type FimCaminho, type FluxoBlocos, type GrafoGerado, type ItemFluxo, type PontoDeInsercao,
} from '@nxt/workflow-core'
import { GRADE, RAIA_ROTULO_W, avisoDeRaia, polilinhaDaSeta, raiaNaAltura, setaSobPonto, type LadoDaSeta } from '@/lib/desenho-bpmn'
import { nodeSize, type FlowNodeType } from '@/lib/flow-layout'
import { ZOOM_MAX, ZOOM_MIN } from '@/components/processes/flow-shared'
import type { NovoItem } from '@/components/processes/workflow-blocos'
import {
  EVENTO_RECUO, FAIXA_PISCINA, MARCADOR_SETA, rotuloDaForma, tiposDeNo, tiposDeSeta,
  type NoBpmn, type SetaBpmn, type TipoLosango,
} from './formas'
import { TIPO_ARRASTO_FORMA } from './paleta'

export interface CanvasBpmnProps {
  fluxo: FluxoBlocos; grafo: GrafoGerado; desenho: DesenhoBpmn
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
  onMoverItem: (id: string, ponto: PontoDeInsercao) => void
  /** Seta desenhada à mão e aceita por `ligacaoPermitida`: o caminho passa a voltar/encerrar. */
  onLigar: (caminhoId: string, fim: FimCaminho) => void
  onRemover: (id: string) => void
  /** Nome do processo, na faixa vertical da piscina. */
  nomeDoProcesso?: string
  /** Muda quando o que `responsavelDe`/`prazoDe`/`problemasDe` leem mudar (papéis e rótulos
   *  carregados depois, pendências recalculadas). As funções em si podem trocar de identidade
   *  a cada render sem reprojetar; é esta revisão que manda refazer os cartões e as marcas. */
  revisaoDasConsultas?: unknown
}

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
  claro: { fundo: '#F4F7F4', ponto: 'rgba(20,36,32,0.13)', mini: '#FFFFFF', miniRaia: '#E6EDE8', miniTarefa: '#075985', miniEscolha: '#5B21B6', miniParalelo: '#9F1239', miniEvento: '#11804F', mascara: 'rgba(20,36,32,0.08)' },
  escuro: { fundo: '#0C1511', ponto: 'rgba(255,255,255,0.07)', mini: '#0F1914', miniRaia: 'rgba(255,255,255,0.06)', miniTarefa: '#7DD3FC', miniEscolha: '#C4B5FD', miniParalelo: '#FDA4B8', miniEvento: '#C6F24E', mascara: 'rgba(0,0,0,0.35)' },
}

/* ─── Projeção: grafo + desenho → nós e setas do React Flow ───────────────── */
type Projecao = Pick<CanvasBpmnProps, 'grafo' | 'desenho' | 'steps' | 'selecionado' | 'responsavelDe' | 'prazoDe' | 'problemasDe' | 'nomeDoProcesso'>

function projetarNos({ grafo, desenho, steps, selecionado, responsavelDe, prazoDe, problemasDe, nomeDoProcesso }: Projecao): NoBpmn[] {
  const pos = (id: string) => desenho.posicoes[id] ?? { x: 0, y: 0 }
  const nos: NoBpmn[] = []

  // piscina + raias: fundo empilhado a partir de y = 0. À esquerda do x = 0 ficam a coluna
  // do rótulo das raias e, antes dela, a faixa vertical com o nome do processo.
  const direita = grafo.nodes.reduce((m, n) => Math.max(m, pos(n.id).x + tamanho(n).w), 0)
  const largura = Math.max(LARGURA_MINIMA_RAIA, RAIA_ROTULO_W + direita + FOLGA_RAIA)
  let topo = 0
  desenho.raias.forEach((r, i) => {
    nos.push({
      id: `raia:${r.id}`, type: 'raia', position: { x: -RAIA_ROTULO_W, y: topo },
      data: { nome: r.nome, largura, altura: r.altura, indice: i, primeira: i === 0, ultima: i === desenho.raias.length - 1 },
      width: largura, height: r.altura, zIndex: -1,
      draggable: false, selectable: false, connectable: false, focusable: false, deletable: false,
      style: { pointerEvents: 'none' }, // clique e arrasto passam para o fundo (tirar seleção, mover a vista)
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

const TIPOS_NOVOS: readonly NovoItem[] = ['userTask', 'serviceTask', 'escolha', 'paralelo']
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
    fluxo, grafo, desenho, steps, selecionado, nomeDoProcesso, revisaoDasConsultas, somenteLeitura = false,
    onSelecionar, onDesenho, onInserir, onMoverItem, onLigar, onRemover,
  } = props
  const { resolvedTheme } = useTheme()
  const escuro = resolvedTheme === 'dark'
  const cor = escuro ? CORES.escuro : CORES.claro
  const sufixoId = useId().replace(/:/g, '')
  const marcador = `${MARCADOR_SETA}-${sufixoId}`
  const marcadorRecusa = `${MARCADOR_SETA}-recusa-${sufixoId}`
  const instancia = useRef<ReactFlowInstance<NoBpmn, SetaBpmn> | null>(null)

  /* As funções de consulta costumam nascer a cada render do pai: ficam numa ref (sempre a
     mais nova, atribuída no render para a projeção nunca ler uma antiga) e a projeção só
     refaz quando os DADOS mudam (grafo deriva do fluxo) ou quando `revisaoDasConsultas` muda. */
  const consultas = useRef({ responsavelDe: props.responsavelDe, prazoDe: props.prazoDe, problemasDe: props.problemasDe })
  consultas.current = { responsavelDe: props.responsavelDe, prazoDe: props.prazoDe, problemasDe: props.problemasDe }
  const projetados = useMemo(
    () => projetarNos({ grafo, desenho, steps, selecionado, nomeDoProcesso, ...consultas.current }),
    // revisaoDasConsultas não é lida aqui: só sinaliza que as consultas passaram a responder outra coisa
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revisão intencional (ver CanvasBpmnProps)
    [grafo, desenho, steps, selecionado, nomeDoProcesso, revisaoDasConsultas],
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
  const setasVistas = useMemo(
    () => (destaque ? setas.map((s) => (s.id === destaque ? { ...s, data: { ...s.data!, destacada: true } } : s)) : setas),
    [setas, destaque],
  )

  /** O que há sob o ponto: `vaga` = a seta mais próxima, se ela for uma vaga do fluxo;
   *  `sobreSeta` = o ponto está em cima de alguma seta (vaga ou não — volta, encerra).
   *  `sem` = forma arrastada (as setas dela andam junto e um bloco não entra em si mesmo).
   *  A tolerância é de 12 px NA TELA: no fluxo ela cresce quando o desenho está afastado. */
  const alvoNoPonto = useCallback((p: Pt, sem?: string): { vaga: { setaId: string; ponto: PontoDeInsercao } | null; sobreSeta: boolean } => {
    const internas = refsInternas(sem ? acharItem(fluxo, sem) : undefined)
    const candidatas = sem
      ? tracados.filter((t) => t.de !== sem && t.para !== sem && t.de !== sem + SUFIXO_REENCONTRO && t.para !== sem + SUFIXO_REENCONTRO)
      : tracados
    const zoom = instancia.current?.getZoom() ?? 1
    const tolerancia = Math.min(TOLERANCIA_MAX, Math.max(TOLERANCIA_MIN, TOLERANCIA_TELA / zoom))
    const setaId = setaSobPonto(candidatas, p, tolerancia)
    const t = setaId ? candidatas.find((x) => x.id === setaId) : undefined
    const ponto = t ? pontoDaSeta(fluxo, t.de, t.para) : null
    return { vaga: t && ponto && !internas.has(ponto.ref) ? { setaId: t.id, ponto } : null, sobreSeta: !!t }
  }, [fluxo, tracados])

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

  const onNodeDragStart = useCallback<OnNodeDrag<NoBpmn>>(() => setArrastando(true), [])
  const onNodeDrag = useCallback<OnNodeDrag<NoBpmn>>((e, no) => {
    if (!reordenavel(no.id)) return
    const p = noFluxo(e)
    setDestaque(p ? alvoNoPonto(p, no.id).vaga?.setaId ?? null : null)
  }, [noFluxo, reordenavel, alvoNoPonto])
  const onNodeDragStop = useCallback<OnNodeDrag<NoBpmn>>((e, no) => {
    setArrastando(false) // o render seguinte ressincroniza, se a projeção mudou durante o arrasto
    setDestaque(null)
    if (no.type === 'raia' || no.type === 'piscina') return
    gravar(no.id, no.position)
    if (!reordenavel(no.id)) return
    const p = noFluxo(e)
    const vaga = p ? alvoNoPonto(p, no.id).vaga : null
    if (vaga) onMoverItem(no.id, vaga.ponto)
  }, [gravar, noFluxo, onMoverItem, reordenavel, alvoNoPonto])

  /* ─── Soltar da paleta ─────────────────────────────────────────────────── */
  const aceitaArrasto = (e: DragEvent) => !somenteLeitura && e.dataTransfer.types.includes(TIPO_ARRASTO_FORMA)
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!aceitaArrasto(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const p = noFluxo(e)
    setDestaque(p ? alvoNoPonto(p).vaga?.setaId ?? null : null)
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
    // em cima de uma seta entra naquela vaga; em área vazia, no fim do fluxo principal;
    // em cima de uma seta que não é vaga (volta, encerra) não faz nada
    const { vaga, sobreSeta } = alvoNoPonto(p)
    if (!vaga && sobreSeta) return
    const ponto = vaga?.ponto ?? { ref: 'raiz', indice: fluxo.itens.length }
    const c = caixaNova(tipo)
    onInserir(ponto, tipo, { x: naGrade(p.x - c.w / 2), y: naGrade(p.y - c.h / 2) })
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

  const tentarLigar = useCallback((de: string, para: string) => {
    if (somenteLeitura || de === para) return
    const r = ligacaoPermitida(fluxo, de, para)
    if (r.ok) { setRecusa(null); onLigar(r.caminhoId, r.fim) }
    else setRecusa((antes) => ({ motivo: r.motivo, pontos: tracoRecusado(de, para), vez: (antes?.vez ?? 0) + 1 }))
  }, [fluxo, onLigar, somenteLeitura, tracoRecusado])

  const isValidConnection = useCallback((c: Edge | Connection) =>
    c.source !== c.target && ligacaoPermitida(fluxo, c.source, c.target).ok, [fluxo])
  const onConnect = useCallback((c: Connection) => tentarLigar(c.source, c.target), [tentarLigar])
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
  const onPaneClick = useCallback(() => setLigandoDe(null), [])

  const onNodesChange = useCallback((mudancas: NodeChange<NoBpmn>[]) => {
    // seleção é controlada por fora: só repassa a intenção
    const sel = mudancas.filter((m) => m.type === 'select')
    const escolhido = sel.find((m) => m.selected)
    // no modo "Ligar com seta", escolher uma forma (clique, ou Enter/espaço no teclado) é o destino
    if (ligandoDe && escolhido) { setLigandoDe(null); tentarLigar(ligandoDe, escolhido.id) }
    if (escolhido) onSelecionar(escolhido.id)
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
  const podeLigar = !!acoes && ligacaoPermitida(fluxo, acoes.id, fluxo.fimId).ok
  const proxima = (tipo: NovoItem) => {
    if (!acoes) return
    const local = localDoItem(fluxo, acoes.id)
    if (!local) return
    // a forma nova nasce à direita do item (do reencontro, se for um bloco), centrada na altura dele
    const ancora = acoes.kind === 'atividade' ? acoes.id : acoes.id + SUFIXO_REENCONTRO
    const p = geo.pos(ancora), c = geo.caixa(ancora), nova = caixaNova(tipo)
    onInserir({ ref: local.ref, indice: local.indice + 1 }, tipo, { x: naGrade(p.x + c.w + 3 * GRADE), y: naGrade(p.y + c.h / 2 - nova.h / 2) })
  }

  const rotulosDeAcesso = useMemo(() => rotulosAria(somenteLeitura), [somenteLeitura])

  const corNoMini = useCallback((n: NoBpmn) => {
    if (n.type === 'raia' || n.type === 'piscina') return cor.miniRaia
    if (n.type === 'tarefa') return cor.miniTarefa
    if (n.type === 'evento') return cor.miniEvento
    return n.data.tipo === 'paralelo' ? cor.miniParalelo : cor.miniEscolha
  }, [cor])

  const ACAO = 'flex h-[22px] w-[26px] items-center justify-center rounded-md border-0 bg-transparent hover:bg-[rgba(20,36,32,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#11804F] dark:hover:bg-white/5 dark:focus-visible:outline-spark'

  return (
    <div className="relative h-full w-full font-sans [--bpmn-seta:#5E6F66] [--bpmn-seta-destaque:#11804F] dark:[--bpmn-seta:#7B8F84] dark:[--bpmn-seta-destaque:#C6F24E]"
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
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
      <ReactFlow<NoBpmn, SetaBpmn>
        nodes={nos}
        edges={setasVistas}
        nodeTypes={tiposDeNo}
        edgeTypes={tiposDeSeta}
        onInit={(i) => { instancia.current = i }}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        nodesDraggable={!somenteLeitura}
        nodesConnectable={!somenteLeitura}
        edgesReconnectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        snapToGrid
        snapGrid={[GRADE, GRADE]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        colorMode={escuro ? 'dark' : 'light'}
        ariaLabelConfig={rotulosDeAcesso}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRADE} size={1.2} color={cor.ponto} bgColor={cor.fundo} />
        <MiniMap<NoBpmn> pannable zoomable nodeColor={corNoMini} nodeStrokeWidth={0} maskColor={cor.mascara} bgColor={cor.mini}
          className="!rounded-lg shadow-[0_0_0_1px_rgba(20,36,32,0.12)] dark:shadow-[0_0_0_1px_#2A3B32]" />
        <Controls showInteractive={false} position="bottom-left" />
        {recusa && (
          <ViewportPortal>
            <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
              <path d={'M' + recusa.pontos.map((q) => `${q.x} ${q.y}`).join(' L')} fill="none" stroke={COR_RECUSA}
                strokeWidth={2} strokeDasharray="6 5" markerEnd={`url(#${marcadorRecusa})`} />
            </svg>
          </ViewportPortal>
        )}
        <NodeToolbar nodeId={acoes?.id} isVisible={!!acoes} position={Position.Right} offset={14}>
          <div role="toolbar" aria-label="Ações rápidas" aria-orientation="vertical"
            className="flex flex-col gap-1 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[#0F1914] dark:shadow-[0_0_0_1px_#2A3B32,0_12px_24px_-12px_rgba(0,0,0,0.7)]">
            <button type="button" title="Próxima: tarefa" aria-label="Próxima: tarefa" className={ACAO} onClick={() => proxima('userTask')}>
              <span aria-hidden className="box-border h-[11px] w-4 rounded-[3px] border-[1.5px] border-[#0369A1] bg-[#E0F2FE] dark:border-[#7DD3FC] dark:bg-[rgba(56,189,248,0.12)]" />
            </button>
            <button type="button" title="Próxima: escolha" aria-label="Próxima: escolha" className={ACAO} onClick={() => proxima('escolha')}>
              <span aria-hidden className="box-border h-2.5 w-2.5 rotate-45 border-[1.5px] border-[#6D28D9] bg-[#EDE9FE] dark:border-[#C4B5FD] dark:bg-[rgba(167,139,250,0.14)]" />
            </button>
            {podeLigar && (
              <button type="button" title="Ligar com seta" aria-label="Ligar com seta" aria-pressed={ligandoDe === acoes?.id}
                className={`${ACAO} text-[13px] text-[#142420] dark:text-white ${ligandoDe === acoes?.id ? 'bg-[rgba(198,242,78,0.35)] dark:bg-[rgba(198,242,78,0.14)]' : ''}`}
                onClick={() => setLigandoDe((x) => (x === acoes?.id ? null : acoes?.id ?? null))}>
                <span aria-hidden>→</span>
              </button>
            )}
            <button type="button" title="Excluir" aria-label="Excluir" className={`${ACAO} text-[#B42318] dark:text-[#FDA29B]`}
              onClick={() => acoes && onRemover(acoes.id)}>
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        </NodeToolbar>
      </ReactFlow>
      {ligandoDe && (
        <p role="status" className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-[10px] bg-white px-3 py-2 text-xs font-semibold text-[#2E3E36] shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[#0F1914] dark:text-[#C9D6CE] dark:shadow-[0_0_0_1px_#2A3B32]">
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
