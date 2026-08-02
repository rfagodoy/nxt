'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Zap, Trash2, User, Clock, LayoutTemplate,
  CircleDot, Loader2, UserSquare, Rows3, AlertTriangle, Building2,
  Minus, Plus, Maximize2, GripVertical, ChevronUp,
  Download, FileImage, FileText, ChevronDown, PanelRightClose, PanelRightOpen,
  X, SlidersHorizontal, Undo2, Check,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { generateBpmn, compileBpmn, type WfGraph, type WfNode, type WfEdge } from '@nxt/workflow-core'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'
import { CONNECTORS, findConnector, isRetiredConnector, isCompensable } from '@nxt/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, useEntityLabels, type EntityKind } from '@/components/ui/entity-select'
import { useScreens } from '@/hooks/use-screens'
import { useLookupTable } from '@/hooks/use-lookup-table'
import type { ScreenSubject } from '@/lib/screen-types'
import { PAPEIS_KEY, INIT_PAPEIS, REFERENCIA, ORIGEM, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { layoutGraph, titleLineCount, LABEL_W, LANE_HEADER_W, LANE_SEM_RESPONSAVEL, type FlowNode as LNode, type FlowNodeType } from '@/lib/flow-layout'
import { exportFlow, type FlowExportFormat, type ExportModel, type ExportNode, type ExportEdge } from '@/lib/flow-export'
import { apiFetch } from '@/lib/http'
import { ProcessHistoryDrawer } from './process-history-drawer'
import { cn } from '@/lib/utils'

/** Preferência de painel recolhido (por usuário desta máquina). */
const PANEL_KEY = 'nxt:workflow:panel-collapsed'

export const WORKFLOW_KINDS = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ADITIVO', label: 'Aditivo' },
] as const

type NType = FlowNodeType
type AddType = 'userTask' | 'serviceTask' | 'exclusiveGateway' | 'parallelGateway'

/** Nó do editor. Atividades carregam a config (StepFormSchema); gateways/eventos só nome. */
interface ENode { id: string; type: NType; name: string; step?: StepFormSchema }
interface EEdge { id: string; from: string; to: string; condition?: string; isDefault?: boolean; label?: string }

export interface FlowInitial {
  id: string
  name: string
  description?: string | null
  kind?: string | null
  bpmnXml: string
  steps: StepFormSchema[]
  positions?: Record<string, { x: number; y: number }>
  positionsRaia?: Record<string, { x: number; y: number }>
  laneOrder?: string[]
  graph?: ProcessFormSchema['graph']
}

const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }
const ENTITY_KIND_LABEL: Record<string, string> = { EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato' }
const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'
const isActivity = (t: NType) => t === 'userTask' || t === 'serviceTask'

/** A API recusou uma gravação que apagaria grande parte do desenho (409). Não é falha:
 *  é a guarda pedindo confirmação consciente. Ver `update()` em processes.service. */
class ReducaoDestrutiva extends Error {}
const rnd = () => Math.random().toString(36).slice(2, 9)
const nid = (p: string) => `${p}_${rnd()}`

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
function edgeGeometry(na: Box, nb: Box): { a: Pt; aDir: Pt; b: Pt; bDir: Pt; backward: boolean } {
  const dx = (nb.x + nb.w / 2) - (na.x + na.w / 2)
  const dy = (nb.y + nb.h / 2) - (na.y + na.h / 2)
  if (dx < 0 && Math.abs(dx) >= Math.abs(dy)) {
    return { a: sidePoint(na, 'bottom'), aDir: SIDE_NORMAL.bottom, b: sidePoint(nb, 'bottom'), bDir: SIDE_NORMAL.bottom, backward: true }
  }
  let aSide: Side, bSide: Side
  if (Math.abs(dx) >= Math.abs(dy)) { aSide = dx >= 0 ? 'right' : 'left'; bSide = dx >= 0 ? 'left' : 'right' }
  else { aSide = dy >= 0 ? 'bottom' : 'top'; bSide = dy >= 0 ? 'top' : 'bottom' }
  return { a: sidePoint(na, aSide), aDir: SIDE_NORMAL[aSide], b: sidePoint(nb, bSide), bDir: SIDE_NORMAL[bSide], backward: false }
}
/** Comprimento do "puxão" da curva — mesmo k usado no bezier (para posicionar o rótulo). */
const edgeK = (a: Pt, b: Pt) => Math.max(28, Math.hypot(b.x - a.x, b.y - a.y) * 0.4)
/** Curva cúbica que SAI perpendicular ao lado de origem e ENTRA perpendicular ao de destino. */
function edgeBezier(a: Pt, aDir: Pt, b: Pt, bDir: Pt): string {
  const k = Math.max(28, Math.hypot(b.x - a.x, b.y - a.y) * 0.4)
  return `M ${a.x} ${a.y} C ${a.x + aDir.x * k} ${a.y + aDir.y * k}, ${b.x + bDir.x * k} ${b.y + bDir.y * k}, ${b.x} ${b.y}`
}
/** Posição de cada porta (dot 12px) centrada na borda do nó. */
const PORT_POS: Record<Side, string> = {
  top: 'left-1/2 -translate-x-1/2 -top-1.5',
  bottom: 'left-1/2 -translate-x-1/2 -bottom-1.5',
  left: 'top-1/2 -translate-y-1/2 -left-1.5',
  right: 'top-1/2 -translate-y-1/2 -right-1.5',
}

/* ─── modelo inicial / conversões ──────────────────────────────────────────── */

function seedGraph(): { nodes: ENode[]; edges: EEdge[] } {
  return {
    nodes: [
      { id: 'Start_1', type: 'start', name: 'Início' },
      { id: 'End_1', type: 'end', name: 'Fim' },
    ],
    edges: [{ id: nid('Flow'), from: 'Start_1', to: 'End_1' }],
  }
}

/** Reconstrói o editor. PREFERE o grafo salvo (formSchema.graph) — que não valida e
 *  preserva rótulos. Só cai no compileBpmn (tolerante a erro) para workflows antigos
 *  sem o grafo salvo; se nem isso compilar, devolve um seed em vez de quebrar a tela. */
function fromInitial(initial: FlowInitial): { nodes: ENode[]; edges: EEdge[]; startId: string } {
  const stepById = new Map(initial.steps.map((s) => [s.stepId, s]))
  let gnodes: Array<{ id: string; type: string; name?: string }>
  let gedges: EEdge[]
  let startId: string
  if (initial.graph && initial.graph.nodes?.length) {
    gnodes = initial.graph.nodes
    gedges = initial.graph.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault, label: e.label }))
    startId = gnodes.find((n) => n.type === 'start')?.id ?? 'Start_1'
  } else {
    try {
      const g: WfGraph = compileBpmn(initial.bpmnXml)
      gnodes = Object.values(g.nodes).map((n) => ({ id: n.id, type: n.type, name: n.name }))
      gedges = g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault }))
      startId = g.startId
    } catch {
      const s = seedGraph()
      return { ...s, startId: 'Start_1' }
    }
  }
  const nodes: ENode[] = gnodes.map((n) => {
    const t = n.type as NType
    const step = stepById.get(n.id)
    return {
      id: n.id,
      type: t,
      name: n.name ?? (t === 'start' ? 'Início' : t === 'end' ? 'Fim' : ''),
      step: isActivity(t) ? (step ?? { stepId: n.id, stepName: n.name ?? '', fields: [], stepType: t as 'userTask' | 'serviceTask' }) : undefined,
    }
  })
  return { nodes, edges: gedges, startId }
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
  return { nodes: wn, edges: we, startId: start?.id ?? 'Start_1' }
}

