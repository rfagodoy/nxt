'use client'

import { Fragment, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Zap, Trash2, User, Clock, LayoutTemplate,
  CircleDot, Loader2, UserSquare, AlertTriangle, Building2,
  GripVertical, ChevronUp, Redo2, Blocks, Rows3, Plus,
  Download, FileImage, FileText, ChevronDown, PanelRightClose, PanelRightOpen,
  X, SlidersHorizontal, Undo2, Check, Info, Lock,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import {
  generateBpmn, compileBpmn, validarDesenho, validarDecisoes, validarAtividades, validarTelasDasAtividades,
  bloqueantes, avisos as avisosDe, blocosParaGrafo, grafoParaBlocos, novoFluxo, pendenciasDosBlocos, validarOrigemDoRegistro, listarEscolhas,
  acharItem, inserirItem, removerItem, atualizarItem, SUFIXO_REENCONTRO,
  type ProblemaAtivacao, type WfGraph, type WfNode, type WfEdge, type FluxoBlocos,
} from '@nxt/workflow-core'
import type { StepFormSchema, ProcessFormSchema, EdgeConditionSpec } from '@nxt/types'
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
import { layoutGraph, titleLineCount, LABEL_W, LANE_SEM_RESPONSAVEL, type FlowNode as LNode, type FlowNodeType, type LaneBand } from '@/lib/flow-layout'
import { exportFlow, type FlowExportFormat, type ExportModel, type ExportNode, type ExportEdge } from '@/lib/flow-export'
import { apiFetch } from '@/lib/http'
import { ProcessHistoryDrawer } from './process-history-drawer'
import { WorkflowIdentity } from './workflow-identity'
import { PendenciasPill, ZoomBar, ZOOM_MAX, ZOOM_MIN } from './flow-shared'
import { BlocosTrilho, BlocoInspector, EscolhaConfigModal, comNomes, novoItem, type NovoItem, type Simulacao, type MetaAtividade } from './workflow-blocos'
import { NoticeDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

/** Preferência de painel recolhido (por usuário desta máquina). */
const PANEL_KEY = 'nxt:workflow:panel-collapsed'

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
  bpmnXml: string
  steps: StepFormSchema[]
  laneOrder?: string[]
  graph?: ProcessFormSchema['graph']
  /** Fonte da autoria desde o editor em blocos. Ausente = workflow anterior a ele. */
  blocos?: FluxoBlocos
}

const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }
const ENTITY_KIND_LABEL: Record<string, string> = { EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato' }
const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'
const isActivity = (t: NType) => t === 'userTask' || t === 'serviceTask'

/** A API recusou uma gravação que apagaria grande parte do desenho (409). Não é falha:
 *  é a guarda pedindo confirmação consciente. Ver `update()` em processes.service. */
class ReducaoDestrutiva extends Error {}

/** Retrato do DESENHO para desfazer/refazer. */
interface Retrato {
  fluxo: FluxoBlocos | null
  steps: Record<string, StepFormSchema>
  laneOrder: string[]
}
const MAX_HISTORIA = 60

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
  /* A AUTORIA é o fluxo em blocos + a configuração de cada atividade. Nós e setas não
     são editados: são gerados disso — é o que impede as formas que travavam o motor. */
  const [fluxo, setFluxo] = useState<FluxoBlocos | null>(inicio.fluxo)
  const [steps, setSteps] = useState<Record<string, StepFormSchema>>(inicio.steps)
  const [laneOrder, setLaneOrder] = useState<string[]>(initial?.laneOrder ?? [])
  /* Duas vistas do MESMO fluxo: montar em blocos (onde a estrutura se edita) e ver por
     raia (quem faz o quê). Desenho antigo que não cabe em blocos só tem a raia. */
  const [vista, setVista] = useState<'blocos' | 'raia'>(somenteLeitura ? 'raia' : 'blocos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /* "Testar decisão": o caminho vencedor acende no trilho, atrás do modal. */
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  /* Atividade em CONFIGURAÇÃO (modal). Separado da seleção: fechar o modal não
     deseleciona, e o painel lateral segue mostrando o resumo. */
  const [configId, setConfigId] = useState<string | null>(null)
  const [escolhaId, setEscolhaId] = useState<string | null>(null)
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
  const [historia, setHistoria] = useState<Retrato[]>(() => [{ fluxo: inicio.fluxo, steps: inicio.steps, laneOrder: initial?.laneOrder ?? [] }])
  const [hIndice, setHIndice] = useState(0)
  const aplicandoHistorico = useRef(false)

  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { screens } = useScreens()
  const resolvePapel = useCallback((id: string) => papeis.entries.find((p) => p.id === id)?.label, [papeis.entries])

  const { nodes, edges } = useMemo(
    () => (fluxo ? grafoDosBlocos(fluxo, steps) : inicio.legado ?? { nodes: [] as ENode[], edges: [] as EEdge[] }),
    [fluxo, steps, inicio.legado],
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
  const selected = selectedId ? nodeById[selectedId] ?? null : null
  const selectedBloco = useMemo(() => {
    const it = fluxo && selectedId ? acharItem(fluxo, selectedId) : undefined
    return it && it.kind !== 'atividade' ? it : null
  }, [fluxo, selectedId])
  const configNode = configId ? nodeById[configId] : null
  const nomeDe = useCallback((id: string) => nodeById[id]?.step?.stepName?.trim() || 'Atividade sem nome', [nodeById])
  const metaDe = useCallback((id: string): MetaAtividade[] => {
    const n = nodeById[id]
    return n ? metaDaAtividade(n, resolvePapel, resolveEntidade) : []
  }, [nodeById, resolvePapel, resolveEntidade])

  /* Pendências de ativação AO VIVO — as MESMAS regras que a API aplica ao ativar
     (@nxt/workflow-core), recalculadas a cada mudança: consertou, o item some. */
  const pendencias = useMemo<ProblemaAtivacao[]>(() => {
    const vnodes = nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name }))
    const vedges = edges.map((e) => ({ from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault }))
    const tarefas = nodes.filter((n) => n.type === 'userTask')
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
      ]),
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
  }, [fluxo, nodes, edges, screens])

  /* Clicar é o gesto de "quero configurar isto": atividade e escolha abrem o modal onde a
     configuração mora; o "ao mesmo tempo" só tem nome, editado no painel. Pontos de
     reencontro (gerados) não têm o que configurar. No desenho antigo, só seleciona. */
  const abrir = useCallback((id: string | null) => {
    const alvo = id && !id.endsWith(SUFIXO_REENCONTRO) ? id : null
    const it = alvo && fluxo ? acharItem(fluxo, alvo) : undefined
    setSelectedId(alvo)
    setConfigId(it?.kind === 'atividade' ? alvo : null)
    setEscolhaId(it?.kind === 'escolha' ? alvo : null)
  }, [fluxo])

  const focarPendencia = useCallback((p: ProblemaAtivacao) => {
    if (!p.nodeId || p.tipo === 'inicio-desligado' || p.tipo === 'fim-inalcancavel') return
    abrir(p.nodeId)
  }, [abrir])

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

  /* Reordenar RAIAS: a banda inteira sobe/desce e as atividades vão junto. */
  const reordenarRaias = useCallback((chave: string, destino: number) => {
    const ordem = layout.lanes?.map((b) => b.key) ?? []
    const de = ordem.indexOf(chave)
    if (de < 0) return
    const alvo = Math.max(0, Math.min(ordem.length - 1, destino > de ? destino - 1 : destino))
    if (alvo === de) return
    const nova = [...ordem]
    nova.splice(alvo, 0, ...nova.splice(de, 1))
    setLaneOrder(nova)
  }, [layout])

  /* Painel lateral RETRÁTIL. O estado efetivo é DERIVADO: recolhido só quando o usuário
     pediu E não há item selecionado — selecionar É o gesto de "quero configurar isto". */
  const [mounted, setMounted] = useState(false)
  const [panelPref, setPanelPref] = useState(false) // true = recolhido
  useEffect(() => { setMounted(true); setPanelPref(localStorage.getItem(PANEL_KEY) === '1') }, [])
  useEffect(() => { if (mounted) localStorage.setItem(PANEL_KEY, panelPref ? '1' : '0') }, [panelPref, mounted])
  const panelCollapsed = mounted && panelPref && !selectedId
  /* Alterna pelo que está NA TELA, não pela preferência guardada. Com a preferência já em
     "recolhido" e um item selecionado, o painel aparece aberto — alternar só a preferência
     fazia o 1º clique virar "aberto" (nada mudava) e só o 2º recolher (achado do PO). */
  const togglePanel = useCallback(() => {
    if (panelCollapsed) { setPanelPref(false); return }
    // recolher = "me devolve o desenho": também deseleciona, senão o derivado o manteria aberto
    setSelectedId(null)
    setPanelPref(true)
  }, [panelCollapsed])

  const activityCount = nodes.filter((n) => isActivity(n.type)).length

  const mudarFluxo = useCallback((fn: (f: FluxoBlocos) => FluxoBlocos) => {
    setFluxo((f) => (f ? fn(f) : f))
  }, [])
  const patchStep = useCallback((id: string, patch: Partial<StepFormSchema>) => {
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[id] ?? passoVazio(id, 'userTask')), ...patch } }))
  }, [])
  // Troca o TIPO da atividade (Tarefa ↔ Ação automática): o tipo mora no BLOCO (é ele que
  // gera o nó) e no passo (stepType) — os dois mudam juntos.
  const changeNodeType = useCallback((id: string, t: 'userTask' | 'serviceTask') => {
    setFluxo((f) => (f ? atualizarItem(f, id, { tipo: t }) : f))
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[id] ?? passoVazio(id, t)), stepType: t } }))
  }, [])

  /* Inserir já abre o que precisa ser preenchido: a atividade nasce sem nome e a escolha
     sem condição — deixar a pessoa procurar onde configurar era o problema de antes. */
  const inserir = useCallback((ref: string, indice: number, tipo: NovoItem) => {
    const item = novoItem(tipo)
    if (item.kind === 'atividade') setSteps((prev) => ({ ...prev, [item.id]: passoVazio(item.id, item.tipo) }))
    setFluxo((f) => (f ? inserirItem(f, ref, indice, item) : f))
    setSelectedId(item.id)
    setConfigId(item.kind === 'atividade' ? item.id : null)
    setEscolhaId(item.kind === 'escolha' ? item.id : null)
  }, [])

  /* Remover um bloco leva junto o que mora dentro dele. Os passos das atividades ficam no
     mapa (o desfazer os traz de volta inteiros); a gravação só leva os que existem. */
  const remover = useCallback((id: string) => {
    setFluxo((f) => (f ? removerItem(f, id) : f))
    setSelectedId((cur) => (cur === id ? null : cur))
    setConfigId((cur) => (cur === id ? null : cur))
    setEscolhaId((cur) => (cur === id ? null : cur))
  }, [])

  /* Registra um retrato quando a autoria para de mudar. A espera COALESCE o que é uma
     ação só aos olhos de quem edita (digitar um nome, por exemplo). */
  useEffect(() => {
    if (aplicandoHistorico.current) { aplicandoHistorico.current = false; return }
    const t = setTimeout(() => {
      const atual = historia[hIndice]
      if (atual && atual.fluxo === fluxo && atual.steps === steps && atual.laneOrder === laneOrder) return
      const proximo = [...historia.slice(0, hIndice + 1), { fluxo, steps, laneOrder }] // um passo novo descarta o "refazer"
      const excedente = Math.max(0, proximo.length - MAX_HISTORIA)
      setHistoria(excedente ? proximo.slice(excedente) : proximo)
      setHIndice(proximo.length - 1 - excedente)
    }, 350)
    return () => clearTimeout(t)
  }, [fluxo, steps, laneOrder, historia, hIndice])

  const irPara = useCallback((i: number) => {
    const r = historia[i]
    if (!r) return
    aplicandoHistorico.current = true
    setFluxo(r.fluxo); setSteps(r.steps); setLaneOrder(r.laneOrder)
    setHIndice(i)
    setConfigId(null); setEscolhaId(null)
  }, [historia])

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

  /* Gravação que apagaria grande parte do desenho: a API recusa com 409 e diz quanto
     seria removido. Só reenviamos com `confirmarReducao` depois que a pessoa confirmar. */
  const [reducao, setReducao] = useState<{ msg: string; acao: 'rascunho' | 'ativar' } | null>(null)
  /* Dialog do DS no lugar do alert() nativo. `aoFechar` segura a navegação até a pessoa
     fechar o aviso, senão o dialog morreria junto da tela. */
  const [aviso, setAviso] = useState<{ msg: string; titulo?: string; aoFechar?: () => void } | null>(null)

  const persist = useCallback(async (confirmarReducao?: boolean): Promise<string> => {
    if (!fluxo) throw new Error('Workflow do editor antigo: aberto só para leitura.')
    const bpmnXml = generateBpmn(buildWfGraph(nodes, edges))
    const stepsVivos = nodes.filter((n) => isActivity(n.type) && n.step).map((n) => ({ ...n.step!, stepId: n.id, stepName: n.step!.stepName, stepType: n.type as 'userTask' | 'serviceTask' }))
    // grafo GERADO (a API valida e compila por ele; telas de leitura o desenham)
    const graph: ProcessFormSchema['graph'] = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name })),
      edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition || undefined, isDefault: e.isDefault, label: e.label, conditionSpec: e.conditionSpec })),
    }
    const formSchema: ProcessFormSchema = {
      steps: stepsVivos, graph,
      blocos: comNomes(fluxo, steps),
      laneOrder: laneOrder.length ? laneOrder : undefined,
    }
    const body = JSON.stringify({ name: name.trim(), description: description.trim() || undefined, bpmnXml, formSchema, kind: kind || undefined, ...(confirmarReducao ? { confirmarReducao: true } : {}) })
    if (editing) {
      const res = await apiFetch(`/api/processes/${initial!.id}`, { method: 'PATCH', body })
      if (res.status === 409) {
        const e = await res.json().catch(() => null)
        throw new ReducaoDestrutiva(e?.message ?? 'Esta gravação removeria grande parte do workflow.')
      }
      if (!res.ok) throw new Error('Erro ao salvar')
      return initial!.id
    }
    const res = await apiFetch(`/api/processes`, { method: 'POST', body })
    if (!res.ok) throw new Error('Erro ao salvar')
    return (await res.json()).id as string
  }, [editing, initial, name, description, kind, fluxo, steps, nodes, edges, laneOrder])

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
    const enodes: ExportNode[] = nodes.map((n) => {
      const p = layout.nodes[n.id]
      const base = { id: n.id, type: n.type, x: p.x, y: p.y, w: p.w, h: p.h }
      if (isActivity(n.type)) {
        // MESMA fonte do cartão da tela — o arquivo exportado não pode contar outra história
        const meta = metaDaAtividade(n, resolvePapel, resolveEntidade).map((m) => m.text)
        return { ...base, name: n.step?.stepName || 'Sem nome', typeLabel: n.type === 'serviceTask' ? 'Ação automática' : 'Tarefa', meta }
      }
      if (n.type === 'exclusiveGateway' || n.type === 'parallelGateway') return { ...base, name: n.name, isFork: !!n.name }
      return { ...base, name: n.name }
    })
    const eedges: ExportEdge[] = edges.filter((e) => layout.nodes[e.from] && layout.nodes[e.to]).map((e) => {
      const a = layout.nodes[e.from], b = layout.nodes[e.to]
      const from = nodeById[e.from]
      const variant: ExportEdge['variant'] = from?.type === 'exclusiveGateway' ? 'exclusive' : from?.type === 'parallelGateway' ? 'parallel' : 'normal'
      // MESMA geometria da tela, senão o arquivo sai diferente do que se vê.
      const g = edgeGeometry(a, b, Object.entries(layout.nodes).filter(([id]) => id !== e.from && id !== e.to).map(([, p]) => p))
      return {
        ax: g.a.x, ay: g.a.y, bx: g.b.x, by: g.b.y,
        adx: g.aDir.x, ady: g.aDir.y, bdx: g.bDir.x, bdy: g.bDir.y,
        backward: g.arcoPorBaixo, variant, label: e.label,
      }
    })
    return { width: layout.width, height: layout.height, nodes: enodes, edges: eedges, lanes: layout.lanes }
  }, [nodes, edges, layout, nodeById, resolvePapel, resolveEntidade])

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

  // Delete/Backspace remove o item selecionado (fora de campos e com os modais fechados).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selectedId || !fluxo || configId || escolhaId) return
      if (acharItem(fluxo, selectedId)) { e.preventDefault(); remover(selectedId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, fluxo, configId, escolhaId, remover])

  return (
    /* O editor é um cartão que ocupa a área toda, com cantos da mesma família das ilhas. */
    <div className="flex flex-col h-full overflow-hidden rounded-xl border bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push('/workflows')} className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        {/* O NOME é o título do documento, no alto do desenho (WorkflowIdentity). Aqui
            fica só a migalha de contexto. */}
        <div className="flex-1 min-w-0 text-[12.5px] text-muted-foreground truncate">
          Workflows <span className="mx-1 opacity-50">/</span>
          <span className="text-foreground font-semibold">{name.trim() || 'sem nome'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {exportError && <span className="text-[11px] text-destructive font-medium">{exportError}</span>}
          {/* Vista: a escolhida fica em negrito além da cor (o PO é daltônico). */}
          <div role="group" aria-label="Vista do desenho" className="flex items-center rounded-md border bg-card p-0.5 shadow-sm mr-1">
            {([['blocos', 'Montar', Blocks], ['raia', 'Ver por raia', Rows3]] as const).map(([v, rotulo, Icone]) => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                disabled={v === 'blocos' && somenteLeitura}
                title={v === 'blocos'
                  ? (somenteLeitura ? 'Este workflow não cabe em blocos — veja o aviso acima do desenho' : 'Montar o fluxo em blocos')
                  : 'Ver o fluxo organizado por quem executa'}
                className={cn('h-7 px-2.5 rounded inline-flex items-center gap-1.5 text-[12px] transition-colors disabled:opacity-40 disabled:hover:bg-transparent',
                  vista === v ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground font-medium hover:text-foreground hover:bg-muted')}>
                <Icone className="h-3.5 w-3.5" />{rotulo}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-md border bg-card shadow-sm mr-1">
            <button type="button" onClick={desfazer} disabled={!podeDesfazer} title="Desfazer (Ctrl+Z)"
              className="h-8 w-8 flex items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <Undo2 className="h-4 w-4" />
            </button>
            <span className="w-px h-4 bg-border" />
            <button type="button" onClick={refazer} disabled={!podeRefazer} title="Refazer (Ctrl+Y)"
              className="h-8 w-8 flex items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          {/* só faz sentido no que já foi salvo: workflow novo ainda não tem histórico */}
          {editing && <ProcessHistoryDrawer processId={initial!.id} />}
          <ExportMenu exporting={exporting} disabled={saving || activating} onExport={handleExport} />
          {/* ⚠️ `() =>` obrigatório: passar a função direto entregaria o MouseEvent como
              `confirmarReducao` — truthy — e a guarda seria burlada em TODO salvamento. */}
          <Button variant="outline" size="sm" onClick={() => handleSaveDraft()} disabled={saving || activating || somenteLeitura}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar rascunho</Button>
          <Button size="sm" onClick={() => handleActivate()} disabled={saving || activating || !name.trim() || somenteLeitura}
            title={somenteLeitura ? 'Workflow do editor antigo: aberto só para leitura' : !name.trim() ? 'Dê um nome ao workflow para poder ativá-lo' : 'Ativar workflow'}>
            {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Ativar workflow</Button>
        </div>
      </div>

      {somenteLeitura && (
        <div className="flex items-start gap-3 px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-[12.5px] leading-snug">
            Este workflow foi desenhado no editor antigo, com ligações livres que não cabem em blocos. Ele abre
            <span className="font-semibold"> só para leitura</span>. Para alterá-lo, crie um workflow novo e monte-o em blocos.
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

      <div className="flex flex-1 overflow-hidden">
        {/* Coluna do DESENHO: a identidade do workflow no alto e o desenho embaixo. */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <WorkflowIdentity
            name={name} onName={setName}
            description={description} onDescription={setDescription}
            kind={kind} onKind={setKind}
            kinds={WORKFLOW_KINDS}
            autoFocus={!editing}
          />
          {vista === 'blocos' && fluxo ? (
            <BlocosTrilho fluxo={fluxo} steps={steps} selectedId={selectedId} simulacao={simulacao} metaDe={metaDe}
              onAbrir={abrir} onInserir={inserir} onRemover={remover} onFluxo={mudarFluxo}
              pendencias={pendencias} pendAberto={pendAberto} onTogglePend={() => setPendAberto((v) => !v)} onFocar={focarPendencia} />
          ) : (
            <FlowCanvas canvasRef={canvasRef} nodes={nodes} edges={edges} layout={layout} selectedId={selectedId} onSelect={abrir}
              resolvePapel={resolvePapel} resolveEntidade={resolveEntidade} onReorderLanes={reordenarRaias}
              pendencias={pendencias} pendAberto={pendAberto} onTogglePend={() => setPendAberto((v) => !v)} onFocar={focarPendencia} />
          )}
        </div>
        {/* trilho do toggle: fica SEMPRE visível (é a alça para trazer o painel de volta) */}
        <div className="w-8 border-l bg-card flex flex-col items-center pt-2.5 shrink-0">
          <button type="button" onClick={togglePanel}
            title={panelCollapsed ? 'Expandir configurações' : 'Recolher configurações (mais espaço para o desenho)'}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {panelCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
        </div>
        <div className={cn('w-80 border-l bg-card flex-col overflow-hidden shrink-0', panelCollapsed ? 'hidden' : 'flex')}>
          {selected && isActivity(selected.type) ? (
            <ActivitySummaryPanel node={selected} papeis={papeis}
              onConfigure={fluxo ? () => setConfigId(selected.id) : undefined}
              onRemove={fluxo ? () => remover(selected.id) : undefined} />
          ) : selectedBloco ? (
            <BlocoInspector key={selectedBloco.id} bloco={selectedBloco} nomeDe={nomeDe}
              onConfigure={() => setEscolhaId(selectedBloco.id)}
              onRenomear={(nome) => mudarFluxo((f) => atualizarItem(f, selectedBloco.id, { nome }))}
              onRemove={() => remover(selectedBloco.id)} />
          ) : (
            /* Nada selecionado → AJUDA. Este painel é do que está SELECIONADO. */
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b shrink-0 flex items-center">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary"><LayoutTemplate className="h-3 w-3" />Como montar</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="rounded-md border border-dashed bg-muted/20 p-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><LayoutTemplate className="h-3.5 w-3.5 text-primary" />Monte o fluxo</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    Clique no <span className="font-medium">+</span> entre dois quadros para inserir uma tarefa, uma ação automática,
                    uma <span className="font-medium">escolha de caminho</span> ou atividades <span className="font-medium">ao mesmo tempo</span>.
                    Clique num quadro para configurá-lo; arraste-o para mudar de lugar.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug border-t pt-1.5">
                    Numa escolha, cada caminho pode <span className="font-medium">seguir</span>, <span className="font-medium">encerrar o processo</span> ou
                    <span className="font-medium"> voltar</span> para uma atividade anterior.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug border-t pt-1.5">
                    <span className="font-medium">Ver por raia</span> mostra o mesmo fluxo organizado por quem executa. Para reordenar
                    uma raia, arraste-a pela faixa do nome, à esquerda.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {escolhaId && fluxo && (
        <EscolhaConfigModal key={escolhaId} fluxo={fluxo} blocoId={escolhaId} nodes={nodes} screens={screens}
          onFluxo={mudarFluxo} onSimulacao={setSimulacao}
          onRemove={() => remover(escolhaId)} onClose={() => setEscolhaId(null)}
          onConfigurarAtividade={(id) => {
            setRetornoEscolha(escolhaId); setEscolhaId(null)
            setSelectedId(id); setConfigSecao('formulario'); setConfigId(id)
          }} />
      )}
      {/* Configuração da atividade: modal amplo (a coluna de 320px não comporta o
          formulário — ver o comentário em ActivityConfigModal). */}
      {configNode && configNode.step && fluxo && (
        <ActivityConfigModal key={configNode.id} node={configNode} nodes={nodes} edges={edges} screens={screens} papeis={papeis}
          secaoInicial={configSecao}
          onPatchStep={(p) => patchStep(configNode.id, p)}
          onChangeType={(t) => changeNodeType(configNode.id, t)}
          onRemove={() => { remover(configNode.id); setRetornoEscolha(null); setConfigSecao(undefined) }}
          onClose={() => {
            setConfigId(null); setConfigSecao(undefined)
            if (retornoEscolha) { setSelectedId(retornoEscolha); setEscolhaId(retornoEscolha); setRetornoEscolha(null) }
          }} />
      )}
    </div>
  )
}

/* ─── Canvas ────────────────────────────────────────────────────────────────── */

const STEP_TONE: Record<string, string> = {
  userTask: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  serviceTask: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
}


/** Calha RESERVADA para grip e setas dentro da faixa de rótulos. Fixa de propósito: o
 *  controle nunca invade o nome, e o nome nunca muda de lugar quando o mouse chega. */
const LANE_CTRL_W = 22

/** Faixa dos nomes das raias — FIXA na tela, fora do canvas escalado. Por isso o nome
 *  continua legível em qualquer zoom e não some quando o desenho é rolado para a direita
 *  (era o que acontecia quando a coluna morava dentro do desenho). */
function LaneHeader({ bandas, largura, scale, scrollTop, arrastando, onStartDrag, onReorder }: {
  bandas: LaneBand[] | undefined
  largura: number
  scale: number
  scrollTop: number
  arrastando: string | null
  onStartDrag: (key: string, ev: React.PointerEvent) => void
  onReorder: (key: string, destino: number) => void
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
           descontada a rolagem, ela é a posição na tela. Somar qualquer folga aqui
           contaria a margem duas vezes e a faixa deslizaria em relação às bandas. */
        const top = b.y * scale - scrollTop
        const alt = b.h * scale
        const semDono = b.key === LANE_SEM_RESPONSAVEL
        return (
          <div key={b.key} data-lane-handle onPointerDown={(e) => onStartDrag(b.key, e)}
            title="Arraste para cima ou para baixo para reordenar a raia"
            className={cn('absolute left-0 right-0 flex items-stretch group/lane pointer-events-auto',
              arrastando === b.key ? 'cursor-grabbing' : 'cursor-grab')}
            style={{
              top, height: alt,
              background: arrastando === b.key ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--foreground) / 0.075)',
              borderRight: '1px solid hsl(var(--foreground) / 0.22)',
              borderTop: i === 0 ? 'none' : '1px solid hsl(var(--foreground) / 0.16)',
            }}>
            {/* calha dos controles — largura fixa, nunca sobrepõe o texto */}
            <div className="flex flex-col items-center justify-center shrink-0" style={{ width: LANE_CTRL_W }}
              onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" disabled={i === 0} title="Subir a raia"
                onClick={() => onReorder(b.key, i - 1)}
                className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover/lane:opacity-100 hover:text-foreground hover:bg-muted disabled:opacity-0 transition-opacity">
                <ChevronUp className="h-3 w-3" />
              </button>
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 my-0.5 pointer-events-none" aria-hidden />
              <button type="button" disabled={i === bandas.length - 1} title="Descer a raia"
                onClick={() => onReorder(b.key, i + 2)}
                className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover/lane:opacity-100 hover:text-foreground hover:bg-muted disabled:opacity-0 transition-opacity">
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            {/* nome — SEM truncar: quebra inclusive em "/" (papel composto é comum) */}
            {/* ⚠️ A faixa é MOLDURA, não conteúdo: o rótulo usa `muted-foreground`, o mesmo
                idiom dos cabeçalhos de tabela do sistema, e só sobe para `foreground` na
                raia sob o mouse. Em preto pleno ele competia com os cartões.
                E NADA de cor nova aqui: neste canvas o vocabulário de cor já está todo
                alocado (sky = tarefa, âmbar = ação automática, violeta = decisão, rosa =
                paralelo, esmeralda = início/fim). A raia sem executor se distingue por
                FORMA — é a primeira e está em itálico —, não por um sexto tom. */}
            <div className="flex-1 min-w-0 flex flex-col justify-center pr-2">
              <span className={cn('text-[11px] font-semibold leading-tight select-none [overflow-wrap:anywhere] transition-colors',
                arrastando === b.key ? 'text-foreground' : 'text-muted-foreground group-hover/lane:text-foreground',
                semDono && 'italic')}>
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

/** VER POR RAIA — o mesmo fluxo dos blocos, organizado por quem executa. A ESTRUTURA não
 *  se edita aqui: ligar setas à mão era o que permitia desenhar formas que travam o
 *  motor. Clicar num quadro ainda abre a configuração dele. */
function FlowCanvas({ canvasRef, nodes, edges, layout, selectedId, onSelect, resolvePapel, resolveEntidade, onReorderLanes, pendencias, pendAberto, onTogglePend, onFocar }: {
  canvasRef: React.RefObject<HTMLDivElement | null>
  nodes: ENode[]; edges: EEdge[]; layout: ReturnType<typeof layoutGraph>
  selectedId: string | null; onSelect: (id: string | null) => void
  resolvePapel: (id: string) => string | undefined
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
  onReorderLanes: (key: string, destino: number) => void
  /** Pendências de ativação (pílula + painel clicável sobre o desenho). */
  pendencias: ProblemaAtivacao[]
  pendAberto: boolean
  onTogglePend: () => void
  onFocar: (p: ProblemaAtivacao) => void
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

  /** Centraliza um nó na área visível — o "ir até ela" do painel de pendências. */
  const centrarNo = useCallback((id: string) => {
    const el = scrollRef.current
    const p = layout.nodes[id]
    if (!el || !p) return
    el.scrollTo({
      left: (p.x + p.w / 2) * scale - el.clientWidth / 2,
      top: (p.y + p.h / 2) * scale - el.clientHeight / 2,
      behavior: 'smooth',
    })
  }, [layout, scale])

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
    if (f?.type === 'exclusiveGateway') return '#7c3aed'
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
    const porPedaco = maiorPedaco * 5.6 + LANE_CTRL_W + 18
    const porTotal = (maisLongo * 5.6) / 2 + LANE_CTRL_W + 18 // mirando 2 linhas
    return Math.round(Math.min(240, Math.max(124, porPedaco, porTotal)))
  }, [layout.lanes])

  /* Arrastar a RAIA pela faixa do rótulo. Só a vertical importa: a banda cai entre duas
     outras, e as atividades acompanham porque o y delas deriva do topo da banda. */
  const [laneDrag, setLaneDrag] = useState<{ key: string; destino: number; linha: number | null } | null>(null)
  const startLaneDrag = (key: string, ev: React.PointerEvent) => {
    ev.preventDefault(); ev.stopPropagation()
    const bandas = layout.lanes
    if (!bandas || bandas.length < 2) return
    // fronteiras entre bandas, em coordenadas do GRAFO (o canvas está sob transform: scale)
    const fronteiras = [bandas[0].y, ...bandas.map((b) => b.y + b.h)]
    const alvoDe = (clientY: number) => {
      const r = canvasRef.current!.getBoundingClientRect()
      const y = (clientY - r.top) / scale
      let i = 0
      for (let k = 1; k < fronteiras.length; k++) if (Math.abs(fronteiras[k] - y) < Math.abs(fronteiras[i] - y)) i = k
      return i
    }
    setLaneDrag({ key, destino: bandas.findIndex((b) => b.key === key), linha: null })
    const move = (e: PointerEvent) => {
      const i = alvoDe(e.clientY)
      setLaneDrag((d) => (d ? { ...d, destino: i, linha: fronteiras[i] } : d))
    }
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      onReorderLanes(key, alvoDe(e.clientY))
      setLaneDrag(null)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // O deselect fica no CONTAINER de rolagem: com o enquadramento a div do grafo não cobre
  // toda a área visível.
  return (
    <div className="flex-1 min-w-0 min-h-0 relative">
    <ZoomBar scale={scale} autoFit={autoFit}
      onZoom={(s) => zoomPara(s)}
      onFit={() => { setAutoFit(true); setScale(fitScale()) }} />
    <PendenciasPill pendencias={pendencias} aberto={pendAberto} onToggle={onTogglePend} style={{ left: laneHeaderW + 12 }}
      onItem={(p) => { if (p.nodeId) centrarNo(p.nodeId); onFocar(p) }} />
    <LaneHeader bandas={layout.lanes} largura={laneHeaderW} scale={scale} scrollTop={scrollTop}
      arrastando={laneDrag?.key ?? null} onStartDrag={startLaneDrag} onReorder={onReorderLanes} />
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
              background: laneDrag?.key === b.key ? 'hsl(var(--primary) / 0.10)' : i % 2 === 1 ? 'hsl(var(--foreground) / 0.045)' : 'transparent',
            }} />
          </div>
        ))}
        {/* onde a raia arrastada vai pousar */}
        {laneDrag && laneDrag.linha !== null && (
          <div className="absolute left-0 pointer-events-none z-20" style={{ top: laneDrag.linha - 1, width: layout.width, height: 2, background: 'hsl(var(--primary))' }} />
        )}
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

/** Botão "Exportar" com menu PNG/PDF. Fecha ao clicar fora; some enquanto captura. */
function ExportMenu({ exporting, disabled, onExport }: {
  exporting: FlowExportFormat | null
  disabled?: boolean
  onExport: (format: FlowExportFormat) => void
}) {
  const [open, setOpen] = useState(false)
  const busy = exporting !== null
  useEffect(() => {
    if (!open) return
    const h = () => setOpen(false)
    const t = setTimeout(() => window.addEventListener('pointerdown', h), 0)
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', h) }
  }, [open])
  return (
    <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => setOpen((o) => !o)} title="Exportar o desenho como imagem ou PDF">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Exportar
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </Button>
      {open && !busy && (
        <div className="glass absolute right-0 top-10 z-30 w-44 rounded-xl p-1">
          <button onClick={() => { onExport('jpg'); setOpen(false) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent">
            <FileImage className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Imagem (JPG)
          </button>
          <button onClick={() => { onExport('pdf'); setOpen(false) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent">
            <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" /> Documento (PDF)
          </button>
        </div>
      )}
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
  if (node.type === 'exclusiveGateway' || node.type === 'parallelGateway') {
    const isExcl = node.type === 'exclusiveGateway'
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
      if (ex.mode === 'VARIAVEL' && ex.entityVar) {
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

/** Resumo da política de devolução da tarefa, para o painel de leitura. */
function devolucaoText(step?: StepFormSchema): string {
  const p = step?.returnPolicy
  if (!p || p.mode === 'ANY') return 'Qualquer etapa anterior'
  if (p.mode === 'NONE') return 'Não devolve'
  const n = (p.nodeIds ?? []).length
  return n === 0 ? '— nenhuma etapa marcada' : `${n} etapa${n > 1 ? 's' : ''} escolhida${n > 1 ? 's' : ''}`
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

/** Bloco de uma seção do modal: título + grade de campos. */
function GSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/**
 * Configuração da atividade em MODAL amplo (decisão do PO em 30/07).
 *
 * Por que saiu da coluna lateral: ela tinha 319px e o conteúdo de uma atividade simples
 * já passava de 674px de altura contra 545 visíveis — ou seja, rolagem obrigatória para
 * ler a própria configuração, com um campo por linha e o nome da tela quebrando dentro
 * do select. Formulário de cadastro não cabe num tubo; aqui ele ganha largura, grade de
 * duas colunas e seções navegáveis, como o resto do sistema.
 *
 * Cancelar RESTAURA o estado de quando o modal abriu (snapshot em `original`): o editor
 * aplica cada mudança ao vivo no grafo, então sem isso "Cancelar" seria só um "Fechar"
 * mentiroso.
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

function ActivityConfigModal({ node, nodes, edges, screens, papeis, onPatchStep, onChangeType, onRemove, onClose, secaoInicial }: {
  node: ENode; nodes: ENode[]; edges: EEdge[]; screens: Screens; papeis: Papeis
  onPatchStep: (patch: Partial<StepFormSchema>) => void; onChangeType: (t: 'userTask' | 'serviceTask') => void; onRemove: () => void
  onClose: () => void
  /** Seção em que o modal abre (ex.: 'formulario', vindo do aviso da escolha). */
  secaoInicial?: string
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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

  // Esc fecha cancelando: é o que a tecla significa em todo lugar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cancelar() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /* Seções: as de tarefa e as de ação automática são conjuntos diferentes — mostrar
     "Formulário" numa ação automática seria oferecer o que não existe. */
  const secoes = type === 'userTask'
    ? [
        { id: 'identificacao', label: 'Identificação', Icon: CircleDot },
        { id: 'executor',      label: 'Quem executa',  Icon: User },
        { id: 'formulario',    label: 'Formulário',    Icon: LayoutTemplate },
        { id: 'prazo',         label: 'Prazo',         Icon: Clock },
        { id: 'devolucao',     label: 'Devolução',     Icon: Undo2 },
      ]
    : [
        { id: 'identificacao', label: 'Identificação',   Icon: CircleDot },
        { id: 'acao',          label: 'Ação automática', Icon: Zap },
      ]
  const [sec, setSec] = useState(secaoInicial ?? 'identificacao')
  useEffect(() => { if (!secoes.some((s) => s.id === sec)) setSec('identificacao') }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Resumo por seção: fechado, o menu ainda diz o que está configurado — sem isso a
     navegação lateral esconde a informação que a coluna única ao menos mostrava. */
  const resumo: Record<string, string> = {
    identificacao: step.stepName || 'sem nome',
    executor: papelSel?.label ?? 'sem papel',
    formulario: step.screenRef ? `${ENTITY_MODE_LABEL[step.entityMode ?? 'CREATE']} ${entityWord}${extras.length ? ` · ${extras.length + 1} telas` : ''}` : 'sem tela',
    prazo: dueText(step) ?? 'sem prazo',
    acao: findConnector(step.connector)?.label ?? 'nenhuma',
    devolucao: retorno.mode === 'NONE' ? 'não devolve'
      : retorno.mode === 'SELECTED' ? `${(retorno.nodeIds ?? []).length} etapa(s)`
      : 'qualquer anterior',
  }

  if (!mounted) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={cancelar} />
      <div role="dialog" aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[70] w-[min(1000px,94vw)] h-[min(660px,90vh)] -translate-x-1/2 -translate-y-1/2 glass-panel rounded-xl border shadow-2xl flex flex-col overflow-hidden">

        {/* Cabeçalho de identidade */}
        <div className="flex items-start justify-between gap-4 px-5 py-3 border-b bg-muted/20 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', meta.tone)}>
                <meta.Icon className="h-3 w-3" />{meta.label}
              </span>
            </div>
            <h2 className="text-sm font-semibold mt-1 truncate">{step.stepName || 'Atividade sem nome'}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onRemove} title="Remover atividade"
              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={cancelar} title="Fechar sem aplicar"
              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Navegação de seções */}
          <nav className="w-48 shrink-0 border-r bg-muted/10 p-2 space-y-0.5 overflow-y-auto rolagem-visivel">
            {secoes.map((s) => (
              <button key={s.id} type="button" onClick={() => setSec(s.id)}
                className={cn('w-full text-left rounded-md px-2.5 py-2 transition-colors',
                  sec === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60')}>
                <span className="flex items-center gap-1.5 text-xs font-medium"><s.Icon className="h-3.5 w-3.5" />{s.label}</span>
                <span className="block text-[10.5px] text-muted-foreground truncate mt-0.5">{resumo[s.id]}</span>
              </button>
            ))}
          </nav>

          {/* Campos */}
          <div className="flex-1 min-w-0 overflow-y-auto rolagem-visivel p-5">
            {sec === 'identificacao' && (
              <GSection title="Identificação" description="Como esta etapa aparece no fluxo e para quem vai executá-la.">
                <GField label="O que esta etapa é" wide hint="Tarefa: uma pessoa executa. Ação automática: o motor executa sozinho.">
                  <div className="flex gap-1 text-xs max-w-sm">
                    {(['userTask', 'serviceTask'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => onChangeType(t)}
                        className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors', type === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                        {t === 'serviceTask' ? 'Ação automática' : 'Tarefa'}
                      </button>
                    ))}
                  </div>
                </GField>
                <GField label={type === 'serviceTask' ? 'Nome da ação' : 'Nome da tarefa'} required wide>
                  <Input className="h-8 text-sm" placeholder={type === 'serviceTask' ? 'Ex.: Cadastrar contrato' : 'Ex.: Preencher dados'} value={step.stepName} onChange={(e) => onPatchStep({ stepName: e.target.value })} />
                </GField>
                <GField label="Instruções para execução" wide hint="Aparece para o executor ao abrir a tarefa.">
                  <Textarea className="text-sm min-h-[90px]" placeholder="Oriente quem vai executar…" value={step.instructions ?? ''} onChange={(e) => onPatchStep({ instructions: e.target.value })} />
                </GField>
              </GSection>
            )}

            {sec === 'executor' && type === 'userTask' && (
              <GSection title="Quem executa" description="O papel resolve as pessoas na hora da execução — a tarefa cai na caixa de quem ocupa o papel na entidade escolhida.">
                <GField label="Executor (papel)" required hint={papeisPessoa.length === 0 ? 'Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).' : undefined}>
                  <Select value={executor?.papelId ?? ''} onValueChange={pickPapel}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione o executor" /></SelectTrigger>
                    <SelectContent>
                      {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </GField>
                {executor && execOrigem && execOrigem !== ORIGEM.ORG && (
                  <>
                    <GField label={`Responsável de qual ${entityKindLabel(execOrigem)}?`}>
                      <div className="flex gap-1 text-[11px]">
                        {(['FIXA', 'VARIAVEL'] as const).map((m) => (
                          <button key={m} type="button" onClick={() => setExec({ mode: m })}
                            className={cn('rounded px-2 py-1 border transition-colors', executor.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                            {m === 'FIXA' ? 'Entidade fixa' : 'Da variável'}
                          </button>
                        ))}
                      </div>
                    </GField>
                    <GField label={executor.mode === 'FIXA' ? entityKindLabel(execOrigem) : 'Variável com o id'}>
                      {executor.mode === 'FIXA' ? (
                        <EntitySelect entityType={execOrigem as EntityKind} value={executor.entityId} onChange={(id) => setExec({ entityId: id, entityVar: undefined })} placeholder={`Selecionar ${entityKindLabel(execOrigem)}…`} />
                      ) : (
                        <Select value={executor.entityVar || 'none'} onValueChange={(v) => setExec({ entityVar: v === 'none' ? undefined : v, entityId: undefined })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Variável com o id…" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">— escolha a variável —</SelectItem>{availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </GField>
                  </>
                )}
              </GSection>
            )}

            {sec === 'formulario' && type === 'userTask' && (
              <GSection title="Formulário" description="A tela que o executor preenche (ou apenas lê). Opcional: sem tela, a etapa é só de aprovação.">
                <GField label="Tela do formulário" wide>
                  <Select value={step.screenRef || 'none'} onValueChange={pickScreen}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem tela" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sem tela</SelectItem>{entityScreens.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{SUBJECT_LABEL[s.subjectType] ?? s.subjectType} · {s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </GField>
                {step.screenRef && (
                  <GField label={`O que a atividade faz com o ${entityWord}`} wide
                    hint={ENTITY_MODE_HINT[step.entityMode ?? 'CREATE']}>
                    <div className="flex gap-1 text-xs max-w-lg">
                      {(['CREATE', 'EDIT', 'VIEW'] as const).map((m) => (
                        <button key={m} type="button"
                          onClick={() => onPatchStep({ entityMode: m, entityVar: undefined, ...(m === 'CREATE' ? { lockedFields: undefined } : {}) })}
                          className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors', (step.entityMode ?? 'CREATE') === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                          {ENTITY_MODE_LABEL[m]} {entityWord}
                        </button>
                      ))}
                    </div>
                  </GField>
                )}

                {telaSel && (
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
                              <SelectTrigger className="h-8 min-w-0 flex-1 text-sm"><SelectValue placeholder="Tela removida" /></SelectTrigger>
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
                )}

                {/* Camada 2: a atividade APERTA a trava da tela — só na etapa que EDITA. Ao
                    CRIAR vale a configuração da própria tela (pedido do PO: quem cria precisa
                    preencher); na CONSULTA a tela inteira já está travada. */}
                {telaSel && step.entityMode === 'EDIT' && (
                  <GField label="Campos travados nesta atividade" wide
                    hint={camposPorTela.length === 0
                      ? 'As telas que esta atividade edita são SOMENTE CONSULTA: todos os campos já estão travados nelas.'
                      : `A trava da tela vale sempre; aqui você aperta mais. O que marcar não poderá ser alterado NESTA etapa — em outras, continua editável.${camposPorTela.length > 1 ? ' Vale para todas as abas desta atividade.' : ''}`}>
                    {camposPorTela.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nada a marcar: a tela <b className="font-semibold text-foreground">{telaSel.name}</b> está em somente consulta.
                      </p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
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
                                        naTela ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer hover:bg-muted')}>
                                      <input type="checkbox" checked={marcado} disabled={naTela}
                                        onChange={() => toggleTravado(fieldValueKey(f))}
                                        className="h-3.5 w-3.5 accent-primary shrink-0 disabled:opacity-60" />
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
              </GSection>
            )}

            {sec === 'prazo' && type === 'userTask' && (
              <GSection title="Prazo" description="Conta no expediente comercial e pula fins de semana e feriados.">
                <GField label="Prazo (SLA)" required>
                  <div className="flex gap-2">
                    <Input className="h-8 text-sm flex-1" type="number" min={0} placeholder="0" value={slaValue} onChange={(e) => setSla(slaUnit, e.target.value)} />
                    <Select value={slaUnit} onValueChange={(u) => setSla(u as 'DAYS' | 'HOURS' | 'MINUTES', slaValue)}>
                      <SelectTrigger className="h-8 text-sm w-36 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAYS">Dias úteis</SelectItem>
                        <SelectItem value="HOURS">Horas úteis</SelectItem>
                        <SelectItem value="MINUTES">Minutos úteis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </GField>
              </GSection>
            )}

            {sec === 'devolucao' && type === 'userTask' && (
              <GSection title="Devolução" description="Para onde quem executa esta tarefa pode devolver o processo.">
                <GField label="Destinos permitidos" wide>
                  <div className="flex gap-1 text-xs max-w-xl">
                    {([
                      ['ANY', 'Qualquer anterior'],
                      ['SELECTED', 'Só as escolhidas'],
                      ['NONE', 'Não devolve'],
                    ] as const).map(([m, lbl]) => (
                      <button key={m} type="button" onClick={() => setRetornoMode(m)}
                        className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors', retorno.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </GField>

                {retorno.mode === 'NONE' && (
                  <GField label="" wide>
                    <p className="text-[11.5px] text-muted-foreground">O botão <span className="font-medium text-foreground">Retroceder</span> não aparece para quem executa esta tarefa.</p>
                  </GField>
                )}

                {retorno.mode === 'SELECTED' && (
                  <GField label="Pode voltar para" required wide
                    hint={destinosDevolucao.length === 0
                      ? 'Esta tarefa não tem nenhuma tarefa humana antes dela no fluxo.'
                      : 'Marque as etapas. Devolver só existe para tarefa de pessoa — ação automática não entra na lista.'}>
                    {destinosDevolucao.length === 0 ? (
                      <p className="text-[11.5px] text-muted-foreground rounded-md border border-dashed p-3">
                        Nada a escolher: ligue esta tarefa depois de outra tarefa de usuário.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {destinosDevolucao.map((d) => {
                          const marcado = (retorno.nodeIds ?? []).includes(d.id)
                          return (
                            <button key={d.id} type="button" onClick={() => toggleDestino(d.id)}
                              className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors',
                                marcado ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted text-muted-foreground')}>
                              <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-sm border shrink-0', marcado ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                                {marcado && <Check className="h-2.5 w-2.5" />}
                              </span>
                              {d.nome}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </GField>
                )}

                {/* Dizer isto AQUI evita a conclusão errada de que a marcação garante o
                    destino — o bloqueio por ação automática continua valendo por cima. */}
                {retorno.mode !== 'NONE' && (
                  <GField label="" wide>
                    <p className="text-[11.5px] text-muted-foreground leading-snug">
                      Em execução, uma etapa marcada ainda pode aparecer bloqueada se estiver atrás de
                      uma ação automática já executada — quem decide o que é seguro refazer é o motor.
                    </p>
                  </GField>
                )}
              </GSection>
            )}

            {sec === 'acao' && type === 'serviceTask' && (
              <GSection title="Ação automática" description="O motor executa esta ação sozinho — grava a entidade de verdade.">
                <GField label="Ação (conector)" wide>
                  <Select value={step.connector || 'none'} onValueChange={(v) => onPatchStep({ connector: v && v !== 'none' ? v : undefined })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhuma (só passa)" /></SelectTrigger>
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
                </GField>
                {isRetiredConnector(step.connector) && (
                  <GField label="" wide>
                    <p className="text-[11.5px] text-amber-700 dark:text-amber-400 leading-snug">
                      Esta ação foi aposentada: criar {step.connector === 'contracts.create' ? 'contrato' : 'parceiro'} agora
                      se faz por uma <span className="font-medium">tela</span> numa tarefa de usuário, que valida e mostra o
                      cadastro inteiro. O processo continua funcionando; troque quando for revisá-lo.
                    </p>
                  </GField>
                )}
                {step.connector && (() => {
                  const compensable = isCompensable(step.connector)
                  return (
                    <GField label="Se o processo for devolvido para trás daqui" wide hint={compensable
                      ? 'Esta ação mexe em dados reais. Escolha o que fazer se alguém devolver o processo atravessando este passo.'
                      : 'Esta ação não tem como ser desfeita, então devolver atravessando-a fica bloqueado.'}>
                      <Select value={step.onReturn ?? 'BLOCK'} onValueChange={(v) => onPatchStep({ onReturn: v as StepFormSchema['onReturn'] })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BLOCK">Bloquear a devolução (padrão)</SelectItem>
                          <SelectItem value="IDEMPOTENT">Liberar — refazer não causa dano</SelectItem>
                          {compensable && <SelectItem value="COMPENSATE">Liberar — desfazer esta ação ao voltar</SelectItem>}
                        </SelectContent>
                      </Select>
                    </GField>
                  )
                })()}
              </GSection>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-muted-foreground">As alterações entram no workflow ao <span className="font-medium">Salvar rascunho</span> ou <span className="font-medium">Ativar</span>.</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancelar}>Cancelar</Button>
            <Button size="sm" onClick={onClose}>Aplicar</Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

/** Coluna lateral com a atividade selecionada: RESUMO do que está configurado + a porta
 *  para o modal. A coluna deixou de ser o lugar de editar (não cabia), mas continua
 *  sendo onde se enxerga o que a etapa faz sem precisar abrir nada. */
function ActivitySummaryPanel({ node, papeis, onConfigure, onRemove }: {
  node: ENode; papeis: Papeis
  /** Ausentes no desenho antigo aberto só para leitura. */
  onConfigure?: () => void; onRemove?: () => void
}) {
  const step = node.step!
  const type = node.type as 'userTask' | 'serviceTask'
  const meta = type === 'serviceTask' ? { label: 'Ação automática', tone: STEP_TONE.serviceTask, Icon: Zap } : { label: 'Tarefa do usuário', tone: STEP_TONE.userTask, Icon: UserSquare }
  const entityWord = SUBJECT_ENTITY[step.screenSubject ?? ''] ?? 'entidade'
  const papel = step.executor?.papelId ? papeis.entries.find((p) => p.id === step.executor!.papelId)?.label : undefined

  const linhas: Array<{ label: string; valor: string }> = type === 'userTask'
    ? [
        { label: 'Executor', valor: papel ?? '— sem papel definido' },
        { label: 'Formulário', valor: step.screenRef ? `${ENTITY_MODE_LABEL[step.entityMode ?? 'CREATE']} ${entityWord}${step.extraScreens?.length ? ` · ${step.extraScreens.length + 1} telas` : ''}` : '— sem tela' },
        { label: 'Prazo', valor: dueText(step) ?? '— sem prazo' },
        { label: 'Devolução', valor: devolucaoText(step) },
      ]
    : [
        { label: 'Ação', valor: findConnector(step.connector)?.label ?? '— nenhuma' },
        { label: 'Se devolvido', valor: RETURN_LABEL[step.onReturn ?? 'BLOCK'] },
      ]

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', meta.tone)}>
          <meta.Icon className="h-3 w-3" />{meta.label}
        </span>
        {onRemove && <button onClick={onRemove} title="Remover atividade" className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold leading-snug">{step.stepName || 'Atividade sem nome'}</h3>
          {step.instructions?.trim() && <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-3">{step.instructions}</p>}
        </div>
        <dl className="rounded-md border bg-muted/20 divide-y">
          {linhas.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
              <dt className="text-[11px] text-muted-foreground shrink-0">{l.label}</dt>
              <dd className="text-[11px] font-medium text-right truncate">{l.valor}</dd>
            </div>
          ))}
        </dl>
        {onConfigure && <Button size="sm" className="w-full" onClick={onConfigure}><SlidersHorizontal className="h-3.5 w-3.5" />Configurar atividade</Button>}
      </div>
    </div>
  )
}

const RETURN_LABEL: Record<string, string> = {
  BLOCK: 'Bloquear', IDEMPOTENT: 'Liberar (refazer)', COMPENSATE: 'Liberar (desfazer)',
}

/** Rótulos e explicações do que a atividade faz com a entidade. VIEW é a etapa de
 *  análise: mostra o cadastro inteiro, não deixa alterar nada. */
const ENTITY_MODE_LABEL: Record<string, string> = { CREATE: 'Criar', EDIT: 'Editar', VIEW: 'Consultar' }
const ENTITY_MODE_HINT: Record<string, string> = {
  CREATE: 'A atividade cria o registro deste processo, com os campos e as travas definidos na tela escolhida.',
  EDIT:   'A atividade abre para alteração o registro deste processo — o que uma etapa anterior criou.',
  VIEW:   'A atividade apenas MOSTRA o registro deste processo, em leitura: nenhum campo pode ser alterado e nada é gravado. Serve para etapas de análise, conferência e ciência.',
}
