'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Zap, Loader2, AlertTriangle, Redo2, Undo2, Info, LayoutGrid, DoorOpen } from 'lucide-react'
import {
  generateBpmn, compileBpmn, validarDesenho, validarAtividades, validarTelasDasAtividades,
  bloqueantes, grafoParaBlocos, novoFluxo, pendenciasDosBlocos, validarOrigemDoRegistro, validarExecutores, validarExecutoresFixos, validarQuemInicia, listarEscolhas,
  acharItem, inserirItem, removerItem, atualizarItem, moverItem, SUFIXO_REENCONTRO,
  lerDesenho, podarDesenho, lerDesenhoV2, blocosParaDesenho, desenhoParaBlocos, atributosNoDesenho, semIdsReservados, assinaturaDoQueExecuta,
  type ProblemaAtivacao, type WfGraph, type WfNode, type WfEdge, type FluxoBlocos,
  type GrafoGerado, type PontoDeInsercao,
  gruposDeVinculo, religarVinculos, listarAtividades as listarAtivs, type ItemAtividade,
} from '@nxt/workflow-core'
import type { StepFormSchema, ProcessFormSchema, DesenhoBpmn, DesenhoV2, FormaDesenho, PontaDaSeta } from '@nxt/types'
import { findConnector } from '@nxt/types'
import { Button } from '@/components/ui/button'
import { useEntityLabels, type EntityKind } from '@/components/ui/entity-select'
import { useScreens } from '@/hooks/use-screens'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { PAPEIS_KEY, INIT_PAPEIS, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { layoutGraph, nodeSize, LANE_SEM_RESPONSAVEL, type FlowNode as LNode, type FlowNodeType } from '@/lib/flow-layout'
import { GRADE, abrirEspaco, adicionarRaia, apagarSeta, completarPosicoes, desenhoInicial, larguraDaInsercao, ligar, organizar, pontasDaSeta, religar, religarSaida, soltarForma, atualizarSeta, apagarForma, pendenciaDaRecusa, type PatchDasPontas } from '@/lib/desenho-bpmn'
import { exportFlow, type FlowExportFormat, type ExportModel, type ExportNode, type ExportEdge } from '@/lib/flow-export'
import { apiFetch, apiJson } from '@/lib/http'
import { ProcessHistoryDrawer } from './process-history-drawer'
import { GatewayGlyph, PendenciasPill, type Pendencia } from './flow-shared'
import { EXECUTOR_CONTRATO_DO_PROCESSO, EXECUTOR_QUEM_INICIOU, nasceDeContrato, tipoDeWorkflowValido, TIPO_DE_WORKFLOW_PADRAO, type QuemInicia } from '@nxt/types'
import { QuemIniciaPill } from './quem-inicia'
import { GavetaDoBloco, comNomes, novoItem, type NovoItem, type Simulacao } from './workflow-blocos'
import { NoticeDialog } from '@/components/ui/confirm-dialog'
import { aoSairDoEditor, destinoInterno } from '@/lib/sair-do-editor'
import { SairSemSalvarDialog } from './sair-sem-salvar'
import { ATRIBUTO_GAVETA, GavetaLateral } from './desenho-bpmn/gaveta'
import { EditorDaSeta, type PatchDaSeta } from './desenho-bpmn/painel-da-seta'
import { GavetaDoLosango } from './desenho-bpmn/gaveta-losango'
import { camposDasTelasDasAtividades } from '@/lib/flow-conditions'
import { CanvasBpmn, modeloDeExportacao, type AlvoDaGaveta } from './desenho-bpmn/canvas-bpmn'
import { PaletaBpmn, type Conector } from './desenho-bpmn/paleta'
import { ControlesDoDesenho, MenuMais, NomeNoTopo, SobreDoWorkflow, tamanhoDoNome, useNivelDoTopo } from './desenho-bpmn/topo'
import { cn } from '@/lib/utils'
import { dueText, entityKindLabel, type EEdge, type ENode } from './editor-comum'
import { PerguntasDaEtapa } from './perguntas-da-etapa'
import { aplicarExecutorDasRaias, raiaDaForma } from '@/lib/editor-bizagi/raias'
import { formaNova, type GrupoItem, type GrupoPaleta, type ItemCatalogo } from '@/lib/editor-bizagi/catalogo'
import { alturaPeloDesenho, caixaDaForma } from '@/lib/editor-bizagi/formas-do-canvas'
import { adicionarFase, adicionarPiscinaExterna, atualizarPiscinaExterna, layoutDe, mudarOrientacao, prazoDaFase, redimensionarForma, removerFase, removerPiscinaExterna, renomearFase, rotularMensagem, apagarMensagem, pontasDaMensagem } from '@/lib/editor-bizagi/layout'
import {
  PISCINA_DO_PROCESSO, comConfig, executorDaRaia, formasNaFase, gavetaDaForma, gavetaDoAlvo, nomeDaRaia, nomeDoElemento, restaurarAlvo, restaurarDesenhoDoBloco,
  restaurarPasso, rotuloDaSeta, setasParaGravar, tarefasNaRaia, workflowsAtivos, type WorkflowDaLista,
} from '@/lib/editor-bizagi/gavetas'
import { GavetaFase, GavetaFormaNova, GavetaMensagem, GavetaPiscinaExterna, GavetaPiscinaPrincipal, GavetaRaia, GavetaSeta, type PatchDaForma } from './desenho-bpmn/gavetas'
import { alinharNaTela, conteudoDasFormas, faixasDoDesenho } from '@/lib/editor-bizagi/faixas'
import type { ModoAlinhar, Orientacao } from '@/lib/editor-bizagi/geometria'
import { caixaReal, lugarDoProximo } from '@/lib/editor-bizagi/proximo'
import { removerCaminhoComVinculos, secaoDaPendencia } from '@/lib/pendencias-do-editor'


export const WORKFLOW_KINDS = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ADITIVO', label: 'Aditivo' },
  /* DISTRATO e nao "RESCISAO": e o nome que o motor ja usa no conector
     `contracts.distrato`. O rotulo na tela e "Encerramento" porque cobre tanto o
     fim previsto quanto a rescisao. */
  { value: 'DISTRATO', label: 'Encerramento' },
] as const

type NType = FlowNodeType


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

const isActivity = (t: NType) => t === 'userTask' || t === 'serviceTask'

/** A API recusou uma gravação que apagaria grande parte do desenho (409). Não é falha:
 *  é a guarda pedindo confirmação consciente. Ver `update()` em processes.service. */
class ReducaoDestrutiva extends Error {}

/** Retrato do DESENHO para desfazer/refazer. `desenho` (posições e raias) entra junto:
 *  mover uma forma também se desfaz. */
interface Retrato {
  /** o DESENHO (formas, setas, posições, raias) — fonte da verdade desde o desenho livre */
  doc: DesenhoV2
  steps: Record<string, StepFormSchema>
  laneOrder: string[]
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

/* ─── modelo inicial / conversões ──────────────────────────────────────────── */

const INICIO_ID = 'Start_1'
const FIM_ID = 'End_1'
/** Fluxo vazio para quem precisa de um enquanto o desenho não cabe em blocos (o canvas). */
const FLUXO_VAZIO = novoFluxo(INICIO_ID, FIM_ID)
/** Recusas do conversor que são "falta desenhar" (o resto é "o motor não executa"). */
const TIPOS_DESENHO_INCOMPLETO = new Set(['fora-do-fluxo', 'sem-saida', 'inicio-desligado', 'inicio-fim'])


const passoVazio = (id: string, tipo: 'userTask' | 'serviceTask'): StepFormSchema => ({ stepId: id, stepName: '', fields: [], stepType: tipo })

/** Item da paleta que já existia antes da paleta Bizagi (Tarefa, Ação automática, Escolha,
 *  Ao mesmo tempo e o Inclusivo, que é a Escolha "todos"): nasce pelo caminho de sempre
 *  (`novoItem`). Os demais nascem por `formaNova`. */
function novoItemDaPaleta(item: ItemCatalogo): NovoItem | null {
  if (item.tipo === 'serviceTask') return 'serviceTask'
  if (item.tipo === 'userTask' && item.variante === 'usuario') return 'userTask'
  if (item.tipo === 'exclusiveGateway') return 'escolha'
  if (item.tipo === 'parallelGateway') return 'paralelo'
  return null
}
const PREFIXO_DO_GRUPO: Record<GrupoItem, string> = {
  inicio: 'Inicio', tarefa: 'Node', subprocesso: 'Subprocesso', escolha: 'Losango', paralelo: 'Losango', losango: 'Losango', intermediario: 'Evento', fim: 'Fim',
}
const idDaFormaNova = (item: ItemCatalogo) => `${PREFIXO_DO_GRUPO[item.grupo]}_${Math.random().toString(36).slice(2, 9)}`
/** A forma que o item da paleta (ou do próximo item) cria: os de sempre nascem por `novoItem`
 *  (ids de bloco/atividade), os demais por `formaNova`. */
function formaDaPaleta(item: ItemCatalogo): FormaDesenho {
  const tipo = novoItemDaPaleta(item)
  if (!tipo) return formaNova(item, idDaFormaNova(item))
  const novo = novoItem(tipo)
  return novo.kind === 'atividade'
    ? { id: novo.id, tipo: novo.tipo }
    : novo.kind === 'escolha' ? { id: novo.id, tipo: 'exclusiveGateway', modo: item.modo ?? novo.modo } : { id: novo.id, tipo: 'parallelGateway' }
}
const ESCOLHIDAS_INICIAIS: Record<GrupoPaleta, number> = { inicio: 0, tarefa: 0, escolha: 0, paralelo: 0, fim: 0 }

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
  doc: DesenhoV2
  steps: Record<string, StepFormSchema>
}

/** Desenho de um grafo antigo que não cabe em blocos (desenho livre de antes): agora abre
 *  EDITÁVEL; a ativação explica se não converter. */