/* ─── componente ───────────────────────────────────────────────────────────── */

export function ProcessFlow({ initial }: { initial?: FlowInitial } = {}) {
  const router = useRouter()
  const editing = !!initial?.id

  const seed = useMemo(() => (initial ? fromInitial(initial) : seedGraph()), [initial])
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [kind, setKind] = useState(initial?.kind ?? '')
  const [nodes, setNodes] = useState<ENode[]>(seed.nodes)
  const [edges, setEdges] = useState<EEdge[]>(seed.edges)
  /* Posições MANUAIS separadas por modo. Um desenho arrumado no canvas livre tem outro
     eixo vertical (não há bandas) e outro zero horizontal (não há coluna de rótulo) do
     que o mesmo desenho arrumado por raia — misturar os dois faria o fluxo "pular" a
     cada vez que o modo fosse alternado. */
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(initial?.positions ?? {})
  const [positionsRaia, setPositionsRaia] = useState<Record<string, { x: number; y: number }>>(initial?.positionsRaia ?? {})
  const [laneOrder, setLaneOrder] = useState<string[]>(initial?.laneOrder ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /* Atividade em CONFIGURAÇÃO (modal). Separado da seleção: fechar o modal não
     deseleciona o nó, e o painel lateral segue mostrando o resumo dele. */
  const [configId, setConfigId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [exporting, setExporting] = useState<FlowExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { screens } = useScreens()
  const resolvePapel = useCallback((id: string) => papeis.entries.find((p) => p.id === id)?.label, [papeis.entries])
  /* Nomes das entidades que hospedam os papéis (unidade, empresa, parceiro…) — o cartão
     mostra QUAL unidade executa, não só o papel. Só carrega os tipos que o fluxo usa. */
  const tiposEntidade = useMemo(() => {
    const s = new Set<EntityKind>()
    for (const n of nodes) { const t = n.step?.executor?.entityType; if (t && t !== 'ORG') s.add(t as EntityKind) }
    return Array.from(s)
  }, [nodes])
  const resolveEntidade = useEntityLabels(tiposEntidade)

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const selected = selectedId ? nodeById[selectedId] : null
  const configNode = configId ? nodeById[configId] : null

  /* Clicar num quadro é o gesto de "quero configurar isto": seleciona e, sendo
     atividade, já abre o modal — era o que a coluna lateral fazia ao aparecer. */
  const selectNode = useCallback((id: string | null) => {
    setSelectedId(id)
    setConfigId(id && isActivity(nodeById[id]?.type) ? id : null)
  }, [nodeById])

  /* VER POR RAIA — modo de visualização, não um elemento que se desenha. Ligado, o
     layout vira bandas por papel; arrastar continua valendo, mas preso à faixa do nó
     (ver `layoutGraph`). Desligado, é o canvas de sempre, com arrasto livre. */
  const [swimlanes, setSwimlanes] = useState(false)
  const posDoModo = swimlanes ? positionsRaia : positions
  const hasManual = Object.keys(posDoModo).length > 0
  const layout = useMemo(() => layoutGraph(
    {
      nodes: nodes.map((n) => ({
        ...toLNode(n),
        lane: laneOf(n, resolvePapel),
        // a altura da caixa acompanha o rodapé REAL do cartão (executor, unidade, prazo)
        metaLines: isActivity(n.type) ? metaDaAtividade(n, resolvePapel, resolveEntidade).length : undefined,
      })),
      edges,
      startId: nodes.find((n) => n.type === 'start')?.id ?? 'Start_1',
    },
    hasManual ? posDoModo : undefined,
    { swimlanes, laneOrder },
  ), [nodes, edges, posDoModo, hasManual, swimlanes, laneOrder, resolvePapel, resolveEntidade])

  /* Reordenar RAIAS: a banda inteira sobe/desce e as atividades vão junto (o y delas
     deriva do topo da banda). As posições manuais são deslocadas pelo MESMO delta, para
     o arranjo que a pessoa fez dentro da banda não se perder na mudança de ordem.
     A altura de cada banda não depende da ordem, então dá para calcular os topos novos
     a partir das alturas atuais — sem esperar o layout recalcular. */
  const reordenarRaias = useCallback((chave: string, destino: number) => {
    const atuais = layout.lanes
    if (!atuais?.length) return
    const ordem = atuais.map((b) => b.key)
    const de = ordem.indexOf(chave)
    if (de < 0) return
    const alvo = Math.max(0, Math.min(ordem.length - 1, destino > de ? destino - 1 : destino))
    if (alvo === de) return

    const nova = [...ordem]
    nova.splice(alvo, 0, ...nova.splice(de, 1))

    const altura = Object.fromEntries(atuais.map((b) => [b.key, b.h]))
    const topoAntes = Object.fromEntries(atuais.map((b) => [b.key, b.y]))
    const topoDepois: Record<string, number> = {}
    let t = atuais[0].y
    for (const k of nova) { topoDepois[k] = t; t += altura[k] }

    setPositionsRaia((prev) => {
      const out = { ...prev }
      for (const [id, p] of Object.entries(prev)) {
        const b = layout.nodes[id]?.band
        if (!b || topoDepois[b] === undefined) continue
        out[id] = { x: p.x, y: p.y + (topoDepois[b] - topoAntes[b]) }
      }
      return out
    })
    setLaneOrder(nova)
  }, [layout])

  /* Painel lateral RETRÁTIL — o canvas é a superfície principal; recolher devolve os
     320px (e o enquadramento reaproveita o espaço, subindo a escala do desenho).
     O estado efetivo é DERIVADO: recolhido só quando o usuário pediu E não há nó
     selecionado — selecionar um nó É o gesto de "quero configurar isto", então o painel
     reaparece sozinho e volta a recolher ao deselecionar. Sem lógica imperativa. */
  const [mounted, setMounted] = useState(false)
  const [panelPref, setPanelPref] = useState(false) // true = recolhido
  useEffect(() => { setMounted(true); setPanelPref(localStorage.getItem(PANEL_KEY) === '1') }, [])
  useEffect(() => { if (mounted) localStorage.setItem(PANEL_KEY, panelPref ? '1' : '0') }, [panelPref, mounted])
  const panelCollapsed = mounted && panelPref && !selectedId
  // recolher = "me devolve o canvas": também deseleciona, senão o derivado o manteria aberto
  const togglePanel = useCallback(() => {
    setPanelPref((prev) => {
      if (!prev) { setSelectedId(null); return true }
      return false
    })
  }, [])

  const setPosition = useCallback((id: string, pos: { x: number; y: number }) => {
    const alvo = swimlanes ? setPositionsRaia : setPositions
    alvo((prev) => ({ ...prev, [id]: pos }))
  }, [swimlanes])
  // (o botão "Organizar" — que zerava as posições manuais para realinhar tudo — foi
  // removido do cabeçalho a pedido; o auto-layout segue valendo enquanto ninguém
  // arrastar um nó, que é quando `positions` deixa de ficar vazio.)

  const activityCount = nodes.filter((n) => isActivity(n.type)).length

  const patchNode = useCallback((id: string, patch: Partial<ENode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }, [])
  const patchStep = useCallback((id: string, patch: Partial<StepFormSchema>) => {
    setNodes((prev) => prev.map((n) => (n.id === id && n.step ? { ...n, step: { ...n.step, ...patch } } : n)))
  }, [])
  // Troca o TIPO da atividade (Tarefa ↔ Ação automática). Precisa mexer em node.type
  // (o inspetor e o motor leem daí) além do stepType — por isso não dá para fazer só
  // via patchStep (era o bug do toggle que "não fazia nada").
  const changeNodeType = useCallback((id: string, t: 'userTask' | 'serviceTask') => {
    setNodes((prev) => prev.map((n) => (n.id === id
      ? { ...n, type: t, step: { ...(n.step ?? { stepId: id, stepName: '', fields: [] }), stepType: t } }
      : n)))
  }, [])

  // ── gestos de conexão (portas): conectar, criar-no-vazio, apagar aresta ──
  const onConnect = useCallback((from: string, to: string) => {
    if (from === to) return
    setEdges((prev) => (prev.some((e) => e.from === from && e.to === to) ? prev : [...prev, { id: nid('Flow'), from, to }]))
  }, [])
  const onCreateConnected = useCallback((from: string, type: AddType) => {
    if (type === 'userTask' || type === 'serviceTask') {
      const id = nid('Node')
      setNodes((ns) => [...ns, { id, type, name: '', step: { stepId: id, stepName: '', fields: [], stepType: type } }])
      setEdges((es) => [...es, { id: nid('Flow'), from, to: id }])
      setSelectedId(id)
    } else {
      const id = nid('Gw')
      setNodes((ns) => [...ns, { id, type, name: type === 'exclusiveGateway' ? 'Decisão' : 'Em paralelo' }])
      setEdges((es) => [...es, { id: nid('Flow'), from, to: id }])
      setSelectedId(id)
    }
  }, [])
  const onDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
  }, [])

  // Remove um nó (atividade) fazendo ponte entre a entrada e a saída.
  const removeNode = useCallback((id: string) => {
    setEdges((prevEdges) => {
      const ins = prevEdges.filter((e) => e.to === id)
      const outs = prevEdges.filter((e) => e.from === id)
      const rest = prevEdges.filter((e) => e.from !== id && e.to !== id)
      // ponte simples: liga cada entrada a cada saída (para atividade linear, 1×1)
      const bridges: EEdge[] = []
      for (const i of ins) for (const o of outs) bridges.push({ id: nid('Flow'), from: i.from, to: o.to, condition: i.condition, isDefault: i.isDefault, label: i.label })
      return [...rest, ...bridges]
    })
    setNodes((ns) => ns.filter((n) => n.id !== id))
    const esquecer = (prev: Record<string, { x: number; y: number }>) => {
      if (!prev[id]) return prev
      const n = { ...prev }; delete n[id]; return n
    }
    setPositions(esquecer); setPositionsRaia(esquecer)
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  const setEdge = useCallback((edgeId: string, patch: Partial<EEdge>) => {
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)))
  }, [])

  /* Gravação que apagaria grande parte do desenho: a API recusa com 409 e diz quanto
     seria removido. Guardamos a pergunta aqui e só reenviamos com `confirmarReducao`
     depois que a pessoa disser que é intencional — sem diálogo nativo, que trava a
     janela e destoa do resto do sistema. */
  const [reducao, setReducao] = useState<{ msg: string; acao: 'rascunho' | 'ativar' } | null>(null)

  const persist = useCallback(async (confirmarReducao?: boolean): Promise<string> => {
    const bpmnXml = generateBpmn(buildWfGraph(nodes, edges))
    const steps = nodes.filter((n) => isActivity(n.type) && n.step).map((n) => ({ ...n.step!, stepId: n.id, stepName: n.step!.stepName, stepType: n.type as 'userTask' | 'serviceTask' }))
    // mantém só posições de nós existentes (nos dois modos)
    const vivos = (m: Record<string, { x: number; y: number }>) =>
      Object.fromEntries(Object.entries(m).filter(([id]) => nodes.some((n) => n.id === id)))
    const pos = vivos(positions)
    const posRaia = vivos(positionsRaia)
    // grafo do editor (fonte de verdade da autoria; sobrevive a rascunhos incompletos)
    const graph: ProcessFormSchema['graph'] = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name })),
      edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition || undefined, isDefault: e.isDefault, label: e.label })),
    }
    const formSchema: ProcessFormSchema = {
      steps, graph,
      positions: Object.keys(pos).length ? pos : undefined,
      positionsRaia: Object.keys(posRaia).length ? posRaia : undefined,
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
  }, [editing, initial, name, description, kind, nodes, edges, positions, positionsRaia, laneOrder])

  const handleSaveDraft = useCallback(async (confirmarReducao?: boolean) => {
    if (!name.trim()) { alert('Dê um nome ao workflow antes de salvar.'); return }
    setSaving(true)
    try { const id = await persist(confirmarReducao); setReducao(null); router.push(`/processes/${id}/edit`) }
    catch (err) {
      if (err instanceof ReducaoDestrutiva) { setReducao({ msg: err.message, acao: 'rascunho' }); return }
      alert('Não foi possível salvar o workflow.'); console.error(err)
    }
    finally { setSaving(false) }
  }, [name, persist, router])

  const handleActivate = useCallback(async (confirmarReducao?: boolean) => {
    if (!name.trim()) { alert('Dê um nome ao workflow antes de ativar.'); return }
    // O tipo decide em que tela o workflow aparece no "Novo processo" — sem ele, o
    // workflow ficaria ativo e invisível para quem trabalha em Contratos/Parceiros.
    // (O backend também recusa; aqui o aviso chega antes de salvar.)
    if (!kind) { alert('Escolha o tipo do workflow (contrato, aditivo ou parceiro) antes de ativar.'); return }
    if (activityCount === 0) { alert('Adicione ao menos uma atividade antes de ativar.'); return }
    setActivating(true)
    try {
      const id = await persist(confirmarReducao)
      setReducao(null)
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) { const e = await res.json().catch(() => null); alert(e?.message || 'Não foi possível ativar o workflow.'); router.push(`/processes/${id}`); return }
      router.push(`/processes/${id}`)
    } catch (err) {
      if (err instanceof ReducaoDestrutiva) { setReducao({ msg: err.message, acao: 'ativar' }); return }
      alert('Não foi possível ativar o workflow.'); console.error(err)
    }
    finally { setActivating(false) }
  }, [name, kind, activityCount, persist, router])

  // Monta o modelo do grafo (posições + textos) para o exportador desenhar em 2D.
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
      // MESMA geometria da tela (âncoras cientes do lado + laço de retorno), senão o
      // arquivo exportado sai diferente do que o usuário desenhou.
      const g = edgeGeometry(a, b)
      return {
        ax: g.a.x, ay: g.a.y, bx: g.b.x, by: g.b.y,
        adx: g.aDir.x, ady: g.aDir.y, bdx: g.bDir.x, bdy: g.bDir.y,
        backward: g.backward, variant, label: e.label,
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

  // Tecla Delete/Backspace exclui o nó selecionado (exceto início/fim), fora de campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selectedId) return
      const n = nodeById[selectedId]
      if (n && n.type !== 'start' && n.type !== 'end') { e.preventDefault(); removeNode(selectedId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, nodeById, removeNode])

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push('/processes')} className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <Input className="h-8 text-sm font-semibold border-0 shadow-none px-0 focus-visible:ring-0 bg-transparent" placeholder="Nome do workflow..." value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {exportError && <span className="text-[11px] text-destructive font-medium">{exportError}</span>}
          {/* só faz sentido no que já foi salvo: workflow novo ainda não tem histórico */}
          {editing && <ProcessHistoryDrawer processId={initial!.id} />}
          <Button variant={swimlanes ? 'secondary' : 'outline'} size="sm" onClick={() => setSwimlanes((s) => !s)} aria-pressed={swimlanes}
            title={swimlanes ? 'Voltar ao desenho livre (permite arrastar os quadros)' : 'Agrupar as atividades em raias por responsável — a raia vem do executor configurado'}>
            <Rows3 className="h-4 w-4" />Ver por raia
          </Button>
          <ExportMenu exporting={exporting} disabled={saving || activating} onExport={handleExport} />
          {/* ⚠️ `() =>` obrigatório: passar a função direto entregaria o MouseEvent como
              `confirmarReducao` — truthy — e a guarda seria burlada em TODO salvamento. */}
          <Button variant="outline" size="sm" onClick={() => handleSaveDraft()} disabled={saving || activating}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar rascunho</Button>
          <Button size="sm" onClick={() => handleActivate()} disabled={saving || activating}>{activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Ativar workflow</Button>
        </div>
      </div>

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

      {/* Canvas + Inspetor */}
      <div className="flex flex-1 overflow-hidden">
        <FlowCanvas canvasRef={canvasRef} nodes={nodes} edges={edges} layout={layout} selectedId={selectedId} onSelect={selectNode} onConnect={onConnect} onCreateConnected={onCreateConnected} onDeleteEdge={onDeleteEdge} onDeleteNode={removeNode} onSetPosition={setPosition} resolvePapel={resolvePapel} resolveEntidade={resolveEntidade} onReorderLanes={reordenarRaias} />
        {/* trilho do toggle: fica SEMPRE visível (é a alça para trazer o painel de volta) */}
        <div className="w-8 border-l bg-card flex flex-col items-center pt-2.5 shrink-0">
          <button type="button" onClick={togglePanel}
            title={panelCollapsed ? 'Expandir configurações' : 'Recolher configurações (mais espaço para o desenho)'}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {panelCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
        </div>
        <div className={cn('w-80 border-l bg-card flex-col overflow-hidden shrink-0', panelCollapsed ? 'hidden' : 'flex')}>
          {selected ? (
            isActivity(selected.type) ? (
              <ActivitySummaryPanel node={selected} papeis={papeis}
                onConfigure={() => setConfigId(selected.id)} onRemove={() => removeNode(selected.id)} />
            ) : (
              <GatewayInspector key={selected.id} node={selected} edges={edges} onPatchNode={(p) => patchNode(selected.id, p)} onSetEdge={setEdge} />
            )
          ) : (
            /* Nada selecionado → propriedades do workflow (padrão de editor visual: painel = documento) */
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b shrink-0 flex items-center">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary"><LayoutTemplate className="h-3 w-3" />Propriedades do workflow</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <Field label="Descrição" hint="O objetivo deste workflow, para quem for gerenciá-lo.">
                  <Textarea className="text-sm min-h-[72px]" placeholder="Descreva o objetivo deste workflow…" value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <Field label="Tipo" hint="Determina onde ele aparece em “Novo processo”.">
                  <Select value={kind || 'none'} onValueChange={(v) => setKind(v === 'none' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— não especificado</SelectItem>
                      {WORKFLOW_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="rounded-md border border-dashed bg-muted/20 p-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><LayoutTemplate className="h-3.5 w-3.5 text-primary" />Monte o fluxo</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">Passe o mouse num quadro e <span className="font-medium">arraste uma das bolinhas</span> (nos 4 lados) até outro quadro para conectar — solte em qualquer parte dele. Ou solte no vazio para criar já ligado. Clique num quadro para configurá-lo.</p>
                  {swimlanes && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug border-t pt-1.5">
                      Para <span className="font-medium">reordenar uma raia</span>, arraste-a pela faixa do nome, à esquerda — ou use as setas <span className="font-medium">↑ ↓</span> que aparecem nela. As atividades vão junto.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Configuração da atividade: modal amplo (a coluna de 320px não comporta o
          formulário — ver o comentário em ActivityConfigModal). */}
      {configNode && configNode.step && (
        <ActivityConfigModal key={configNode.id} node={configNode} nodes={nodes} edges={edges} screens={screens} papeis={papeis}
          onPatchStep={(p) => patchStep(configNode.id, p)}
          onChangeType={(t) => changeNodeType(configNode.id, t)}
          onRemove={() => { removeNode(configNode.id); setConfigId(null) }}
          onClose={() => setConfigId(null)} />
      )}
    </div>
  )
}

/* ─── Canvas ────────────────────────────────────────────────────────────────── */

const STEP_TONE: Record<string, string> = {
  userTask: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  serviceTask: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
}

/* Zoom do canvas. O teto acima de 100% existe para LER: com o desenho grande, é o que
   permite conferir prazo e executor sem abrir a atividade. O piso é o mesmo do
   enquadramento automático — abaixo disso o texto do cartão vira borrão. */
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2
const ZOOM_PASSOS = [0.25, 0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2]

function FlowCanvas({ canvasRef, nodes, edges, layout, selectedId, onSelect, onConnect, onCreateConnected, onDeleteEdge, onDeleteNode, onSetPosition, resolvePapel, resolveEntidade, onReorderLanes }: {
  canvasRef: React.RefObject<HTMLDivElement | null>
  nodes: ENode[]; edges: EEdge[]; layout: ReturnType<typeof layoutGraph>
  selectedId: string | null; onSelect: (id: string | null) => void
  onConnect: (from: string, to: string) => void
  onCreateConnected: (from: string, type: AddType) => void
  onDeleteEdge: (edgeId: string) => void
  onDeleteNode: (id: string) => void
  onSetPosition: (id: string, pos: { x: number; y: number }) => void
  resolvePapel: (id: string) => string | undefined
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
  onReorderLanes: (key: string, destino: number) => void
}) {
  const [connecting, setConnecting] = useState<string | null>(null)
  const [rubber, setRubber] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; from: string } | null>(null)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  // ENQUADRAMENTO: encolhe o desenho para caber na área REAL do canvas (que já exclui o
  // inspetor, pois são irmãos no flex). Sem isso o "Fim" — sempre na última coluna —
  // nasce fora da tela e o usuário não vê (nem alcança) as ligações que chegam nele.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  /* O enquadramento automático só vale ENQUANTO o usuário não pediu um zoom. Antes
     disto ele reagia a cada atividade nova e desfazia qualquer ajuste manual — era o
     que fazia o desenho "ir ficando pequeno" sem que houvesse como reagir. */
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

  /** Muda o zoom mantendo FIXO o ponto sob o cursor (ou o centro da área visível).
   *  Sem ancorar, ampliar joga o desenho para longe e a pessoa se perde. */
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

  /* Ctrl/⌘ + roda = zoom, o gesto que todo mundo tenta primeiro. Precisa de listener
     NÃO-PASSIVO: sem `preventDefault` o navegador aplica o zoom DELE na página. */
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
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number; moved: boolean } | null>(null)

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const edgeColor = (e: EEdge) => {
    const f = nodeById[e.from]
    if (f?.type === 'exclusiveGateway') return '#7c3aed'
    if (f?.type === 'parallelGateway') return '#e11d68'
    return 'hsl(var(--muted-foreground) / 0.5)' // visível sobre a "Mesa de Vidro" (--border some no fundo profundo)
  }
  // px de tela → coordenadas do GRAFO (o canvas está sob transform: scale)
  const toCanvas = (cx: number, cy: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (cx - r.left) / scale, y: (cy - r.top) / scale }
  }

  const startConnect = (from: string, side: Side, ev: React.PointerEvent) => {
    ev.preventDefault(); ev.stopPropagation()
    setConnecting(from)
    const a = sidePoint(layout.nodes[from], side)
    const aDir = SIDE_NORMAL[side]
    const move = (e: PointerEvent) => {
      const c = toCanvas(e.clientX, e.clientY)
      setRubber(edgeBezier(a, aDir, c, { x: -aDir.x, y: -aDir.y }))
    }
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setRubber(''); setConnecting(null)
      // SOLTAR EM QUALQUER LUGAR DE UM NÓ conecta (antes exigia acertar a bolinha de
      // entrada, 14px — por isso início→atividade e atividade→fim "não funcionavam").
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const to = (el?.closest('[data-node-id]') as HTMLElement | null)?.getAttribute('data-node-id')
      if (to && to !== from && nodeById[to]?.type !== 'start') { onConnect(from, to); return }
      setMenu({ ...toCanvas(e.clientX, e.clientY), from })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* Fator dos CONTROLES da raia: eles vivem dentro do canvas escalado, então desenhamos
     em 1/escala para o tamanho na TELA ficar constante. O teto de 3,2 impede que, num
     zoom muito baixo, o par de setas fique mais alto que a própria banda. */
  const ctrlK = Math.min(3.2, Math.max(1, 1 / scale))

  /* Arrastar a RAIA pela coluna do rótulo. Só a vertical importa: a banda cai entre duas
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

  // arrastar a CAIXA (corpo do nó) → posição manual, com snap na grade + guias de alinhamento
  const GRID = 12, ALIGN = 6
  const startNodeDrag = (id: string, ev: React.PointerEvent) => {
    if ((ev.target as HTMLElement).closest('[data-port],[data-trash]')) return
    const p = layout.nodes[id]; if (!p) return
    dragRef.current = { id, sx: ev.clientX, sy: ev.clientY, ox: p.x, oy: p.y, w: p.w, h: p.h, moved: false }
    const others = Object.entries(layout.nodes).filter(([oid]) => oid !== id).map(([, op]) => ({ cx: op.x + op.w / 2, cy: op.y + op.h / 2 }))
    const move = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) return
      d.moved = true; setDragId(d.id)
      // delta de TELA → delta do GRAFO (dividido pela escala do enquadramento)
      let nx = Math.round((d.ox + (e.clientX - d.sx) / scale) / GRID) * GRID
      let ny = Math.round((d.oy + (e.clientY - d.sy) / scale) / GRID) * GRID
      let cx = nx + d.w / 2, cy = ny + d.h / 2
      let gx: number | undefined, gy: number | undefined
      for (const o of others) {
        if (gx === undefined && Math.abs(cx - o.cx) <= ALIGN) { nx = o.cx - d.w / 2; cx = o.cx; gx = o.cx }
        if (gy === undefined && Math.abs(cy - o.cy) <= ALIGN) { ny = o.cy - d.h / 2; cy = o.cy; gy = o.cy }
      }
      setGuides({ x: gx, y: gy })
      onSetPosition(d.id, { x: Math.max(8, nx), y: Math.max(8, ny) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      dragRef.current = null; setDragId(null); setGuides({})
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // O deselect fica no CONTAINER de rolagem (não na div do grafo): com o enquadramento a
  // div do grafo não cobre toda a área visível, e clicar no vazio abaixo dela não
  // deselecionava — o painel ficava preso no inspetor do nó.
  return (
    <div className="flex-1 min-w-0 min-h-0 relative">
    <ZoomBar scale={scale} autoFit={autoFit}
      onZoom={(s) => zoomPara(s)}
      onFit={() => { setAutoFit(true); setScale(fitScale()) }} />
    <div ref={scrollRef} className="absolute inset-0 overflow-auto bg-muted/20 [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px]"
      onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-node-id]')) onSelect(null) }}>
      {/* espaçador com o tamanho JÁ ESCALADO: mantém as barras de rolagem corretas */}
      <div style={{ width: layout.width * scale, height: layout.height * scale, minWidth: '100%' }}>
      <div ref={canvasRef} className="relative" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {/* RAIAS — bandas atrás de tudo, com o papel na coluna da esquerda. Só leitura:
            a banda vem do executor configurado, não se arrasta nada para dentro dela.

            ⚠️ A moldura NÃO usa `--border`/`--muted`: no tema claro esses tokens têm a
            mesma luminosidade do fundo (88% contra 88%) e a raia sumia — funcionava só
            no escuro. Sai de `--foreground` com alfa, que contrasta com o fundo por
            construção nos dois temas. */}
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
            {/* a COLUNA DO RÓTULO é a alça: arrastar aqui sobe/desce a raia inteira */}
            <div data-lane-handle onPointerDown={(e) => startLaneDrag(b.key, e)}
              className={cn('absolute inset-y-0 left-0 flex items-center justify-center px-2 pointer-events-auto group/lane',
                laneDrag ? 'cursor-grabbing' : 'cursor-grab')}
              title="Arraste para cima ou para baixo para reordenar a raia"
              style={{ width: LANE_HEADER_W, background: 'hsl(var(--foreground) / 0.075)', borderRight: '1px solid hsl(var(--foreground) / 0.22)' }}>
              {/* ⚠️ CONTRA-ESCALA: tudo aqui dentro está sob o `scale` do canvas. No zoom
                  em que um fluxo grande costuma ficar (~30%) um botão normal viraria 4px
                  e seria inalcançável — daí desenhar em 1/escala, limitado ao que cabe na
                  faixa. Só os CONTROLES compensam; o rótulo escala junto com o desenho. */}
              <GripVertical className="absolute left-0 text-muted-foreground" aria-hidden
                style={{ height: 14 * ctrlK, width: 14 * ctrlK }} />
              <span className={cn('text-[11px] font-semibold text-center leading-tight select-none', b.key === LANE_SEM_RESPONSAVEL ? 'text-muted-foreground italic' : 'text-foreground')}
                style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}>{b.label}</span>
              <div className="absolute right-0 flex flex-col opacity-0 group-hover/lane:opacity-100 transition-opacity"
                style={{ gap: 2 * ctrlK }} onPointerDown={(e) => e.stopPropagation()}>
                <button type="button" disabled={i === 0} title="Subir a raia"
                  onClick={(e) => { e.stopPropagation(); onReorderLanes(b.key, i - 1) }}
                  className="flex items-center justify-center rounded bg-card/90 border shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  style={{ height: 16 * ctrlK, width: 16 * ctrlK }}>
                  <ChevronUp style={{ height: 11 * ctrlK, width: 11 * ctrlK }} />
                </button>
                <button type="button" disabled={i === (layout.lanes?.length ?? 1) - 1} title="Descer a raia"
                  onClick={(e) => { e.stopPropagation(); onReorderLanes(b.key, i + 2) }}
                  className="flex items-center justify-center rounded bg-card/90 border shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  style={{ height: 16 * ctrlK, width: 16 * ctrlK }}>
                  <ChevronDown style={{ height: 11 * ctrlK, width: 11 * ctrlK }} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {/* onde a raia arrastada vai pousar */}
        {laneDrag && laneDrag.linha !== null && (
          <div className="absolute left-0 pointer-events-none z-20" style={{ top: laneDrag.linha - 1, width: layout.width, height: 2, background: 'hsl(var(--primary))' }} />
        )}
        {/* ⚠️ `pointer-events-none` na RAIZ do svg. Um <svg> inline é hit-testável em TODA
            a sua caixa, e esta cobre o canvas inteiro — vindo depois das raias no DOM, ele
            engolia o mouse sobre a coluna de rótulos e a raia não podia ser pega nem
            arrastada. Só as arestas voltam a receber evento (`pointer-events-auto` no
            <g>), que é o que precisa de hover para o botão de apagar. */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: layout.width, height: layout.height }}>
          <defs>
            <marker id="fl-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
          </defs>
          {edges.map((e) => {
            const na = layout.nodes[e.from], nb = layout.nodes[e.to]
            if (!na || !nb) return null
            const { a, aDir, b, bDir } = edgeGeometry(na, nb)
            const d = edgeBezier(a, aDir, b, bDir)
            const col = edgeColor(e)
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
            return (
              <g key={e.id} className="pointer-events-auto" onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge((h) => (h === e.id ? null : h))}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }} />
                <path d={d} fill="none" stroke={col} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#fl-arrow)" style={{ color: col }} />
                {hoverEdge === e.id && (
                  <g transform={`translate(${mx},${my})`} style={{ cursor: 'pointer' }} onClick={() => onDeleteEdge(e.id)}>
                    <circle r={9} fill="#fff" stroke="#dc2626" strokeWidth={1.5} />
                    <line x1={-3.2} y1={-3.2} x2={3.2} y2={3.2} stroke="#dc2626" strokeWidth={1.8} strokeLinecap="round" />
                    <line x1={3.2} y1={-3.2} x2={-3.2} y2={3.2} stroke="#dc2626" strokeWidth={1.8} strokeLinecap="round" />
                  </g>
                )}
              </g>
            )
          })}
          {connecting && rubber && <path d={rubber} fill="none" stroke="#18c07a" strokeWidth={2.25} strokeDasharray="5 4" strokeLinecap="round" />}
        </svg>

        {/* rótulos das arestas */}
        {edges.map((e) => {
          const na = layout.nodes[e.from], nb = layout.nodes[e.to]
          if (!na || !nb || !e.label) return null
          const { a, b, backward } = edgeGeometry(na, nb)
          const mx = (a.x + b.x) / 2
          // no retorno o rótulo acompanha o ponto mais baixo do arco (y ≈ Y + 0.75k)
          const my = backward ? (a.y + b.y) / 2 + 0.75 * edgeK(a, b) : (a.y + b.y) / 2 - 16
          return <div key={`lb-${e.id}`} className="absolute -translate-x-1/2 -translate-y-1/2 text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-card border shadow-sm pointer-events-none" style={{ left: mx, top: my, color: e.isDefault ? 'hsl(var(--muted-foreground))' : undefined }}>{e.label}</div>
        })}

        {/* nós + portas de conexão */}
        {nodes.map((n) => {
          const p = layout.nodes[n.id]
          if (!p) return null
          return (
            <div key={n.id} data-node-id={n.id} onPointerDown={(e) => startNodeDrag(n.id, e)}
              className={cn('absolute group select-none', dragId === n.id ? 'z-40 cursor-grabbing' : 'cursor-grab')}
              style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>
              <FlowNodeView node={n} selected={n.id === selectedId} onClick={() => onSelect(n.id)} resolvePapel={resolvePapel} resolveEntidade={resolveEntidade} />
              {n.type !== 'start' && n.type !== 'end' && (
                <button data-trash onClick={(e) => { e.stopPropagation(); onDeleteNode(n.id) }} title="Excluir"
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              {/* Portas de saída nos 4 lados (menos o Fim, que só recebe). Arraste qualquer
                  uma até OUTRO nó (solte em qualquer lugar dele) para conectar. */}
              {n.type !== 'end' && (['top', 'right', 'bottom', 'left'] as Side[]).map((side) => (
                <div key={side} data-port title="Arraste para conectar" onPointerDown={(ev) => startConnect(n.id, side, ev)}
                  className={cn('absolute w-3 h-3 rounded-full bg-background border-2 border-primary z-10 cursor-crosshair transition-all hover:bg-primary hover:scale-125',
                    connecting ? 'opacity-70' : 'opacity-0 group-hover:opacity-100', PORT_POS[side])} />
              ))}
            </div>
          )
        })}

        {/* guias de alinhamento (aparecem ao arrastar) */}
        {guides.x !== undefined && <div className="absolute top-0 bottom-0 w-px bg-primary/70 pointer-events-none z-30" style={{ left: guides.x }} />}
        {guides.y !== undefined && <div className="absolute left-0 right-0 h-px bg-primary/70 pointer-events-none z-30" style={{ top: guides.y }} />}

        {menu && <CreateMenu x={menu.x} y={menu.y} onPick={(t) => { onCreateConnected(menu.from, t); setMenu(null) }} onClose={() => setMenu(null)} />}
      </div>
      </div>
    </div>
    </div>
  )
}

