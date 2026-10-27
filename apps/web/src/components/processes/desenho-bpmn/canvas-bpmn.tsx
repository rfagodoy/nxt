'use client'

/* ─── Canvas do desenho BPMN ───────────────────────────────────────────────────
   Projeta o grafo gerado dos blocos + o desenho gravado (posições e raias) em nós e
   setas do React Flow. O canvas não muda o fluxo: mover uma forma só devolve um novo
   `DesenhoBpmn` por `onDesenho`; selecionar avisa `onSelecionar`. Soltar, ligar e
   remover chegam na Task 5 — as props já existem para a página montar o canvas uma vez. */
import { useCallback, useId, useMemo, useRef, useState, type JSX } from 'react'
import { useTheme } from 'next-themes'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, applyNodeChanges,
  type AriaLabelConfig, type NodeChange, type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DesenhoBpmn, StepFormSchema } from '@nxt/types'
import { SUFIXO_REENCONTRO, type FimCaminho, type FluxoBlocos, type GrafoGerado, type PontoDeInsercao } from '@nxt/workflow-core'
import { GRADE, RAIA_ROTULO_W, avisoDeRaia, raiaNaAltura } from '@/lib/desenho-bpmn'
import { nodeSize, type FlowNodeType } from '@/lib/flow-layout'
import { ZOOM_MAX, ZOOM_MIN } from '@/components/processes/flow-shared'
import type { NovoItem } from '@/components/processes/workflow-blocos'
import {
  FAIXA_PISCINA, MARCADOR_SETA, rotuloDaForma, tiposDeNo, tiposDeSeta,
  type NoBpmn, type SetaBpmn, type TipoLosango,
} from './formas'

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
  onInserir: (ponto: PontoDeInsercao, tipo: NovoItem, perto: { x: number; y: number }) => void
  onMoverItem: (id: string, ponto: PontoDeInsercao) => void
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

/* ─── Componente ──────────────────────────────────────────────────────────── */
export function CanvasBpmn(props: CanvasBpmnProps): JSX.Element {
  const { grafo, desenho, steps, selecionado, nomeDoProcesso, revisaoDasConsultas, somenteLeitura = false, onSelecionar, onDesenho } = props
  const { resolvedTheme } = useTheme()
  const escuro = resolvedTheme === 'dark'
  const cor = escuro ? CORES.escuro : CORES.claro
  const marcador = `${MARCADOR_SETA}-${useId().replace(/:/g, '')}`

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

  /* Cópia local dos nós só para o arrasto ficar fluido; a cada nova projeção ela é
     substituída (ajuste durante o render, sem efeito) — nunca no meio de um arrasto. */
  const [nos, setNos] = useState(projetados)
  const [base, setBase] = useState(projetados)
  const [arrastando, setArrastando] = useState(false)
  if (base !== projetados && !arrastando) { setBase(projetados); setNos(projetados) }

  /** Grava a posição; não faz nada se a forma ficou onde estava (clique sem mover). */
  const gravar = useCallback((id: string, p: { x: number; y: number }) => {
    const antes = desenho.posicoes[id]
    if (antes && antes.x === p.x && antes.y === p.y) return
    onDesenho({ ...desenho, posicoes: { ...desenho.posicoes, [id]: { x: p.x, y: p.y } } })
  }, [desenho, onDesenho])

  const onNodesChange = useCallback((mudancas: NodeChange<NoBpmn>[]) => {
    // seleção é controlada por fora: só repassa a intenção
    const sel = mudancas.filter((m) => m.type === 'select')
    const escolhido = sel.find((m) => m.selected)
    if (escolhido) onSelecionar(escolhido.id)
    else if (sel.length) onSelecionar(null)
    // mover pelo teclado não passa por onNodeDragStop: grava aqui
    if (!arrastando) {
      for (const m of mudancas) if (m.type === 'position' && m.position && !m.dragging) gravar(m.id, m.position)
    }
    const resto = mudancas.filter((m) => m.type === 'position' || m.type === 'dimensions')
    if (resto.length) setNos((atual) => applyNodeChanges(resto, atual))
  }, [arrastando, gravar, onSelecionar])

  const onNodeDragStart = useCallback<OnNodeDrag<NoBpmn>>(() => setArrastando(true), [])
  const onNodeDragStop = useCallback<OnNodeDrag<NoBpmn>>((_, no) => {
    setArrastando(false) // o render seguinte ressincroniza, se a projeção mudou durante o arrasto
    if (no.type !== 'raia' && no.type !== 'piscina') gravar(no.id, no.position)
  }, [gravar])
  const rotulosDeAcesso = useMemo(() => rotulosAria(somenteLeitura), [somenteLeitura])

  const corNoMini = useCallback((n: NoBpmn) => {
    if (n.type === 'raia' || n.type === 'piscina') return cor.miniRaia
    if (n.type === 'tarefa') return cor.miniTarefa
    if (n.type === 'evento') return cor.miniEvento
    return n.data.tipo === 'paralelo' ? cor.miniParalelo : cor.miniEscolha
  }, [cor])

  return (
    <div className="relative h-full w-full font-sans [--bpmn-seta:#5E6F66] dark:[--bpmn-seta:#7B8F84]">
      {/* ponta da seta, uma vez por canvas; a cor vem da mesma variável do traço */}
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <marker id={marcador} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--bpmn-seta)' }} />
          </marker>
        </defs>
      </svg>
      <ReactFlow<NoBpmn, SetaBpmn>
        nodes={nos}
        edges={setas}
        nodeTypes={tiposDeNo}
        edgeTypes={tiposDeSeta}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
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
      </ReactFlow>
    </div>
  )
}
