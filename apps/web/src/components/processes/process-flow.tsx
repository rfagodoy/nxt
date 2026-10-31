'use client'

import { Fragment, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Zap, Trash2, User, Clock,
  CircleDot, Loader2, UserSquare, AlertTriangle, Building2,
  ChevronUp, Redo2, Plus, ChevronDown,
  Undo2, Check, Info, Lock, Link2, LayoutGrid, DoorOpen,
} from 'lucide-react'
import {
  generateBpmn, compileBpmn, validarDesenho, validarDecisoes, validarAtividades, validarTelasDasAtividades,
  bloqueantes, avisos as avisosDe, blocosParaGrafo, grafoParaBlocos, novoFluxo, pendenciasDosBlocos, validarOrigemDoRegistro, validarExecutores, validarExecutoresFixos, validarQuemInicia, listarEscolhas,
  acharItem, inserirItem, removerItem, atualizarItem, moverItem, atualizarCaminho, SUFIXO_REENCONTRO,
  lerDesenho, podarDesenho, localDoItem,
  type ProblemaAtivacao, type WfGraph, type WfNode, type WfEdge, type FluxoBlocos,
  type FimCaminho, type GrafoGerado, type PontoDeInsercao,
  gruposDeVinculo, religarVinculos, listarAtividades as listarAtivs, type ItemAtividade,
} from '@nxt/workflow-core'
import type { StepFormSchema, ProcessFormSchema, EdgeConditionSpec, DesenhoBpmn } from '@nxt/types'
import { CONNECTORS, findConnector, isRetiredConnector, isCompensable } from '@nxt/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, useEntityLabels, type EntityKind } from '@/components/ui/entity-select'
import { useScreens } from '@/hooks/use-screens'
import { useLookupTable } from '@/hooks/use-lookup-table'
import type { ScreenSubject } from '@/lib/screen-types'
import { fieldValueKey } from '@/lib/screen-types'
import { PAPEIS_KEY, INIT_PAPEIS, REFERENCIA, ORIGEM, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { layoutGraph, nodeSize, titleLineCount, LABEL_W, LANE_SEM_RESPONSAVEL, type FlowNode as LNode, type FlowNodeType, type LaneBand } from '@/lib/flow-layout'
import { GRADE, abrirEspaco, adicionarRaia, completarPosicoes, desenhoInicial, larguraDaInsercao, organizar } from '@/lib/desenho-bpmn'
import { exportFlow, type FlowExportFormat, type ExportModel, type ExportNode, type ExportEdge } from '@/lib/flow-export'
import { apiFetch } from '@/lib/http'
import { ProcessHistoryDrawer } from './process-history-drawer'
import { GatewayGlyph, PendenciasPill, ZoomBar, ZOOM_MAX, ZOOM_MIN } from './flow-shared'
import { ExecutorDaVariavel } from './executor-da-variavel'
import { EXECUTOR_CONTRATO_DO_PROCESSO, EXECUTOR_QUEM_INICIOU, nasceDeContrato, type QuemInicia } from '@nxt/types'
import { QuemIniciaPill } from './quem-inicia'
import { ConfiguracaoDoBloco, comNomes, novoItem, type NovoItem, type Simulacao } from './workflow-blocos'
import { NoticeDialog } from '@/components/ui/confirm-dialog'
import { aoSairDoEditor, destinoInterno } from '@/lib/sair-do-editor'
import { SairSemSalvarDialog } from './sair-sem-salvar'
import { ATRIBUTO_GAVETA, GavetaLateral, ehEscDaGaveta } from './desenho-bpmn/gaveta'
import { CanvasBpmn, modeloDeExportacao } from './desenho-bpmn/canvas-bpmn'
import { PaletaBpmn } from './desenho-bpmn/paleta'
import { MenuMais, NomeNoTopo, SobreDoWorkflow, tamanhoDoNome, useNivelDoTopo } from './desenho-bpmn/topo'
import { cn } from '@/lib/utils'


export const WORKFLOW_KINDS = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ADITIVO', label: 'Aditivo' },
  /* DISTRATO e nao "RESCISAO": e o nome que o motor ja usa no conector
     `contracts.distrato`. O rotulo na tela e "Encerramento" porque cobre tanto o
     fim previsto quanto a rescisao. */
  { value: 'DISTRATO', label: 'Encerramento' },
] as const

type NType = FlowNodeType

/** Nó do grafo DERIVADO — dos blocos, ou do desenho antigo aberto só para leitura.
 *  Atividades carregam a config (StepFormSchema); gateways/eventos só nome. */
interface ENode { id: string; type: NType; name: string; step?: StepFormSchema }
interface EEdge { id: string; from: string; to: string; condition?: string; isDefault?: boolean; label?: string; conditionSpec?: EdgeConditionSpec }

export interface FlowInitial {
  id: string
  name: string
  description?: string | null
  kind?: string | null
  /** ATIVO: gravar mudança no FLUXO devolve o workflow a rascunho (o "gravar ao sair" avisa); só desenho, não */
  status?: string
  bpmnXml: string
  steps: StepFormSchema[]
  laneOrder?: string[]
  graph?: ProcessFormSchema['graph']
  /** Fonte da autoria desde o editor em blocos. Ausente = workflow anterior a ele. */
  blocos?: FluxoBlocos
  /** quem pode iniciar (ausente = qualquer usuário) */
  quemInicia?: QuemInicia
  /** `formSchema.desenho` como veio da API — conferido por `lerDesenho` na abertura. */
  desenho?: unknown
}

const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }
const ENTITY_KIND_LABEL: Record<string, string> = { EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato' }
const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'
const isActivity = (t: NType) => t === 'userTask' || t === 'serviceTask'

/** A API recusou uma gravação que apagaria grande parte do desenho (409). Não é falha:
 *  é a guarda pedindo confirmação consciente. Ver `update()` em processes.service. */
class ReducaoDestrutiva extends Error {}

/** Retrato do DESENHO para desfazer/refazer. `desenho` (posições e raias) entra junto:
 *  mover uma forma também se desfaz. */
interface Retrato {
  fluxo: FluxoBlocos | null
  steps: Record<string, StepFormSchema>
  laneOrder: string[]
  desenho: DesenhoBpmn | null
}
const MAX_HISTORIA = 60
const naGrade = (v: number) => Math.round(v / GRADE) * GRADE
/** Quanto a abertura espera os nomes de papéis/entidades para sugerir as raias. */
const ESPERA_NOMES_MS = 2500

/* ─── Conexões: âncoras cientes do lado (portas nos 4 lados) ─────────────────── */
type Side = 'top' | 'right' | 'bottom' | 'left'
type Pt = { x: number; y: number }
type Box = { x: number; y: number; w: number; h: number }
const SIDE_NORMAL: Record<Side, Pt> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }
const sidePoint = (b: Box, side: Side): Pt => {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  if (side === 'top') return { x: cx, y: b.y }
  if (side === 'bottom') return { x: cx, y: b.y + b.h }
  if (side === 'left') return { x: b.x, y: cy }
  return { x: b.x + b.w, y: cy }
}
/** Escolhe os lados mais próximos entre dois nós → âncoras + normais de saída/entrada.
 *  `backward` = RETORNO (laço para trás): o destino está à ESQUERDA na mesma faixa. Nesse
 *  caso sai e entra por BAIXO, arcando por fora — senão o traço cai EXATAMENTE sobre a
 *  aresta de ida e as duas viram uma "seta dupla" indistinguível (o laço some da tela). */
function edgeGeometry(na: Box, nb: Box, obstaculos: Box[] = []): { a: Pt; aDir: Pt; b: Pt; bDir: Pt; backward: boolean; arcoPorBaixo: boolean } {
  const dx = (nb.x + nb.w / 2) - (na.x + na.w / 2)
  const dy = (nb.y + nb.h / 2) - (na.y + na.h / 2)
  if (dx < 0 && Math.abs(dx) >= Math.abs(dy)) {
    return { a: sidePoint(na, 'bottom'), aDir: SIDE_NORMAL.bottom, b: sidePoint(nb, 'bottom'), bDir: SIDE_NORMAL.bottom, backward: true, arcoPorBaixo: true }
  }
  let aSide: Side, bSide: Side
  if (Math.abs(dx) >= Math.abs(dy)) { aSide = dx >= 0 ? 'right' : 'left'; bSide = dx >= 0 ? 'left' : 'right' }
  else { aSide = dy >= 0 ? 'bottom' : 'top'; bSide = dy >= 0 ? 'top' : 'bottom' }
  const a = sidePoint(na, aSide), b = sidePoint(nb, bSide)
  /* Seta que passa POR TRÁS de outro quadro mente sobre o desenho: quem olha lê a seta
     saindo do quadro do meio. Ficou visível agora que a atividade pode ser um beco sem
     saída — o caminho até o Fim salta por cima dela. Nesse caso a seta arqueia por
     BAIXO, contornando: sai e entra pela base, como o laço de retorno já faz. */
  if (cruzaAlguemNoCaminho(a, b, obstaculos)) {
    return { a: sidePoint(na, 'bottom'), aDir: SIDE_NORMAL.bottom, b: sidePoint(nb, 'bottom'), bDir: SIDE_NORMAL.bottom, backward: false, arcoPorBaixo: true }
  }
  return { a, aDir: SIDE_NORMAL[aSide], b, bDir: SIDE_NORMAL[bSide], backward: false, arcoPorBaixo: false }
}
/** A reta a→b atravessa alguma caixa que não é a de origem nem a de destino?
 *  Amostragem simples ao longo do segmento — barata e suficiente para a escala do
 *  desenho (dezenas de nós), sem trazer uma biblioteca de geometria. */
function cruzaAlguemNoCaminho(a: Pt, b: Pt, obstaculos: Box[]): boolean {
  const dentro = (p: Pt, o: Box) => p.x > o.x + 2 && p.x < o.x + o.w - 2 && p.y > o.y + 2 && p.y < o.y + o.h - 2
  for (let t = 0.08; t <= 0.92; t += 0.04) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (obstaculos.some((o) => dentro(p, o))) return true
  }
  return false
}

/** Comprimento do "puxão" da curva — mesmo k usado no bezier (para posicionar o rótulo). */
const edgeK = (a: Pt, b: Pt) => Math.max(28, Math.hypot(b.x - a.x, b.y - a.y) * 0.4)
/** Curva cúbica que SAI perpendicular ao lado de origem e ENTRA perpendicular ao de destino. */
function edgeBezier(a: Pt, aDir: Pt, b: Pt, bDir: Pt): string {
  const k = Math.max(28, Math.hypot(b.x - a.x, b.y - a.y) * 0.4)
  return `M ${a.x} ${a.y} C ${a.x + aDir.x * k} ${a.y + aDir.y * k}, ${b.x + bDir.x * k} ${b.y + bDir.y * k}, ${b.x} ${b.y}`
}

/* ─── modelo inicial / conversões ──────────────────────────────────────────── */

const INICIO_ID = 'Start_1'
const FIM_ID = 'End_1'

const passoVazio = (id: string, tipo: 'userTask' | 'serviceTask'): StepFormSchema => ({ stepId: id, stepName: '', fields: [], stepType: tipo })

/** Grafo gravado de um workflow ANTERIOR aos blocos. Prefere `formSchema.graph` (preserva
 *  rótulos e aceita rascunho incompleto); cai no compileBpmn só para os mais antigos. */
function grafoGravado(initial: FlowInitial): { nodes: ENode[]; edges: EEdge[] } | null {
  const stepById = new Map(initial.steps.map((s) => [s.stepId, s]))
  let gnodes: Array<{ id: string; type: string; name?: string }>
  let edges: EEdge[]
  if (initial.graph?.nodes?.length) {
    gnodes = initial.graph.nodes
    edges = initial.graph.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault, label: e.label, conditionSpec: e.conditionSpec }))
  } else {
    try {
      const g: WfGraph = compileBpmn(initial.bpmnXml)
      gnodes = Object.values(g.nodes).map((n) => ({ id: n.id, type: n.type, name: n.name }))
      edges = g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault }))
    } catch {
      return null
    }
  }
  const nodes: ENode[] = gnodes.map((n) => {
    const t = n.type as NType
    return {
      id: n.id,
      type: t,
      name: n.name ?? (t === 'start' ? 'Início' : t === 'end' ? 'Fim' : ''),
      step: isActivity(t) ? (stepById.get(n.id) ?? passoVazio(n.id, t as 'userTask' | 'serviceTask')) : undefined,
    }
  })
  return { nodes, edges }
}

interface EstadoInicial {
  fluxo: FluxoBlocos | null
  steps: Record<string, StepFormSchema>
  /** Desenho antigo que não cabe em blocos: abre só para leitura, na vista por raia. */
  legado: { nodes: ENode[]; edges: EEdge[] } | null
}

/** Blocos gravados vencem. Desenho antigo LINEAR vira blocos sem perda; qualquer outra
 *  forma fica só para leitura — estruturar um desenho livre seria adivinhar a intenção
 *  de quem desenhou, e errar calado é pior do que dizer que não dá. */
function estadoInicial(initial?: FlowInitial): EstadoInicial {
  const steps = Object.fromEntries((initial?.steps ?? []).map((s) => [s.stepId, s]))
  if (!initial) return { fluxo: novoFluxo(INICIO_ID, FIM_ID), steps, legado: null }
  if (initial.blocos?.itens) return { fluxo: initial.blocos, steps, legado: null }
  const g = grafoGravado(initial)
  if (!g) return { fluxo: novoFluxo(INICIO_ID, FIM_ID), steps, legado: null }
  const f = grafoParaBlocos(g.nodes, g.edges)
  return f ? { fluxo: f, steps, legado: null } : { fluxo: null, steps, legado: g }
}

/** O grafo que o motor executa, GERADO dos blocos — com os nomes que moram nos passos. */
function grafoDosBlocos(f: FluxoBlocos, steps: Record<string, StepFormSchema>): { nodes: ENode[]; edges: EEdge[] } {
  const g = blocosParaGrafo(f)
  const nodes: ENode[] = g.nodes.map((n) => {
    if (n.type === 'userTask' || n.type === 'serviceTask') {
      const step: StepFormSchema = { ...(steps[n.id] ?? passoVazio(n.id, n.type)), stepId: n.id, stepType: n.type }
      return { id: n.id, type: n.type, name: step.stepName, step }
    }
    return { id: n.id, type: n.type as NType, name: n.type === 'start' ? 'Início' : n.type === 'end' ? 'Fim' : (n.name ?? '') }
  })
  return { nodes, edges: g.edges as EEdge[] }
}

const toLNode = (n: ENode): LNode => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name })

/** RAIA de uma atividade = quem executa. Derivada do que já está configurado, nunca
 *  digitada à parte — assim o desenho não pode contradizer quem o motor aciona.
 *  Ação automática é do "Sistema"; evento e gateway não têm raia própria (herdam). */
const LANE_SISTEMA = 'Sistema'
function laneOf(n: ENode, resolvePapel: (id: string) => string | undefined): string | undefined {
  if (n.type === 'serviceTask') return LANE_SISTEMA
  if (n.type !== 'userTask') return undefined
  const papelId = n.step?.executor?.papelId
  return (papelId && resolvePapel(papelId)) || LANE_SEM_RESPONSAVEL
}

function buildWfGraph(nodes: ENode[], edges: EEdge[]): WfGraph {
  const wn: Record<string, WfNode> = {}
  for (const n of nodes) wn[n.id] = { id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || 'Etapa') : (n.name || undefined) }
  const we: WfEdge[] = edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition || undefined, isDefault: e.isDefault }))
  const start = nodes.find((n) => n.type === 'start')
  return { nodes: wn, edges: we, startId: start?.id ?? INICIO_ID }
}

/* ─── componente ───────────────────────────────────────────────────────────── */