/** Controle de zoom, flutuante sobre o canvas. "Ajustar" devolve o enquadramento
 *  automático — e volta a valer a cada atividade nova, até você mexer no zoom. */
function ZoomBar({ scale, autoFit, onZoom, onFit }: {
  scale: number; autoFit: boolean; onZoom: (s: number) => void; onFit: () => void
}) {
  // vai para o degrau seguinte/anterior da escala — o zoom da roda cai entre eles
  const passo = (dir: 1 | -1) => {
    const alvo = dir > 0
      ? ZOOM_PASSOS.find((s) => s > scale + 0.001)
      : [...ZOOM_PASSOS].reverse().find((s) => s < scale - 0.001)
    onZoom(alvo ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN))
  }
  const btn = 'h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <div className="glass absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-xl p-1 shadow-sm">
      <button type="button" onClick={() => passo(-1)} disabled={scale <= ZOOM_MIN + 0.001} className={btn} title="Afastar (Ctrl + roda do mouse)"><Minus className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => onZoom(1)} className="h-7 min-w-[3.25rem] px-1 rounded-md text-[11px] font-semibold tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Voltar para 100%">
        {Math.round(scale * 100)}%
      </button>
      <button type="button" onClick={() => passo(1)} disabled={scale >= ZOOM_MAX - 0.001} className={btn} title="Aproximar (Ctrl + roda do mouse)"><Plus className="h-3.5 w-3.5" /></button>
      <span className="w-px h-4 bg-border mx-0.5" />
      <button type="button" onClick={onFit} className={cn(btn, autoFit && 'text-primary')} title="Ajustar à tela"><Maximize2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}

