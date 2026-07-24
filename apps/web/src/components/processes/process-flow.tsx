'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Zap, Trash2, User, Clock, LayoutTemplate, Wand2,
  CircleDot, CheckCircle2, Loader2, UserSquare, GitBranch, GitMerge,
  Download, FileImage, FileText, ChevronDown, PanelRightClose, PanelRightOpen,
} from 'lucide-react'
import { generateBpmn, compileBpmn, type WfGraph, type WfNode, type WfEdge } from '@nxt/workflow-core'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'
import { CONNECTORS } from '@nxt/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, type EntityKind } from '@/components/ui/entity-select'
import { useScreens } from '@/hooks/use-screens'
import { useLookupTable } from '@/hooks/use-lookup-table'
import type { ScreenSubject } from '@/lib/screen-types'
import { PAPEIS_KEY, INIT_PAPEIS, REFERENCIA, ORIGEM, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { layoutGraph, titleLineCount, type FlowNode as LNode, type FlowNodeType } from '@/lib/flow-layout'
import { exportFlow, type FlowExportFormat, type ExportModel, type ExportNode, type ExportEdge } from '@/lib/flow-export'
import { apiFetch } from '@/lib/http'
import { cn } from '@/lib/utils'

/** Preferência de painel recolhido (por usuário desta máquina). */
const PANEL_KEY = 'nxt:workflow:panel-collapsed'

export const WORKFLOW_KINDS = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ADITIVO', label: 'Aditivo' },
  { value: 'PARCEIRO', label: 'Parceiro' },
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
  graph?: ProcessFormSchema['graph']
}