export function ProcessFlow({ initial }: { initial?: FlowInitial } = {}) {
  const router = useRouter()
  const editing = !!initial?.id

  const inicio = useMemo(() => estadoInicial(initial), [initial])
  const somenteLeitura = inicio.legado !== null
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [kind, setKind] = useState(initial?.kind ?? '')
  const [quemInicia, setQuemInicia] = useState<QuemInicia | undefined>(initial?.quemInicia)
  /* A AUTORIA é o fluxo em blocos + a configuração de cada atividade. Nós e setas não
     são editados: são gerados disso — é o que impede as formas que travavam o motor. */
  const [fluxo, setFluxo] = useState<FluxoBlocos | null>(inicio.fluxo)
  const [steps, setSteps] = useState<Record<string, StepFormSchema>>(inicio.steps)
  const [laneOrder, setLaneOrder] = useState<string[]>(initial?.laneOrder ?? [])
  /* DESENHO BPMN (27/10/2026): posições das formas e raias visuais — uma projeção do fluxo,
     gravada em `formSchema.desenho`. Sem desenho gravado, nasce organizado e com raias
     sugeridas pelos responsáveis (ver "abertura do desenho", mais abaixo). */
  const [desenho, setDesenho] = useState<DesenhoBpmn | null>(() => (inicio.fluxo ? lerDesenho(initial?.desenho) : null))
  /* O desenho é onde se edita; "Ver por raia" é a vista antiga, só de leitura, organizada
     por quem executa. Desenho antigo que não cabe em blocos só tem a raia. */
  const [vista, setVista] = useState<'desenho' | 'raia'>(somenteLeitura ? 'raia' : 'desenho')
  const [historicoAberto, setHistoricoAberto] = useState(false)
  /** Pedido de "enquadrar a vista" ao canvas (contador). */
  const [enquadrar, setEnquadrar] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /* "Testar decisão": os caminhos que serviriam acendem na configuração da escolha. */
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  /* Atividade em CONFIGURAÇÃO (gaveta lateral). Separado da seleção: fechar a gaveta não
     deseleciona (a forma segue destacada no desenho). */
  const [configId, setConfigId] = useState<string | null>(null)
  /* Vindo do aviso "sem campos" da escolha: abre a atividade já na seção Formulário e, ao
     fechar, devolve a pessoa para a escolha de onde ela saiu. */
  const [retornoEscolha, setRetornoEscolha] = useState<string | null>(null)
  const [configSecao, setConfigSecao] = useState<string | undefined>(undefined)
  /* Painel de pendências de ativação (aberto pela pílula ou pelo "Ativar"). */
  const [pendAberto, setPendAberto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [exporting, setExporting] = useState<FlowExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  /* ─── Desfazer / refazer ──────────────────────────────────────────────────────
     Guarda RETRATOS da autoria (fluxo, passos e ordem das raias). Nome, descrição e
     tipo ficam de fora de propósito: são campos de texto, e o navegador já desfaz
     digitação neles — capturá-los faria um Ctrl+Z "engolir" uma letra.
     O retrato é tirado por OBSERVAÇÃO do estado, não em cada ponto de mutação. */
  const [historia, setHistoria] = useState<Retrato[]>(() => [{ fluxo: inicio.fluxo, steps: inicio.steps, laneOrder: initial?.laneOrder ?? [], desenho }])
  const [hIndice, setHIndice] = useState(0)
  const aplicandoHistorico = useRef(false)

  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { screens } = useScreens()
  const resolvePapel = useCallback((id: string) => id === EXECUTOR_QUEM_INICIOU
    ? 'Quem iniciou o processo'
    : papeis.entries.find((p) => p.id === id)?.label, [papeis.entries])

  /* Atividade VINCULADA (PO, 04/10/2026): lê a configuração da raiz. `stepsEfetivos` é o
     que o desenho, o grafo e a gravação enxergam — cada vinculada sai com o próprio stepId. */
  const raizDe = useMemo(() => {
    const m = new Map<string, string>()
    if (fluxo) for (const a of listarAtivs(fluxo)) if (a.vinculoDe) m.set(a.id, a.vinculoDe)
    return m
  }, [fluxo])
  const raizRef = useRef(raizDe)
  raizRef.current = raizDe
  const stepsEfetivos = useMemo(() => {
    if (!raizDe.size) return steps
    const out = { ...steps }
    for (const [id, raiz] of raizDe) out[id] = { ...(steps[raiz] ?? passoVazio(id, 'userTask')), stepId: id }
    return out
  }, [steps, raizDe])
  const vinculos = useMemo(() => (fluxo ? gruposDeVinculo(fluxo) : new Map<string, string[]>()), [fluxo])

  const { nodes, edges } = useMemo(
    () => (fluxo ? grafoDosBlocos(fluxo, stepsEfetivos) : inicio.legado ?? { nodes: [] as ENode[], edges: [] as EEdge[] }),
    [fluxo, stepsEfetivos, inicio.legado],
  )

  /* Nomes das entidades que hospedam os papéis (unidade, empresa, parceiro…) — o cartão
     mostra QUAL unidade executa, não só o papel. Só carrega os tipos que o fluxo usa. */
  const tiposEntidade = useMemo(() => {
    const s = new Set<EntityKind>()
    for (const n of nodes) { const t = n.step?.executor?.entityType; if (t && t !== 'ORG') s.add(t as EntityKind) }
    return Array.from(s)
  }, [nodes])
  const resolveEntidade = useEntityLabels(tiposEntidade)

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const selectedBloco = useMemo(() => {
    const it = fluxo && selectedId ? acharItem(fluxo, selectedId) : undefined
    return it && it.kind !== 'atividade' ? it : null
  }, [fluxo, selectedId])
  const configNode = configId ? nodeById[configId] : null

  /* ─── Consultas do desenho ────────────────────────────────────────────────────
     Quem executa, em texto ("Analista de Central de Contratos", "Quem iniciou o processo"):
     o mesmo que o cartão mostra, e o que sugere e confere as raias. Ação automática é do
     "Sistema" (a mesma raia da vista por raia); sem papel, não há responsável. */
  const responsavelDe = useCallback((id: string): string | undefined => {
    const n = nodeById[id]
    if (!n) return undefined
    if (n.type === 'serviceTask') return LANE_SISTEMA
    const ex = n.type === 'userTask' ? n.step?.executor : undefined
    if (!ex?.papelId) return undefined
    const papel = resolvePapel(ex.papelId) ?? 'Responsável'
    // entidade FIXA entra no nome; "da variável"/"do contrato" muda a cada processo — fica só o papel
    const entidade = ex.mode !== 'VARIAVEL' && ex.entityId ? resolveEntidade(ex.entityType, ex.entityId) : undefined
    return entidade ? `${papel} de ${entidade}` : papel
  }, [nodeById, resolvePapel, resolveEntidade])
  const prazoDe = useCallback((id: string) => dueText(nodeById[id]?.step), [nodeById])
  /** Os nomes que `responsavelDe` usa já chegaram? (papéis e entidades vêm da rede) */
  const consultasProntas = useMemo(() => nodes.every((n) => {
    const ex = n.type === 'userTask' ? n.step?.executor : undefined
    if (!ex?.papelId) return true
    if (!resolvePapel(ex.papelId)) return false
    return !(ex.mode !== 'VARIAVEL' && ex.entityId && ex.entityType && ex.entityType !== 'ORG' && !resolveEntidade(ex.entityType, ex.entityId))
  }), [nodes, resolvePapel, resolveEntidade])

  /* Pendências de ativação AO VIVO — as MESMAS regras que a API aplica ao ativar
     (@nxt/workflow-core), recalculadas a cada mudança: consertou, o item some. */
  const pendencias = useMemo<ProblemaAtivacao[]>(() => {
    const vnodes = nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name }))
    const vedges = edges.map((e) => ({ from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault }))
    const tarefas = nodes.filter((n) => n.type === 'userTask')
    /* Aditivo e Encerramento nascem de um contrato: `contratoId` existe desde a partida. */
    const iniciais = nasceDeContrato(kind) ? ['contratoId'] : []
    const dasAtividades = [
      ...validarAtividades(tarefas.map((n) => ({
        stepId: n.id, stepName: n.step?.stepName, executor: n.step?.executor,
        slaBusinessDays: n.step?.slaBusinessDays, slaBusinessHours: n.step?.slaBusinessHours, slaBusinessMinutes: n.step?.slaBusinessMinutes,
      }))),
      ...validarTelasDasAtividades(
        tarefas.map((n) => ({ stepId: n.id, stepName: n.step?.stepName, screenRef: n.step?.screenRef, entityMode: n.step?.entityMode, extraScreens: n.step?.extraScreens })),
        screens,
      ),
      /* Editar/consultar — e a escolha que testa campos do contrato — usam o registro do
         processo: avisa quando nenhuma atividade antes o cria. */
      ...validarOrigemDoRegistro(vedges, [
        ...nodes.filter((n) => isActivity(n.type)).map((n) => ({
          stepId: n.id, stepName: n.step?.stepName, screenRef: n.step?.screenRef, screenSubject: n.step?.screenSubject,
          entityMode: n.step?.entityMode, produz: n.type === 'serviceTask' ? findConnector(n.step?.connector)?.outputs : undefined,
        })),
        ...(fluxo ? listarEscolhas(fluxo) : [])
          .filter((e) => e.caminhos.some((c) => /\bcontrato\./.test(c.condition ?? '')))
          .map((e) => ({ stepId: e.id, stepName: e.pergunta, tipoItem: 'escolha' as const, screenSubject: 'CONTRATO' })),
      ], iniciais),
      /* Executor "Da variável" pelo contrato do processo — a MESMA regra da API na ativação. */
      ...validarExecutores(vedges,
        nodes.filter((n) => isActivity(n.type)).map((n) => ({
          stepId: n.id, stepName: n.step?.stepName, executor: n.type === 'userTask' ? n.step?.executor : undefined,
          screenRef: n.step?.screenRef, screenSubject: n.step?.screenSubject, entityMode: n.step?.entityMode,
          produz: n.type === 'serviceTask' ? findConnector(n.step?.connector)?.outputs : undefined,
        })),
        papeis.entries.map((p) => ({ id: p.id, label: p.label, origem: p.origem, referencia: referenciaDoPapelEntry(p) })),
        iniciais),
      /* Papel de unidade sem a unidade — a mesma regra da API. Papel VAGO só a API sabe
         (precisa de quem ocupa o papel hoje): aparece na recusa do "Ativar". */
      ...validarExecutoresFixos(
        nodes.filter((n) => n.type === 'userTask').map((n) => ({ stepId: n.id, stepName: n.step?.stepName, executor: n.step?.executor })),
        papeis.entries.map((p) => ({ id: p.id, label: p.label, origem: p.origem, referencia: referenciaDoPapelEntry(p) })),
        new Map()),
      /* Quem pode iniciar + aviso de 1ª atividade "Quem iniciou" com início aberto — a mesma regra da API. */
      ...validarQuemInicia(quemInicia,
        papeis.entries.map((p) => ({ id: p.id, label: p.label, origem: p.origem, referencia: referenciaDoPapelEntry(p) })),
        { kind, primeiraAtividade: (() => {
          const ini = nodes.find((n) => n.type === 'start')
          const prim = ini && nodes.find((n) => n.id === edges.find((e) => e.from === ini.id)?.to)
          return prim?.type === 'userTask' ? { stepId: prim.id, stepName: prim.step?.stepName, executor: prim.step?.executor } : null
        })() }),
    ]
    if (!fluxo) return [...validarDesenho(vnodes, vedges), ...validarDecisoes(vnodes, vedges), ...dasAtividades]
    /* Em blocos a forma já nasce ligada e com "caso contrário": do desenho sobra o que só
       o bloco sabe dizer (condição que falta, volta sem destino). Os pontos de reencontro
       são gerados — nunca culpados de algo que a pessoa possa consertar. */
    return [
      ...pendenciasDosBlocos(fluxo),
      ...validarDesenho(vnodes, vedges).filter((p) => !p.nodeId?.endsWith(SUFIXO_REENCONTRO)),
      ...dasAtividades,
    ]
  }, [fluxo, nodes, edges, screens, kind, papeis.entries, quemInicia])

  /* Marca de problema em cada forma: as mesmas pendências da pílula de saúde. */
  const problemasPorNo = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of pendencias) if (p.nodeId) m.set(p.nodeId, [...(m.get(p.nodeId) ?? []), p.mensagem])
    return m
  }, [pendencias])
  const problemasDe = useCallback((id: string) => problemasPorNo.get(id) ?? [], [problemasPorNo])
  /* As mesmas pendências, inteiras, para a marca no cabeçalho da configuração do bloco. */
  const pendenciasPorNo = useMemo(() => {
    const m = new Map<string, ProblemaAtivacao[]>()
    for (const p of pendencias) if (p.nodeId) m.set(p.nodeId, [...(m.get(p.nodeId) ?? []), p])
    return m
  }, [pendencias])
  /* O canvas só refaz cartões e marcas quando isto muda (ver CanvasBpmnProps). */
  const revisaoDasConsultas = useMemo(() => ({}), [papeis.entries, resolveEntidade, pendencias]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Desenho: grafo, posições que faltam e abertura ──────────────────────────
     O grafo do desenho é o MESMO gerado dos blocos, com os nomes dos passos (o tamanho
     do cartão depende das linhas do nome). Forma sem posição — a que acabou de nascer,
     o reencontro de uma escolha nova — ganha lugar por `completarPosicoes` já no render
     (nada nasce em 0,0) e o resultado é gravado no estado em seguida. */
  const grafo = useMemo<GrafoGerado | null>(() => (fluxo
    ? { nodes: nodes.map((n) => ({ id: n.id, type: n.type as GrafoGerado['nodes'][number]['type'], name: n.name })), edges: edges as GrafoGerado['edges'] }
    : null), [fluxo, nodes, edges])
  const desenhoVisto = useMemo(() => (desenho && grafo && grafo.nodes.some((n) => !desenho.posicoes[n.id])
    ? completarPosicoes(grafo, desenho)
    : desenho), [desenho, grafo])

  /* A gaveta é um PAINEL DE PROPRIEDADES (como no Bizagi), não um modal — decisão R11 do
     desenho BPMN: o que se edita nela já vale ao vivo. Clicar noutra forma/atividade, no
     vazio do desenho, em "Salvar rascunho" ou "Ativar" com a gaveta das perguntas aberta
     APLICA (fecha como o "Aplicar") e segue. Só "Cancelar", o X e o Esc (dentro da gaveta)
     desfazem pelo retrato tirado na abertura.
     Aplicar por troca de seleção também esquece a pergunta de abertura (`configSecao`) e a
     volta para a escolha (`retornoEscolha`): elas valiam só para a gaveta que fechou. */
  const aplicarGaveta = useCallback(() => {
    setConfigId(null); setConfigSecao(undefined); setRetornoEscolha(null)
  }, [])

  /* Clicar é o gesto de "quero configurar isto": a atividade abre a gaveta das perguntas;
     escolha e "ao mesmo tempo" selecionados abrem a gaveta da configuração do bloco. Pontos de
     reencontro (gerados) não têm o que configurar. No desenho antigo, só seleciona. */
  const abrir = useCallback((id: string | null) => {
    const alvo = id && !id.endsWith(SUFIXO_REENCONTRO) ? id : null
    const it = alvo && fluxo ? acharItem(fluxo, alvo) : undefined
    aplicarGaveta()
    setSelectedId(alvo)
    setConfigId(it?.kind === 'atividade' ? alvo : null)
  }, [fluxo, aplicarGaveta])

  /* Conserto de "caminho sem campos" (aviso dentro da escolha): abre a atividade já na
     pergunta do formulário e, ao fechar, devolve a seleção para a escolha. */
  const configurarAtividadeDaEscolha = useCallback((id: string) => {
    setFocarGaveta(true); setRetornoEscolha(selectedId); setSelectedId(id); setConfigSecao('formulario'); setConfigId(id)
  }, [selectedId])

  /* Pedido para o canvas centrar numa forma (`vez` muda a cada pedido). */
  const [focoEm, setFocoEm] = useState<{ id: string; vez: number } | null>(null)
  /* Foco ao abrir a gaveta: vinda de um clique/tecla NA FORMA, o foco fica na forma (as setas
     do teclado seguem movendo-a, como a descrição acessível promete); vinda de outro lugar
     (pílula de saúde, ação rápida, paleta, aviso da escolha), o foco vai para a gaveta. */
  const [focarGaveta, setFocarGaveta] = useState(true)
  const aoSelecionarNoDesenho = useCallback((id: string | null) => { setFocarGaveta(false); abrir(id) }, [abrir])
  const focarPendencia = useCallback((p: ProblemaAtivacao) => {
    if (!p.nodeId || p.tipo === 'inicio-desligado' || p.tipo === 'fim-inalcancavel') return
    setFocarGaveta(true)
    const id = p.nodeId
    abrir(id)
    // desenho antigo: a atividade abre a gaveta de leitura (abrir só seleciona sem blocos)
    if (!fluxo && isActivity(nodeById[id]?.type ?? 'start')) setConfigId(id)
    setFocoEm((f) => ({ id, vez: (f?.vez ?? 0) + 1 }))
  }, [abrir, fluxo, nodeById])

  /* VER POR RAIA: layout automático sempre. Posição manual deixou de existir com os
     blocos — a ordem vem do fluxo, e a raia, de quem executa. */
  const layout = useMemo(() => layoutGraph(
    {
      nodes: nodes.map((n) => ({
        ...toLNode(n),
        lane: laneOf(n, resolvePapel),
        // a altura da caixa acompanha o rodapé REAL do cartão (executor, unidade, prazo)
        metaLines: isActivity(n.type) ? metaDaAtividade(n, resolvePapel, resolveEntidade).length : undefined,
      })),
      edges,
      startId: nodes.find((n) => n.type === 'start')?.id ?? INICIO_ID,
    },
    undefined,
    { swimlanes: true, laneOrder },
  ), [nodes, edges, laneOrder, resolvePapel, resolveEntidade])

  const activityCount = nodes.filter((n) => isActivity(n.type)).length

  const mudarFluxo = useCallback((fn: (f: FluxoBlocos) => FluxoBlocos) => {
    setFluxo((f) => (f ? fn(f) : f))
  }, [])
  const patchStep = useCallback((idAlvo: string, patch: Partial<StepFormSchema>) => {
    const id = raizRef.current.get(idAlvo) ?? idAlvo
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[id] ?? passoVazio(id, 'userTask')), ...patch } }))
  }, [])
  // Troca o TIPO da atividade (Tarefa ↔ Ação automática): o tipo mora no BLOCO (é ele que
  // gera o nó) e no passo (stepType) — os dois mudam juntos.
  const changeNodeType = useCallback((idAlvo: string, t: 'userTask' | 'serviceTask') => {
    const id = raizRef.current.get(idAlvo) ?? idAlvo
    // o grupo vinculado inteiro muda junto (é a mesma atividade em vários lugares)
    const grupo = [id, ...[...raizRef.current.entries()].filter(([, r]) => r === id).map(([v]) => v)]
    setFluxo((f) => (f ? grupo.reduce((g, gid) => atualizarItem(g, gid, { tipo: t }), f) : f))
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[id] ?? passoVazio(id, t)), stepType: t } }))
  }, [])
  /* LUGAR da forma nova (B6): no meio do fluxo, tudo que começa a partir dela anda para a
     direita o quanto ela precisa (`abrirEspaco`); no FIM do fluxo principal (inclusive
     soltar em área vazia) só o Fim anda, para depois dela, na altura dela. O reencontro de
     um bloco cai no espaço aberto (`completarPosicoes` o põe um passo à direita). */
  const darLugar = useCallback((id: string, tipo: NovoItem, perto: { x: number; y: number }, ref: string, indice: number) => {
    const noFim = !!fluxo && ref === 'raiz' && indice >= fluxo.itens.length
    const fimId = fluxo?.fimId
    const largura = larguraDaInsercao(tipo)
    const altura = nodeSize({ id, type: tipo === 'escolha' ? 'exclusiveGateway' : tipo === 'paralelo' ? 'parallelGateway' : tipo }, 0, 0).h
    setDesenho((d) => {
      if (!d) return d
      // a forma que começa um pouco antes dela também a cobriria: entra no empurrão
      const aberto = noFim ? d : abrirEspaco(d, perto.x - 2 * GRADE, largura)
      const posicoes = { ...aberto.posicoes, [id]: { x: perto.x, y: perto.y } }
      const fim = fimId ? posicoes[fimId] : undefined
      if (noFim && fimId && fim && fim.x < perto.x + largura) {
        posicoes[fimId] = { x: naGrade(perto.x + largura), y: naGrade(perto.y + altura / 2 - nodeSize({ id: fimId, type: 'end' }, 0, 0).h / 2) }
      }
      return { ...aberto, posicoes }
    })
  }, [fluxo])

  /** Repete aqui uma atividade já configurada — mesma configuração, vinculada. `perto` é o
   *  lugar da forma nova no desenho (como em `inserir`). */
  const inserirVinculada = useCallback((ref: string, indice: number, origemId: string, perto?: { x: number; y: number }) => {
    if (!fluxo) return
    const raiz = raizRef.current.get(origemId) ?? origemId
    const origem = listarAtivs(fluxo).find((a) => a.id === raiz)
    if (!origem) return
    // o item nasce FORA do updater: o id é um só (o StrictMode chama o updater duas vezes)
    const item = { ...novoItem(origem.tipo), vinculoDe: raiz } as ItemAtividade
    aplicarGaveta()
    setFluxo((f) => (f ? inserirItem(f, ref, indice, item) : f))
    if (perto) darLugar(item.id, origem.tipo, perto, ref, indice)
    setSelectedId(item.id)
  }, [fluxo, aplicarGaveta, darLugar])
  /** Desfaz o vínculo: a atividade passa a ter configuração própria (cópia da atual). */
  const desvincular = useCallback((id: string) => {
    const raiz = raizRef.current.get(id)
    if (!raiz) return
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[raiz] ?? passoVazio(id, 'userTask')), stepId: id } }))
    setFluxo((f) => (f ? atualizarItem(f, id, { vinculoDe: undefined } as Partial<ItemAtividade>) : f))
  }, [])

  /* Inserir já abre o que precisa ser preenchido: a atividade nasce sem nome e a escolha
     sem condição — deixar a pessoa procurar onde configurar era o problema de antes.
     `perto` = onde a forma nova fica no desenho; o resto do que nasce junto (o reencontro
     de uma escolha / "ao mesmo tempo") ganha lugar por `completarPosicoes`. Devolve o id. */
  const inserir = useCallback((ref: string, indice: number, tipo: NovoItem, perto?: { x: number; y: number }): string => {
    const item = novoItem(tipo)
    if (item.kind === 'atividade') setSteps((prev) => ({ ...prev, [item.id]: passoVazio(item.id, item.tipo) }))
    setFocarGaveta(true)
    setFluxo((f) => (f ? inserirItem(f, ref, indice, item) : f))
    if (perto) darLugar(item.id, tipo, perto, ref, indice)
    aplicarGaveta()
    setSelectedId(item.id)
    setConfigId(item.kind === 'atividade' ? item.id : null)
    return item.id
  }, [aplicarGaveta, darLugar])

  /* Remover um bloco leva junto o que mora dentro dele. Os passos das atividades ficam no
     mapa (o desfazer os traz de volta inteiros); a gravação só leva os que existem. */
  const remover = useCallback((id: string) => {
    setFluxo((f) => {
      if (!f) return f
      const { fluxo: g, promovidas } = religarVinculos(removerItem(f, id))
      if (promovidas.length) {
        setSteps((prev) => {
          const out = { ...prev }
          for (const p of promovidas) out[p.para] = { ...(prev[p.de] ?? passoVazio(p.para, 'userTask')), stepId: p.para }
          return out
        })
      }
      return g
    })
    setSelectedId((cur) => (cur === id ? null : cur))
    setConfigId((cur) => (cur === id ? null : cur))
  }, [])

  /* ─── Intenções do desenho BPMN ───────────────────────────────────────────────
     O canvas só AVISA; quem muda o fluxo é a página, pelas mesmas funções de antes. Um
     arrasto pode chamar `onDesenho` (a posição) e depois `onMoverItem` (a vaga): as duas
     atualizações são funcionais e valem juntas. */
  const aoMudarDesenho = useCallback((d: DesenhoBpmn) => setDesenho(d), [])
  const aoInserir = useCallback((ponto: PontoDeInsercao, tipo: NovoItem, perto: { x: number; y: number }) => {
    inserir(ponto.ref, ponto.indice, tipo, perto)
  }, [inserir])
  const aoMoverItem = useCallback((id: string, ponto: PontoDeInsercao) => {
    mudarFluxo((f) => moverItem(f, id, ponto.ref, ponto.indice))
  }, [mudarFluxo])
  const aoLigar = useCallback((caminhoId: string, fim: FimCaminho) => {
    mudarFluxo((f) => atualizarCaminho(f, caminhoId, { fim }))
  }, [mudarFluxo])
  const aoAdicionarRaia = useCallback(() => setDesenho((d) => (d ? adicionarRaia(d) : d)), [])
  const organizarDesenho = useCallback(() => {
    if (!grafo || !desenhoVisto) return
    aplicarGaveta()
    setDesenho(organizar(grafo, desenhoVisto, responsavelDe))
    setEnquadrar((n) => n + 1) // B7: depois de arrumar, a vista mostra o desenho todo
  }, [grafo, desenhoVisto, responsavelDe, aplicarGaveta])

  /* R12: "Próxima: mesma configuração de…" — as atividades que podem ser repetidas (as
     raízes; uma cópia vinculada repete a raiz dela). */
  const vinculaveis = useMemo(() => (fluxo
    ? listarAtivs(fluxo).filter((a) => !a.vinculoDe).map((a) => ({ id: a.id, nome: stepsEfetivos[a.id]?.stepName?.trim() || 'Atividade sem nome' }))
    : []), [fluxo, stepsEfetivos])
  const aoInserirVinculada = useCallback((ponto: PontoDeInsercao, origemId: string, perto: { x: number; y: number }) => {
    inserirVinculada(ponto.ref, ponto.indice, origemId, perto)
  }, [inserirVinculada])

  /* Forma escolhida na paleta por clique/teclado: entra DEPOIS do item selecionado (na
     mesma lista) ou, sem seleção (ou com início/fim/reencontro selecionado), no fim do
     fluxo principal. Nasce à direita da forma de referência; no fim do fluxo, o Fim anda
     para a direita para lhe dar lugar. */
  const aoEscolherNaPaleta = useCallback((tipo: NovoItem) => {
    if (!fluxo || !grafo || !desenhoVisto) return
    const local = selectedId ? localDoItem(fluxo, selectedId) : null
    const ref = (local && selectedId ? acharItem(fluxo, selectedId) : undefined) ?? (local ? undefined : fluxo.itens[fluxo.itens.length - 1])
    const ancora = ref ? (ref.kind === 'atividade' ? ref.id : ref.id + SUFIXO_REENCONTRO) : fluxo.inicioId
    const caixaDe = (id: string) => {
      const n = grafo.nodes.find((x) => x.id === id)
      return n ? nodeSize({ id, type: n.type as FlowNodeType, name: n.name }, 0, 0) : { w: 0, h: 0 }
    }
    const nova = nodeSize({ id: 'nova', type: tipo === 'escolha' ? 'exclusiveGateway' : tipo === 'paralelo' ? 'parallelGateway' : tipo }, 0, 0)
    const p = desenhoVisto.posicoes[ancora] ?? { x: 0, y: 0 }, c = caixaDe(ancora)
    const perto = { x: naGrade(p.x + c.w + 3 * GRADE), y: naGrade(p.y + c.h / 2 - nova.h / 2) }
    if (local) { inserir(local.ref, local.indice + 1, tipo, perto); return }
    inserir('raiz', fluxo.itens.length, tipo, perto) // o Fim anda para depois dela (darLugar)
  }, [fluxo, grafo, desenhoVisto, selectedId, inserir])

  /* Registra um retrato quando a autoria para de mudar. A espera COALESCE o que é uma
     ação só aos olhos de quem edita (digitar um nome, por exemplo). */
  useEffect(() => {
    if (aplicandoHistorico.current) { aplicandoHistorico.current = false; return }
    const t = setTimeout(() => {
      const atual = historia[hIndice]
      if (atual && atual.fluxo === fluxo && atual.steps === steps && atual.laneOrder === laneOrder && atual.desenho === desenho) return
      const proximo = [...historia.slice(0, hIndice + 1), { fluxo, steps, laneOrder, desenho }] // um passo novo descarta o "refazer"
      const excedente = Math.max(0, proximo.length - MAX_HISTORIA)
      setHistoria(excedente ? proximo.slice(excedente) : proximo)
      setHIndice(proximo.length - 1 - excedente)
    }, 350)
    return () => clearTimeout(t)
  }, [fluxo, steps, laneOrder, desenho, historia, hIndice])

  const irPara = useCallback((i: number) => {
    const r = historia[i]
    if (!r) return
    aplicandoHistorico.current = true
    setFluxo(r.fluxo); setSteps(r.steps); setLaneOrder(r.laneOrder); setDesenho(r.desenho)
    setHIndice(i)
    aplicarGaveta()
  }, [historia, aplicarGaveta])

  const podeDesfazer = hIndice > 0
  const podeRefazer = hIndice < historia.length - 1
  const desfazer = useCallback(() => { if (hIndice > 0) irPara(hIndice - 1) }, [hIndice, irPara])
  const refazer = useCallback(() => { if (hIndice < historia.length - 1) irPara(hIndice + 1) }, [hIndice, historia.length, irPara])

  /* Ctrl+Z / Ctrl+Y (e Ctrl+Shift+Z). ⚠️ Fica fora quando o foco está num campo: lá o
     desfazer é o do NAVEGADOR, e roubá-lo apagaria o desenho no lugar de uma palavra. */
  useEffect(() => {
    const emCampo = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || emCampo(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desfazer, refazer])

  /* ── Gravar ao sair (pedido do PO, 04/10/2026) ─────────────────────────────────
     Quem sai do editor sem salvar não perde o trabalho: navegação dentro do sistema grava
     na desmontagem; fechar a aba tenta gravar com `keepalive` (o navegador limita o corpo
     — acima disso, aparece o "sair sem salvar?" padrão). Workflow ATIVO volta a rascunho
     ao gravar mudança, e a barra avisa ANTES. A gravação que apagaria grande parte do
     desenho (409) não é feita sozinha: ela existe para pedir confirmação. */
  const assinatura = useMemo(
    () => (fluxo ? JSON.stringify({ name, description, kind, quemInicia, fluxo: comNomes(fluxo, steps), steps, laneOrder, desenho: desenhoVisto }) : ''),
    // desenhoVisto: o mesmo que `persist` grava — senão "Não salvo" voltaria depois de salvar
    [name, description, kind, quemInicia, fluxo, steps, laneOrder, desenhoVisto],
  )
  const assinaturaRef = useRef(assinatura)
  assinaturaRef.current = assinatura
  /** o que está gravado no servidor (a assinatura da abertura, depois a da última gravação) */
  const limpoRef = useRef<string>(assinatura)
  /* Desenho gerado ou completado NA ABERTURA não é mudança da pessoa: se o documento estava
     limpo, continua limpo (a assinatura de referência passa a incluir o desenho novo). */
  const realinharLimpo = useRef(false)
  if (realinharLimpo.current && desenho) { limpoRef.current = assinatura; realinharLimpo.current = false }
  const sujo = !somenteLeitura && assinatura !== limpoRef.current
  const ativoNoServidor = initial?.status === 'ACTIVE'
  /* Só mudar o FLUXO devolve um workflow ativo a rascunho; arrumar o desenho (posições,
     raias, ordem das raias), o nome ou o tipo não (PO, 30/10/2026 — `mudaOFluxo` na API).
     Esta assinatura deixa o desenho de fora para o aviso dizer a verdade. */
  const assinaturaFluxo = useMemo(
    () => (fluxo ? JSON.stringify({ quemInicia, fluxo: comNomes(fluxo, steps), steps }) : ''),
    [quemInicia, fluxo, steps],
  )
  const assinaturaFluxoRef = useRef(assinaturaFluxo)
  assinaturaFluxoRef.current = assinaturaFluxo
  const limpoFluxoRef = useRef<string>(assinaturaFluxo)
  const voltaARascunho = sujo && ativoNoServidor && assinaturaFluxo !== limpoFluxoRef.current

  /* ─── Abertura do desenho e posições que faltam ──────────────────────────────
     Sem desenho gravado (workflow anterior ao desenho BPMN, ou novo), ele nasce de
     `desenhoInicial`: organizado e com raias sugeridas pelos responsáveis. Para as raias
     não congelarem como "Sem responsável", espera os nomes dos papéis/entidades chegarem
     (no máximo ESPERA_NOMES_MS). Depois, toda forma sem posição recebe a que
     `completarPosicoes` calculou (`desenhoVisto`). Na abertura nada disso suja o documento
     nem vira um passo do desfazer: o retrato inicial passa a ter o desenho. */
  const [esperaVenceu, setEsperaVenceu] = useState(false)
  useEffect(() => { const t = setTimeout(() => setEsperaVenceu(true), ESPERA_NOMES_MS); return () => clearTimeout(t) }, [])
  const naAbertura = useRef(true)
  /* calculado uma vez só: no StrictMode o efeito roda duas vezes com o mesmo estado, e um
     segundo desenho (igual, mas outro objeto) viraria um passo falso no desfazer */
  const desenhoDaAbertura = useRef<DesenhoBpmn | null>(null)
  useEffect(() => {
    if (!grafo) return
    let proximo: DesenhoBpmn
    if (!desenho) {
      if (!consultasProntas && !esperaVenceu) return
      proximo = desenhoDaAbertura.current ??= desenhoInicial(grafo, responsavelDe)
      setEnquadrar((n) => n + 1)
    } else if (desenhoVisto && desenhoVisto !== desenho) {
      proximo = desenhoVisto
    } else {
      naAbertura.current = false
      return
    }
    if (naAbertura.current) {
      naAbertura.current = false
      const anterior = desenho
      realinharLimpo.current = assinaturaRef.current === limpoRef.current
      setHistoria((h) => h.map((r) => (r.desenho === anterior ? { ...r, desenho: proximo } : r)))
    }
    setDesenho(proximo)
  }, [grafo, desenho, desenhoVisto, consultasProntas, esperaVenceu, responsavelDe])

  /* Gravação que apagaria grande parte do desenho: a API recusa com 409 e diz quanto
     seria removido. Só reenviamos com `confirmarReducao` depois que a pessoa confirmar. */
  const [reducao, setReducao] = useState<{ msg: string; acao: 'rascunho' | 'ativar' } | null>(null)
  /* Dialog do DS no lugar do alert() nativo. `aoFechar` segura a navegação até a pessoa
     fechar o aviso, senão o dialog morreria junto da tela. */
  const [aviso, setAviso] = useState<{ msg: string; titulo?: string; aoFechar?: () => void } | null>(null)

  const persist = useCallback(async (confirmarReducao?: boolean, auto?: { keepalive?: boolean }): Promise<string> => {
    if (!fluxo) throw new Error('Workflow do editor antigo: aberto só para leitura.')
    const assinaturaGravada = assinaturaRef.current
    const fluxoGravado = assinaturaFluxoRef.current
    const bpmnXml = generateBpmn(buildWfGraph(nodes, edges))
    const stepsVivos = nodes.filter((n) => isActivity(n.type) && n.step).map((n) => ({ ...n.step!, stepId: n.id, stepName: n.step!.stepName, stepType: n.type as 'userTask' | 'serviceTask' }))
    // grafo GERADO (a API valida e compila por ele; telas de leitura o desenham)
    const graph: ProcessFormSchema['graph'] = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name })),
      edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition || undefined, isDefault: e.isDefault, label: e.label, conditionSpec: e.conditionSpec })),
    }
    const formSchema: ProcessFormSchema = {
      steps: stepsVivos, graph,
      blocos: comNomes(fluxo, stepsEfetivos),
      laneOrder: laneOrder.length ? laneOrder : undefined,
      quemInicia,
      // só as posições de formas que existem (as de formas removidas ficam para trás)
      desenho: desenhoVisto ? podarDesenho(desenhoVisto, nodes.map((n) => n.id)) : undefined,
    }
    /* gravação automática de um workflow novo sem nome: não perde o trabalho */
    const nome = name.trim() || (auto ? 'Rascunho sem nome' : '')
    const body = JSON.stringify({ name: nome, description: description.trim() || undefined, bpmnXml, formSchema, kind: kind || undefined, ...(confirmarReducao ? { confirmarReducao: true } : {}) })
    const keepalive = !!auto?.keepalive
    if (editing) {
      const res = await apiFetch(`/api/processes/${initial!.id}`, { method: 'PATCH', body, keepalive })
      if (res.status === 409) {
        const e = await res.json().catch(() => null)
        throw new ReducaoDestrutiva(e?.message ?? 'Esta gravação removeria grande parte do workflow.')
      }
      if (!res.ok) throw new Error('Erro ao salvar')
      limpoRef.current = assinaturaGravada
      limpoFluxoRef.current = fluxoGravado
      return initial!.id
    }
    const res = await apiFetch(`/api/processes`, { method: 'POST', body, keepalive })
    if (!res.ok) throw new Error('Erro ao salvar')
    limpoRef.current = assinaturaGravada
    limpoFluxoRef.current = fluxoGravado
    return (await res.json()).id as string
  }, [editing, initial, name, description, kind, quemInicia, fluxo, stepsEfetivos, nodes, edges, laneOrder, desenhoVisto])

  const persistRef = useRef(persist)
  persistRef.current = persist
  /* "sujo" lido NA HORA (não o da última renderização): logo depois de um Salvar a tela pode
     sair antes de se redesenhar — e gravaria de novo (num workflow novo, uma CÓPIA). */
  const somenteLeituraRef = useRef(somenteLeitura)
  /* Workflow ATIVO não grava sozinho ao sair (decisão do PO, 30/10/2026): gravar mudança
     de etapa o devolve a rascunho, e isso não acontece sem a pessoa escolher. */
  const ativoRef = useRef(ativoNoServidor)
  ativoRef.current = ativoNoServidor
  const aoSairAgora = useCallback(() => aoSairDoEditor({
    somenteLeitura: somenteLeituraRef.current, ativo: ativoRef.current, sujo: assinaturaRef.current !== limpoRef.current,
  }), [])
  const gravandoSozinho = useRef(false)
  const gravarAoSair = useCallback((keepalive: boolean) => {
    if (gravandoSozinho.current || aoSairAgora() !== 'gravar') return false
    gravandoSozinho.current = true
    void persistRef.current(undefined, { keepalive }).catch(() => { /* 409 destrutiva ou rede: fica o que estava */ })
    return true
  }, [aoSairAgora])
  useEffect(() => {
    const LIMITE_KEEPALIVE = 60_000 // o navegador recusa keepalive acima de ~64 KB
    const aoFechar = (e: BeforeUnloadEvent) => {
      const acao = aoSairAgora()
      if (acao === 'nada') return
      // ativo: o "sair sem salvar?" do navegador (fechar a aba não deixa mostrar o nosso)
      if (acao === 'perguntar' || assinaturaRef.current.length * 2 > LIMITE_KEEPALIVE) { e.preventDefault(); e.returnValue = ''; return }
      gravarAoSair(true) // fechando a aba: só o keepalive sobrevive à página
    }
    window.addEventListener('beforeunload', aoFechar)
    return () => {
      window.removeEventListener('beforeunload', aoFechar)
      gravarAoSair(false) // saiu da tela por dentro do sistema (menu, outra aba): a página segue viva
    }
  }, [gravarAoSair, aoSairAgora])

  /* Saída por link (menu lateral, topo, breadcrumb) de um workflow ATIVO com alterações:
     segura o clique e pergunta. Escuta na captura, antes do Link do Next navegar. */
  const [saida, setSaida] = useState<string | null>(null)
  const sairPara = useCallback((destino: string) => {
    if (aoSairAgora() === 'perguntar') setSaida(destino)
    else router.push(destino)
  }, [aoSairAgora, router])
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (aoSairAgora() !== 'perguntar') return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const destino = destinoInterno({
        button: e.button, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
        defaultPrevented: e.defaultPrevented, href: a.href, target: a.target, download: a.hasAttribute('download'),
      }, window.location.origin, window.location.pathname)
      if (!destino) return
      e.preventDefault(); e.stopPropagation()
      setSaida(destino)
    }
    document.addEventListener('click', aoClicar, true)
    return () => document.removeEventListener('click', aoClicar, true)
  }, [aoSairAgora])

  const handleSaveDraft = useCallback(async (confirmarReducao?: boolean) => {
    if (!name.trim()) { setAviso({ msg: 'Dê um nome ao workflow antes de salvar.' }); return }
    setSaving(true)
    try { const id = await persist(confirmarReducao); setReducao(null); router.push(`/workflows/${id}/edit`) }
    catch (err) {
      if (err instanceof ReducaoDestrutiva) { setReducao({ msg: err.message, acao: 'rascunho' }); return }
      setAviso({ msg: 'Não foi possível salvar o workflow.' }); console.error(err)
    }
    finally { setSaving(false) }
  }, [name, persist, router])

  const handleActivate = useCallback(async (confirmarReducao?: boolean) => {
    if (!name.trim()) { setAviso({ msg: 'Dê um nome ao workflow antes de ativar.' }); return }
    // O tipo decide em que tela o workflow aparece no "Novo processo" (o backend também recusa).
    if (!kind) { setAviso({ msg: 'Escolha o tipo do workflow (contrato, aditivo ou parceiro) antes de ativar.' }); return }
    if (activityCount === 0) { setAviso({ msg: 'Adicione ao menos uma atividade antes de ativar.' }); return }
    // Pendências conhecidas ANTES do servidor: abre a lista clicável. AVISO não impede.
    if (bloqueantes(pendencias).length) { setPendAberto(true); return }
    setActivating(true)
    try {
      const id = await persist(confirmarReducao)
      setReducao(null)
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setAviso({ titulo: 'Ainda não dá para ativar', msg: e?.message || 'Não foi possível ativar o workflow.', aoFechar: () => router.push(`/workflows/${id}`) })
        return
      }
      router.push(`/workflows/${id}`)
    } catch (err) {
      if (err instanceof ReducaoDestrutiva) { setReducao({ msg: err.message, acao: 'ativar' }); return }
      setAviso({ msg: 'Não foi possível ativar o workflow.' }); console.error(err)
    }
    finally { setActivating(false) }
  }, [name, kind, activityCount, pendencias, persist, router])

  // Monta o modelo do grafo (posições da raia + textos) para o exportador desenhar em 2D.
  const buildExportModel = useCallback((): ExportModel => {
    /* O arquivo é o que está na TELA: no desenho BPMN, as posições, raias e setas dele (os
       textos vêm da mesma fonte do cartão); em "Ver por raia", a vista por raia, abaixo. */
    if (vista === 'desenho' && grafo && desenhoVisto) {
      return modeloDeExportacao(grafo, desenhoVisto, (g) => {
        const n = nodeById[g.id]
        if (isActivity(g.type)) {
          const meta = n ? metaDaAtividade(n, resolvePapel, resolveEntidade).map((m) => m.text) : []
          return { name: n?.step?.stepName || 'Sem nome', typeLabel: g.type === 'serviceTask' ? 'Ação automática' : 'Tarefa', meta }
        }
        if (g.type === 'exclusiveGateway' || g.type === 'parallelGateway' || g.type === 'inclusiveGateway') return { name: g.name ?? '', isFork: !!g.name }
        return { name: g.name || (g.type === 'start' ? 'Início' : g.type === 'end' ? 'Fim' : '') }
      })
    }
    const enodes: ExportNode[] = nodes.map((n) => {
      const p = layout.nodes[n.id]
      const base = { id: n.id, type: n.type, x: p.x, y: p.y, w: p.w, h: p.h }
      if (isActivity(n.type)) {
        // MESMA fonte do cartão da tela — o arquivo exportado não pode contar outra história
        const meta = metaDaAtividade(n, resolvePapel, resolveEntidade).map((m) => m.text)
        return { ...base, name: n.step?.stepName || 'Sem nome', typeLabel: n.type === 'serviceTask' ? 'Ação automática' : 'Tarefa', meta }
      }
      if (n.type === 'exclusiveGateway' || n.type === 'parallelGateway' || n.type === 'inclusiveGateway') return { ...base, name: n.name, isFork: !!n.name }
      return { ...base, name: n.name }
    })
    const eedges: ExportEdge[] = edges.filter((e) => layout.nodes[e.from] && layout.nodes[e.to]).map((e) => {
      const a = layout.nodes[e.from], b = layout.nodes[e.to]
      const from = nodeById[e.from]
      const variant: ExportEdge['variant'] = from?.type === 'exclusiveGateway' || from?.type === 'inclusiveGateway' ? 'exclusive' : from?.type === 'parallelGateway' ? 'parallel' : 'normal'
      // MESMA geometria da tela, senão o arquivo sai diferente do que se vê.
      const g = edgeGeometry(a, b, Object.entries(layout.nodes).filter(([id]) => id !== e.from && id !== e.to).map(([, p]) => p))
      return {
        ax: g.a.x, ay: g.a.y, bx: g.b.x, by: g.b.y,
        adx: g.aDir.x, ady: g.aDir.y, bdx: g.bDir.x, bdy: g.bDir.y,
        backward: g.arcoPorBaixo, variant, label: e.label,
      }
    })
    return { width: layout.width, height: layout.height, nodes: enodes, edges: eedges, lanes: layout.lanes }
  }, [nodes, edges, layout, nodeById, resolvePapel, resolveEntidade, vista, grafo, desenhoVisto])

  // Exporta o desenho atual (edições ao vivo, sem precisar salvar) como JPG ou PDF.
  const handleExport = useCallback(async (format: FlowExportFormat) => {
    setExporting(format); setExportError(null)
    try {
      await exportFlow(buildExportModel(), { format, name: name || 'workflow', kind })
    } catch (err) {
      // NÃO usar alert() aqui: diálogo nativo trava a automação/extensão. Erro inline + console.
      console.error('[export]', err)
      setExportError('Falha ao exportar')
      setTimeout(() => setExportError(null), 5000)
    } finally {
      setExporting(null)
    }
  }, [buildExportModel, name, kind])

  /* Esc DENTRO da gaveta de um bloco a fecha (deseleciona). Não há o que desfazer: a
     configuração do bloco vale ao vivo, como no resto do desenho. */
  const gavetaDoBloco = !!selectedBloco && !(configNode && configNode.step)
  useEffect(() => {
    if (!gavetaDoBloco) return
    const onKey = (e: KeyboardEvent) => { if (ehEscDaGaveta(e)) { e.stopPropagation(); setSelectedId(null) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [gavetaDoBloco])

  // Delete/Backspace remove o item selecionado (fora de campos e com os modais fechados).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // dentro da gaveta lateral (um botão, uma lista) a tecla é dela, não do desenho
      if (t?.closest?.(`[${ATRIBUTO_GAVETA}],[data-floating-menu],[role="menu"]`)) return
      if (!selectedId || !fluxo || configId || vista !== 'desenho') return
      if (acharItem(fluxo, selectedId)) { e.preventDefault(); remover(selectedId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, fluxo, configId, vista, remover])

  const resumo = (() => {
    const atv = nodes.filter((n) => isActivity(n.type)).length
    const esc = fluxo ? listarEscolhas(fluxo).length : 0
    const par = nodes.filter((n) => n.type === 'parallelGateway' && !n.id.endsWith(SUFIXO_REENCONTRO)).length
    return [`${atv} ${atv === 1 ? 'atividade' : 'atividades'}`, ...(esc ? [`${esc} ${esc === 1 ? 'escolha' : 'escolhas'}`] : []), ...(par ? [`${par} ao mesmo tempo`] : [])].join(' · ')
  })()
  const noDesenho = !!fluxo && vista === 'desenho'

  /* Topo: compacta pela largura DISPONÍVEL (ver useNivelDoTopo). A chave lista o que pode
     ENCOLHER o conteúdo (aí vale tentar um nível menor); o que só cresce (o texto de "Quem
     inicia", os papéis que chegam) é pego pela medida a cada render, que só sobe. */
  const topoRef = useRef<HTMLDivElement>(null)
  const maisRef = useRef<HTMLButtonElement>(null)
  /* Os balões do topo têm o estado AQUI: mudar de nível não pode fechá-los. E, com um deles
     aberto, o nível congela (ver useNivelDoTopo). */
  const [quemIniciaAberto, setQuemIniciaAberto] = useState(false)
  const [sobreAberto, setSobreAberto] = useState(false)
  const [maisAberto, setMaisAberto] = useState(false)
  const nivelTopo = useNivelDoTopo(topoRef, [
    tamanhoDoNome(name), !name.trim(), sujo, voltaARascunho, pendencias.length, bloqueantes(pendencias).length, kind,
    exportError ?? '', editing,
    // fechar um balão do topo remede desde o 0 (o que mudou com ele aberto — ex.: "Quem inicia" — conta)
    quemIniciaAberto || sobreAberto || maisAberto,
  ].join('|'), quemIniciaAberto || sobreAberto || maisAberto)
  const quemIniciaNoMenu = nivelTopo >= 6
  /* saiu do ⋯ (o nível desceu) com o balão fechado: nada de reabrir sozinho depois */
  const [noMenuAntes, setNoMenuAntes] = useState(quemIniciaNoMenu)
  if (noMenuAntes !== quemIniciaNoMenu) {
    setNoMenuAntes(quemIniciaNoMenu)
    if (!quemIniciaNoMenu && quemIniciaAberto) setQuemIniciaAberto(false)
  }

  return (
    /* O editor é um cartão que ocupa a área toda, com cantos da mesma família das ilhas. */
    <div className="flex flex-col h-full overflow-hidden rounded-xl border bg-background">
      {/* TOPO numa linha só (spec "Topo"). `relative z-40`: o painel da saúde abre para
          baixo, por cima do desenho e da gaveta. */}
      <div ref={topoRef} className="relative z-40 flex min-w-0 items-center gap-2 border-b bg-card px-3 py-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => sairPara('/workflows')} className="h-8 w-8 shrink-0" aria-label="Voltar para Workflows" title="Voltar para Workflows"><ArrowLeft className="h-4 w-4" /></Button>
        <NomeNoTopo nome={name} onNome={setName} autoFocus={!editing} podeEncolher={nivelTopo >= 7} />
        <SobreDoWorkflow descricao={description} onDescricao={setDescription} tipo={kind} onTipo={setKind} tipos={WORKFLOW_KINDS} resumo={resumo} soIcone={nivelTopo >= 4}
          aberto={sobreAberto} onAberto={setSobreAberto} />
        {/* no nível 6 o botão vai para o ⋯; o balão continua aqui, ancorado no ⋯ */}
        <QuemIniciaPill value={quemInicia} onChange={setQuemInicia} papeis={papeis.entries} kind={kind} soIcone={nivelTopo >= 2}
          aberto={quemIniciaAberto} onAberto={setQuemIniciaAberto} semBotao={quemIniciaNoMenu} ancora={maisRef} />
        <PendenciasPill noTopo compacta={nivelTopo >= 3} pendencias={pendencias} aberto={pendAberto} onToggle={() => setPendAberto((v) => !v)}
          onItem={(p) => { setPendAberto(false); if (fluxo) setVista('desenho'); focarPendencia(p) }} />
        <div data-topo-espaco className="min-w-0 flex-1" />
        {exportError && <span className="shrink-0 text-[11px] text-destructive font-medium">{exportError}</span>}
        {/* Frase CURTA: o detalhe fica no title. */}
        {sujo && (
          <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px]', voltaARascunho ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}
            title={voltaARascunho
              ? 'Alterações não salvas. Ao sair, gravam sozinhas e o workflow volta a rascunho — sai do "Novo processo" até ser reativado. Processos em andamento não são afetados.'
              : ativoNoServidor
                ? 'Alterações não salvas, só no desenho. Gravam sozinhas ao sair e o workflow continua ativo.'
                : 'Alterações não salvas. Gravam sozinhas ao sair.'}>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className={nivelTopo >= 5 ? 'sr-only' : undefined}>{voltaARascunho ? 'Não salvo · volta a rascunho' : 'Não salvo'}</span>
          </span>
        )}
        <div className="flex shrink-0 items-center rounded-md border bg-card shadow-sm">
          <button type="button" onClick={desfazer} disabled={!podeDesfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"
            className="h-8 w-8 flex items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Undo2 className="h-4 w-4" />
          </button>
          <span className="w-px h-4 bg-border" />
          <button type="button" onClick={refazer} disabled={!podeRefazer} title="Refazer (Ctrl+Y)" aria-label="Refazer"
            className="h-8 w-8 flex items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        {nivelTopo < 6 && (
          <Button variant="outline" size="sm" className={cn('shrink-0', nivelTopo >= 1 && 'px-2')} onClick={organizarDesenho} disabled={!noDesenho || !desenhoVisto}
            aria-label="Organizar" title="Organizar: arruma as formas na ordem do fluxo e cada uma na raia de quem a executa">
            <LayoutGrid className="h-4 w-4" />{nivelTopo < 1 && 'Organizar'}
          </Button>
        )}
        <MenuMais botaoRef={maisRef} aberto={maisAberto} onAberto={setMaisAberto}
          // com o "Quem inicia" aberto a partir do ⋯, clicar no ⋯ só o fecha (não abre os dois)
          antesDeAlternar={() => { if (quemIniciaNoMenu && quemIniciaAberto) { setQuemIniciaAberto(false); return true } return false }}
          extras={nivelTopo >= 6 ? [
            { rotulo: 'Organizar', icone: <LayoutGrid className="h-4 w-4 text-muted-foreground" />, onClick: organizarDesenho, disabled: !noDesenho || !desenhoVisto },
            { rotulo: 'Quem inicia…', icone: <DoorOpen className="h-4 w-4 text-muted-foreground" />, onClick: () => setQuemIniciaAberto(true) },
          ] : undefined}
          onHistorico={editing ? () => setHistoricoAberto(true) : undefined}
          onExportar={handleExport} exportando={exporting} exportarDesabilitado={saving || activating}
          onVerPorRaia={() => { aplicarGaveta(); setSelectedId(null); setVista('raia') }} verPorRaiaDesabilitado={vista === 'raia'} />
        {editing && <ProcessHistoryDrawer processId={initial!.id} aberto={historicoAberto} onFechar={() => setHistoricoAberto(false)} />}
        {/* ⚠️ `() =>` obrigatório: passar a função direto entregaria o MouseEvent como
            `confirmarReducao` — truthy — e a guarda seria burlada em TODO salvamento. */}
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => { aplicarGaveta(); void handleSaveDraft() }} disabled={saving || activating || somenteLeitura}
          aria-label="Salvar rascunho" title="Salvar rascunho">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{nivelTopo >= 5 ? 'Salvar' : 'Salvar rascunho'}</Button>
        <Button size="sm" className="shrink-0" onClick={() => { aplicarGaveta(); void handleActivate() }} disabled={saving || activating || !name.trim() || somenteLeitura}
          title={somenteLeitura ? 'Workflow do editor antigo: aberto só para leitura' : !name.trim() ? 'Dê um nome ao workflow para poder ativá-lo' : 'Ativar workflow'}
          aria-label="Ativar workflow">
          {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{nivelTopo >= 7 ? 'Ativar' : 'Ativar workflow'}</Button>
      </div>

      {somenteLeitura && (
        <div className="flex items-start gap-3 px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-[12.5px] leading-snug">
            Este workflow foi desenhado no editor antigo, com ligações livres que não cabem em blocos. Ele abre
            <span className="font-semibold"> só para leitura</span>. Para alterá-lo, crie um workflow novo e desenhe-o de novo.
          </p>
        </div>
      )}

      {/* Guarda de gravação destrutiva: a API recusou porque a gravação apagaria grande
          parte do desenho. A pessoa decide, sabendo o que perde. */}
      {reducao && (
        <div className="flex items-start gap-3 px-4 py-2.5 border-b bg-destructive/10 text-destructive shrink-0">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-[12.5px] leading-snug flex-1 min-w-0">{reducao.msg}</p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setReducao(null)}>Não salvar</Button>
            <Button variant="destructive" size="sm" disabled={saving || activating}
              onClick={() => (reducao.acao === 'ativar' ? handleActivate(true) : handleSaveDraft(true))}>
              Salvar assim mesmo
            </Button>
          </div>
        </div>
      )}

      <NoticeDialog open={!!aviso} title={aviso?.titulo} message={aviso?.msg}
        onClose={() => { const depois = aviso?.aoFechar; setAviso(null); depois?.() }} />
      <SairSemSalvarDialog open={!!saida}
        onContinuar={() => setSaida(null)}
        onDescartar={() => { const destino = saida!; limpoRef.current = assinaturaRef.current; setSaida(null); router.push(destino) }}
        onSalvar={async () => {
          const destino = saida!
          setSaida(null)
          if (!name.trim()) { setAviso({ msg: 'Dê um nome ao workflow antes de salvar.' }); return }
          try { await persist(); router.push(destino) }
          catch (err) {
            if (err instanceof ReducaoDestrutiva) { setReducao({ msg: err.message, acao: 'rascunho' }); return }
            setAviso({ msg: 'Não foi possível salvar o workflow.' }); console.error(err)
          }
        }} />

      {/* `relative`: as gavetas laterais (absolute) encostam à direita desta faixa, por cima do desenho. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {noDesenho ? (
          <>
            <PaletaBpmn onAdicionarRaia={aoAdicionarRaia} onEscolher={aoEscolherNaPaleta} desabilitada={!desenhoVisto} />
            <div className="relative min-w-0 flex-1">
              {fluxo && grafo && desenhoVisto ? (
                <CanvasBpmn fluxo={fluxo} grafo={grafo} desenho={desenhoVisto} steps={stepsEfetivos} selecionado={selectedId}
                  nomeDoProcesso={name} revisaoDasConsultas={revisaoDasConsultas}
                  responsavelDe={responsavelDe} prazoDe={prazoDe} problemasDe={problemasDe}
                  onSelecionar={aoSelecionarNoDesenho} onDesenho={aoMudarDesenho} onInserir={aoInserir} onMoverItem={aoMoverItem}
                  onLigar={aoLigar} onRemover={remover}
                  vinculaveis={vinculaveis} onInserirVinculada={aoInserirVinculada} focoEm={focoEm} enquadrar={enquadrar} />
              ) : (
                <div role="status" className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Preparando o desenho…
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            {/* VER POR RAIA: a vista antiga, só de leitura. No desenho antigo é a única. */}
            {fluxo && (
              <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-3 py-1.5">
                <Button variant="outline" size="sm" onClick={() => { setSelectedId(null); setVista('desenho') }}><ArrowLeft className="h-4 w-4" />Voltar ao desenho</Button>
                <p className="text-[11.5px] text-muted-foreground">Vista por raia: o mesmo fluxo organizado por quem executa, só para leitura.</p>
              </div>
            )}
            <FlowCanvas canvasRef={canvasRef} nodes={nodes} edges={edges} layout={layout} selectedId={selectedId}
              onSelect={(id) => {
                // só leitura: no desenho antigo a atividade abre a gaveta de leitura (R13); no
                // "Ver por raia" de um fluxo editável, só destaca (configurar é no desenho)
                setSelectedId(id)
                const n = id ? nodeById[id] : undefined
                setConfigId(!fluxo && n && isActivity(n.type) ? n.id : null)
              }}
              resolvePapel={resolvePapel} resolveEntidade={resolveEntidade} pendencias={pendencias} />
          </div>
        )}

        {/* Configuração da escolha / "ao mesmo tempo" selecionado: gaveta lateral por cima
            do desenho (as etapas dos caminhos estão nele). As perguntas de uma atividade em
            configuração têm a vez sobre ela. */}
        {noDesenho && selectedBloco && fluxo && !(configNode && configNode.step) && (
          <GavetaLateral key={selectedBloco.id}
            rotulo={selectedBloco.kind === 'escolha' ? 'Escolha' : 'Ao mesmo tempo'}
            titulo={(selectedBloco.kind === 'escolha' ? selectedBloco.pergunta?.trim() : selectedBloco.nome?.trim())
              || (selectedBloco.kind === 'escolha' ? 'Escolha sem pergunta' : 'Bloco sem nome')}
            rotuloTom={selectedBloco.kind === 'escolha' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}
            rotuloIcone={<GatewayGlyph kind={selectedBloco.kind === 'escolha' ? 'exclusive' : 'parallel'} className="h-3 w-3" />}
            onFechar={() => setSelectedId(null)} focarAoAbrir={focarGaveta}>
            <ConfiguracaoDoBloco blocoId={selectedBloco.id} fluxo={fluxo} steps={stepsEfetivos} simulacao={simulacao}
              onRemover={remover} onFluxo={mudarFluxo}
              screens={screens} onSimulacao={setSimulacao} onConfigurarAtividade={configurarAtividadeDaEscolha} problemas={pendenciasPorNo} />
          </GavetaLateral>
        )}

        {/* Configuração da atividade: perguntas numa gaveta lateral de 440 px. */}
        {somenteLeitura && configNode && configNode.step && (
          <PerguntasDaEtapa key={configNode.id} node={configNode} nodes={nodes} edges={edges} screens={screens} papeis={papeis} resolveEntidade={resolveEntidade}
            somenteLeitura onPatchStep={() => {}} onChangeType={() => {}} onRemove={() => {}}
            onClose={() => setConfigId(null)} />
        )}

        {noDesenho && configNode && configNode.step && fluxo && (
          <PerguntasDaEtapa key={configNode.id} node={configNode} nodes={nodes} edges={edges} screens={screens} papeis={papeis} resolveEntidade={resolveEntidade}
            secaoInicial={configSecao} focarAoAbrir={focarGaveta}
            onPatchStep={(p) => patchStep(configNode.id, p)}
            onChangeType={(t) => changeNodeType(configNode.id, t)}
            vinculo={(() => {
              const raiz = raizDe.get(configNode.id) ?? configNode.id
              const outros = (vinculos.get(raiz) ?? []).length
              if (!outros) return undefined
              return { lugares: outros + 1, ehCopia: raizDe.has(configNode.id), desvincular: () => desvincular(configNode.id) }
            })()}
            onRemove={() => { remover(configNode.id); setRetornoEscolha(null); setConfigSecao(undefined) }}
            onClose={() => {
              setConfigId(null); setConfigSecao(undefined)
              if (retornoEscolha) { setSelectedId(retornoEscolha); setRetornoEscolha(null) }
            }} />
        )}
      </div>
    </div>
  )
}