function CreateMenu({ x, y, onPick, onClose }: { x: number; y: number; onPick: (t: AddType) => void; onClose: () => void }) {
  useEffect(() => {
    const h = () => onClose()
    const t = setTimeout(() => window.addEventListener('pointerdown', h), 0)
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', h) }
  }, [onClose])
  return (
    <div className="glass absolute z-30 w-44 rounded-xl p-1" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {([['userTask', 'Tarefa', UserSquare, 'text-sky-600 dark:text-sky-400'], ['serviceTask', 'Ação automática', Zap, 'text-amber-600 dark:text-amber-400'], ['exclusiveGateway', 'Decisão (ou/ou)', XorGlyph, 'text-violet-600 dark:text-violet-400'], ['parallelGateway', 'Paralelo (e/e)', AndGlyph, 'text-rose-600 dark:text-rose-400']] as const).map(([t, lbl, Icon, cls]) => (
        <button key={t} onClick={() => onPick(t)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent">
          <Icon className={cn('h-4 w-4', cls)} /> {lbl}
        </button>
      ))}
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

/** Losango do gateway em miniatura, para menus e cabeçalhos de painel. */
function GatewayGlyph({ kind, className }: { kind: 'exclusive' | 'parallel'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
      {kind === 'exclusive'
        ? <><path d="m8.9 8.9 6.2 6.2" /><path d="m15.1 8.9-6.2 6.2" /></>
        : <><path d="M12 7.7v8.6" /><path d="M7.7 12h8.6" /></>}
    </svg>
  )
}
/** Mesma assinatura dos ícones do lucide (só `className`), para entrarem nas listas de menu. */
const XorGlyph = (p: { className?: string }) => <GatewayGlyph kind="exclusive" {...p} />
const AndGlyph = (p: { className?: string }) => <GatewayGlyph kind="parallel" {...p} />

function FlowNodeView({ node, selected, onClick, resolvePapel, resolveEntidade }: {
  node: ENode; selected: boolean; onClick: () => void
  resolvePapel: (id: string) => string | undefined
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
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

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 flex items-center gap-1">{label}{required && <span className="text-destructive">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

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

function ActivityConfigModal({ node, nodes, edges, screens, papeis, onPatchStep, onChangeType, onRemove, onClose }: {
  node: ENode; nodes: ENode[]; edges: EEdge[]; screens: Screens; papeis: Papeis
  onPatchStep: (patch: Partial<StepFormSchema>) => void; onChangeType: (t: 'userTask' | 'serviceTask') => void; onRemove: () => void
  onClose: () => void
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
  const pickScreen = (id: string) => {
    if (!id || id === 'none') { onPatchStep({ screenRef: undefined, screenSubject: undefined, entityMode: undefined, entityVar: undefined }); return }
    const sc = entityScreens.find((s) => s.id === id)
    onPatchStep({ screenRef: id, screenSubject: sc?.subjectType as ScreenSubject as 'CONTRATO' | 'FORNECEDOR' | undefined, entityMode: step.entityMode ?? 'CREATE' })
  }

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
  const [sec, setSec] = useState('identificacao')
  useEffect(() => { if (!secoes.some((s) => s.id === sec)) setSec('identificacao') }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Resumo por seção: fechado, o menu ainda diz o que está configurado — sem isso a
     navegação lateral esconde a informação que a coluna única ao menos mostrava. */
  const resumo: Record<string, string> = {
    identificacao: step.stepName || 'sem nome',
    executor: papelSel?.label ?? 'sem papel',
    formulario: step.screenRef ? `${ENTITY_MODE_LABEL[step.entityMode ?? 'CREATE']} ${entityWord}` : 'sem tela',
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
                          onClick={() => onPatchStep({ entityMode: m, entityVar: m === 'CREATE' ? undefined : step.entityVar })}
                          className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors', (step.entityMode ?? 'CREATE') === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                          {ENTITY_MODE_LABEL[m]} {entityWord}
                        </button>
                      ))}
                    </div>
                  </GField>
                )}
                {step.screenRef && step.entityMode && step.entityMode !== 'CREATE' && (
                  <GField label={`Qual ${entityWord}?`} required wide
                    hint={availableVars.length === 0
                      ? 'Nenhuma etapa anterior produz uma referência. Coloque antes uma etapa que crie a entidade.'
                      : 'A variável do processo que carrega o id — normalmente produzida por uma etapa anterior.'}>
                    <Select value={step.entityVar || 'none'} onValueChange={(v) => onPatchStep({ entityVar: v === 'none' ? undefined : v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Variável com o id…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— escolha a variável —</SelectItem>
                        {availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
  node: ENode; papeis: Papeis; onConfigure: () => void; onRemove: () => void
}) {
  const step = node.step!
  const type = node.type as 'userTask' | 'serviceTask'
  const meta = type === 'serviceTask' ? { label: 'Ação automática', tone: STEP_TONE.serviceTask, Icon: Zap } : { label: 'Tarefa do usuário', tone: STEP_TONE.userTask, Icon: UserSquare }
  const entityWord = SUBJECT_ENTITY[step.screenSubject ?? ''] ?? 'entidade'
  const papel = step.executor?.papelId ? papeis.entries.find((p) => p.id === step.executor!.papelId)?.label : undefined

  const linhas: Array<{ label: string; valor: string }> = type === 'userTask'
    ? [
        { label: 'Executor', valor: papel ?? '— sem papel definido' },
        { label: 'Formulário', valor: step.screenRef ? `${ENTITY_MODE_LABEL[step.entityMode ?? 'CREATE']} ${entityWord}` : '— sem tela' },
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
        <button onClick={onRemove} title="Remover atividade" className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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
        <Button size="sm" className="w-full" onClick={onConfigure}><SlidersHorizontal className="h-3.5 w-3.5" />Configurar atividade</Button>
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
  CREATE: 'A atividade cria um registro novo, e o id dele fica disponível para as etapas seguintes.',
  EDIT:   'A atividade abre um registro existente para alteração — escolha abaixo de onde vem o id.',
  VIEW:   'A atividade apenas MOSTRA o registro, em leitura: nenhum campo pode ser alterado e nada é gravado. Serve para etapas de análise, conferência e ciência.',
}

function GatewayInspector({ node, edges, onPatchNode, onSetEdge }: {
  node: ENode; edges: EEdge[]; onPatchNode: (patch: Partial<ENode>) => void; onSetEdge: (edgeId: string, patch: Partial<EEdge>) => void
}) {
  const isExcl = node.type === 'exclusiveGateway'
  const outs = edges.filter((e) => e.from === node.id)
  const tone = isExcl ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', tone)}><GatewayGlyph kind={isExcl ? 'exclusive' : 'parallel'} className="h-3 w-3" />{isExcl ? 'Decisão (ou/ou)' : 'Paralelo (e/e)'}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label={isExcl ? 'Pergunta / rótulo' : 'Rótulo'}>
          <Input className="h-8 text-sm" placeholder={isExcl ? 'Ex.: Valor acima de R$ 100 mil?' : 'Ex.: Em paralelo'} value={node.name} onChange={(e) => onPatchNode({ name: e.target.value })} />
        </Field>
        {isExcl ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Condição de cada saída (a saída padrão é usada quando nenhuma casa):</p>
            {outs.map((e) => (
              <div key={e.id} className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Input className="h-6 text-[11px] w-24 px-2" value={e.label ?? ''} placeholder="Rótulo" onChange={(ev) => onSetEdge(e.id, { label: ev.target.value })} />
                  {e.isDefault ? <Badge variant="outline" className="text-[10px]">padrão</Badge> : (
                    <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => { outs.forEach((o) => onSetEdge(o.id, { isDefault: false })); onSetEdge(e.id, { isDefault: true, condition: '' }) }}>tornar padrão</button>
                  )}
                </div>
                {!e.isDefault && (
                  <Input className="h-7 text-xs font-mono" placeholder="ex.: valor > 100000" value={e.condition ?? ''} onChange={(ev) => onSetEdge(e.id, { condition: ev.target.value })} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground leading-snug">Todas as saídas rodam ao mesmo tempo; o motor espera todas concluírem antes de seguir. Insira atividades em cada faixa com o <span className="font-medium">+</span> no conector.</p>
        )}
      </div>
    </div>
  )
}