function docDoGrafo(g: { nodes: ENode[]; edges: EEdge[] }, v1: DesenhoBpmn | null): DesenhoV2 {
  const formas: FormaDesenho[] = g.nodes.map((n) => {
    const tipo = (n.type === 'inclusiveGateway' ? 'exclusiveGateway' : n.type) as FormaDesenho['tipo']
    const f: FormaDesenho = { id: n.id, tipo }
    if (n.type === 'inclusiveGateway') f.modo = 'todos'
    if (n.name && !isActivity(n.type)) f.nome = n.name
    return f
  })
  const setas = g.edges.map((e) => ({
    id: e.id, de: e.from, para: e.to,
    ...(e.condition ? { condition: e.condition } : {}),
    ...(e.conditionSpec ? { conditionSpec: e.conditionSpec } : {}),
    ...(e.label ? { rotulo: e.label } : {}),
    ...(e.isDefault ? { padrao: true as const } : {}),
  }))
  return { versao: 2, formas, setas, posicoes: v1?.posicoes ?? {}, raias: v1?.raias ?? [] }
}

/** Desenho v2 gravado vence; senão, nasce dos blocos (com as posições do desenho v1), ou
 *  de um grafo antigo (linear vira blocos; o resto entra como desenho livre). */
function estadoInicial(initial?: FlowInitial): EstadoInicial {
  const steps = Object.fromEntries((initial?.steps ?? []).map((s) => [s.stepId, s]))
  const vazio = () => blocosParaDesenho(novoFluxo(INICIO_ID, FIM_ID))
  if (!initial) return { doc: vazio(), steps }
  const v2 = lerDesenhoV2(initial.desenho)
  // gravado antes da troca do id reservado (ver `semIdsReservados`)
  if (v2) return { doc: semIdsReservados(v2), steps }
  const v1 = lerDesenho(initial.desenho)
  if (initial.blocos?.itens) return { doc: blocosParaDesenho(initial.blocos, v1), steps }
  const g = grafoGravado(initial)
  if (!g) return { doc: vazio(), steps }
  const f = grafoParaBlocos(g.nodes, g.edges)
  return { doc: f ? blocosParaDesenho(f, v1) : docDoGrafo(g, v1), steps }
}