/* ─── Canvas ────────────────────────────────────────────────────────────────── */

const STEP_TONE: Record<string, string> = {
  userTask: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  serviceTask: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
}


/** Recuo do nome da raia na faixa de rótulos. */
const LANE_PAD = 10

/** Faixa dos nomes das raias — FIXA na tela, fora do canvas escalado. Por isso o nome
 *  continua legível em qualquer zoom e não some quando o desenho é rolado para a direita
 *  (era o que acontecia quando a coluna morava dentro do desenho). Só leitura: reordenar
 *  raias é no desenho BPMN. */
function LaneHeader({ bandas, largura, scale, scrollTop }: {
  bandas: LaneBand[] | undefined
  largura: number
  scale: number
  scrollTop: number
}) {
  if (!bandas?.length) return null
  /* ⚠️ O CONTÊINER é transparente. Pintar a faixa toda (`inset-y-0` com fundo) fazia a
     área acima da primeira banda e abaixo da última receber a mesma cor — e a primeira e
     a última raia pareciam maiores que a banda a que correspondem. Cor e bordas
     pertencem a cada LINHA, que tem a altura exata da sua banda. */
  return (
    <div className="absolute inset-y-0 left-0 z-20 overflow-hidden pointer-events-none" style={{ width: largura }}>
      {bandas.map((b, i) => {
        /* `b.y` já é a coordenada do DESENHO (inclui a margem do layout); escalada e
           descontada a rolagem, ela é a posição na tela. */
        const top = b.y * scale - scrollTop
        const alt = b.h * scale
        const semDono = b.key === LANE_SEM_RESPONSAVEL
        return (
          <div key={b.key} className="absolute left-0 right-0 flex items-stretch"
            style={{
              top, height: alt, paddingLeft: LANE_PAD,
              background: 'hsl(var(--foreground) / 0.075)',
              borderRight: '1px solid hsl(var(--foreground) / 0.22)',
              borderTop: i === 0 ? 'none' : '1px solid hsl(var(--foreground) / 0.16)',
            }}>
            {/* ⚠️ A faixa é MOLDURA, não conteúdo: o rótulo usa `muted-foreground`, o mesmo
                idiom dos cabeçalhos de tabela do sistema. E NADA de cor nova: a raia sem
                executor se distingue por FORMA (primeira e em itálico), não por um tom. */}
            <div className="flex-1 min-w-0 flex flex-col justify-center pr-2">
              <span className={cn('text-[11px] font-semibold leading-tight select-none [overflow-wrap:anywhere] text-muted-foreground', semDono && 'italic')}>
                {b.label.replace(/\//g, '/​')}
              </span>
              {/* a raia sem executor é a LISTA do que falta configurar, não um resto */}
              {semDono && b.atividades > 0 && alt > 34 && (
                <span className="text-[10px] leading-tight text-muted-foreground/80 select-none">
                  {b.atividades} sem executor
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** VER POR RAIA — o mesmo fluxo, organizado por quem executa. Só leitura: clicar num
 *  quadro só o destaca (configurar é no desenho). */
function FlowCanvas({ canvasRef, nodes, edges, layout, selectedId, onSelect, resolvePapel, resolveEntidade, pendencias }: {
  canvasRef: React.RefObject<HTMLDivElement | null>
  nodes: ENode[]; edges: EEdge[]; layout: ReturnType<typeof layoutGraph>
  selectedId: string | null; onSelect: (id: string | null) => void
  resolvePapel: (id: string) => string | undefined
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
  /** Pendências de ativação: os avisos marcam o quadro (a pílula mora no topo). */
  pendencias: ProblemaAtivacao[]
}) {
  // ENQUADRAMENTO: encolhe o desenho para caber na área REAL do canvas. Sem isso o "Fim" —
  // sempre na última coluna — nasce fora da tela.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  // a faixa de rótulos vive FORA do canvas rolável, então precisa acompanhar a rolagem
  const [scrollTop, setScrollTop] = useState(0)
  /* O enquadramento automático só vale ENQUANTO o usuário não pediu um zoom. */
  const [autoFit, setAutoFit] = useState(true)

  const fitScale = useCallback(() => {
    const el = scrollRef.current
    if (!el) return 1
    const availW = el.clientWidth - 24, availH = el.clientHeight - 24
    if (availW <= 0 || availH <= 0) return 1
    return Math.max(ZOOM_MIN, Math.min(1, availW / layout.width, availH / layout.height))
  }, [layout.width, layout.height])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const aplicar = () => { if (autoFit) setScale(fitScale()) }
    aplicar()
    const ro = new ResizeObserver(aplicar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitScale, autoFit])

  /** Muda o zoom mantendo FIXO o ponto sob o cursor (ou o centro da área visível). */
  const zoomPara = useCallback((novo: number, ancoraClientX?: number, ancoraClientY?: number) => {
    const el = scrollRef.current
    if (!el) return
    const s2 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo))
    setScale((s1) => {
      if (s2 === s1) return s1
      const r = el.getBoundingClientRect()
      const ax = ancoraClientX !== undefined ? ancoraClientX - r.left : el.clientWidth / 2
      const ay = ancoraClientY !== undefined ? ancoraClientY - r.top : el.clientHeight / 2
      const gx = (el.scrollLeft + ax) / s1, gy = (el.scrollTop + ay) / s1
      requestAnimationFrame(() => { el.scrollLeft = gx * s2 - ax; el.scrollTop = gy * s2 - ay })
      return s2
    })
    setAutoFit(false)
  }, [])

  /* Ctrl/⌘ + roda = zoom. Listener NÃO-PASSIVO: sem `preventDefault` o navegador aplica o
     zoom DELE na página. */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomPara(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scale, zoomPara])

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  /** Caixas que a seta from→to precisa contornar: todo nó posicionado, menos as pontas. */
  const obstaculosPara = useCallback((from: string, to: string): Box[] =>
    Object.entries(layout.nodes).filter(([id]) => id !== from && id !== to).map(([, p]) => p),
  [layout])

  /* AVISO no próprio quadro: a lista diz o que é, mas quem olha o desenho precisa ver ONDE. */
  const avisoPorNo = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of avisosDe(pendencias)) if (p.nodeId) m[p.nodeId] = p.mensagem
    return m
  }, [pendencias])
  const edgeColor = (e: EEdge) => {
    const f = nodeById[e.from]
    if (f?.type === 'exclusiveGateway' || f?.type === 'inclusiveGateway') return '#7c3aed'
    if (f?.type === 'parallelGateway') return '#e11d68'
    return 'hsl(var(--muted-foreground) / 0.5)'
  }

  /* Largura da faixa de rótulos: ADAPTATIVA ao papel de nome mais longo, entre um piso e
     um teto. Estimativa determinística (~5,6px por caractere a 11px semibold). */
  const laneHeaderW = useMemo(() => {
    const rotulos = layout.lanes?.map((b) => b.label) ?? []
    if (!rotulos.length) return 0
    // maior pedaço INDIVISÍVEL (quebramos em espaço e em "/") define o piso da largura
    const maiorPedaco = Math.max(...rotulos.flatMap((r) => r.split(/[\s/]+/).map((p) => p.length)), 6)
    const maisLongo = Math.max(...rotulos.map((r) => r.length))
    const porPedaco = maiorPedaco * 5.6 + LANE_PAD + 18
    const porTotal = (maisLongo * 5.6) / 2 + LANE_PAD + 18 // mirando 2 linhas
    return Math.round(Math.min(240, Math.max(124, porPedaco, porTotal)))
  }, [layout.lanes])

  // O deselect fica no CONTAINER de rolagem: com o enquadramento a div do grafo não cobre
  // toda a área visível.
  return (
    <div className="flex-1 min-w-0 min-h-0 relative">
    <ZoomBar scale={scale} autoFit={autoFit}
      onZoom={(s) => zoomPara(s)}
      onFit={() => { setAutoFit(true); setScale(fitScale()) }} />
    <LaneHeader bandas={layout.lanes} largura={laneHeaderW} scale={scale} scrollTop={scrollTop} />
    <div ref={scrollRef} className="absolute inset-y-0 right-0 overflow-auto bg-muted/20 [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px]"
      style={{ left: laneHeaderW }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-node-id]')) onSelect(null) }}>
      {/* espaçador com o tamanho JÁ ESCALADO: mantém as barras de rolagem corretas */}
      <div style={{ width: layout.width * scale, height: layout.height * scale, minWidth: '100%' }}>
      <div ref={canvasRef} className="relative" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {/* RAIAS — bandas atrás de tudo. ⚠️ A moldura sai de `--foreground` com alfa, não de
            `--border`/`--muted`: no tema claro esses tokens somem contra o fundo. */}
        {layout.lanes?.length ? (
          <div className="absolute left-0 pointer-events-none rounded-sm"
            style={{
              top: layout.lanes[0].y, width: layout.width,
              height: layout.lanes[layout.lanes.length - 1].y + layout.lanes[layout.lanes.length - 1].h - layout.lanes[0].y,
              border: '1px solid hsl(var(--foreground) / 0.22)', // contorno do "pool"
              background: 'hsl(var(--card) / 0.55)',
            }} />
        ) : null}
        {layout.lanes?.map((b, i) => (
          <div key={b.key} className="absolute left-0 pointer-events-none z-[1]" style={{ top: b.y, height: b.h, width: layout.width }}>
            <div className="absolute inset-0" style={{
              borderTop: i === 0 ? 'none' : '1px solid hsl(var(--foreground) / 0.16)',
              background: i % 2 === 1 ? 'hsl(var(--foreground) / 0.045)' : 'transparent',
            }} />
          </div>
        ))}
        {/* ⚠️ `pointer-events-none` na RAIZ do svg: ele cobre o canvas inteiro e engoliria o
            mouse sobre a coluna de rótulos. */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: layout.width, height: layout.height }}>
          <defs>
            <marker id="fl-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
          </defs>
          {edges.map((e) => {
            const na = layout.nodes[e.from], nb = layout.nodes[e.to]
            if (!na || !nb) return null
            const { a, aDir, b, bDir } = edgeGeometry(na, nb, obstaculosPara(e.from, e.to))
            const col = edgeColor(e)
            return <path key={e.id} d={edgeBezier(a, aDir, b, bDir)} fill="none" stroke={col} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#fl-arrow)" style={{ color: col }} />
          })}
        </svg>

        {/* rótulos das arestas */}
        {edges.map((e) => {
          const na = layout.nodes[e.from], nb = layout.nodes[e.to]
          if (!na || !nb || !e.label) return null
          const { a, b, arcoPorBaixo } = edgeGeometry(na, nb, obstaculosPara(e.from, e.to))
          const mx = (a.x + b.x) / 2
          // no retorno o rótulo acompanha o ponto mais baixo do arco (y ≈ Y + 0.75k)
          const my = arcoPorBaixo ? (a.y + b.y) / 2 + 0.75 * edgeK(a, b) : (a.y + b.y) / 2 - 16
          return <div key={`lb-${e.id}`} className="absolute -translate-x-1/2 -translate-y-1/2 text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-card border shadow-sm pointer-events-none" style={{ left: mx, top: my, color: e.isDefault ? 'hsl(var(--muted-foreground))' : undefined }}>{e.label}</div>
        })}

        {/* nós */}
        {nodes.map((n) => {
          const p = layout.nodes[n.id]
          if (!p) return null
          return (
            <div key={n.id} data-node-id={n.id} className="absolute select-none" style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>
              <FlowNodeView node={n} selected={n.id === selectedId} onClick={() => onSelect(n.id)} resolvePapel={resolvePapel} resolveEntidade={resolveEntidade} aviso={avisoPorNo[n.id]} />
            </div>
          )
        })}
      </div>
      </div>
    </div>
    </div>
  )
}

/* ─── Símbolos BPMN ──────────────────────────────────────────────────────────
   Eventos e gateways usam a NOTAÇÃO PADRÃO (a mesma do Bizagi/Camunda), não ícones
   decorativos: círculo fino = início, círculo grosso = fim, losango com "X" = decisão
   exclusiva (ou/ou), losango com "+" = paralelo (e/e). O nome fica FORA da forma,
   embaixo — é assim que o BPMN rotula evento e gateway. As cores continuam sendo as
   do design system; o padrão define a FORMA, não a paleta. */

/** Rótulo do nó desenhado FORA da forma (evento/gateway), centrado embaixo. */
function NodeLabel({ text }: { text?: string }) {
  if (!text) return null
  return (
    <span className="absolute left-1/2 top-full z-10 -translate-x-1/2 mt-1 text-center text-[11px] font-semibold leading-tight text-foreground pointer-events-none"
      style={{ width: LABEL_W, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
      {text}
    </span>
  )
}

function FlowNodeView({ node, selected, onClick, resolvePapel, resolveEntidade, aviso }: {
  node: ENode; selected: boolean; onClick: () => void
  resolvePapel: (id: string) => string | undefined
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
  /** Aviso de ativação deste nó (ex.: executa, mas não leva ao fim). Não é erro. */
  aviso?: string
}) {
  if (node.type === 'start' || node.type === 'end') {
    // BPMN: início = anel FINO, fim = anel GROSSO. O raio compensa a espessura para os
    // dois círculos terem o mesmo diâmetro externo (senão o "Fim" parece maior).
    const isStart = node.type === 'start'
    const sw = isStart ? 2 : 4.5
    return (
      <div className="relative w-full h-full">
        <svg viewBox="0 0 56 56" className="w-full h-full overflow-visible text-emerald-600 dark:text-emerald-400">
          <circle cx={28} cy={28} r={28 - sw / 2} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={sw} />
        </svg>
        <NodeLabel text={node.name} />
      </div>
    )
  }
  if (node.type === 'exclusiveGateway' || node.type === 'parallelGateway' || node.type === 'inclusiveGateway') {
    const isExcl = node.type !== 'parallelGateway'
    const tone = isExcl ? 'text-violet-600 dark:text-violet-400' : 'text-rose-600 dark:text-rose-400'
    const m = 9.5 // meio-braço do marcador interno
    return (
      <div className="relative w-full h-full">
        <button onClick={onClick} className={cn('block w-full h-full transition-transform hover:scale-105', tone)}
          title={node.name || 'Reencontro'}>
          <svg viewBox="0 0 56 56" className="w-full h-full overflow-visible">
            {selected && <polygon points="28,-2 58,28 28,58 -2,28" fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />}
            <polygon points="28,2 54,28 28,54 2,28" fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
            <g stroke="currentColor" strokeWidth={3.4} strokeLinecap="round">
              {isExcl
                ? <><line x1={28 - m} y1={28 - m} x2={28 + m} y2={28 + m} /><line x1={28 + m} y1={28 - m} x2={28 - m} y2={28 + m} /></>
                : <><line x1={28} y1={28 - m * 1.35} x2={28} y2={28 + m * 1.35} /><line x1={28 - m * 1.35} y1={28} x2={28 + m * 1.35} y2={28} /></>}
            </g>
          </svg>
        </button>
        <NodeLabel text={node.name} />
      </div>
    )
  }
  // atividade — card em vidro (sem thumbnail-esqueleto), acento no topo pela cor do tipo
  const type = node.type
  const tone = STEP_TONE[type]
  const Icon = type === 'serviceTask' ? Zap : UserSquare
  const step = node.step
  const meta = metaDaAtividade(node, resolvePapel, resolveEntidade)
  return (
    <button onClick={onClick} className={cn('group/card w-full h-full text-left rounded-xl glass overflow-hidden flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-lg', selected && 'ring-2 ring-primary')}>
      <div className={cn('h-1 shrink-0', type === 'serviceTask' ? 'bg-amber-500/70' : 'bg-sky-500/70')} />
      <div className="flex flex-1 min-h-0 flex-col p-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg shrink-0', tone)}><Icon className="h-3.5 w-3.5" /></span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{type === 'serviceTask' ? 'Ação automática' : 'Tarefa'}</span>
          {/* Não leva ao fim: marca discreta, com a frase inteira no title. O quadro
              continua legítimo — por isso azul de informação, não vermelho de erro. */}
          {aviso && (
            <span title={aviso} className="ml-auto shrink-0 text-sky-500" aria-label={aviso}>
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <p className="text-[13px] font-semibold leading-tight mt-1.5 shrink-0" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: titleLineCount(step?.stepName), overflow: 'hidden' }}>{step?.stepName || <span className="text-muted-foreground italic font-normal">Sem nome</span>}</p>
        <div className="mt-auto space-y-0.5 pt-1.5 min-h-0 overflow-hidden">
          {meta.map((m, i) => (
            <MetaRow key={i} icon={m.kind === 'exec' && type === 'serviceTask' ? <Zap className="h-3 w-3" /> : META_ICON[m.kind]} text={m.text} />
          ))}
        </div>
      </div>
    </button>
  )
}

/** Linhas de rodapé de uma atividade — FONTE ÚNICA. O cartão desenha por esta lista, o
 *  layout mede a altura da caixa por ela (`metaLines`) e o exportador repete o mesmo.
 *  Se cada um contasse por si, a caixa cortaria a última linha ou sobraria vazio.
 *
 *  A UNIDADE (ou a entidade que hospeda o papel) entra como linha própria: o papel
 *  sozinho não diz QUEM executa — "Solicitante" de qual unidade é a informação que
 *  faltava para ler o fluxo sem abrir cada atividade. Existir a linha depende do DADO
 *  configurado, nunca de o nome já ter chegado da rede — senão o cartão mudaria de
 *  altura quando a lista carregasse, e o desenho inteiro pularia. */
type MetaLinha = { kind: 'exec' | 'entidade' | 'prazo'; text: string }

function metaDaAtividade(
  node: ENode,
  resolvePapel: (id: string) => string | undefined,
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined,
): MetaLinha[] {
  const step = node.step
  const linhas: MetaLinha[] = []

  if (node.type === 'serviceTask') {
    linhas.push({ kind: 'exec', text: findConnector(step?.connector)?.label ?? 'Sem ação' })
  } else {
    const papel = step?.executor?.papelId ? (resolvePapel(step.executor.papelId) ?? 'Responsável') : null
    linhas.push({ kind: 'exec', text: papel ?? 'Sem executor' })
    const ex = step?.executor
    if (ex?.papelId) {
      if (ex.mode === 'VARIAVEL' && ex.stakeholder) {
        linhas.push({ kind: 'entidade', text: ex.stakeholder === EXECUTOR_CONTRATO_DO_PROCESSO
          ? 'do contrato do processo'
          : `da ${resolvePapel(ex.stakeholder) ?? 'parte'} do contrato` })
      } else if (ex.mode === 'VARIAVEL' && ex.entityVar) {
        linhas.push({ kind: 'entidade', text: `${entityKindLabel(ex.entityType)} da variável ${ex.entityVar}` })
      } else if (ex.entityId) {
        linhas.push({ kind: 'entidade', text: resolveEntidade(ex.entityType, ex.entityId) ?? `${entityKindLabel(ex.entityType)}…` })
      }
    }
  }

  const due = dueText(step)
  if (due) linhas.push({ kind: 'prazo', text: due })
  return linhas
}

const META_ICON: Record<MetaLinha['kind'], React.ReactNode> = {
  exec: <User className="h-3 w-3" />,
  entidade: <Building2 className="h-3 w-3" />,
  prazo: <Clock className="h-3 w-3" />,
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0"><span className="shrink-0">{icon}</span><span className="truncate">{text}</span></div>
}

function dueText(step?: StepFormSchema): string | null {
  const d = step?.slaBusinessDays ?? 0, h = step?.slaBusinessHours ?? 0, m = step?.slaBusinessMinutes ?? 0
  const parts: string[] = []
  if (d) parts.push(`${d} ${d > 1 ? 'dias úteis' : 'dia útil'}`)
  if (h) parts.push(`${h} h úteis`)
  if (m) parts.push(`${m} min úteis`)
  return parts.length ? parts.join(' · ') : null
}

/* ─── Inspetores ───────────────────────────────────────────────────────────── */

type Papeis = ReturnType<typeof useLookupTable>
type Screens = ReturnType<typeof useScreens>['screens']

/** Campo em GRID: `wide` ocupa a linha inteira (título, texto longo, seletor comprido);
 *  os curtos ficam pareados. Mesma hierarquia dos formulários do sistema. */
function GField({ label, required, hint, wide, children }: { label: string; required?: boolean; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <label className="text-xs font-medium mb-1.5 flex items-center gap-1">{label}{required && <span className="text-destructive">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

/**
 * Configuração da atividade: PERGUNTAS numa GAVETA lateral de 440 px (desenho BPMN,
 * 27/10/2026). Antes era um modal amplo por cima do editor; agora o desenho fica visível
 * ao lado enquanto se configura. Coluna única: o "Em resumo" no alto e as perguntas
 * embaixo, na ordem em que a pessoa pensa a etapa (o índice lateral saiu — não cabia;
 * a contagem do que falta segue no rodapé).
 *
 * Cancelar RESTAURA o estado de quando a gaveta abriu (snapshot em `original`): o editor
 * aplica cada mudança ao vivo no grafo, então sem isso "Cancelar" seria só um "Fechar"
 * mentiroso. Fechar pelo X e o Esc também cancelam; só "Aplicar" mantém.
 */
/** Ids de todos os nós que chegam a `alvo` andando o grafo para trás (predecessoras
 *  transitivas). Guarda de visitados porque o grafo pode ter ciclo. */
function predecessorasDe(edges: EEdge[], alvo: string): Set<string> {
  const preds = new Set<string>()
  const seen = new Set<string>()
  let frontier = edges.filter((e) => e.to === alvo).map((e) => e.from)
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id); preds.add(id)
      for (const e of edges.filter((x) => x.to === id)) next.push(e.from)
    }
    frontier = next
  }
  return preds
}

function PerguntasDaEtapa({ node, nodes, edges, screens, papeis, resolveEntidade, onPatchStep, onChangeType, onRemove, onClose, secaoInicial, vinculo, somenteLeitura, focarAoAbrir }: {
  node: ENode; nodes: ENode[]; edges: EEdge[]; screens: Screens; papeis: Papeis
  /** nome da entidade fixa do executor, para a frase do "Em resumo" */
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
  /** a mesma configuração vale em vários lugares do fluxo (atividade vinculada) */
  vinculo?: { lugares: number; ehCopia: boolean; desvincular: () => void }
  onPatchStep: (patch: Partial<StepFormSchema>) => void; onChangeType: (t: 'userTask' | 'serviceTask') => void; onRemove: () => void
  onClose: () => void
  /** Pergunta em que a gaveta abre (ex.: 'formulario', vindo do aviso da escolha). */
  secaoInicial?: string
  /** Workflow antigo aberto só para leitura: só o "Em resumo" e as respostas, sem campos. */
  somenteLeitura?: boolean
  /** false = a gaveta abre sem tirar o foco da forma (ver GavetaLateral) */
  focarAoAbrir?: boolean
}) {
  const step = node.step!
  const type = node.type as 'userTask' | 'serviceTask'
  const meta = type === 'serviceTask' ? { label: 'Ação automática', tone: STEP_TONE.serviceTask, Icon: Zap } : { label: 'Tarefa do usuário', tone: STEP_TONE.userTask, Icon: UserSquare }
  const entityWord = SUBJECT_ENTITY[step.screenSubject ?? ''] ?? 'entidade'

  // variáveis de etapas ANTERIORES (predecessoras topológicas simples)
  const availableVars = useMemo(() => {
    const preds = predecessorasDe(edges, node.id)
    const out: Array<{ name: string; label: string }> = []
    const s = new Set<string>()
    const add = (n: string, l: string) => { if (n && !s.has(n)) { s.add(n); out.push({ name: n, label: l }) } }
    for (const p of nodes.filter((n) => preds.has(n.id) && n.step)) {
      const st = p.step!
      const m = findConnector(st.connector)
      if (m) for (const o of m.outputs) add(o, `${o} · saída de ${m.label}`)
      if (st.screenRef && st.entityMode === 'CREATE' && st.screenSubject) add(st.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId', `criado em ${st.stepName || 'etapa'}`)
    }
    return out
  }, [edges, nodes, node.id])

  /* Destinos possíveis de DEVOLUÇÃO: predecessoras que são tarefa de usuário. Só elas —
     devolver para uma ação automática a reexecutaria, e o motor recusa. Note que aqui
     a lista é a do DESENHO; em execução o motor ainda pode bloquear um destino que
     esteja atrás de uma ação automática já rodada. A tela avisa isso abaixo. */
  const destinosDevolucao = useMemo(() => {
    const preds = predecessorasDe(edges, node.id)
    return nodes
      .filter((n) => preds.has(n.id) && n.type === 'userTask')
      .map((n) => ({ id: n.id, nome: n.step?.stepName || 'Etapa sem nome' }))
  }, [edges, nodes, node.id])

  const retorno = step.returnPolicy ?? { mode: 'ANY' as const }
  const setRetornoMode = (mode: 'ANY' | 'SELECTED' | 'NONE') =>
    onPatchStep({ returnPolicy: mode === 'ANY' ? undefined : { mode, nodeIds: mode === 'SELECTED' ? (retorno.nodeIds ?? []) : undefined } })
  const toggleDestino = (id: string) => {
    const atuais = new Set(retorno.nodeIds ?? [])
    if (atuais.has(id)) atuais.delete(id); else atuais.add(id)
    onPatchStep({ returnPolicy: { mode: 'SELECTED', nodeIds: [...atuais] } })
  }

  const entityScreens = screens.filter((s) => s.subjectType === 'CONTRATO' || s.subjectType === 'FORNECEDOR')
  const papeisPessoa = papeis.active.filter((p) => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
  const executor = step.executor
  const papelSel = executor?.papelId ? papeis.entries.find((p) => p.id === executor.papelId) : undefined
  const execOrigem = papelSel?.origem
  /** executor "Quem iniciou o processo" (PO, 04/10/2026) */
  const porIniciador = executor?.papelId === EXECUTOR_QUEM_INICIOU
  const pickPapel = (papelId: string) => {
    if (!papelId) return
    const p = papeis.entries.find((pp) => pp.id === papelId)
    onPatchStep({ executor: { papelId, entityType: p?.origem ?? 'CONTRATO', mode: 'FIXA', entityId: undefined, entityVar: undefined } })
  }
  const setExec = (patch: Partial<NonNullable<StepFormSchema['executor']>>) => executor && onPatchStep({ executor: { ...executor, ...patch } })
  /* Tela escolhida na atividade — a origem dos campos que esta etapa pode travar. */
  const telaSel = step.screenRef ? entityScreens.find((s) => s.id === step.screenRef) : undefined
  const travados = step.lockedFields ?? []
  /* Guarda a CHAVE do campo (fieldKey), não o id da linha: a chave é a mesma em todas as
     telas do tipo, então a etapa continua valendo se a tela for trocada por outra do mesmo
     subject — e o que já estava gravado bate, porque a chave nasceu igual ao id antigo. */
  const toggleTravado = (chave: string) =>
    onPatchStep({ lockedFields: travados.includes(chave) ? travados.filter((x) => x !== chave) : [...travados, chave] })

  const pickScreen = (id: string) => {
    if (!id || id === 'none') { onPatchStep({ screenRef: undefined, screenSubject: undefined, entityMode: undefined, entityVar: undefined, lockedFields: undefined, extraScreens: undefined }); return }
    const sc = entityScreens.find((s) => s.id === id)
    /* Trocar de tela DENTRO do mesmo tipo preserva os travados e as abas adicionais: eles
       valem para o tipo, não para aquela tela. Só mudar de subject invalida as listas. */
    const mesmoTipo = sc?.subjectType && telaSel?.subjectType && sc.subjectType === telaSel.subjectType
    const extrasMantidas = (step.extraScreens ?? []).filter((e) => e.screenRef !== id)
    onPatchStep({
      screenRef: id, screenSubject: sc?.subjectType as ScreenSubject as 'CONTRATO' | 'FORNECEDOR' | undefined, entityMode: step.entityMode ?? 'CREATE',
      lockedFields: mesmoTipo ? step.lockedFields : undefined,
      extraScreens: mesmoTipo && extrasMantidas.length ? extrasMantidas : undefined,
    })
  }

  /* Telas ADICIONAIS: o mesmo registro em outras abas na execução. Só telas do mesmo tipo
     da principal; tela somente consulta nasce (e fica) como "Consultar". */
  type ExtraScreen = NonNullable<StepFormSchema['extraScreens']>[number]
  const extras = step.extraScreens ?? []
  const telasDoTipo = telaSel ? entityScreens.filter((s) => s.subjectType === telaSel.subjectType && s.id !== telaSel.id) : []
  const usadas = new Set(extras.map((e) => e.screenRef))
  const livres = telasDoTipo.filter((s) => !usadas.has(s.id))
  const atividadeSoConsulta = (step.entityMode ?? 'CREATE') === 'VIEW'
  const gravarExtras = (lista: ExtraScreen[]) => onPatchStep({ extraScreens: lista.length ? lista : undefined })
  const addExtra = () => { const t = livres[0]; if (t) gravarExtras([...extras, { screenRef: t.id, mode: t.readOnly ? 'VIEW' : 'EDIT' }]) }
  const setExtra = (i: number, patch: Partial<ExtraScreen>) => gravarExtras(extras.map((e, j) => {
    if (j !== i) return e
    const novo = { ...e, ...patch }
    return entityScreens.find((s) => s.id === novo.screenRef)?.readOnly ? { ...novo, mode: 'VIEW' as const } : novo
  }))
  const moverExtra = (i: number, d: -1 | 1) => { const l = [...extras]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); gravarExtras(l) }
  const removerExtra = (i: number) => gravarExtras(extras.filter((_, j) => j !== i))

  /* Campos que a atividade pode travar: os de TODAS as telas que editam (principal +
     abas "Editar"), cada campo listado uma vez — a trava é por chave do tipo. */
  const telasQueEditam = [telaSel, ...extras.filter((e) => e.mode === 'EDIT').map((e) => entityScreens.find((s) => s.id === e.screenRef))]
    .filter((t): t is NonNullable<typeof telaSel> => !!t && !t.readOnly)
  const chavesListadas = new Set<string>()
  const camposPorTela = telasQueEditam.map((tela) => ({
    tela,
    secoes: [...tela.sections].sort((a, b) => a.order - b.order).map((sec2) => {
      const fs = tela.fields
        .filter((f) => f.sectionId === sec2.id && f.visible !== false && !chavesListadas.has(fieldValueKey(f)))
        .sort((a, b) => a.order - b.order)
      fs.forEach((f) => chavesListadas.add(fieldValueKey(f)))
      return { sec2, fs }
    }).filter((x) => x.fs.length > 0),
  })).filter((x) => x.secoes.length > 0)

  // Prazo ÚNICO + unidade (dias/horas/minutos úteis): guarda em apenas UM dos três
  // campos slaBusiness* (os outros ficam undefined) — "de acordo com a unidade, um só campo".
  const slaUnit: 'DAYS' | 'HOURS' | 'MINUTES' = step.slaBusinessDays != null ? 'DAYS' : step.slaBusinessHours != null ? 'HOURS' : step.slaBusinessMinutes != null ? 'MINUTES' : 'DAYS'
  const slaValue = step.slaBusinessDays ?? step.slaBusinessHours ?? step.slaBusinessMinutes ?? ''
  const setSla = (unit: 'DAYS' | 'HOURS' | 'MINUTES', value: string | number) => {
    const v = value === '' ? undefined : Math.max(0, Number(value))
    onPatchStep({
      slaBusinessDays: unit === 'DAYS' ? v : undefined,
      slaBusinessHours: unit === 'HOURS' ? v : undefined,
      slaBusinessMinutes: unit === 'MINUTES' ? v : undefined,
    })
  }

  /* ── Snapshot para o Cancelar ──────────────────────────────────────────────
     Guardado uma única vez, na abertura. Restaurar precisa da UNIÃO das chaves:
     um campo criado durante a edição (entityVar, por exemplo) não existe no
     snapshot, e um merge simples o deixaria para trás. */
  const original = useRef<{ step: StepFormSchema; type: 'userTask' | 'serviceTask' }>({ step: { ...step }, type })
  const corpoRef = useRef<HTMLDivElement>(null)

  const cancelar = () => {
    const antes = original.current
    const restauro: Record<string, unknown> = {}
    for (const k of new Set([...Object.keys(antes.step), ...Object.keys(step)])) {
      restauro[k] = (antes.step as unknown as Record<string, unknown>)[k]
    }
    if (antes.type !== node.type) onChangeType(antes.type)
    onPatchStep(restauro as Partial<StepFormSchema>)
    onClose()
  }

  /* Esc fecha cancelando — mas só o Esc DENTRO da gaveta e sem uma camada (lista, balão,
     diálogo) aberta por cima: essa fecha sozinha. Fora disso, nem para a propagação. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (ehEscDaGaveta(e)) { e.stopPropagation(); cancelar() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /* ── Perguntas ─────────────────────────────────────────────────────────────
     A configuração deixou de ser um formulário em seções (Identificação, Quem executa…)
     e virou PERGUNTAS em português, numa coluna só, na ordem em que a pessoa pensa a
     etapa (mockup "Configurar a etapa por perguntas", PO 27/10/2026). No alto, o
     "Em resumo" escreve a etapa numa frase — quem configura confere o que entendeu
     sem precisar ler campo por campo. */
  const faltaNome = !step.stepName?.trim()
  const faltaQuem = type === 'userTask' && !porIniciador && (
    !executor?.papelId
    || (!!execOrigem && execOrigem !== ORIGEM.ORG && (executor.mode === 'FIXA' ? !executor.entityId : !(executor.stakeholder || executor.entityVar)))
  )
  const faltaPrazo = type === 'userTask' && !dueText(step)
  const faltaDevolucao = type === 'userTask' && retorno.mode === 'SELECTED' && !(retorno.nodeIds ?? []).length
  const perguntas = type === 'userTask'
    ? [
        { id: 'identificacao', titulo: 'O que precisa ser feito?',          ok: !faltaNome },
        { id: 'executor',      titulo: 'Quem faz?',                         ok: !faltaQuem },
        { id: 'formulario',    titulo: 'O que a pessoa vê e preenche?',     ok: true },
        { id: 'prazo',         titulo: 'Em quanto tempo?',                  ok: !faltaPrazo },
        { id: 'devolucao',     titulo: 'Se precisar, pode devolver para…',  ok: !faltaDevolucao },
      ]
    : [
        { id: 'identificacao', titulo: 'O que precisa ser feito?', ok: !faltaNome },
        { id: 'acao',          titulo: 'O que o sistema faz?',     ok: !!step.connector },
      ]
  const pendentes = perguntas.filter((p) => !p.ok).length
  const nPergunta = (id: string) => perguntas.findIndex((p) => p.id === id) + 1

  const [mostrarInstrucoes, setMostrarInstrucoes] = useState(!!step.instructions?.trim())
  const [maisDaTela, setMaisDaTela] = useState(extras.length > 0 || travados.length > 0)

  /* "Quem recebe hoje": só quando a resposta não depende do processo (papel global ou
     entidade fixa). undefined = procurando; null = depende do processo / não se aplica. */
  const [pessoasHoje, setPessoasHoje] = useState<string[] | null | undefined>(null)
  const exPapel = executor?.papelId, exTipo = executor?.entityType, exModo = executor?.mode, exEntidade = executor?.entityId
  useEffect(() => {
    if (type !== 'userTask' || !exPapel || exPapel === EXECUTOR_QUEM_INICIOU || exModo === 'VARIAVEL' || (exTipo !== ORIGEM.ORG && !exEntidade)) {
      setPessoasHoje(null); return
    }
    let vivo = true
    setPessoasHoje(undefined)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/instances/executor-pessoas', {
          method: 'POST', body: JSON.stringify({ executor: { papelId: exPapel, entityType: exTipo, mode: exModo, entityId: exEntidade } }),
        })
        const corpo = res.ok ? await res.json() as { pessoas: string[] | null } : null
        if (vivo) setPessoasHoje(corpo?.pessoas ?? null)
      } catch { if (vivo) setPessoasHoje(null) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [type, exPapel, exTipo, exModo, exEntidade])

  /* Abre já na pergunta pedida (ex.: 'formulario', vindo do aviso da escolha). Rola SÓ o
     corpo da gaveta: `scrollIntoView` rolaria também os contêineres `overflow-hidden` do
     editor e deslocaria o desenho. */
  useEffect(() => {
    if (!secaoInicial) return
    const alvo = document.getElementById(`pergunta-${secaoInicial}`)
    const caixa = corpoRef.current?.parentElement
    if (!alvo || !caixa) return
    caixa.scrollTop += alvo.getBoundingClientRect().top - caixa.getBoundingClientRect().top - 12
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── A frase do "Em resumo" ── */
  const quem = porIniciador ? 'Quem iniciou o processo' : papelSel ? (() => {
    if (!executor || !execOrigem || execOrigem === ORIGEM.ORG) return papelSel.label
    if (executor.mode === 'FIXA') {
      const nome = resolveEntidade(executor.entityType, executor.entityId)
      return nome ? `${papelSel.label} de ${nome}` : papelSel.label
    }
    if (executor.stakeholder === EXECUTOR_CONTRATO_DO_PROCESSO) return `${papelSel.label} do contrato do processo`
    if (executor.stakeholder) {
      const parte = papeis.entries.find((p) => p.id === executor.stakeholder)?.label
      return `${papelSel.label} da parte “${parte ?? 'escolhida'}” do contrato`
    }
    return papelSel.label
  })() : null
  const due = dueText(step)
  const nomesDevolucao = (retorno.nodeIds ?? []).map((id) => destinosDevolucao.find((d) => d.id === id)?.nome).filter((x): x is string => !!x)
  const frase = type === 'userTask' ? (
    <>
      {quem ? <ResumoForte>{quem}</ResumoForte> : <ResumoFalta>alguém (falta escolher quem)</ResumoFalta>}
      {' recebe “'}<ResumoForte>{step.stepName?.trim() || 'esta tarefa'}</ResumoForte>{'”'}
      {telaSel
        ? <>, {VERBO_DO_MODO[step.entityMode ?? 'CREATE']} o {entityWord} na tela <ResumoForte>{telaSel.name}</ResumoForte></>
        : ', sem tela: só conclui ou devolve'}
      {due ? <> e tem <ResumoForte>{due}</ResumoForte> para concluir.</> : <> e <ResumoFalta>ainda não tem prazo</ResumoFalta>.</>}
      {' '}
      {retorno.mode === 'NONE' ? 'Não pode devolver o processo.'
        : retorno.mode === 'SELECTED'
          ? (nomesDevolucao.length
              ? <>Se precisar, pode devolver para <ResumoForte>{listaPt(nomesDevolucao)}</ResumoForte>.</>
              : <ResumoFalta>Falta marcar para onde pode devolver.</ResumoFalta>)
          : 'Se precisar, pode devolver para qualquer etapa anterior.'}
    </>
  ) : (
    <>
      {'O sistema faz sozinho: '}
      {step.connector
        ? <ResumoForte>{findConnector(step.connector)?.label ?? step.connector}</ResumoForte>
        : <ResumoFalta>falta escolher a ação</ResumoFalta>}.
      {step.connector && <> {FRASE_RETORNO[step.onReturn ?? 'BLOCK']}</>}
    </>
  )

  if (somenteLeitura) {
    const respostas: Array<{ rotulo: string; valor: string }> = type === 'userTask'
      ? [
          { rotulo: 'Quem faz', valor: quem ?? '— sem executor' },
          { rotulo: 'Tela', valor: telaSel ? `${ENTITY_MODE_LABEL[step.entityMode ?? 'CREATE']} ${entityWord} · ${telaSel.name}` : '— sem tela' },
          { rotulo: 'Prazo', valor: due ?? '— sem prazo' },
          { rotulo: 'Devolução', valor: retorno.mode === 'NONE' ? 'Não devolve'
            : retorno.mode === 'SELECTED' ? (nomesDevolucao.length ? listaPt(nomesDevolucao) : '— nenhuma etapa marcada')
              : 'Qualquer etapa anterior' },
        ]
      : [
          { rotulo: 'Ação', valor: findConnector(step.connector)?.label ?? step.connector ?? '— nenhuma' },
          { rotulo: 'Se devolvido', valor: FRASE_RETORNO[step.onReturn ?? 'BLOCK'] },
        ]
    return (
      <GavetaLateral rotulo={`${meta.label} · só leitura`} rotuloTom={meta.tone} rotuloIcone={<meta.Icon className="h-3 w-3" />}
        titulo={step.stepName?.trim() || 'Etapa sem nome'} onFechar={onClose}>
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="rounded-xl bg-[#0C1410] p-4 text-[#C9D6CE] shadow-[0_18px_40px_-24px_rgba(12,20,16,0.7)] ring-1 ring-white/5">
            <span className="inline-block rounded bg-[#C6F24E] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-[#0C1410]">EM RESUMO</span>
            <p className="mt-2 text-[13px] leading-relaxed">{frase}</p>
          </div>
          <dl className="divide-y rounded-lg border bg-muted/20">
            {respostas.map((r) => (
              <div key={r.rotulo} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-xs text-muted-foreground">{r.rotulo}</dt>
                <dd className="min-w-0 text-right text-xs font-medium">{r.valor}</dd>
              </div>
            ))}
          </dl>
          {step.instructions?.trim() && (
            <div>
              <p className="text-xs font-semibold">Instruções para quem executa</p>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{step.instructions}</p>
            </div>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">Workflow do editor antigo: aberto só para leitura.</p>
        </div>
      </GavetaLateral>
    )
  }

  const rodape = (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {pendentes > 0
          ? <span className="font-semibold text-amber-800 dark:text-amber-300">Falta responder {pendentes} pergunta{pendentes > 1 ? 's' : ''}</span>
          : <span className="inline-flex items-center gap-1 font-semibold text-primary"><Check className="h-3.5 w-3.5" />Tudo respondido</span>}
        {' · '}As alterações entram no workflow ao <span className="font-medium">Salvar rascunho</span> ou <span className="font-medium">Ativar</span>.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remover atividade"
          className="mr-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />Remover
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelar}>Cancelar</Button>
        <Button size="sm" onClick={onClose}>Aplicar</Button>
      </div>
    </div>
  )

  return (
    <GavetaLateral rotulo={meta.label} rotuloTom={meta.tone} rotuloIcone={<meta.Icon className="h-3 w-3" />} rotuloFechar="Fechar sem aplicar"
      titulo={step.stepName?.trim() || 'Etapa sem nome'} onFechar={cancelar} rodape={rodape} focarAoAbrir={focarAoAbrir}>
      <div ref={corpoRef} className="flex flex-col">
        {vinculo && (
          <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              Configuração <span className="font-semibold">compartilhada em {vinculo.lugares} lugares</span> do fluxo — o que você mudar aqui vale para todos.
            </span>
            {vinculo.ehCopia && (
              <button type="button" onClick={vinculo.desvincular}
                className="shrink-0 rounded-md border bg-card px-2 py-1 text-[11.5px] font-semibold hover:bg-muted">Tornar independente</button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-7 px-4 py-4">
          <div className="rounded-xl bg-[#0C1410] p-4 text-[#C9D6CE] shadow-[0_18px_40px_-24px_rgba(12,20,16,0.7)] ring-1 ring-white/5">
            <span className="inline-block rounded bg-[#C6F24E] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-[#0C1410]">EM RESUMO</span>
            <p className="mt-2 text-[13px] leading-relaxed" aria-live="polite">{frase}</p>
          </div>

          <Pergunta id="identificacao" n={nPergunta('identificacao')} titulo="O que precisa ser feito?" ok={!faltaNome}
            ajuda="É o nome que aparece no fluxo e na caixa de tarefas de quem executa.">
            <Input className={cn(CAMPO, 'max-w-lg')} aria-label="Nome da etapa" value={step.stepName}
              placeholder={type === 'serviceTask' ? 'Ex.: Cadastrar o contrato' : 'Ex.: Analisar os dados cadastrais'}
              onChange={(e) => onPatchStep({ stepName: e.target.value })} />
            <div role="radiogroup" aria-label="Quem realiza esta etapa" className="grid gap-2 sm:grid-cols-2">
              <Opcao ativo={type === 'userTask'} onClick={() => onChangeType('userTask')} icone={<UserSquare className="h-4 w-4" />}
                titulo="Uma pessoa" descricao="A tarefa cai na caixa de alguém, que preenche, analisa ou aprova." />
              <Opcao ativo={type === 'serviceTask'} onClick={() => onChangeType('serviceTask')} icone={<Zap className="h-4 w-4" />}
                titulo="O sistema, sozinho" descricao="Uma ação automática, sem ninguém precisar clicar." />
            </div>
            {type === 'userTask' && (mostrarInstrucoes ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="cfg-instrucoes" className="text-[length:var(--rotulo-fonte)] font-medium text-muted-foreground">Instruções para quem executa</label>
                <Textarea id="cfg-instrucoes" className="min-h-[80px] text-[length:var(--campo-fonte)]"
                  placeholder="Ex.: confira se as certidões estão em dia antes de aprovar."
                  value={step.instructions ?? ''} onChange={(e) => onPatchStep({ instructions: e.target.value })} />
              </div>
            ) : (
              <button type="button" onClick={() => setMostrarInstrucoes(true)}
                className="inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline">
                <Plus className="h-3 w-3" />Escrever instruções para quem executa
              </button>
            ))}
          </Pergunta>

          {type === 'userTask' && (
            <Pergunta id="executor" n={nPergunta('executor')} titulo="Quem faz?" ok={!faltaQuem}
              ajuda="A tarefa vai para quem ocupar o papel na hora em que ela nascer.">
              <div role="radiogroup" aria-label="Quem recebe a tarefa" className="grid gap-2 sm:grid-cols-2">
                <Opcao ativo={!porIniciador} onClick={() => { if (porIniciador) onPatchStep({ executor: undefined }) }}
                  icone={<User className="h-4 w-4" />} titulo="Quem ocupa um papel" descricao="Ex.: o Analista da Central de Contratos." />
                <Opcao ativo={porIniciador} onClick={() => onPatchStep({ executor: { papelId: EXECUTOR_QUEM_INICIOU, entityType: 'ORG', mode: 'FIXA' } })}
                  icone={<CircleDot className="h-4 w-4" />} titulo="Quem iniciou o processo" descricao="A pessoa que clicou em “+ Novo processo”." />
              </div>
              {porIniciador ? (
                <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                  Na primeira etapa, a tarefa abre na hora, como aba; mais adiante, cai na caixa de tarefas dessa pessoa.
                  Se ela estiver inativa quando a tarefa nascer, vai para os administradores, com aviso.
                </p>
              ) : (<>
                <div className="flex max-w-sm flex-col gap-1">
                  <label htmlFor="cfg-papel" className="text-[length:var(--rotulo-fonte)] font-medium text-muted-foreground">Papel</label>
                  <Select value={executor?.papelId ?? ''} onValueChange={pickPapel}>
                    <SelectTrigger id="cfg-papel" className={CAMPO}><SelectValue placeholder="Escolha o papel" /></SelectTrigger>
                    <SelectContent>
                      {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {papeisPessoa.length === 0 && (
                    <p className="text-[11px] leading-snug text-muted-foreground">Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).</p>
                  )}
                </div>
                {executor && execOrigem && execOrigem !== ORIGEM.ORG && (() => {
                  const tipo = entityKindLabel(execOrigem)
                  const masc = execOrigem === ORIGEM.PARCEIRO || execOrigem === 'CONTRATO'
                  return (<>
                    <p className="text-[13px] font-semibold">{papelSel?.label ?? 'O papel'} de qual {tipo}?</p>
                    <div role="radiogroup" aria-label={`De qual ${tipo}`} className="grid gap-2 sm:grid-cols-2">
                      <Opcao ativo={executor.mode === 'FIXA'} onClick={() => setExec({ mode: 'FIXA' })}
                        titulo={`Sempre ${masc ? 'o mesmo' : 'a mesma'}`} descricao={`Você escolhe agora qual ${tipo}.`} />
                      <Opcao ativo={executor.mode === 'VARIAVEL'} onClick={() => setExec({ mode: 'VARIAVEL' })}
                        titulo={execOrigem === ORIGEM.PARCEIRO ? 'Depende do processo' : 'A do contrato do processo'}
                        descricao="Muda conforme o contrato que passa pelo processo." />
                    </div>
                    <div className="max-w-lg">
                      {executor.mode === 'FIXA' ? (
                        <EntitySelect entityType={execOrigem as EntityKind} value={executor.entityId}
                          onChange={(id) => setExec({ entityId: id, entityVar: undefined, stakeholder: undefined })}
                          placeholder={`Escolha ${masc ? 'o' : 'a'} ${tipo}…`} />
                      ) : (
                        <ExecutorDaVariavel executor={executor} papelLabel={papelSel?.label ?? 'o papel'} papeis={papeis.entries}
                          variaveisTecnicas={availableVars} onChange={setExec} />
                      )}
                    </div>
                  </>)
                })()}
                <PessoasHoje pessoas={pessoasHoje} />
              </>)}
            </Pergunta>
          )}

          {type === 'userTask' && (
            <Pergunta id="formulario" n={nPergunta('formulario')} titulo="O que a pessoa vê e preenche?" ok
              ajuda="Opcional. Sem tela, a pessoa só conclui ou devolve — bom para aprovações e ciência.">
              <Select value={step.screenRef || 'none'} onValueChange={pickScreen}>
                <SelectTrigger aria-label="Tela" className={cn(CAMPO, 'max-w-lg')}><SelectValue placeholder="Sem tela" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem tela — só concluir ou devolver</SelectItem>
                  {entityScreens.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{SUBJECT_LABEL[s.subjectType] ?? s.subjectType} · {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {step.screenRef && (<>
                <p className="text-[13px] font-semibold">E o que faz com o {entityWord}?</p>
                <div role="radiogroup" aria-label={`O que a atividade faz com o ${entityWord}`} className="grid gap-2">
                  {(['CREATE', 'EDIT', 'VIEW'] as const).map((m) => (
                    <Opcao key={m} ativo={(step.entityMode ?? 'CREATE') === m}
                      onClick={() => onPatchStep({ entityMode: m, entityVar: undefined, ...(m === 'CREATE' ? { lockedFields: undefined } : {}) })}
                      titulo={`${ENTITY_MODE_LABEL[m]} ${entityWord}`} descricao={ENTITY_MODE_CURTO[m]} />
                  ))}
                </div>
              </>)}
              {telaSel && (
                <div className="rounded-lg border bg-muted/20">
                  <button type="button" aria-expanded={maisDaTela} onClick={() => setMaisDaTela((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-muted/40">
                    <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !maisDaTela && '-rotate-90')} />
                    Mais opções da tela
                    <span className="truncate font-normal text-muted-foreground">
                      · {extras.length ? `${extras.length} aba${extras.length > 1 ? 's' : ''} a mais` : 'outras abas'}
                      {step.entityMode === 'EDIT' ? `, ${travados.length} campo${travados.length === 1 ? '' : 's'} travado${travados.length === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                  {maisDaTela && (
                    <div className="flex flex-col gap-4 border-t px-3 py-3">
                      <GField label={`Telas adicionais (o mesmo ${entityWord})`} wide
                        hint={`Na execução, cada tela vira uma aba depois da principal, mostrando o mesmo ${entityWord}. Serve para separar o que esta etapa altera do que ela só consulta.${(step.entityMode ?? 'CREATE') === 'CREATE' ? ` As abas adicionais liberam depois que o ${entityWord} for salvo na principal.` : ''}${atividadeSoConsulta ? ' Nesta atividade de consulta, todas abrem em leitura.' : ''}`}>
                        <div className="space-y-1.5">
                          {extras.map((e, i) => {
                            const opcoes = telasDoTipo.filter((s) => s.id === e.screenRef || !usadas.has(s.id))
                            const telaDaAba = entityScreens.find((s) => s.id === e.screenRef)
                            const modoEfetivo = atividadeSoConsulta || telaDaAba?.readOnly ? 'VIEW' : e.mode
                            return (
                              <div key={`${e.screenRef}-${i}`} className="flex items-center gap-1.5">
                                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 2}.</span>
                                <Select value={e.screenRef} onValueChange={(v) => setExtra(i, { screenRef: v })}>
                                  <SelectTrigger className={cn(CAMPO, 'min-w-0 flex-1')}><SelectValue placeholder="Tela removida" /></SelectTrigger>
                                  <SelectContent>
                                    {opcoes.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}{s.readOnly ? ' · somente consulta' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <div className="flex shrink-0 overflow-hidden rounded-md border text-xs" role="group" aria-label="O que esta aba faz">
                                  {(['EDIT', 'VIEW'] as const).map((m) => (
                                    <button key={m} type="button" aria-pressed={modoEfetivo === m}
                                      disabled={atividadeSoConsulta || (m === 'EDIT' && !!telaDaAba?.readOnly)}
                                      title={m === 'EDIT' && telaDaAba?.readOnly ? 'Esta tela é somente consulta' : undefined}
                                      onClick={() => setExtra(i, { mode: m })}
                                      className={cn('px-2 py-1.5 transition-colors disabled:cursor-not-allowed',
                                        modoEfetivo === m ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent')}>
                                      {m === 'EDIT' ? 'Editar' : 'Consultar'}
                                    </button>
                                  ))}
                                </div>
                                <button type="button" title="Mostrar esta aba antes" aria-label="Subir aba" disabled={i === 0} onClick={() => moverExtra(i, -1)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="Mostrar esta aba depois" aria-label="Descer aba" disabled={i === extras.length - 1} onClick={() => moverExtra(i, 1)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="Remover esta tela" aria-label="Remover tela adicional" onClick={() => removerExtra(i)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )
                          })}
                          <button type="button" disabled={livres.length === 0} onClick={addExtra}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                            <Plus className="h-3 w-3" />{livres.length === 0 ? `Não há outra tela de ${entityWord} para adicionar` : 'Adicionar tela'}
                          </button>
                        </div>
                      </GField>

                      {/* A atividade APERTA a trava da tela — só na etapa que EDITA. Ao CRIAR
                          vale a configuração da própria tela; na CONSULTA tudo já está travado. */}
                      {step.entityMode === 'EDIT' && (
                        <GField label="Campos travados nesta etapa" wide
                          hint={camposPorTela.length === 0
                            ? 'As telas que esta atividade edita são SOMENTE CONSULTA: todos os campos já estão travados nelas.'
                            : `A trava da tela vale sempre; aqui você aperta mais. O que marcar não poderá ser alterado NESTA etapa — em outras, continua editável.${camposPorTela.length > 1 ? ' Vale para todas as abas desta atividade.' : ''}`}>
                          {camposPorTela.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Nada a marcar: a tela <b className="font-semibold text-foreground">{telaSel.name}</b> está em somente consulta.
                            </p>
                          ) : (
                            <div className="max-h-64 divide-y overflow-y-auto rounded-md border bg-card">
                              {camposPorTela.map(({ tela, secoes }) => (
                                <Fragment key={tela.id}>
                                  {camposPorTela.length > 1 && <p className="bg-muted/40 px-2.5 py-1 text-[11px] font-semibold">{tela.name}</p>}
                                  {secoes.map(({ sec2, fs }) => (
                                    <div key={sec2.id} className="p-1.5">
                                      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        {sec2.label}{sec2.locked && <span className="ml-1.5 normal-case tracking-normal text-amber-600 dark:text-amber-400">· somente consulta</span>}
                                      </p>
                                      <div className="grid grid-cols-2 gap-x-2">
                                        {fs.map((f) => {
                                          // já travado pela TELA (campo ou seção inteira): a atividade não afrouxa
                                          const naTela = !!f.locked || !!sec2.locked
                                          const marcado = naTela || travados.includes(fieldValueKey(f))
                                          return (
                                            <label key={f.id} title={naTela ? 'Travado na tela — a atividade não pode liberar' : undefined}
                                              className={cn('flex items-center gap-1.5 rounded px-1 py-0.5 text-xs',
                                                naTela ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer hover:bg-muted')}>
                                              <input type="checkbox" checked={marcado} disabled={naTela}
                                                onChange={() => toggleTravado(fieldValueKey(f))}
                                                className="h-3.5 w-3.5 shrink-0 accent-primary disabled:opacity-60" />
                                              <span className="truncate">{f.label}</span>
                                              {naTela && <Lock className="h-2.5 w-2.5 shrink-0" />}
                                            </label>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </Fragment>
                              ))}
                            </div>
                          )}
                        </GField>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Pergunta>
          )}

          {type === 'userTask' && (
            <Pergunta id="prazo" n={nPergunta('prazo')} titulo="Em quanto tempo?" ok={!faltaPrazo}
              ajuda="Conta só o expediente: pula fins de semana e feriados.">
              <div className="flex flex-wrap items-center gap-2">
                <Input className={cn(CAMPO, 'w-20 text-center font-mono')} type="number" min={0} placeholder="0" aria-label="Prazo"
                  value={slaValue} onChange={(e) => setSla(slaUnit, e.target.value)} />
                <Select value={slaUnit} onValueChange={(u) => setSla(u as 'DAYS' | 'HOURS' | 'MINUTES', slaValue)}>
                  <SelectTrigger aria-label="Unidade do prazo" className={cn(CAMPO, 'w-40')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAYS">dias úteis</SelectItem>
                    <SelectItem value="HOURS">horas úteis</SelectItem>
                    <SelectItem value="MINUTES">minutos úteis</SelectItem>
                  </SelectContent>
                </Select>
                <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
                {ATALHOS_PRAZO.map((a) => {
                  const on = slaUnit === a.unidade && Number(slaValue) === a.valor
                  return (
                    <button key={a.rotulo} type="button" aria-pressed={on} onClick={() => setSla(a.unidade, a.valor)}
                      className={cn('h-[var(--campo-altura)] rounded-full border px-3 text-xs font-semibold transition-colors',
                        on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      {a.rotulo}
                    </button>
                  )
                })}
              </div>
            </Pergunta>
          )}

          {type === 'userTask' && (
            <Pergunta id="devolucao" n={nPergunta('devolucao')} titulo="Se precisar, pode devolver para…" ok={!faltaDevolucao}
              ajuda="Para onde quem executa pode mandar o processo de volta, com o botão Retroceder.">
              <div role="radiogroup" aria-label="Para onde pode devolver" className="grid gap-2">
                <Opcao ativo={retorno.mode === 'ANY'} onClick={() => setRetornoMode('ANY')}
                  titulo="Qualquer etapa anterior" descricao="O padrão: a pessoa escolhe para onde." />
                <Opcao ativo={retorno.mode === 'SELECTED'} onClick={() => setRetornoMode('SELECTED')}
                  titulo="Só para algumas" descricao="Você marca as etapas permitidas." />
                <Opcao ativo={retorno.mode === 'NONE'} onClick={() => setRetornoMode('NONE')}
                  titulo="Não pode devolver" descricao="O botão Retroceder não aparece." />
              </div>
              {retorno.mode === 'SELECTED' && (destinosDevolucao.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-[11.5px] text-muted-foreground">
                  Nada a marcar: não há tarefa de pessoa antes desta no fluxo.
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {destinosDevolucao.map((d) => {
                    const marcado = (retorno.nodeIds ?? []).includes(d.id)
                    return (
                      <button key={d.id} type="button" role="checkbox" aria-checked={marcado} onClick={() => toggleDestino(d.id)}
                        className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors',
                          marcado ? 'border-primary bg-primary/5 font-medium' : 'text-muted-foreground hover:bg-muted')}>
                        <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border', marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {marcado && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate">{d.nome}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {/* Dizer isto AQUI evita a conclusão errada de que a marcação garante o
                  destino — o bloqueio por ação automática continua valendo por cima. */}
              {retorno.mode !== 'NONE' && (
                <p className="flex gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  Uma etapa permitida ainda pode ficar bloqueada se estiver antes de uma ação automática já executada — quem decide o que é seguro refazer é o sistema.
                </p>
              )}
            </Pergunta>
          )}

          {type === 'serviceTask' && (
            <Pergunta id="acao" n={nPergunta('acao')} titulo="O que o sistema faz?" ok={!!step.connector}
              ajuda="O sistema executa esta ação sozinho e grava o registro de verdade.">
              <Select value={step.connector || 'none'} onValueChange={(v) => onPatchStep({ connector: v && v !== 'none' ? v : undefined })}>
                <SelectTrigger aria-label="Ação automática" className={cn(CAMPO, 'max-w-lg')}><SelectValue placeholder="Escolha a ação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (só passa)</SelectItem>
                  {CONNECTORS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  {/* Conector aposentado só aparece quando ESTE passo já o usa: some da
                      vitrine para desenhos novos sem sumir da tela de quem já o escolheu. */}
                  {isRetiredConnector(step.connector) && (
                    <SelectItem value={step.connector as string}>{findConnector(step.connector)?.label}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {isRetiredConnector(step.connector) && (
                <p className="max-w-xl text-[11.5px] leading-snug text-amber-700 dark:text-amber-400">
                  Esta ação foi aposentada: criar {step.connector === 'contracts.create' ? 'contrato' : 'parceiro'} agora
                  se faz por uma <span className="font-medium">tela</span> numa tarefa de pessoa, que valida e mostra o
                  cadastro inteiro. O processo continua funcionando; troque quando for revisá-lo.
                </p>
              )}
              {step.connector && (() => {
                const compensable = isCompensable(step.connector)
                return (<>
                  <p className="text-[13px] font-semibold">E se alguém devolver o processo para antes daqui?</p>
                  <div role="radiogroup" aria-label="Se o processo for devolvido para trás daqui" className={cn('grid gap-2', compensable ? 'grid-cols-1' : 'sm:grid-cols-2')}>
                    <Opcao ativo={(step.onReturn ?? 'BLOCK') === 'BLOCK'} onClick={() => onPatchStep({ onReturn: 'BLOCK' })}
                      titulo="Não deixar devolver" descricao={compensable ? 'O padrão, e o mais seguro.' : 'Esta ação não tem como ser desfeita.'} />
                    <Opcao ativo={step.onReturn === 'IDEMPOTENT'} onClick={() => onPatchStep({ onReturn: 'IDEMPOTENT' })}
                      titulo="Deixar e refazer" descricao="Refazer a ação não causa dano." />
                    {compensable && (
                      <Opcao ativo={step.onReturn === 'COMPENSATE'} onClick={() => onPatchStep({ onReturn: 'COMPENSATE' })}
                        titulo="Deixar e desfazer" descricao="Ao voltar, a ação é desfeita." />
                    )}
                  </div>
                </>)
              })()}
            </Pergunta>
          )}
        </div>
      </div>
    </GavetaLateral>
  )
}

/* ─── Peças das perguntas da etapa ────────────────────────────────────────── */

/** Altura e letra dos campos seguem a DENSIDADE escolhida pelo usuário (lib/densidade). */
const CAMPO = 'h-[var(--campo-altura)] text-[length:var(--campo-fonte)]'

const VERBO_DO_MODO: Record<string, string> = { CREATE: 'cadastra', EDIT: 'altera', VIEW: 'consulta' }
const ENTITY_MODE_CURTO: Record<string, string> = {
  CREATE: 'Cadastra um novo, do zero.',
  EDIT: 'Altera o que uma etapa anterior criou.',
  VIEW: 'Só lê, sem alterar nada. Para análise e ciência.',
}
const FRASE_RETORNO: Record<string, string> = {
  BLOCK: 'Se alguém devolver o processo para antes daqui, a devolução fica bloqueada.',
  IDEMPOTENT: 'Se alguém devolver o processo para antes daqui, ela é refeita.',
  COMPENSATE: 'Se alguém devolver o processo para antes daqui, ela é desfeita.',
}
const ATALHOS_PRAZO: Array<{ rotulo: string; unidade: 'DAYS' | 'HOURS'; valor: number }> = [
  { rotulo: '4 horas', unidade: 'HOURS', valor: 4 },
  { rotulo: '1 dia', unidade: 'DAYS', valor: 1 },
  { rotulo: '2 dias', unidade: 'DAYS', valor: 2 },
  { rotulo: '5 dias', unidade: 'DAYS', valor: 5 },
]
const listaPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

function ResumoForte({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-white">{children}</b>
}
/** O que ainda falta, dito DENTRO da frase: quem lê o resumo vê o buraco no lugar dele. */
function ResumoFalta({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[#F5B971] underline decoration-dotted underline-offset-2">{children}</span>
}

function NumeroPergunta({ n, ok, pequeno }: { n: number; ok: boolean; pequeno?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-mono font-bold',
      pequeno ? 'h-5 w-5 text-[10.5px]' : 'h-6 w-6 text-[11px]',
      ok ? 'bg-primary text-primary-foreground' : 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/50 dark:text-amber-300')}
      aria-label={ok ? `Pergunta ${n}, respondida` : `Pergunta ${n}, falta responder`}>
      {ok ? <Check className={pequeno ? 'h-3 w-3' : 'h-3.5 w-3.5'} /> : n}
    </span>
  )
}

/** Uma pergunta do modal: número (vira ✓ quando respondida), a pergunta, uma linha de ajuda. */
function Pergunta({ id, n, titulo, ajuda, ok, children }: {
  id: string; n: number; titulo: string; ajuda?: string; ok: boolean; children: React.ReactNode
}) {
  return (
    <section id={`pergunta-${id}`} aria-labelledby={`pergunta-${id}-titulo`} className="flex scroll-mt-4 flex-col gap-[var(--form-gap)]">
      <div className="flex items-start gap-3">
        <NumeroPergunta n={n} ok={ok} />
        <div className="min-w-0">
          <h3 id={`pergunta-${id}-titulo`} className="text-[15px] font-bold leading-snug">{titulo}</h3>
          {ajuda && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{ajuda}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-[var(--form-gap)] pl-9">{children}</div>
    </section>
  )
}

/** Resposta em CARTÃO (rádio): título + uma linha que explica a consequência. */
function Opcao({ ativo, onClick, titulo, descricao, icone, disabled }: {
  ativo: boolean; onClick: () => void; titulo: string; descricao?: string; icone?: React.ReactNode; disabled?: boolean
}) {
  return (
    <button type="button" role="radio" aria-checked={ativo} disabled={disabled} onClick={onClick}
      className={cn('flex min-w-0 items-start gap-2.5 rounded-lg border bg-card px-3 py-[var(--secao-pad)] text-left transition-colors',
        ativo ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-foreground/25 hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-50')}>
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        ativo ? 'border-primary bg-primary' : 'border-muted-foreground/50')} aria-hidden>
        {ativo && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[length:var(--campo-fonte)] font-semibold">
          {icone && <span className={cn('shrink-0', ativo ? 'text-primary' : 'text-muted-foreground')}>{icone}</span>}{titulo}
        </span>
        {descricao && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{descricao}</span>}
      </span>
    </button>
  )
}

/** "Quem recebe hoje": a consequência do papel escolhido, em nomes de gente. */
function PessoasHoje({ pessoas }: { pessoas: string[] | null | undefined }) {
  if (pessoas === null) return null
  if (pessoas === undefined) return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Vendo quem recebe esta tarefa hoje…</p>
  )
  if (pessoas.length === 0) return (
    <p className="flex max-w-xl items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs leading-snug text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      Hoje ninguém ocupa este papel. Atribua alguém em Estrutura organizacional antes de ativar.
    </p>
  )
  const mostra = pessoas.slice(0, 4)
  const resto = pessoas.length - mostra.length
  return (
    <p className="flex max-w-xl items-start gap-1.5 rounded-md bg-primary/[0.07] px-2.5 py-2 text-xs leading-snug">
      <User className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
      <span>
        Hoje {pessoas.length === 1 ? 'recebe' : 'recebem'} esta tarefa: <b className="font-semibold">{listaPt(resto > 0 ? [...mostra, `mais ${resto}`] : mostra)}</b>.
      </span>
    </p>
  )
}

/** Rótulos e explicações do que a atividade faz com a entidade. VIEW é a etapa de
 *  análise: mostra o cadastro inteiro, não deixa alterar nada. */
const ENTITY_MODE_LABEL: Record<string, string> = { CREATE: 'Criar', EDIT: 'Editar', VIEW: 'Consultar' }