const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }
const ENTITY_KIND_LABEL: Record<string, string> = { EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato' }
const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'
const isActivity = (t: NType) => t === 'userTask' || t === 'serviceTask'
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
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(initial?.positions ?? {})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [exporting, setExporting] = useState<FlowExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { screens } = useScreens()
  const resolvePapel = useCallback((id: string) => papeis.entries.find((p) => p.id === id)?.label, [papeis.entries])

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const selected = selectedId ? nodeById[selectedId] : null

  const hasManual = Object.keys(positions).length > 0
  const layout = useMemo(() => layoutGraph({ nodes: nodes.map(toLNode), edges, startId: nodes.find((n) => n.type === 'start')?.id ?? 'Start_1' }, hasManual ? positions : undefined), [nodes, edges, positions, hasManual])

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

  const setPosition = useCallback((id: string, pos: { x: number; y: number }) => setPositions((prev) => ({ ...prev, [id]: pos })), [])
  const organize = useCallback(() => setPositions({}), [])

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
    setPositions((prev) => { if (!prev[id]) return prev; const n = { ...prev }; delete n[id]; return n })
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  const setEdge = useCallback((edgeId: string, patch: Partial<EEdge>) => {
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)))
  }, [])

  const persist = useCallback(async (): Promise<string> => {
    const bpmnXml = generateBpmn(buildWfGraph(nodes, edges))
    const steps = nodes.filter((n) => isActivity(n.type) && n.step).map((n) => ({ ...n.step!, stepId: n.id, stepName: n.step!.stepName, stepType: n.type as 'userTask' | 'serviceTask' }))
    // mantém só posições de nós existentes
    const pos = Object.fromEntries(Object.entries(positions).filter(([id]) => nodes.some((n) => n.id === id)))
    // grafo do editor (fonte de verdade da autoria; sobrevive a rascunhos incompletos)
    const graph: ProcessFormSchema['graph'] = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name })),
      edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition || undefined, isDefault: e.isDefault, label: e.label })),
    }
    const formSchema: ProcessFormSchema = { steps, positions: Object.keys(pos).length ? pos : undefined, graph }
    const body = JSON.stringify({ name: name.trim(), description: description.trim() || undefined, bpmnXml, formSchema, kind: kind || undefined })
    if (editing) {
      const res = await apiFetch(`/api/processes/${initial!.id}`, { method: 'PATCH', body })
      if (!res.ok) throw new Error('Erro ao salvar')
      return initial!.id
    }
    const res = await apiFetch(`/api/processes`, { method: 'POST', body })
    if (!res.ok) throw new Error('Erro ao salvar')
    return (await res.json()).id as string
  }, [editing, initial, name, description, kind, nodes, edges, positions])

  const handleSaveDraft = useCallback(async () => {
    if (!name.trim()) { alert('Dê um nome ao workflow antes de salvar.'); return }
    setSaving(true)
    try { const id = await persist(); router.push(`/processes/${id}/edit`) }
    catch (err) { alert('Não foi possível salvar o workflow.'); console.error(err) }
    finally { setSaving(false) }
  }, [name, persist, router])

  const handleActivate = useCallback(async () => {
    if (!name.trim()) { alert('Dê um nome ao workflow antes de ativar.'); return }
    if (activityCount === 0) { alert('Adicione ao menos uma atividade antes de ativar.'); return }
    setActivating(true)
    try {
      const id = await persist()
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) { const e = await res.json().catch(() => null); alert(e?.message || 'Não foi possível ativar o workflow.'); router.push(`/processes/${id}`); return }
      router.push(`/processes/${id}`)
    } catch (err) { alert('Não foi possível ativar o workflow.'); console.error(err) }
    finally { setActivating(false) }
  }, [name, activityCount, persist, router])

  // Monta o modelo do grafo (posições + textos) para o exportador desenhar em 2D.
  const buildExportModel = useCallback((): ExportModel => {
    const enodes: ExportNode[] = nodes.map((n) => {
      const p = layout.nodes[n.id]
      const base = { id: n.id, type: n.type, x: p.x, y: p.y, w: p.w, h: p.h }
      if (isActivity(n.type)) {
        const step = n.step
        const role = step?.executor?.papelId ? (resolvePapel(step.executor.papelId) ?? 'Responsável') : null
        const connector = CONNECTORS.find((c) => c.value === step?.connector)?.label
        const due = dueText(step)
        const meta = [n.type === 'serviceTask' ? (connector ?? 'Sem ação') : (role ?? 'Sem executor')]
        if (due) meta.push(due)
        return { ...base, name: step?.stepName || 'Sem nome', typeLabel: n.type === 'serviceTask' ? 'Ação automática' : 'Tarefa', meta }
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
    return { width: layout.width, height: layout.height, nodes: enodes, edges: eedges }
  }, [nodes, edges, layout, nodeById, resolvePapel])

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
          {activityCount > 0 && <Badge variant="secondary" className="text-xs">{activityCount} atividade{activityCount !== 1 ? 's' : ''}</Badge>}
          {hasManual && (
            <Button variant="ghost" size="sm" onClick={organize} title="Realinhar tudo automaticamente"><Wand2 className="h-4 w-4" />Organizar</Button>
          )}
          {exportError && <span className="text-[11px] text-destructive font-medium">{exportError}</span>}
          <ExportMenu exporting={exporting} disabled={saving || activating} onExport={handleExport} />
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving || activating}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar rascunho</Button>
          <Button size="sm" onClick={handleActivate} disabled={saving || activating}>{activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Ativar workflow</Button>
        </div>
      </div>

      {/* Canvas + Inspetor */}
      <div className="flex flex-1 overflow-hidden">
        <FlowCanvas canvasRef={canvasRef} nodes={nodes} edges={edges} layout={layout} selectedId={selectedId} onSelect={setSelectedId} onConnect={onConnect} onCreateConnected={onCreateConnected} onDeleteEdge={onDeleteEdge} onDeleteNode={removeNode} onSetPosition={setPosition} resolvePapel={resolvePapel} />
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
              <ActivityInspector key={selected.id} node={selected} nodes={nodes} edges={edges} screens={screens} papeis={papeis} onPatchStep={(p) => patchStep(selected.id, p)} onChangeType={(t) => changeNodeType(selected.id, t)} onRemove={() => removeNode(selected.id)} />
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
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Canvas ────────────────────────────────────────────────────────────────── */

const STEP_TONE: Record<string, string> = {
  userTask: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  serviceTask: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
}

function FlowCanvas({ canvasRef, nodes, edges, layout, selectedId, onSelect, onConnect, onCreateConnected, onDeleteEdge, onDeleteNode, onSetPosition, resolvePapel }: {
  canvasRef: React.RefObject<HTMLDivElement | null>
  nodes: ENode[]; edges: EEdge[]; layout: ReturnType<typeof layoutGraph>
  selectedId: string | null; onSelect: (id: string | null) => void
  onConnect: (from: string, to: string) => void
  onCreateConnected: (from: string, type: AddType) => void
  onDeleteEdge: (edgeId: string) => void
  onDeleteNode: (id: string) => void
  onSetPosition: (id: string, pos: { x: number; y: number }) => void
  resolvePapel: (id: string) => string | undefined
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
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const fit = () => {
      const availW = el.clientWidth - 24, availH = el.clientHeight - 24
      if (availW <= 0 || availH <= 0) return
      // só REDUZ (nunca amplia) e nunca abaixo de 0.5, senão vira ilegível — aí rola.
      setScale(Math.max(0.5, Math.min(1, availW / layout.width, availH / layout.height)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.width, layout.height])
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
    <div ref={scrollRef} className="flex-1 min-w-0 min-h-0 overflow-auto bg-muted/20 [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px]"
      onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-node-id]')) onSelect(null) }}>
      {/* espaçador com o tamanho JÁ ESCALADO: mantém as barras de rolagem corretas */}
      <div style={{ width: layout.width * scale, height: layout.height * scale, minWidth: '100%' }}>
      <div ref={canvasRef} className="relative" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <svg className="absolute inset-0 overflow-visible" style={{ width: layout.width, height: layout.height }}>
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
              <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge((h) => (h === e.id ? null : h))}>
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
              <FlowNodeView node={n} selected={n.id === selectedId} onClick={() => onSelect(n.id)} resolvePapel={resolvePapel} />
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
      {([['userTask', 'Tarefa', UserSquare, 'text-sky-600 dark:text-sky-400'], ['serviceTask', 'Ação automática', Zap, 'text-amber-600 dark:text-amber-400'], ['exclusiveGateway', 'Decisão (ou/ou)', GitBranch, 'text-violet-600 dark:text-violet-400'], ['parallelGateway', 'Paralelo (e/e)', GitMerge, 'text-rose-600 dark:text-rose-400']] as const).map(([t, lbl, Icon, cls]) => (
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

function FlowNodeView({ node, selected, onClick, resolvePapel }: { node: ENode; selected: boolean; onClick: () => void; resolvePapel: (id: string) => string | undefined }) {
  if (node.type === 'start' || node.type === 'end') {
    const Icon = node.type === 'start' ? CircleDot : CheckCircle2
    return <div className="w-full h-full rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-sm text-emerald-600 dark:text-emerald-400 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold"><Icon className="h-4 w-4" />{node.name}</div>
  }
  if (node.type === 'exclusiveGateway' || node.type === 'parallelGateway') {
    const isExcl = node.type === 'exclusiveGateway'
    const isFork = !!node.name // fork tem rótulo; junção é o losango pequeno
    const tone = isExcl ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/40' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/40'
    const Icon = isExcl ? GitBranch : GitMerge
    if (!isFork) {
      return <button onClick={onClick} className={cn('w-full h-full rounded-lg border flex items-center justify-center transition-all rotate-45', tone, selected && 'ring-2 ring-primary/30')} title="Reencontro"><Icon className="h-3.5 w-3.5 -rotate-45" /></button>
    }
    return (
      <button onClick={onClick} className={cn('w-full h-full rounded-xl border shadow-sm flex items-center gap-2 px-3 text-left transition-all hover:shadow-md', tone, selected ? 'ring-2 ring-primary/30' : '')}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-[12px] font-semibold leading-tight truncate">{node.name}</span>
      </button>
    )
  }
  // atividade — card em vidro (sem thumbnail-esqueleto), acento no topo pela cor do tipo
  const type = node.type
  const tone = STEP_TONE[type]
  const Icon = type === 'serviceTask' ? Zap : UserSquare
  const step = node.step
  const role = step?.executor?.papelId ? (resolvePapel(step.executor.papelId) ?? 'Responsável') : null
  const connector = CONNECTORS.find((c) => c.value === step?.connector)?.label
  const due = dueText(step)
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
          <MetaRow icon={type === 'serviceTask' ? <Zap className="h-3 w-3" /> : <User className="h-3 w-3" />} text={type === 'serviceTask' ? (connector ?? 'Sem ação') : (role ?? 'Sem executor')} />
          {due && <MetaRow icon={<Clock className="h-3 w-3" />} text={due} />}
        </div>
      </div>
    </button>
  )
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

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 flex items-center gap-1">{label}{required && <span className="text-destructive">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

function ActivityInspector({ node, nodes, edges, screens, papeis, onPatchStep, onChangeType, onRemove }: {
  node: ENode; nodes: ENode[]; edges: EEdge[]; screens: Screens; papeis: Papeis
  onPatchStep: (patch: Partial<StepFormSchema>) => void; onChangeType: (t: 'userTask' | 'serviceTask') => void; onRemove: () => void
}) {
  const step = node.step!
  const type = node.type as 'userTask' | 'serviceTask'
  const meta = type === 'serviceTask' ? { label: 'Ação automática', tone: STEP_TONE.serviceTask, Icon: Zap } : { label: 'Tarefa do usuário', tone: STEP_TONE.userTask, Icon: UserSquare }
  const entityWord = SUBJECT_ENTITY[step.screenSubject ?? ''] ?? 'entidade'

  // variáveis de etapas ANTERIORES (predecessoras topológicas simples)
  const availableVars = useMemo(() => {
    const preds = new Set<string>()
    let frontier = edges.filter((e) => e.to === node.id).map((e) => e.from)
    const seen = new Set<string>()
    while (frontier.length) {
      const next: string[] = []
      for (const id of frontier) { if (seen.has(id)) continue; seen.add(id); preds.add(id); for (const e of edges.filter((x) => x.to === id)) next.push(e.from) }
      frontier = next
    }
    const out: Array<{ name: string; label: string }> = []
    const s = new Set<string>()
    const add = (n: string, l: string) => { if (n && !s.has(n)) { s.add(n); out.push({ name: n, label: l }) } }
    for (const p of nodes.filter((n) => preds.has(n.id) && n.step)) {
      const st = p.step!
      const m = CONNECTORS.find((c) => c.value === st.connector)
      if (m) for (const o of m.outputs) add(o, `${o} · saída de ${m.label}`)
      if (st.screenRef && st.entityMode === 'CREATE' && st.screenSubject) add(st.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId', `criado em ${st.stepName || 'etapa'}`)
    }
    return out
  }, [edges, nodes, node.id])

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

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', meta.tone)}><meta.Icon className="h-3 w-3" />{meta.label}</span>
        <button onClick={onRemove} title="Remover atividade" className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex gap-1 text-xs">
          {(['userTask', 'serviceTask'] as const).map((t) => (
            <button key={t} type="button" onClick={() => onChangeType(t)}
              className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors', type === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
              {t === 'serviceTask' ? 'Ação automática' : 'Tarefa'}
            </button>
          ))}
        </div>

        <Field label={type === 'serviceTask' ? 'Nome da ação' : 'Tarefa do usuário'} required>
          <Input className="h-8 text-sm" placeholder={type === 'serviceTask' ? 'Ex.: Cadastrar contrato' : 'Ex.: Preencher dados'} value={step.stepName} onChange={(e) => onPatchStep({ stepName: e.target.value })} />
        </Field>

        <Field label="Instruções para execução" hint="Aparece para o executor ao abrir a tarefa.">
          <Textarea className="text-sm min-h-[64px]" placeholder="Oriente quem vai executar…" value={step.instructions ?? ''} onChange={(e) => onPatchStep({ instructions: e.target.value })} />
        </Field>

        {type === 'userTask' ? (
          <>
            <Field label="Executor (papel)" required hint={papeisPessoa.length === 0 ? 'Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).' : undefined}>
              <Select value={executor?.papelId ?? ''} onValueChange={pickPapel}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione o executor" /></SelectTrigger>
                <SelectContent>
                  {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {executor && execOrigem && execOrigem !== ORIGEM.ORG && (
              <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                <label className="text-[11px] text-muted-foreground block">Responsável de qual {entityKindLabel(execOrigem)}?</label>
                <div className="flex gap-1 text-[11px]">
                  {(['FIXA', 'VARIAVEL'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setExec({ mode: m })} className={cn('rounded px-2 py-0.5 border transition-colors', executor.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>{m === 'FIXA' ? 'Entidade fixa' : 'Da variável'}</button>
                  ))}
                </div>
                {executor.mode === 'FIXA' ? (
                  <EntitySelect entityType={execOrigem as EntityKind} value={executor.entityId} onChange={(id) => setExec({ entityId: id, entityVar: undefined })} placeholder={`Selecionar ${entityKindLabel(execOrigem)}…`} />
                ) : (
                  <Select value={executor.entityVar || 'none'} onValueChange={(v) => setExec({ entityVar: v === 'none' ? undefined : v, entityId: undefined })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Variável com o id…" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">— escolha a variável —</SelectItem>{availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            )}
            <Field label="Tela do formulário" hint={step.screenRef ? `A atividade cria/edita o ${entityWord}.` : 'Opcional — pode ser só uma etapa de aprovação.'}>
              <Select value={step.screenRef || 'none'} onValueChange={pickScreen}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem tela" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sem tela</SelectItem>{entityScreens.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{SUBJECT_LABEL[s.subjectType] ?? s.subjectType} · {s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {step.screenRef && (
              <div className="flex gap-1 text-xs">
                {([['CREATE', `Criar ${entityWord}`], ['EDIT', `Editar ${entityWord}`]] as const).map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => onPatchStep({ entityMode: m, entityVar: m === 'EDIT' ? step.entityVar : undefined })} className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors', (step.entityMode ?? 'CREATE') === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>{lbl}</button>
                ))}
              </div>
            )}
            <Field label="Prazo (SLA)" required hint="Conta no expediente comercial e pula fins de semana e feriados.">
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
            </Field>
          </>
        ) : (
          <Field label="Ação automática (conector)" hint="O motor executa esta ação sozinho — grava a entidade de verdade.">
            <Select value={step.connector || 'none'} onValueChange={(v) => onPatchStep({ connector: v && v !== 'none' ? v : undefined })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhuma (só passa)" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nenhuma (só passa)</SelectItem>{CONNECTORS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
      </div>
    </div>
  )
}

function GatewayInspector({ node, edges, onPatchNode, onSetEdge }: {
  node: ENode; edges: EEdge[]; onPatchNode: (patch: Partial<ENode>) => void; onSetEdge: (edgeId: string, patch: Partial<EEdge>) => void
}) {
  const isExcl = node.type === 'exclusiveGateway'
  const outs = edges.filter((e) => e.from === node.id)
  const tone = isExcl ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
  const Icon = isExcl ? GitBranch : GitMerge
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', tone)}><Icon className="h-3 w-3" />{isExcl ? 'Decisão (ou/ou)' : 'Paralelo (e/e)'}</span>
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