/** O grafo do desenho — com os nomes que moram nos passos. */
function comPassos(g: GrafoGerado, steps: Record<string, StepFormSchema>): { nodes: ENode[]; edges: EEdge[] } {
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
  const somenteLeitura = false
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  /* Todo workflow tem tipo (PO, 07/11/2026). Novo nasce Contrato; um antigo sem tipo, ou
     com o legado Parceiro, abre como Contrato — é o que a API passa a exigir ao gravar. */
  const [kind, setKind] = useState<string>(tipoDeWorkflowValido(initial?.kind) ? initial!.kind! : TIPO_DE_WORKFLOW_PADRAO)
  const [quemInicia, setQuemInicia] = useState<QuemInicia | undefined>(initial?.quemInicia)
  /* A AUTORIA é o fluxo em blocos + a configuração de cada atividade. Nós e setas não
     são editados: são gerados disso — é o que impede as formas que travavam o motor. */
  const [doc, setDoc] = useState<DesenhoV2>(inicio.doc)
  const [steps, setSteps] = useState<Record<string, StepFormSchema>>(inicio.steps)
  const [laneOrder, setLaneOrder] = useState<string[]>(initial?.laneOrder ?? [])
  /* DESENHO BPMN (27/10/2026): posições das formas e raias visuais — uma projeção do fluxo,
     gravada em `formSchema.desenho`. Sem desenho gravado, nasce organizado e com raias
     sugeridas pelos responsáveis (ver "abertura do desenho", mais abaixo). */
  /* DESENHO LIVRE (30/10/2026): o desenho é a fonte da verdade; os BLOCOS são derivados
     dele (`desenhoParaBlocos`). `setFluxo` aplica uma mudança de bloco e a devolve ao
     desenho (`blocosParaDesenho`, preservando ids e posições) — assim as ações de sempre
     (painéis, gavetas) seguem iguais. Sem conversão (desenho incompleto), `fluxo` é null. */
  const conversao = useMemo(() => desenhoParaBlocos(doc, { nomeDe: (id) => steps[id]?.stepName?.trim() || '' }), [doc, steps])
  const fluxo = conversao.ok ? conversao.fluxo : null
  const setFluxo = useCallback((up: FluxoBlocos | null | ((f: FluxoBlocos | null) => FluxoBlocos | null)) => {
    setDoc((d) => {
      const c = desenhoParaBlocos(d)
      const atual = c.ok ? c.fluxo : null
      const novo = typeof up === 'function' ? up(atual) : up
      if (!novo || novo === atual) return d
      // só atributos (condição, pergunta, nome…): vão direto para as formas/setas, sem refazer
      return (atual && atributosNoDesenho(d, atual, novo)) ?? blocosParaDesenho(novo, d)
    })
  }, [])
  /* Posições e raias (o "desenho v1" de antes): lidas do desenho; null quando ainda não há
     nenhuma (o desenho nasce organizado — ver "abertura do desenho"). */
  const desenho = useMemo<DesenhoBpmn | null>(() => (Object.keys(doc.posicoes).length || doc.raias.length
    ? { versao: 1, posicoes: doc.posicoes, raias: doc.raias } : null), [doc.posicoes, doc.raias])
  const setDesenho = useCallback((up: DesenhoBpmn | null | ((d: DesenhoBpmn | null) => DesenhoBpmn | null)) => {
    setDoc((d) => {
      const v1: DesenhoBpmn | null = Object.keys(d.posicoes).length || d.raias.length ? { versao: 1, posicoes: d.posicoes, raias: d.raias } : null
      const novo = typeof up === 'function' ? up(v1) : up
      return !novo || novo === v1 ? d : { ...d, posicoes: novo.posicoes, raias: novo.raias }
    })
  }, [])
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
  /* Forma cuja gaveta (escolha, "ao mesmo tempo", losango solto) está aberta. No desenho,
     selecionar NÃO abre: só o duplo clique, o Enter ou "Parametrizar" (`abrir`). A gaveta
     vale enquanto a forma seguir selecionada. A atividade usa `configId`. */
  const [gavetaDe, setGavetaDe] = useState<string | null>(null)
  /* Gaveta NOVA aberta (spec §3): raia, fase, piscinas, fluxo de mensagem e as formas que não
     são etapa nem escolha (início, fim, intermediários, subprocesso…). Mesma regra da etapa:
     ao vivo; Cancelar/X/Esc voltam ao retrato da abertura; Aplicar e o resto mantêm. */
  const [alvoNovo, setAlvoNovo] = useState<AlvoDaGaveta | null>(null)
  const [configSecao, setConfigSecao] = useState<string | undefined>(undefined)
  /* Painel de pendências de ativação (aberto pela pílula ou pelo "Ativar"). */
  const [pendAberto, setPendAberto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [exporting, setExporting] = useState<FlowExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  /* ─── Desfazer / refazer ──────────────────────────────────────────────────────
     Guarda RETRATOS da autoria (fluxo, passos e ordem das raias). Nome, descrição e
     tipo ficam de fora de propósito: são campos de texto, e o navegador já desfaz
     digitação neles — capturá-los faria um Ctrl+Z "engolir" uma letra.
     O retrato é tirado por OBSERVAÇÃO do estado, não em cada ponto de mutação. */
  const [historia, setHistoria] = useState<Retrato[]>(() => [{ doc: inicio.doc, steps: inicio.steps, laneOrder: initial?.laneOrder ?? [] }])
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

  /* O grafo é o do DESENHO (formas e setas como desenhadas). Escolha "todos" aparece com o
     losango inclusivo, como sempre. */
  const grafoDoDoc = useMemo<GrafoGerado>(() => ({
    nodes: doc.formas.map((f) => ({
      id: f.id, type: (f.tipo === 'exclusiveGateway' && f.modo === 'todos' ? 'inclusiveGateway' : f.tipo) as GrafoGerado['nodes'][number]['type'],
      name: f.tipo === 'exclusiveGateway' || f.tipo === 'parallelGateway' ? (f.pergunta ?? f.nome) : f.nome,
    })),
    edges: doc.setas.map((x) => ({ id: x.id, from: x.de, to: x.para, condition: x.condition, conditionSpec: x.conditionSpec, label: x.rotulo, isDefault: x.padrao })),
  }), [doc.formas, doc.setas])
  const { nodes, edges } = useMemo(() => comPassos(grafoDoDoc, stepsEfetivos), [grafoDoDoc, stepsEfetivos])

  /* Nomes das entidades que hospedam os papéis (unidade, empresa, parceiro…) — o cartão
     mostra QUAL unidade executa, não só o papel. Só carrega os tipos que o fluxo usa. */
  const tiposEntidade = useMemo(() => {
    const s = new Set<EntityKind>()
    for (const n of nodes) { const t = n.step?.executor?.entityType; if (t && t !== 'ORG') s.add(t as EntityKind) }
    // o executor padrão das raias também mostra o nome da entidade
    for (const ra of doc.raias) { const t = ra.executor?.entityType; if (t && t !== 'ORG') s.add(t as EntityKind) }
    return Array.from(s)
  }, [nodes, doc.raias])
  const resolveEntidade = useEntityLabels(tiposEntidade)

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const grafo = useMemo<GrafoGerado | null>(
    () => ({ nodes: nodes.map((n) => ({ id: n.id, type: n.type as GrafoGerado['nodes'][number]['type'], name: n.name })), edges: edges as GrafoGerado['edges'] }),
    [nodes, edges])
  const desenhoVisto = useMemo(() => (desenho && grafo && grafo.nodes.some((n) => !desenho.posicoes[n.id])
    ? completarPosicoes(grafo, desenho)
    : desenho), [desenho, grafo])

  /* Altura de cada forma como o canvas a desenha (tarefa redimensionada = tamanho gravado):
     a raia de uma forma é achada pelo centro dela, e canvas, gaveta e Salvar têm de concordar. */
  const tamanhos = layoutDe(doc).tamanhos
  const orientacao = layoutDe(doc).orientacao
  const alturaDe = useMemo(() => alturaPeloDesenho(nodes, tamanhos), [nodes, tamanhos])

  /* As etapas COMO VÃO SER GRAVADAS: a tarefa que herda da raia já leva o executor dela
     (mesma conta do Salvar, mesmas alturas do canvas, `alturaDe`). Pendências, cartão e gaveta leem daqui. */
  const nodesEfetivos = useMemo(() => {
    if (!desenhoVisto) return nodes
    const entrada = nodes.filter((n) => n.type === 'userTask' && n.step).map((n) => ({ ...n.step!, stepId: n.id, stepType: 'userTask' as const }))
    const saida = aplicarExecutorDasRaias(entrada, { ...doc, posicoes: desenhoVisto.posicoes, raias: desenhoVisto.raias }, alturaDe)
    const mudou = new Map(saida.flatMap((r, i) => (r !== entrada[i] ? [[r.stepId, r] as const] : [])))
    if (!mudou.size) return nodes
    return nodes.map((n) => { const r = mudou.get(n.id); return r && n.step ? { ...n, step: { ...n.step, executor: r.executor, executorDaRaia: r.executorDaRaia } } : n })
  }, [nodes, desenhoVisto, doc, alturaDe])
  const nodeEfetivoById = useMemo(() => Object.fromEntries(nodesEfetivos.map((n) => [n.id, n])), [nodesEfetivos])
  const selectedBloco = useMemo(() => {
    const it = fluxo && selectedId ? acharItem(fluxo, selectedId) : undefined
    return it && it.kind !== 'atividade' ? it : null
  }, [fluxo, selectedId])
  const configNode = configId ? nodeById[configId] : null

  /* CONDIÇÃO NA SETA (desenho livre): a seta que sai de uma Escolha abre a condição dela; o
     losango que ainda não fecha em blocos lista as setas que saem, com o mesmo editor. */
  const [setaAberta, setSetaAberta] = useState<string | null>(null)
  const formaDoDoc = useCallback((id: string) => doc.formas.find((f) => f.id === id), [doc.formas])
  const setaDoPainel = useMemo(() => {
    const seta = setaAberta ? doc.setas.find((x) => x.id === setaAberta) : undefined
    return seta && formaDoDoc(seta.de)?.tipo === 'exclusiveGateway' ? seta : null
  }, [setaAberta, doc.setas, formaDoDoc])
  const losangoSolto = useMemo(() => {
    const f = selectedId && !selectedBloco ? formaDoDoc(selectedId) : undefined
    return f?.tipo === 'exclusiveGateway' ? f : null
  }, [selectedId, selectedBloco, formaDoDoc])
  const nomeDaForma = useCallback((id: string) => {
    const f = formaDoDoc(id)
    if (f?.tipo === 'end') return 'Fim'
    return stepsEfetivos[id]?.stepName?.trim() || f?.nome?.trim() || (f?.tipo === 'exclusiveGateway' || f?.tipo === 'parallelGateway' ? 'outro losango' : 'etapa sem nome')
  }, [formaDoDoc, stepsEfetivos])
  /** Campos que a condição da seta pode testar: os das telas das etapas logo depois dela (até o
   *  próximo losango); seta sem etapa testa o mesmo que as irmãs. */
  const camposDaSeta = useCallback((seta: { id: string; de: string; para: string }) => {
    const etapasApos = (inicio: string) => {
      const ids: string[] = []
      for (let atual: string | undefined = inicio; atual && !ids.includes(atual);) {
        const f = formaDoDoc(atual)
        if (f?.tipo !== 'userTask' && f?.tipo !== 'serviceTask') break
        ids.push(atual)
        const saem = doc.setas.filter((x) => x.de === atual)
        atual = saem.length === 1 ? saem[0].para : undefined
      }
      return ids
    }
    let ids = etapasApos(seta.para)
    if (!ids.length) ids = doc.setas.filter((x) => x.de === seta.de && x.id !== seta.id).flatMap((x) => etapasApos(x.para))
    return camposDasTelasDasAtividades(ids.map((id) => stepsEfetivos[id]).filter((x): x is StepFormSchema => !!x), screens)
  }, [doc.setas, formaDoDoc, stepsEfetivos, screens])
  const aoMudarSeta = useCallback((setaId: string, p: PatchDaSeta) => setDoc((d) => atualizarSeta(d, setaId, p)), [])
  const aoMudarLosango = useCallback((id: string, patch: { pergunta?: string; modo?: 'primeiro' | 'todos' }) =>
    setDoc((d) => ({ ...d, formas: d.formas.map((f) => (f.id === id ? { ...f, ...patch } : f)) })), [])
  /** O que chega a uma forma (nomes das formas de onde saem as setas): o "Depois de …" do resumo. */
  const anterioresDe = useCallback((id: string) => [...new Set(doc.setas.filter((x) => x.para === id).map((x) => nomeDaForma(x.de)))], [doc.setas, nomeDaForma])
  /* Gaveta da ESCOLHA / "AO MESMO TEMPO" (no bloco ou o losango solto): mesma regra das outras
     — ao vivo; Cancelar, X e Esc voltam ao retrato da abertura (desenho e etapas: remover um
     caminho leva etapas e promove cópias vinculadas); Aplicar mantém. A gaveta "Caminho" de uma
     seta aberta a partir do losango solto fica dentro do mesmo retrato. */
  const chaveDoLosango = gavetaDe && (selectedBloco?.id === gavetaDe || losangoSolto?.id === gavetaDe) ? gavetaDe : null
  const retratoDoLosango = useRef<{ chave: string; doc: DesenhoV2; steps: Record<string, StepFormSchema> } | null>(null)
  if (!chaveDoLosango) retratoDoLosango.current = null
  else if (retratoDoLosango.current?.chave !== chaveDoLosango) retratoDoLosango.current = { chave: chaveDoLosango, doc, steps }
  const aplicarLosango = useCallback(() => { setGavetaDe(null); setSetaAberta(null) }, [])
  const cancelarLosango = useCallback(() => {
    const r = retratoDoLosango.current
    if (r) { setDoc((d) => restaurarDesenhoDoBloco(d, r.doc)); setSteps(r.steps) }
    setGavetaDe(null); setSetaAberta(null)
  }, [])
  /* Retrato da etapa na ABERTURA (para o Cancelar): sobrevive a uma remontagem das
     perguntas. Tirado na primeira renderização com a etapa aberta. */
  const retratoDaAbertura = useRef<{ id: string; step: StepFormSchema; type: 'userTask' | 'serviceTask' } | null>(null)
  if (!configNode?.step) retratoDaAbertura.current = null
  else if (retratoDaAbertura.current?.id !== configNode.id) {
    retratoDaAbertura.current = { id: configNode.id, step: { ...configNode.step }, type: configNode.type as 'userTask' | 'serviceTask' }
  }

  /* ─── Consultas do desenho ────────────────────────────────────────────────────
     Quem executa, em texto ("Analista de Central de Contratos", "Quem iniciou o processo"):
     o mesmo que o cartão mostra, e o que sugere e confere as raias. Ação automática é do
     "Sistema" (a mesma raia do layout automático); sem papel, não há responsável. */
  const responsavelDe = useCallback((id: string): string | undefined => {
    const n = nodeEfetivoById[id]
    if (!n) return undefined
    if (n.type === 'serviceTask') return LANE_SISTEMA
    const ex = n.type === 'userTask' ? n.step?.executor : undefined
    if (!ex?.papelId) return undefined
    const papel = resolvePapel(ex.papelId) ?? 'Responsável'
    // entidade FIXA entra no nome; "da variável"/"do contrato" muda a cada processo — fica só o papel
    const entidade = ex.mode !== 'VARIAVEL' && ex.entityId ? resolveEntidade(ex.entityType, ex.entityId) : undefined
    return entidade ? `${papel} de ${entidade}` : papel
  }, [nodeEfetivoById, resolvePapel, resolveEntidade])
  /** A raia onde a etapa está desenhada (pelo centro) e o executor padrão dela, para o "Quem faz?". */
  const raiaDaEtapa = useMemo(() => {
    if (!configId || !desenhoVisto) return undefined
    const raia = raiaDaForma({ ...doc, posicoes: desenhoVisto.posicoes, raias: desenhoVisto.raias }, configId, alturaDe)
    if (!raia) return undefined
    const ex = raia.executor
    const papel = ex?.papelId ? resolvePapel(ex.papelId) ?? 'Responsável' : undefined
    const entidade = ex && ex.mode !== 'VARIAVEL' && ex.entityId ? resolveEntidade(ex.entityType, ex.entityId) : undefined
    return { nome: raia.nome, executor: ex, rotuloExecutor: papel && (entidade ? `${papel} de ${entidade}` : papel) }
  }, [configId, desenhoVisto, doc, alturaDe, resolvePapel, resolveEntidade])
  const prazoDe = useCallback((id: string) => dueText(nodeById[id]?.step), [nodeById])
  /** Os nomes que `responsavelDe` usa já chegaram? (papéis e entidades vêm da rede) */
  const consultasProntas = useMemo(() => nodesEfetivos.every((n) => {
    const ex = n.type === 'userTask' ? n.step?.executor : undefined
    if (!ex?.papelId) return true
    if (!resolvePapel(ex.papelId)) return false
    return !(ex.mode !== 'VARIAVEL' && ex.entityId && ex.entityType && ex.entityType !== 'ORG' && !resolveEntidade(ex.entityType, ex.entityId))
  }), [nodesEfetivos, resolvePapel, resolveEntidade])

  /* Pendências de ativação AO VIVO — as MESMAS regras que a API aplica ao ativar
     (@nxt/workflow-core), recalculadas a cada mudança: consertou, o item some. */
  const pendencias = useMemo<Pendencia[]>(() => {
    const vnodes = nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name }))
    const vedges = edges.map((e) => ({ from: e.from, to: e.to, condition: e.condition, isDefault: e.isDefault }))
    const tarefas = nodesEfetivos.filter((n) => n.type === 'userTask')
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
    /* Do conversor (desenho livre): o que não monta em blocos — "o motor não executa" — e
       os avisos (losango sem efeito). A primeira forma culpada recebe a marca. */
    const doDesenho: Pendencia[] = conversao.ok
      ? conversao.avisos.map((p) => ({ tipo: p.tipo as ProblemaAtivacao['tipo'], severidade: 'aviso' as const, nodeId: p.formas[0], mensagem: p.mensagem, setas: p.setas }))
      : conversao.problemas.map((p) => ({
          tipo: p.tipo as ProblemaAtivacao['tipo'], nodeId: p.formas[0], mensagem: p.mensagem, setas: p.setas,
          grupo: TIPOS_DESENHO_INCOMPLETO.has(p.tipo) ? 'desenho' as const : 'motor' as const,
        }))
    /* O que o desenho ainda não liga (forma solta, sem saída, que não chega ao Fim). */
    const incompleto = (ps: ProblemaAtivacao[]): Pendencia[] => ps.map((p) => ({ ...p, grupo: 'desenho' as const }))
    if (!fluxo) {
      // o conversor já disse o que não fecha; do validador só entra o que ele não disse
      const ditos = new Set(doDesenho.map((p) => `${p.nodeId}`))
      return [...doDesenho, ...incompleto(validarDesenho(vnodes, vedges).filter((p) => !ditos.has(`${p.nodeId}`))), ...dasAtividades]
    }
    /* Do desenho sobra o que só o bloco sabe dizer (condição que falta, volta sem destino).
       Os pontos de reencontro gerados nunca são culpados de algo que a pessoa conserte. */
    return [
      ...doDesenho,
      ...pendenciasDosBlocos(fluxo),
      ...incompleto(validarDesenho(vnodes, vedges).filter((p) => !p.nodeId?.endsWith(SUFIXO_REENCONTRO))),
      ...dasAtividades,
    ]
  }, [conversao, fluxo, nodes, nodesEfetivos, edges, screens, kind, papeis.entries, quemInicia])

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

  /* A gaveta é um PAINEL DE PROPRIEDADES (como no Bizagi), não um modal — decisão R11 do
     desenho BPMN: o que se edita nela já vale ao vivo. Clicar noutra forma/atividade, no
     vazio do desenho, em "Salvar rascunho" ou "Ativar" com a gaveta das perguntas aberta
     APLICA (fecha como o "Aplicar") e segue. Só "Cancelar", o X e o Esc (dentro da gaveta)
     desfazem pelo retrato tirado na abertura.
     Aplicar por troca de seleção também esquece a pergunta de abertura (`configSecao`) e a
     volta para a escolha (`retornoEscolha`): elas valiam só para a gaveta que fechou. */
  const aplicarGaveta = useCallback(() => {
    setConfigId(null); setConfigSecao(undefined); setRetornoEscolha(null); setAlvoNovo(null)
  }, [])

  /* Abrir é o gesto de "quero configurar isto" (duplo clique no desenho, pendência): a
     atividade abre a gaveta das perguntas; escolha, "ao mesmo tempo" e o losango solto abrem
     a gaveta da configuração deles. Pontos de reencontro (gerados) não
     têm o que configurar. No desenho antigo, só seleciona. */
  const abrir = useCallback((id: string | null) => {
    const alvo = id && !id.endsWith(SUFIXO_REENCONTRO) ? id : null
    const it = alvo && fluxo ? acharItem(fluxo, alvo) : undefined
    /* a forma diz a gaveta (também sem blocos: com uma forma da "Próxima rodada" ou o desenho
       incompleto, a etapa segue configurável); sem forma, o item */
    const forma = alvo ? formaDoDoc(alvo) : undefined
    const qual = forma ? gavetaDaForma(forma, !!it && it.kind !== 'atividade') : null
    aplicarGaveta()
    setSelectedId(alvo)
    setGavetaDe(alvo)
    setConfigId((forma ? qual === 'etapa' : it?.kind === 'atividade') ? alvo : null)
    if (alvo && qual === 'forma') setAlvoNovo({ k: 'forma', id: alvo })
  }, [fluxo, aplicarGaveta, formaDoDoc])
  /* Clique no desenho: só seleciona (a gaveta aberta aplica e fecha, como o "Aplicar"). */
  const selecionar = useCallback((id: string | null) => {
    aplicarGaveta()
    setSelectedId(id && !id.endsWith(SUFIXO_REENCONTRO) ? id : null)
    setGavetaDe(null)
  }, [aplicarGaveta])

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
  const aoSelecionarNoDesenho = useCallback((id: string | null) => { setFocarGaveta(false); selecionar(id) }, [selecionar])
  /* Somente leitura: clicar numa etapa mostra a configuração dela, sem campos. */
  const aoSelecionarNaLeitura = useCallback((id: string | null) => {
    setSelectedId(id)
    const f = id ? formaDoDoc(id) : undefined
    setConfigId(f && gavetaDaForma(f, false) === 'etapa' ? f.id : null)
  }, [formaDoDoc])
  /* Seta: só a seleção sumir fecha a condição dela; abrir é por `aoAbrir`. */
  const aoSelecionarSeta = useCallback((id: string | null) => { if (!id) setSetaAberta(null) }, [])
  /* Setas culpadas da pendência clicada: vermelho tracejado até a próxima mudança. */
  const [setasComProblema, setSetasComProblema] = useState<string[] | null>(null)
  useEffect(() => { setSetasComProblema(null) }, [doc.setas, doc.formas])
  const focarPendencia = useCallback((p: Pendencia) => {
    setSetasComProblema(p.setas?.length ? p.setas : null)
    if (!p.nodeId || p.tipo === 'inicio-desligado' || p.tipo === 'fim-inalcancavel') return
    setFocarGaveta(true)
    const id = p.nodeId
    abrir(id)
    // abre já na pergunta que falta (abrir limpa a seção; esta vem depois e vale)
    setConfigSecao(secaoDaPendencia(p, stepsEfetivos[raizRef.current.get(id) ?? id]))
    // (sem blocos a etapa também abre: `abrir` decide pela forma — a da "Próxima rodada" abre a gaveta dela)
    setFocoEm((f) => ({ id, vez: (f?.vez ?? 0) + 1 }))
  }, [abrir, stepsEfetivos])

  /* Layout automático por raia: só para exportar enquanto o desenho ainda não tem posições
     (a abertura não terminou). A ordem vem do fluxo, e a raia, de quem executa. */
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
  }, [setFluxo])
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
    // sem blocos (desenho incompleto, forma da "Próxima rodada"): direto nas formas
    if (fluxo) setFluxo((f) => (f ? grupo.reduce((g, gid) => atualizarItem(g, gid, { tipo: t }), f) : f))
    else setDoc((d) => ({ ...d, formas: d.formas.map((f) => (grupo.includes(f.id) && f.tipo !== t ? { ...f, tipo: t } : f)) }))
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[id] ?? passoVazio(id, t)), stepType: t } }))
  }, [fluxo, setFluxo])
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
  }, [fluxo, setDesenho])

  /** Repete aqui uma atividade já configurada — mesma configuração, vinculada. `perto` é o
   *  lugar da forma nova no desenho. */
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
  }, [fluxo, aplicarGaveta, darLugar, setFluxo])
  /** Desfaz o vínculo: a atividade passa a ter configuração própria (cópia da atual). */
  const desvincular = useCallback((id: string) => {
    const raiz = raizRef.current.get(id)
    if (!raiz) return
    setSteps((prev) => ({ ...prev, [id]: { ...(prev[raiz] ?? passoVazio(id, 'userTask')), stepId: id } }))
    setFluxo((f) => (f ? atualizarItem(f, id, { vinculoDe: undefined } as Partial<ItemAtividade>) : f))
  }, [setFluxo])

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
  }, [setFluxo])
  /* Excluir no DESENHO (qualquer forma, também com o desenho incompleto): sai a forma e as
     setas dela; a etapa no meio da sequência é costurada. A etapa com cópias vinculadas
     passa pelo `remover` (a cópia vira a raiz, com a configuração). */
  const removerNoDesenho = useCallback((id: string) => {
    const it = fluxo ? acharItem(fluxo, id) : undefined
    const raiz = raizDe.get(id) ?? id
    if (it?.kind === 'atividade' && (vinculos.get(raiz) ?? []).length) { remover(id); return }
    setDoc((d) => apagarForma(d, id, true))
    setSelectedId((cur) => (cur === id ? null : cur))
    setConfigId((cur) => (cur === id ? null : cur))
  }, [fluxo, raizDe, vinculos, remover])
  /** Remover um caminho de escolha (ou frente de ao mesmo tempo), pelo painel do bloco: as
   *  etapas vão junto e a cópia de uma etapa vinculada cuja raiz estava ali vira a raiz, com a
   *  configuração (como `remover`). */
  const removerCaminhoDaEscolha = useCallback((blocoId: string, caminhoId: string) => {
    setFluxo((f) => {
      if (!f) return f
      const { fluxo: g, promovidas } = removerCaminhoComVinculos(f, blocoId, caminhoId)
      if (promovidas.length) {
        setSteps((prev) => {
          const out = { ...prev }
          for (const p of promovidas) out[p.para] = { ...(prev[p.de] ?? passoVazio(p.para, 'userTask')), stepId: p.para }
          return out
        })
      }
      return g
    })
  }, [setFluxo])

  /* ─── Intenções do desenho BPMN ───────────────────────────────────────────────
     O canvas só AVISA; quem muda o fluxo é a página, pelas mesmas funções de antes. Um
     arrasto pode chamar `onDesenho` (a posição) e depois `onMoverItem` (a vaga): as duas
     atualizações são funcionais e valem juntas. */
  const aoMudarDesenho = useCallback((d: DesenhoBpmn) => setDesenho(d), [setDesenho])
  const aoMoverItem = useCallback((id: string, ponto: PontoDeInsercao) => {
    mudarFluxo((f) => moverItem(f, id, ponto.ref, ponto.indice))
  }, [mudarFluxo])
  /* Setas livres: mudam o DESENHO; os blocos são refeitos a partir dele. */
  const aoLigar = useCallback((de: string, para: string) => setDoc((d) => ligar(d, de, para)), [])
  const aoApagarSeta = useCallback((setaId: string) => setDoc((d) => apagarSeta(d, setaId)), [])
  const aoAdicionarRaia = useCallback(() => setDesenho((d) => (d ? adicionarRaia(d) : d)), [setDesenho])
  /* Tarefa/subprocesso redimensionado pela alça: também é do DOC (um passo do desfazer); a
     função pura devolve o mesmo desenho quando o tamanho não muda (aí não há passo). */
  const aoTamanho = useCallback((id: string, tam: { largura: number; altura: number }) => setDoc((d) => redimensionarForma(d, id, tam)), [])
  /* Paleta: a variação mostrada em cada grupo e o conector ativo (o tipo das setas novas). */
  const [escolhidas, setEscolhidas] = useState<Record<GrupoPaleta, number>>(ESCOLHIDAS_INICIAIS)
  const aoTrocarVariante = useCallback((g: GrupoPaleta, indice: number) => setEscolhidas((e) => ({ ...e, [g]: indice })), [])
  const [conector, setConector] = useState<Conector>('sequencia')
  const organizarDesenho = useCallback(() => {
    if (!grafo || !desenhoVisto) return
    aplicarGaveta()
    setDesenho(organizar(grafo, desenhoVisto, responsavelDe))
    setEnquadrar((n) => n + 1) // B7: depois de arrumar, a vista mostra o desenho todo
  }, [grafo, desenhoVisto, responsavelDe, aplicarGaveta, setDesenho])

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
  /* Forma da paleta no desenho (DESENHO LIVRE): entra no DESENHO, não nos blocos. Escolha e
     Ao mesmo tempo são um losango só — quem junta os caminhos é outro losango, desenhado à
     mão. */
  /** A etapa (passo) da atividade que acabou de nascer no desenho. Devolve se é atividade. */
  const criarPassoDaForma = useCallback((forma: FormaDesenho): boolean => {
    const atividade = forma.tipo === 'userTask' || forma.tipo === 'serviceTask' ? forma.tipo : null
    if (atividade) setSteps((prev) => ({ ...prev, [forma.id]: { ...passoVazio(forma.id, atividade), stepName: forma.nome ?? '' } }))
    return !!atividade
  }, [])
  const aoSoltar = useCallback((daPaleta: ItemCatalogo, perto: { x: number; y: number }, sobreSeta?: string) => {
    const forma = formaDaPaleta(daPaleta)
    const atividade = criarPassoDaForma(forma)
    // nada chega num Início nem sai de um Fim: esses não entram no meio de uma seta
    const naSeta = forma.tipo === 'start' || forma.tipo === 'end' ? undefined : sobreSeta
    setFocarGaveta(true)
    setDoc((d) => {
      if (!naSeta) return soltarForma(d, forma, perto)
      /* No meio de uma seta, as formas daí em diante andam para a direita e a nova cabe sem
         cobrir ninguém (PO, 30/10/2026). A que começa um pouco
         antes dela também a cobriria: entra no empurrão. */
      const caixa = nodeSize({ id: forma.id, type: forma.tipo as FlowNodeType }, 0, 0)
      const largura = Math.ceil((caixa.w + 3 * GRADE) / GRADE) * GRADE
      const { posicoes } = abrirEspaco({ versao: 1, posicoes: d.posicoes, raias: d.raias }, perto.x - 2 * GRADE, largura)
      return soltarForma({ ...d, posicoes }, forma, perto, naSeta)
    })
    aplicarGaveta()
    setSelectedId(forma.id)
    setGavetaDe(forma.id)
    setConfigId(atividade ? forma.id : null)
  }, [aplicarGaveta, criarPassoDaForma])

  /* Duplo clique, Enter ou "Parametrizar" no desenho. A forma decide em `abrir` (etapa,
     escolha, bloco ou a gaveta nova); raia, fase, piscina e fluxo de mensagem abrem a deles
     (a gaveta que estava aberta aplica, como num clique noutra forma). */
  const aoAbrir = useCallback((alvo: AlvoDaGaveta) => {
    if (alvo.k === 'forma') { setFocarGaveta(false); abrir(alvo.id); setSetaAberta(null) }
    // a seta que sai de uma Escolha abre a condição (a de hoje); as outras, o rótulo
    else if (alvo.k === 'seta' && formaDoDoc(doc.setas.find((x) => x.id === alvo.id)?.de ?? '')?.tipo === 'exclusiveGateway') { selecionar(null); setSetaAberta(alvo.id) }
    else { setFocarGaveta(false); selecionar(null); setSetaAberta(null); setAlvoNovo(alvo) }
  }, [abrir, selecionar, formaDoDoc, doc.setas])

  /* Clique (ou teclado) na paleta: a forma entra logo DEPOIS da selecionada — no meio da seta
     que sai dela, se for uma só — ou, sem seleção, antes do Fim. */
  const aoEscolherNaPaleta = useCallback((item: ItemCatalogo) => {
    if (!grafo || !desenhoVisto) return
    const sel = selectedId ? doc.formas.find((f) => f.id === selectedId && f.tipo !== 'end') : undefined
    const fimId = doc.formas.find((f) => f.tipo === 'end')?.id
    const ancora = sel?.id ?? doc.setas.find((x) => x.para === fimId)?.de ?? doc.formas.find((f) => f.tipo === 'start')?.id
    if (!ancora) return
    const saem = doc.setas.filter((x) => x.de === ancora)
    const nova = nodeSize({ id: 'nova', type: item.tipo as FlowNodeType }, 0, 0)
    const p = desenhoVisto.posicoes[ancora] ?? { x: 0, y: 0 }
    // a caixa da âncora como o canvas a desenha (o tamanho gravado vence o de sempre)
    const n = grafo.nodes.find((x) => x.id === ancora)
    const c = n ? caixaReal(n, p, tamanhos) : { largura: 0, altura: 0 }
    const perto = { x: naGrade(p.x + c.largura + 3 * GRADE), y: naGrade(p.y + c.altura / 2 - nova.h / 2) }
    aoSoltar(item, perto, saem.length === 1 ? saem[0].id : undefined)
  }, [grafo, desenhoVisto, selectedId, doc.formas, doc.setas, aoSoltar, tamanhos])

  /** Grava o estado de agora como um passo do desfazer (se mudou desde o último). */
  const registrarPasso = useCallback(() => {
    const atual = historia[hIndice]
    if (atual && atual.doc === doc && atual.steps === steps && atual.laneOrder === laneOrder) return
    const proximo = [...historia.slice(0, hIndice + 1), { doc, steps, laneOrder }] // um passo novo descarta o "refazer"
    const excedente = Math.max(0, proximo.length - MAX_HISTORIA)
    setHistoria(excedente ? proximo.slice(excedente) : proximo)
    setHIndice(proximo.length - 1 - excedente)
  }, [doc, steps, laneOrder, historia, hIndice])
  /* Pontas das setas (religar arrastando uma ponta, ajustar a ponta no contorno, "Caminho
     automático"): cada ajuste é UM passo do desfazer — o pendente fecha antes. */
  const aoReligar = useCallback((setaId: string, para: string, entrada?: PontaDaSeta) => {
    registrarPasso(); setDoc((d) => religar(d, setaId, para, entrada))
  }, [registrarPasso])
  const aoReligarSaida = useCallback((setaId: string, de: string, saida?: PontaDaSeta) => {
    registrarPasso(); setDoc((d) => religarSaida(d, setaId, de, saida))
  }, [registrarPasso])
  const aoPontas = useCallback((setaId: string, patch: PatchDasPontas) => {
    registrarPasso(); setDoc((d) => pontasDaSeta(d, setaId, patch))
  }, [registrarPasso])
  /* Registra um retrato quando a autoria para de mudar. A espera COALESCE o que é uma
     ação só aos olhos de quem edita (digitar um nome, por exemplo). Ações discretas que
     podem vir em sequência rápida (o próximo item) fecham o passo pendente antes com
     `registrarPasso`, para cada uma ter o seu. */
  useEffect(() => {
    if (aplicandoHistorico.current) { aplicandoHistorico.current = false; return }
    const t = setTimeout(registrarPasso, 350)
    return () => clearTimeout(t)
  }, [registrarPasso])

  /* Próximo item (a coluna ao lado da forma selecionada): a forma nasce à direita da base (ou
     onde foi solta), já ligada a ela por uma seta de sequência — forma e seta num passo só do
     desfazer (o passo pendente, de uma criação anterior, fecha antes). A forma nova fica
     selecionada, sem gaveta: a coluna passa para ela e a cadeia cresce para a direita. */
  const aoProximo = useCallback((baseId: string, item: ItemCatalogo, soltoEm?: { x: number; y: number }) => {
    if (!grafo || !desenhoVisto) return
    const forma = formaDaPaleta(item)
    const lugar = soltoEm ?? lugarDoProximo(baseId, forma, grafo.nodes, desenhoVisto.posicoes, tamanhos)
    if (!lugar) return
    registrarPasso()
    criarPassoDaForma(forma)
    setDoc((d) => ligar(soltarForma(d, forma, lugar), baseId, forma.id))
    aplicarGaveta()
    setSelectedId(forma.id)
    setGavetaDe(null)
  }, [grafo, desenhoVisto, tamanhos, registrarPasso, criarPassoDaForma, aplicarGaveta])

  /* DESENHO (orientação, grade, laço, fases, piscinas, mensagens). Cada ação aqui é UM passo
     do desfazer: o passo pendente fecha antes (`registrarPasso`) e o retrato depois pega a
     mudança. A orientação é do desenho (gravada com ele); a grade é só da tela. */
  const [grade, setGrade] = useState(true)
  const [selecaoMultipla, setSelecaoMultipla] = useState<string[]>([])
  const aoOrientacao = useCallback((o: Orientacao) => { registrarPasso(); setDoc((d) => mudarOrientacao(d, o)) }, [registrarPasso])
  /** Fase, largura da piscina e fluxo de mensagem vêm do canvas como o desenho com o layout novo. */
  const aoLayout = useCallback((novo: DesenhoV2) => {
    registrarPasso()
    setDoc((d) => (d.layout === novo.layout ? d : { ...d, layout: novo.layout }))
  }, [registrarPasso])
  /* A primeira fase ocupa a piscina como ela está na tela (a mesma conta do canvas): só a
     "Nova fase" alarga a piscina. */
  const aoAdicionarFase = useCallback(() => {
    registrarPasso()
    setDoc((d) => {
      if (!grafo || !desenhoVisto || layoutDe(d).fases.length) return adicionarFase(d)
      const caixas = grafo.nodes.flatMap((n) => {
        const p = desenhoVisto.posicoes[n.id]
        if (!p) return []
        const c = caixaDaForma(n.id, n.type, nodeSize({ id: n.id, type: n.type as FlowNodeType, name: n.name }, 0, 0), layoutDe(d).tamanhos)
        return [{ x: p.x, y: p.y, largura: c.w, altura: c.h }]
      })
      const larguraAtual = faixasDoDesenho(desenhoVisto.raias, layoutDe(d), conteudoDasFormas(caixas)).largura
      return adicionarFase(d, { larguraAtual })
    })
  }, [registrarPasso, grafo, desenhoVisto])
  const aoAdicionarPiscina = useCallback(() => { registrarPasso(); setDoc((d) => adicionarPiscinaExterna(d)) }, [registrarPasso])

  /* ─── Gavetas novas (raia, fase, piscinas, mensagem, formas novas) ────────────
     Retrato da ABERTURA para o Cancelar, tirado na primeira renderização com a gaveta aberta
     (como o da etapa). Cancelar devolve só o que a gaveta edita (`restaurarAlvo`). */
  /* `passo`: a etapa da forma (pelo id da RAIZ, onde `patchStep` grava), ou ausente se ainda
     não existia — digitar o nome a cria, e o Cancelar a tira. */
  const retratoDaGaveta = useRef<{
    chave: string; doc: DesenhoV2; passo?: { id: string; step: StepFormSchema | undefined }
    name: string; description: string; quemInicia?: QuemInicia
  } | null>(null)
  const chaveDaGaveta = alvoNovo ? `${alvoNovo.k}:${alvoNovo.id}` : null
  if (!chaveDaGaveta) retratoDaGaveta.current = null
  else if (retratoDaGaveta.current?.chave !== chaveDaGaveta) {
    const raiz = alvoNovo?.k === 'forma' ? raizRef.current.get(alvoNovo.id) ?? alvoNovo.id : undefined
    retratoDaGaveta.current = { chave: chaveDaGaveta, doc, passo: raiz ? { id: raiz, step: steps[raiz] } : undefined, name, description, quemInicia }
  }
  const cancelarGavetaNova = useCallback(() => {
    const r = retratoDaGaveta.current
    if (r && alvoNovo) {
      setDoc((d) => restaurarAlvo(d, r.doc, alvoNovo))
      if (r.passo) setSteps((s) => restaurarPasso(s, r.passo!.id, r.passo!.step))
      if (alvoNovo.k === 'piscina' && alvoNovo.id === PISCINA_DO_PROCESSO) { setName(r.name); setDescription(r.description); setQuemInicia(r.quemInicia) }
    }
    setAlvoNovo(null); setGavetaDe(null)
  }, [alvoNovo])
  const aplicarGavetaNova = useCallback(() => { setAlvoNovo(null); setGavetaDe(null) }, [])
  /* Remover pela gaveta (fase, piscina externa): o que a gaveta mudou fica como um passo e a
     remoção é o seguinte — um Ctrl+Z traz de volta a fase/piscina (e os fluxos dela). */
  const removerPelaGaveta = useCallback((remove: (d: DesenhoV2) => DesenhoV2) => {
    registrarPasso()
    setDoc(remove)
    setAlvoNovo(null); setGavetaDe(null)
  }, [registrarPasso])
  /** Nome e configuração da forma; na tarefa (envio/recebimento) o nome é também o da etapa. */
  const aoMudarForma = useCallback((id: string, p: PatchDaForma) => {
    setDoc((d) => {
      const i = d.formas.findIndex((f) => f.id === id)
      if (i === -1) return d
      let f = d.formas[i]
      if (p.nome !== undefined && f.nome !== p.nome) f = { ...f, nome: p.nome }
      if (p.config) f = comConfig(f, p.config)
      return f === d.formas[i] ? d : { ...d, formas: d.formas.map((x, j) => (j === i ? f : x)) }
    })
    const tipo = formaDoDoc(id)?.tipo
    if (p.nome !== undefined && (tipo === 'userTask' || tipo === 'serviceTask')) patchStep(id, { stepName: p.nome })
  }, [formaDoDoc, patchStep])
  /* Workflows que um subprocesso pode chamar: os ativos (a mesma lista da tela Workflows), sem
     este. Carrega na primeira gaveta de subprocesso. */
  const [workflowsDaOrg, setWorkflowsDaOrg] = useState<WorkflowDaLista[] | null>(null)
  const pediuWorkflows = useRef(false)
  const abriuSubprocesso = alvoNovo?.k === 'forma' && formaDoDoc(alvoNovo.id)?.tipo === 'subProcess'
  useEffect(() => {
    if (!abriuSubprocesso || pediuWorkflows.current) return
    pediuWorkflows.current = true
    apiJson<WorkflowDaLista[]>('/api/processes')
      .then((l) => setWorkflowsDaOrg(l ?? []))
      .catch(() => { pediuWorkflows.current = false; setWorkflowsDaOrg([]) })
  }, [abriuSubprocesso])
  const workflowsChamaveis = useMemo(() => (workflowsDaOrg ? workflowsAtivos(workflowsDaOrg, initial?.id) : null), [workflowsDaOrg, initial?.id])
  /** Nome de uma ponta (forma ou piscina externa) para as frases das gavetas. */
  const nomeDoPonto = useCallback((id: string) => {
    const ext = layoutDe(doc).piscinasExternas.find((p) => p.id === id)
    if (ext) return ext.nome || 'Participante sem nome'
    const f = formaDoDoc(id)
    if (f && f.tipo !== 'userTask' && f.tipo !== 'serviceTask' && f.nome?.trim()) return f.nome.trim()
    return nomeDaForma(id)
  }, [doc, formaDoDoc, nomeDaForma])
  /** Alinhar as formas do laço como se vê na TELA (na vertical também); grava no lógico. */
  const aoAlinhar = useCallback((modo: ModoAlinhar) => {
    if (!grafo || !desenhoVisto || selecaoMultipla.length < 2) return
    const caixas = selecaoMultipla.flatMap((id) => {
      const n = grafo.nodes.find((x) => x.id === id), p = desenhoVisto.posicoes[id]
      if (!n || !p) return []
      const c = caixaDaForma(id, n.type, nodeSize({ id, type: n.type as FlowNodeType, name: n.name }, 0, 0), tamanhos)
      return [{ id, x: p.x, y: p.y, largura: c.w, altura: c.h }]
    })
    const novas = alinharNaTela(caixas, modo, orientacao)
    registrarPasso()
    setDesenho((d) => (d ? { ...d, posicoes: { ...d.posicoes, ...novas } } : d))
  }, [grafo, desenhoVisto, selecaoMultipla, tamanhos, orientacao, registrarPasso, setDesenho])

  const irPara = useCallback((i: number) => {
    const r = historia[i]
    if (!r) return
    aplicandoHistorico.current = true
    setDoc(r.doc); setSteps(r.steps); setLaneOrder(r.laneOrder)
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
    () => JSON.stringify({ name, description, kind, quemInicia, formas: doc.formas, setas: doc.setas, steps, laneOrder, desenho: desenhoVisto, layout: doc.layout }),
    // desenhoVisto: o mesmo que `persist` grava — senão "Não salvo" voltaria depois de salvar.
    // layout: fases, piscinas externas, mensagens e orientação também são do que se grava
    [name, description, kind, quemInicia, doc.formas, doc.setas, steps, laneOrder, desenhoVisto, doc.layout],
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
  /* O formSchema COMO VAI SER GRAVADO (o `persist` manda este): as etapas já com o executor
     da raia onde a tarefa está desenhada, o desenho podado. */
  const formSchemaVivo = useMemo((): ProcessFormSchema => {
    /* o desenho que vai ser gravado — também decide em que raia cada tarefa está */
    const visto = desenhoVisto ? podarDesenho(desenhoVisto, nodes.map((n) => n.id)) : null
    const desenhoFinal: DesenhoV2 = {
      ...doc,
      posicoes: visto?.posicoes ?? doc.posicoes, raias: visto?.raias ?? doc.raias,
      // condição só vale em seta que sai de uma Escolha; o rótulo, em qualquer uma
      setas: setasParaGravar(doc),
    }
    // a tarefa que herda da raia leva o executor da raia onde está desenhada
    const stepsVivos = aplicarExecutorDasRaias(
      nodes.filter((n) => isActivity(n.type) && n.step).map((n) => ({ ...n.step!, stepId: n.id, stepName: n.step!.stepName, stepType: n.type as 'userTask' | 'serviceTask' })),
      desenhoFinal, alturaDe,
    )
    // grafo GERADO (a API valida e compila por ele; telas de leitura o desenham)
    const graph: ProcessFormSchema['graph'] = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: isActivity(n.type) ? (n.step?.stepName || '') : n.name })),
      edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, condition: e.condition || undefined, isDefault: e.isDefault, label: e.label, conditionSpec: e.conditionSpec })),
    }
    return {
      steps: stepsVivos, graph,
      // cópia DERIVADA, só quando o desenho cabe em blocos (a leitura a usa ao abrir)
      blocos: fluxo ? comNomes(fluxo, stepsEfetivos) : undefined,
      laneOrder: laneOrder.length ? laneOrder : undefined,
      quemInicia,
      // só as posições de formas que existem (as de formas removidas ficam para trás)
      desenho: desenhoFinal,
    }
  }, [nodes, edges, desenhoVisto, doc, alturaDe, fluxo, stepsEfetivos, laneOrder, quemInicia])
  /* Só mudar o que o motor EXECUTA devolve um workflow ativo a rascunho; arrumar o desenho
     (posições, raias, layout, rótulos, nome do Início/Fim), o nome ou o tipo não (PO,
     30/10/2026). A conta é a da API (`mudaOFluxo` usa `assinaturaDoQueExecuta`), sobre o que
     vai ser gravado, e a referência é o que está no servidor. `null` = desenho que não fecha:
     a API conta como mudança. */
  const assinaturaFluxo = useMemo(() => assinaturaDoQueExecuta(formSchemaVivo), [formSchemaVivo])
  const assinaturaFluxoRef = useRef(assinaturaFluxo)
  assinaturaFluxoRef.current = assinaturaFluxo
  const limpoFluxoRef = useRef<string | null | undefined>(undefined)
  if (limpoFluxoRef.current === undefined) {
    // o formSchema gravado, com as chaves que a abertura recebeu (o resto é só visual)
    limpoFluxoRef.current = initial
      ? assinaturaDoQueExecuta({ steps: initial.steps, quemInicia: initial.quemInicia, blocos: initial.blocos, desenho: initial.desenho })
      : assinaturaFluxo
  }
  const voltaARascunho = sujo && ativoNoServidor && (assinaturaFluxo === null || limpoFluxoRef.current === null || assinaturaFluxo !== limpoFluxoRef.current)

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
    const novoDoc: DesenhoV2 = { ...doc, posicoes: proximo.posicoes, raias: proximo.raias }
    if (naAbertura.current) {
      naAbertura.current = false
      realinharLimpo.current = assinaturaRef.current === limpoRef.current
      setHistoria((h) => h.map((r) => (r.doc === doc ? { ...r, doc: novoDoc } : r)))
    }
    setDoc(novoDoc)
  }, [grafo, doc, desenho, desenhoVisto, consultasProntas, esperaVenceu, responsavelDe])

  /* Gravação que apagaria grande parte do desenho: a API recusa com 409 e diz quanto
     seria removido. Só reenviamos com `confirmarReducao` depois que a pessoa confirmar. */
  const [reducao, setReducao] = useState<{ msg: string; acao: 'rascunho' | 'ativar' } | null>(null)
  /* Dialog do DS no lugar do alert() nativo. `aoFechar` segura a navegação até a pessoa
     fechar o aviso, senão o dialog morreria junto da tela. */
  const [aviso, setAviso] = useState<{ msg: string; titulo?: string; aoFechar?: () => void } | null>(null)

  const persist = useCallback(async (confirmarReducao?: boolean, auto?: { keepalive?: boolean }): Promise<string> => {
    const assinaturaGravada = assinaturaRef.current
    const fluxoGravado = assinaturaFluxoRef.current
    const bpmnXml = generateBpmn(buildWfGraph(nodes, edges))
    const formSchema = formSchemaVivo
    /* gravação automática de um workflow novo sem nome: não perde o trabalho */
    const nome = name.trim() || (auto ? 'Rascunho sem nome' : '')
    const body = JSON.stringify({ name: nome, description: description.trim() || undefined, bpmnXml, formSchema, kind, ...(confirmarReducao ? { confirmarReducao: true } : {}) })
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
  }, [editing, initial, name, description, kind, nodes, edges, formSchemaVivo])

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
    if (!kind) { setAviso({ msg: 'Escolha o tipo do workflow (contrato, aditivo ou encerramento) antes de ativar.' }); return }
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
        /* desenho que o servidor não converteu: ao fechar, fica no editor com o culpado em
           destaque no Desenho (como a pendência clicada); senão, vai para o workflow */
        const culpada = editing ? pendenciaDaRecusa(e) : null
        const aoFechar = culpada
          ? () => focarPendencia({ ...culpada, tipo: culpada.tipo as Pendencia['tipo'] })
          : () => router.push(`/workflows/${id}`)
        setAviso({ titulo: 'Ainda não dá para ativar', msg: e?.message || 'Não foi possível ativar o workflow.', aoFechar })
        return
      }
      router.push(`/workflows/${id}`)
    } catch (err) {
      if (err instanceof ReducaoDestrutiva) { setReducao({ msg: err.message, acao: 'ativar' }); return }
      setAviso({ msg: 'Não foi possível ativar o workflow.' }); console.error(err)
    }
    finally { setActivating(false) }
  }, [name, kind, activityCount, pendencias, persist, router, editing, focarPendencia])

  // Monta o modelo do grafo (posições da raia + textos) para o exportador desenhar em 2D.
  const buildExportModel = useCallback((): ExportModel => {
    /* O arquivo é o desenho BPMN — as posições, raias e setas dele (os textos vêm da mesma
       fonte do cartão). Sem posições ainda (a abertura não terminou), sai o layout por raia. */
    if (grafo && desenhoVisto) {
      return modeloDeExportacao(grafo, desenhoVisto, (g) => {
        const n = nodeById[g.id]
        if (isActivity(g.type)) {
          const meta = n ? metaDaAtividade(n, resolvePapel, resolveEntidade).map((m) => m.text) : []
          return { name: n?.step?.stepName || 'Sem nome', typeLabel: g.type === 'serviceTask' ? 'Ação automática' : 'Tarefa', meta }
        }
        if (g.type === 'exclusiveGateway' || g.type === 'parallelGateway' || g.type === 'inclusiveGateway') return { name: g.name ?? '', isFork: !!g.name }
        return { name: g.name || (g.type === 'start' ? 'Início' : g.type === 'end' ? 'Fim' : '') }
      }, layoutDe(doc).tamanhos, new Map(doc.setas.map((x) => [x.id, { saida: x.saida, entrada: x.entrada }])))
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
  }, [nodes, edges, layout, nodeById, resolvePapel, resolveEntidade, grafo, desenhoVisto, doc])

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
      // dentro da gaveta lateral (um botão, uma lista) a tecla é dela, não do desenho
      if (t?.closest?.(`[${ATRIBUTO_GAVETA}],[data-floating-menu],[role="menu"]`)) return
      if (!selectedId || configId || somenteLeitura) return
      if (fluxo && acharItem(fluxo, selectedId)) { e.preventDefault(); remover(selectedId); return }
      // forma que não é item dos blocos (Início/Fim a mais, losango solto…) ou desenho que não
      // vira blocos: sai do desenho, como pelo Apagar do menu (o único Início e o último Fim ficam)
      if (doc.formas.some((f) => f.id === selectedId)) { e.preventDefault(); removerNoDesenho(selectedId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, fluxo, configId, somenteLeitura, remover, removerNoDesenho, doc.formas])

  const resumo = (() => {
    const atv = nodes.filter((n) => isActivity(n.type)).length
    const esc = fluxo ? listarEscolhas(fluxo).length : 0
    const par = nodes.filter((n) => n.type === 'parallelGateway' && !n.id.endsWith(SUFIXO_REENCONTRO)).length
    return [`${atv} ${atv === 1 ? 'atividade' : 'atividades'}`, ...(esc ? [`${esc} ${esc === 1 ? 'escolha' : 'escolhas'}`] : []), ...(par ? [`${par} ao mesmo tempo`] : [])].join(' · ')
  })()
  /** Alguma gaveta do desenho está aberta: o menu da seleção e o próximo item se recolhem,
   *  e a seleção passa a levar a gaveta junto. */
  const gavetaAberta = !!(configNode && configNode.step) || (!!selectedBloco && gavetaDe === selectedBloco.id)
    || (!!losangoSolto && gavetaDe === losangoSolto.id) || !!setaDoPainel || (!!alvoNovo && !!gavetaDoAlvo(alvoNovo, doc))
  /* A configuração aberta da etapa (gaveta lateral). */
  const perguntasDaEtapa = configNode && configNode.step ? (
    <PerguntasDaEtapa key={configNode.id} retratoDaAbertura={retratoDaAbertura.current ?? undefined} node={configNode} nodes={nodes} edges={edges} screens={screens} papeis={papeis} resolveEntidade={resolveEntidade}
      secaoInicial={configSecao} focarAoAbrir={focarGaveta} raiaDaEtapa={raiaDaEtapa}
      onPatchStep={(p) => patchStep(configNode.id, p)}
      onChangeType={(t) => changeNodeType(configNode.id, t)}
      vinculo={(() => {
        const raiz = raizDe.get(configNode.id) ?? configNode.id
        const outros = (vinculos.get(raiz) ?? []).length
        if (!outros) return undefined
        return { lugares: outros + 1, ehCopia: raizDe.has(configNode.id), desvincular: () => desvincular(configNode.id) }
      })()}
      onRemove={() => { (fluxo ? remover : removerNoDesenho)(configNode.id); setRetornoEscolha(null); setConfigSecao(undefined) }}
      onClose={() => {
        setConfigId(null); setConfigSecao(undefined)
        if (retornoEscolha) { setSelectedId(retornoEscolha); setGavetaDe(retornoEscolha); setRetornoEscolha(null) }
      }} />
  ) : null
  /* A gaveta nova aberta — a do alvo, se ele ainda existe no desenho. */
  const gavetaNova = (() => {
    if (!alvoNovo || !desenhoVisto) return null
    const qual = gavetaDoAlvo(alvoNovo, doc, () => false)
    const chave = `${alvoNovo.k}:${alvoNovo.id}`
    const moldura = { onCancelar: cancelarGavetaNova, onAplicar: aplicarGavetaNova, focarAoAbrir: focarGaveta }
    const l = layoutDe(doc)
    const id = alvoNovo.id
    switch (qual) {
      case 'raia': {
        const raia = doc.raias.find((r) => r.id === id)!
        const visto = { ...doc, posicoes: desenhoVisto.posicoes, raias: desenhoVisto.raias }
        return <GavetaRaia key={chave} {...moldura} raia={raia} papeis={papeis} tarefasNaRaia={tarefasNaRaia(visto, id, alturaDe, stepsEfetivos)}
          onPatch={(p) => setDoc((d) => {
            let n = p.nome !== undefined ? nomeDaRaia(d, id, p.nome) : d
            if ('executor' in p) n = executorDaRaia(n, id, p.executor)
            return n
          })} />
      }
      case 'fase': {
        const centros = (grafo?.nodes ?? []).flatMap((n) => {
          const pos = desenhoVisto.posicoes[n.id]
          if (!pos) return []
          return [pos.x + caixaDaForma(n.id, n.type, nodeSize({ id: n.id, type: n.type as FlowNodeType, name: n.name }, 0, 0), tamanhos).w / 2]
        })
        return <GavetaFase key={chave} {...moldura} fase={l.fases.find((f) => f.id === id)!} formasNaFase={formasNaFase(l.fases, id, centros)}
          onPatch={(p) => setDoc((d) => {
            let n = p.nome !== undefined ? renomearFase(d, id, p.nome) : d
            if ('prazoDiasUteis' in p) n = prazoDaFase(n, id, p.prazoDiasUteis)
            return n
          })}
          onRemover={() => removerPelaGaveta((d) => removerFase(d, id))} />
      }
      case 'piscinaPrincipal':
        return <GavetaPiscinaPrincipal key={chave} {...moldura} nome={name} descricao={description} quemInicia={quemInicia} papeis={papeis} kind={kind} orientacao={orientacao}
          onNome={setName} onDescricao={setDescription} onQuemInicia={setQuemInicia} onOrientacao={aoOrientacao} />
      case 'piscinaExterna':
        return <GavetaPiscinaExterna key={chave} {...moldura} piscina={l.piscinasExternas.find((p) => p.id === id)!}
          onPatch={(p) => setDoc((d) => atualizarPiscinaExterna(d, id, p))}
          onRemover={() => removerPelaGaveta((d) => removerPiscinaExterna(d, id))} />
      case 'mensagem': {
        const fluxoMsg = l.fluxosMensagem.find((m) => m.id === id)!
        return <GavetaMensagem key={chave} {...moldura} fluxo={fluxoMsg} de={nomeDoPonto(fluxoMsg.de)} para={nomeDoPonto(fluxoMsg.para)}
          onPatch={(p) => setDoc((d) => rotularMensagem(d, id, p.rotulo))}
          onCaminhoAutomatico={() => { registrarPasso(); setDoc((d) => pontasDaMensagem(d, id, { saida: null, entrada: null })) }}
          onRemover={() => removerPelaGaveta((d) => apagarMensagem(d, id))} />
      }
      case 'seta': {
        const seta = doc.setas.find((x) => x.id === id)!
        return <GavetaSeta key={chave} {...moldura} seta={seta} de={nomeDoPonto(seta.de)} para={nomeDoPonto(seta.para)}
          onPatch={(p) => setDoc((d) => rotuloDaSeta(d, id, p.rotulo))} onCaminhoAutomatico={() => aoPontas(id, { saida: null, entrada: null })} />
      }
      case 'forma': {
        const forma = formaDoDoc(id)!
        const ehEtapa = forma.tipo === 'userTask' || forma.tipo === 'serviceTask'
        /* como o Apagar do menu: qualquer forma, menos o único Início e o último Fim */
        const podeSair = (forma.tipo !== 'start' && forma.tipo !== 'end') || doc.formas.filter((f) => f.tipo === forma.tipo).length > 1
        const nome = (ehEtapa ? stepsEfetivos[id]?.stepName : undefined) ?? forma.nome ?? ''
        const saidas = doc.setas.filter((x) => x.de === id).map((x) => {
          const destino = formaDoDoc(x.para)
          return { id: x.para, nome: nomeDoPonto(x.para), tipo: destino ? nomeDoElemento(destino) : '' }
        })
        return <GavetaFormaNova key={chave} {...moldura} forma={forma} nome={nome} workflowsAtivos={workflowsChamaveis} piscinasExternas={l.piscinasExternas}
          saidas={saidas} nomeDaPiscina={name} papeis={papeis} onPatch={(p) => aoMudarForma(id, p)}
          onRemover={podeSair ? () => { registrarPasso(); removerNoDesenho(id); setAlvoNovo(null); setGavetaDe(null) } : undefined}
          onAbrirForma={(destino) => { setFocarGaveta(true); abrir(destino) }} />
      }
      default: return null
    }
  })()
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
    exportError ?? '', editing, selecaoMultipla.length >= 2,
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
          onItem={(p) => { setPendAberto(false); focarPendencia(p) }} />
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
        {!somenteLeitura && (
          <ControlesDoDesenho orientacao={orientacao} onOrientacao={aoOrientacao} grade={grade} onGrade={setGrade}
            selecionadas={selecaoMultipla.length} onAlinhar={aoAlinhar} soIcone={nivelTopo >= 1} />
        )}
        {nivelTopo < 6 && !somenteLeitura && (
          <Button variant="outline" size="sm" className={cn('shrink-0', nivelTopo >= 1 && 'px-2')} onClick={organizarDesenho} disabled={!desenhoVisto}
            aria-label="Organizar" title="Organizar: arruma as formas na ordem do fluxo e cada uma na raia de quem a executa">
            <LayoutGrid className="h-4 w-4" />{nivelTopo < 1 && 'Organizar'}
          </Button>
        )}
        <MenuMais botaoRef={maisRef} aberto={maisAberto} onAberto={setMaisAberto}
          // com o "Quem inicia" aberto a partir do ⋯, clicar no ⋯ só o fecha (não abre os dois)
          antesDeAlternar={() => { if (quemIniciaNoMenu && quemIniciaAberto) { setQuemIniciaAberto(false); return true } return false }}
          extras={nivelTopo >= 6 ? [
            ...(!somenteLeitura ? [{ rotulo: 'Organizar', icone: <LayoutGrid className="h-4 w-4 text-muted-foreground" />, onClick: organizarDesenho, disabled: !desenhoVisto }] : []),
            { rotulo: 'Quem inicia…', icone: <DoorOpen className="h-4 w-4 text-muted-foreground" />, onClick: () => setQuemIniciaAberto(true) },
          ] : undefined}
          onHistorico={editing ? () => setHistoricoAberto(true) : undefined}
          onExportar={handleExport} exportando={exporting} exportarDesabilitado={saving || activating} />
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
      <SairSemSalvarDialog open={!!saida} voltaARascunho={voltaARascunho}
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
        {/* O editor é só o desenho. Somente leitura: sem paleta, e o clique numa etapa abre a
            gaveta de leitura dela. */}
        {!somenteLeitura && (
          <PaletaBpmn escolhidas={escolhidas} onTrocarVariante={aoTrocarVariante} onEscolher={aoEscolherNaPaleta}
            conector={conector} onConector={setConector}
            onAdicionarRaia={aoAdicionarRaia} onAdicionarFase={aoAdicionarFase} onAdicionarPiscina={aoAdicionarPiscina} desabilitada={!desenhoVisto} />
        )}
        <div className="relative min-w-0 flex-1">
          {grafo && desenhoVisto ? (
            <CanvasBpmn fluxo={fluxo ?? FLUXO_VAZIO} grafo={grafo} desenho={desenhoVisto} steps={stepsEfetivos} selecionado={selectedId}
              nomeDoProcesso={name} revisaoDasConsultas={revisaoDasConsultas} somenteLeitura={somenteLeitura}
              responsavelDe={responsavelDe} prazoDe={prazoDe} problemasDe={problemasDe}
              onSelecionar={somenteLeitura ? aoSelecionarNaLeitura : aoSelecionarNoDesenho} onAbrir={aoAbrir} onProximo={aoProximo} gavetaAberta={gavetaAberta}
              orientacao={orientacao} grade={grade} conector={conector} onSelecaoMultipla={setSelecaoMultipla} onLayout={aoLayout}
              onDesenho={aoMudarDesenho} onSoltar={aoSoltar} onMoverItem={aoMoverItem}
              doc={doc} onLigar={aoLigar} onReligar={aoReligar} onReligarSaida={aoReligarSaida} onPontas={aoPontas} onTamanho={aoTamanho} onApagarSeta={aoApagarSeta} onSelecionarSeta={aoSelecionarSeta} setasComProblema={setasComProblema ?? undefined} onRemover={removerNoDesenho}
              vinculaveis={vinculaveis} onInserirVinculada={aoInserirVinculada} focoEm={focoEm} enquadrar={enquadrar} />
          ) : (
            <div role="status" className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Preparando o desenho…
            </div>
          )}
        </div>

        {/* Escolha / "ao mesmo tempo" selecionado: gaveta lateral por cima do desenho (as
            etapas dos caminhos estão nele). As perguntas de uma atividade em configuração têm
            a vez sobre ela. */}
        {!somenteLeitura && selectedBloco && gavetaDe === selectedBloco.id && fluxo && !(configNode && configNode.step) && (
          <GavetaDoBloco key={selectedBloco.id} blocoId={selectedBloco.id} fluxo={fluxo} steps={stepsEfetivos} simulacao={simulacao}
            onRemover={remover} onRemoverCaminho={removerCaminhoDaEscolha} onFluxo={mudarFluxo}
            screens={screens} onSimulacao={setSimulacao} onConfigurarAtividade={configurarAtividadeDaEscolha} problemas={pendenciasPorNo}
            anteriores={anterioresDe(selectedBloco.id)} focarAoAbrir={focarGaveta} onCancelar={cancelarLosango} onAplicar={aplicarLosango} />
        )}

        {/* Condição de uma seta que sai de uma Escolha. */}
        {!somenteLeitura && setaDoPainel && !(configNode && configNode.step) && (
          <GavetaLateral key={setaDoPainel.id} rotulo="Caminho" titulo={`Para ${nomeDaForma(setaDoPainel.para)}`}
            rotuloTom="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            rotuloIcone={<GatewayGlyph kind="exclusive" className="h-3 w-3" />}
            onFechar={() => setSetaAberta(null)} focarAoAbrir={false}>
            <EditorDaSeta seta={setaDoPainel} campos={camposDaSeta(setaDoPainel)} onPatch={(p) => aoMudarSeta(setaDoPainel.id, p)}
              onCaminhoAutomatico={() => aoPontas(setaDoPainel.id, { saida: null, entrada: null })} />
          </GavetaLateral>
        )}

        {/* Escolha que ainda não fecha em blocos: a pergunta e as setas que saem dela. */}
        {!somenteLeitura && losangoSolto && gavetaDe === losangoSolto.id && !setaDoPainel && !(configNode && configNode.step) && (
          <GavetaDoLosango key={losangoSolto.id} forma={losangoSolto} setas={doc.setas.filter((x) => x.de === losangoSolto.id)} nomeDe={nomeDaForma}
            anteriores={anterioresDe(losangoSolto.id)} onMudar={(p) => aoMudarLosango(losangoSolto.id, p)}
            onEditarSeta={(id) => { setFocarGaveta(true); setSetaAberta(id) }} onApagarSeta={aoApagarSeta}
            onRemover={() => { removerNoDesenho(losangoSolto.id); setGavetaDe(null) }}
            onCancelar={cancelarLosango} onAplicar={aplicarLosango} focarAoAbrir={focarGaveta} />
        )}

        {/* Configuração da atividade: perguntas numa gaveta lateral de 440 px. */}
        {somenteLeitura && configNode && configNode.step && (
          <PerguntasDaEtapa key={configNode.id} node={configNode} nodes={nodes} edges={edges} screens={screens} papeis={papeis} resolveEntidade={resolveEntidade}
            somenteLeitura raiaDaEtapa={raiaDaEtapa} onPatchStep={() => {}} onChangeType={() => {}} onRemove={() => {}}
            onClose={() => setConfigId(null)} />
        )}

        {!somenteLeitura && perguntasDaEtapa}
        {!somenteLeitura && gavetaNova}
      </div>
    </div>
  )
}

/** Linhas de rodapé de uma atividade — FONTE ÚNICA. O layout mede a altura da caixa por
 *  ela (`metaLines`) e o exportador repete o mesmo.
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
