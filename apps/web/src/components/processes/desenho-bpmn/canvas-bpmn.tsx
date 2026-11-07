'use client'

/* ─── Canvas do desenho BPMN ───────────────────────────────────────────────────
   Projeta o grafo gerado dos blocos + o desenho gravado (posições e raias) em nós e
   setas do React Flow. O canvas não muda o fluxo: mover uma forma só devolve um novo
   `DesenhoBpmn` por `onDesenho`. Clique SÓ seleciona (`onSelecionar`, `onSelecionarSeta`);
   duplo clique, Enter ou "Parametrizar" no menu da seleção pedem a gaveta (`onAbrir`). A
   forma selecionada mostra o menu pequeno acima, o próximo item ao lado (`onProximo`) e a
   bolinha de ligar embaixo. As intenções que mudam
   o fluxo só são AVISADAS: soltar uma forma da paleta (`onSoltar`), arrastar uma forma
   para cima de uma seta (`onMoverItem`), puxar uma seta à mão (`onLigar`, depois de
   `podeLigar`), arrastar a ponta de uma seta até outra forma (`onReligar`) ou pelo contorno
   da própria (`onPontas`, pontas livres), apagar a seta selecionada
   (`onApagarSeta`) e as ações rápidas da forma selecionada. Quem muda o fluxo é a página.
   As raias são só visuais: renomear, mudar a altura, subir/descer, remover e "+ raia"
   também saem por `onDesenho` (as formas ficam onde estão). Fases, largura da piscina e
   fluxos de mensagem saem por `onLayout`.
   Orientação: as posições são LÓGICAS; a tela é transposta na vertical (`paraTela`/
   `retanguloParaTela`) e tudo o que o ponteiro dá volta ao lógico (`daTela`, `pontoNaTela`).
   A vista anda como um mapa (PO, 07/11/2026): arrastar no vazio e a roda/trackpad movem o
   desenho (Shift + roda, para os lados); zoom no Ctrl + roda, na pinça e nos botões. Shift +
   arrastar no vazio é o laço, que seleciona várias (`onSelecaoMultipla`; com Ctrl, soma); o
   arrasto de formas encaixa na grade (se ligada) e nas guias de centro das outras formas. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type JSX, type KeyboardEvent as TeclaReact, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { useTema } from '@/lib/temas-provider'
import {
  ReactFlow, Background, BackgroundVariant, Controls, NodeToolbar, Panel, Position, ViewportPortal, applyNodeChanges,
  useStore, useStoreApi, useUpdateNodeInternals,
  useReactFlow,
  type AriaLabelConfig, type Connection, type Edge, type NodeChange, type NodePositionChange, type NodeSelectionChange, type OnConnectEnd,
  type OnNodeDrag, type ReactFlowInstance,
} from '@xyflow/react'
import { ArrowRight, Link2, Route, Settings, Trash2 } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import type { DesenhoBpmn, DesenhoV2, FormaDesenho, LayoutDesenho, PontaDaSeta, SetaDesenho, StepFormSchema, TipoForma } from '@nxt/types'
import {
  SUFIXO_REENCONTRO, acharItem, localDoItem, pontoDaSeta, varianteDe,
  type FluxoBlocos, type GrafoGerado, type ItemFluxo, type PontoDeInsercao,
} from '@nxt/workflow-core'
import {
  GRADE, RAIA_ROTULO_W, adicionarRaia, moverRaia, podeLigar, polilinhaDaSeta, raiaNaAltura, redimensionarRaia, removerRaia,
  renomearRaia, reordenarNoDesenho, setaSobPonto, type LadoDaSeta, type PatchDasPontas,
} from '@/lib/desenho-bpmn'
import { avisoDeRaia } from '@/lib/editor-bizagi/raias'
import { nodeSize, type FlowNodeType } from '@/lib/flow-layout'
import type { ExportModel, ExportNode, ExportNodeType } from '@/lib/flow-export'
import { ZOOM_MAX, ZOOM_MIN } from '@/components/processes/flow-shared'
import type { NovoItem } from '@/components/processes/workflow-blocos'
import {
  ContextoFormas, ContextoRaias, EVENTO_RECUO, MARCADOR_SETA, contornoDoNo, rotuloDaForma, tiposDeNo, tiposDeSeta, useRotaLivre,
  type AcoesDeForma, type AcoesDeRaia, type AlvoDaGaveta, type AlvoDeLargura, type NoBpmn, type PontasNaTela, type SetaBpmn, type SetaDeMensagem,
  type SetaDeSequencia, type TipoLosango,
} from './formas'
import { TIPO_ARRASTO_FORMA } from './paleta'
import { ALTURA_DA_COLUNA, ProximoItem } from './proximo-item'
import { indiceNaPaleta, itemDoArrasto, type ItemCatalogo } from '@/lib/editor-bizagi/catalogo'
import { daTela, encaixarComGuias, paraTela, type Caixa as CaixaLogica, type Orientacao } from '@/lib/editor-bizagi/geometria'
import {
  FORMA_MINIMA, apagarMensagem, larguraDaPiscina, layoutDe, ligarMensagem, podeLigarMensagem, pontasDaMensagem, redimensionarFase, religarMensagem,
} from '@/lib/editor-bizagi/layout'
import {
  pontaDaAlca, pontaDaTela, pontaMaisProxima, pontaParaTela, pontasLivresNaTela, pontoDoContorno, rotaEntreContornos, type ContornoDaPonta,
} from '@/lib/editor-bizagi/contorno'
import {
  alcaNaTela, faixasDoDesenho, faixasNaTela, pontoNaTela, rotaDaMensagem, type Faixas, type Retangulo,
} from '@/lib/editor-bizagi/faixas'
import { caixaDaForma, familiaDaForma, tipoDoEvento } from '@/lib/editor-bizagi/formas-do-canvas'

export type { AlvoDaGaveta } from './formas'

export interface CanvasBpmnProps {
  fluxo: FluxoBlocos; grafo: GrafoGerado; desenho: DesenhoBpmn
  /** O desenho livre (formas e setas como desenhadas): é o que decide se uma seta pode existir. */
  doc: DesenhoV2
  steps: Record<string, StepFormSchema>
  selecionado: string | null
  somenteLeitura?: boolean
  responsavelDe: (id: string) => string | undefined   // "Analista de Central de Contratos"
  /** O mesmo texto, para o executor padrão de uma raia (o aviso de raia o usa). */
  rotuloDoExecutorDaRaia: (ex: StepFormSchema['executor']) => string | undefined
  prazoDe: (id: string) => string | null               // dueText
  problemasDe: (id: string) => string[]                // mensagens de validação do nó
  /** Clique na forma (ou no vazio, `null`): só seleciona. */
  onSelecionar: (id: string | null) => void
  /** Duplo clique, Enter ou "Parametrizar": abre a gaveta do elemento. */
  onAbrir: (alvo: AlvoDaGaveta) => void
  /** Próximo item escolhido ao lado da forma `baseId`: a página cria a forma e a seta
   *  base → nova. `soltoEm` = canto superior esquerdo, na grade, quando foi arrastado. */
  onProximo: (baseId: string, item: ItemCatalogo, soltoEm?: { x: number; y: number }) => void
  /** Uma gaveta está aberta: o menu da seleção e o próximo item se recolhem. */
  gavetaAberta?: boolean
  /** Orientação do desenho. As posições gravadas são LÓGICAS (sempre horizontais); na vertical
   *  a tela é a transposição (formas pelo centro, faixas pelo retângulo inteiro). O próximo
   *  item vai à direita na horizontal, embaixo na vertical. */
  orientacao: Orientacao
  /** Grade ligada: pontos no fundo e as formas encaixam nela ao mover. */
  grade: boolean
  /** Conector ativo na paleta: "mensagem" faz o traço à mão virar fluxo de mensagem
   *  (só até/desde uma piscina externa — `podeLigarMensagem`). */
  conector: 'sequencia' | 'mensagem'
  /** Laço (ou Shift+clique) com 2+ formas: os ids delas; `[]` quando a seleção múltipla acaba. */
  onSelecaoMultipla: (ids: string[]) => void
  /** O desenho com o `layout` novo: fases, piscinas, fluxos de mensagem e tamanhos voltam por
   *  aqui (cada chamada é uma ação — um passo do desfazer). */
  onLayout: (d: DesenhoV2) => void
  onDesenho: (d: DesenhoBpmn) => void
  /** Forma da paleta solta no desenho: sobre uma seta (`sobreSeta`) entra no meio dela; em
   *  área vazia fica solta. Escolha e Ao mesmo tempo chegam como UM losango (sem o par). */
  onSoltar: (item: ItemCatalogo, perto: { x: number; y: number }, sobreSeta?: string) => void
  onMoverItem: (id: string, ponto: PontoDeInsercao) => void
  /** Seta desenhada à mão entre duas formas quaisquer (aceita por `podeLigar`). */
  onLigar: (de: string, para: string) => void
  /** A ponta de chegada da seta foi arrastada para outra forma; `entrada` = onde foi solta no
   *  contorno dela (lógico). */
  onReligar: (setaId: string, para: string, entrada?: PontaDaSeta) => void
  /** A ponta de saída da seta foi arrastada para outra forma (a condição vai junto). */
  onReligarSaida: (setaId: string, de: string, saida?: PontaDaSeta) => void
  /** Pontas livres de uma seta de sequência: a ponta arrastada pelo contorno da própria forma
   *  (lógica) ou `null` ("Caminho automático"). Cada chamada é um passo do desfazer. Os fluxos
   *  de mensagem mudam por `onLayout`. */
  onPontas: (setaId: string, patch: PatchDasPontas) => void
  /** Tarefa ou subprocesso redimensionado pela alça (a página grava em `layout.tamanhos`). */
  onTamanho: (id: string, tam: { largura: number; altura: number }) => void
  onApagarSeta: (setaId: string) => void
  /** A seta selecionada mudou (null = nenhuma). Só seleção: a condição abre por `onAbrir`. */
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
   *  `onInserirVinculada`, o menu da seleção ganha "Próxima: mesma configuração de…". */
  vinculaveis?: Array<{ id: string; nome: string }>
  onInserirVinculada?: (ponto: PontoDeInsercao, origemId: string, perto: { x: number; y: number }) => void
  /** Centra a vista nesta forma. `vez` muda a cada pedido (o mesmo id pode ser pedido de novo). */
  focoEm?: { id: string; vez: number } | null
  /** Muda (contador) quando a página quer a vista enquadrada no desenho todo — depois do
   *  "Organizar" e do desenho inicial. O valor da montagem não enquadra (o fitView já faz). */
  enquadrar?: number
}

/** Enquadrar deixa folga embaixo para os controles de zoom não cobrirem formas. A miniatura
 *  saiu (PO, 07/11/2026): com arrastar e rolar movendo o desenho, ela não fazia mais falta. */
const ENQUADRAR = { padding: { top: '48px', left: '48px', right: '48px', bottom: '96px' } } as const
/** Folga à direita da última forma, dentro da raia. */
const FOLGA_RAIA = 160
const LARGURA_MINIMA_RAIA = 640
/** Diferença de altura a partir da qual a seta sai/chega pelo topo ou pela base do losango. */
const DESNIVEL = GRADE / 2

type No = GrafoGerado['nodes'][number]
const ehAtividade = (t: No['type']) => t === 'userTask' || t === 'serviceTask'
const ehLosango = (t: No['type']) => familiaDaForma(t) === 'losango'
/** Evento (início, intermediário, fim): a alça fica recuada até o círculo. */
const ehEvento = (t: No['type'] | undefined) => !!t && familiaDaForma(t) === 'evento'
type Tamanhos = LayoutDesenho['tamanhos']
const SEM_TAMANHOS: Tamanhos = {}
/** A mesma caixa que o layout reserva (tarefa 190 × altura pelas linhas do nome; símbolos 56),
 *  ou o tamanho gravado da tarefa/subprocesso redimensionado. */
const tamanho = (n: No, tamanhos: Tamanhos = SEM_TAMANHOS) =>
  caixaDaForma(n.id, n.type, nodeSize({ id: n.id, type: n.type as FlowNodeType, name: n.name }, 0, 0), tamanhos)

const TIPO_LOSANGO: Partial<Record<string, TipoLosango>> = {
  exclusiveGateway: 'escolha', inclusiveGateway: 'inclusivo', parallelGateway: 'paralelo', eventGateway: 'evento',
}

/* O React Flow usa a descrição "keyboardDisabled" justamente quando o teclado está LIGADO
   (é a que fala das setas). Só leitura: as setas não movem nada, então o texto não promete. */
const rotulosAria = (somenteLeitura: boolean): Partial<AriaLabelConfig> => ({
  'node.a11yDescription.default': 'Espaço seleciona a forma; Enter abre a parametrização.',
  'node.a11yDescription.keyboardDisabled': somenteLeitura
    ? 'Espaço seleciona a forma; Enter abre a parametrização.'
    : 'Espaço seleciona a forma; depois, as setas do teclado a movem. Enter abre a parametrização.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `Forma movida para ${direction}. Nova posição: x ${x}, y ${y}.`,
  'edge.a11yDescription.default': 'Seta do fluxo.',
  'controls.ariaLabel': 'Controles do desenho',
  'controls.zoomIn.ariaLabel': 'Aproximar',
  'controls.zoomOut.ariaLabel': 'Afastar',
  'controls.fitView.ariaLabel': 'Enquadrar o desenho',
  'controls.interactive.ariaLabel': 'Travar ou destravar o desenho',
  'handle.ariaLabel': 'Ponto de ligação',
})

/* Cores que o React Flow pinta por prop (não aceitam classe `dark:`). */
const CORES = {
  claro: { fundo: 'var(--e-F4F7F4)', ponto: 'rgba(20,36,32,0.13)' },
  escuro: { fundo: 'var(--e-0C1511)', ponto: 'rgba(255,255,255,0.07)' },
}

/* ─── Projeção: grafo + desenho → nós e setas do React Flow ───────────────── */
type Projecao = Pick<CanvasBpmnProps, 'grafo' | 'desenho' | 'steps' | 'selecionado' | 'responsavelDe' | 'rotuloDoExecutorDaRaia' | 'prazoDe' | 'problemasDe' | 'nomeDoProcesso'> & {
  /** As formas do desenho livre (variante e nome de cada uma). */
  formas: readonly FormaDesenho[]
  tamanhos: Tamanhos
  /** Piscina, raias, fases e piscinas externas (lógico; `faixasDoDesenho`). */
  faixas: Faixas
  orientacao: Orientacao
  /** Formas da seleção múltipla (laço). */
  selecionadas: ReadonlySet<string>
}

/** Prefixos dos nós de fundo: não são formas (não ligam, não abrem a gaveta de forma). */
const ehFaixa = (id: string) => id === 'piscina' || id.startsWith('raia:') || id.startsWith('fase:') || id.startsWith('externa:')
const NO_EXTERNA = 'externa:'
const SETA_MENSAGEM = 'mensagem:'
const ehMensagem = (id: string) => id.startsWith(SETA_MENSAGEM)
/** Id do desenho a partir do id do nó (a piscina externa leva o prefixo no canvas). */
const idDoDesenho = (no: string) => (no.startsWith(NO_EXTERNA) ? no.slice(NO_EXTERNA.length) : no)

const FUNDO = {
  draggable: false, selectable: false, connectable: false, focusable: false, deletable: false, zIndex: -1,
  // clique e arrasto passam para o fundo (tirar seleção, laço, mover a vista); só os rótulos e
  // as alças religam o ponteiro (ver FormaRaia, FormaFase, FormaPiscina, FormaPiscinaExterna)
  style: { pointerEvents: 'none' as const },
}

function projetarNos({ grafo, desenho, steps, selecionado, responsavelDe, rotuloDoExecutorDaRaia, prazoDe, problemasDe, nomeDoProcesso, formas, tamanhos, faixas, orientacao, selecionadas }: Projecao): NoBpmn[] {
  const pos = (id: string) => desenho.posicoes[id] ?? { x: 0, y: 0 }
  const nos: NoBpmn[] = []

  /* fundo, na ordem em que se empilha: a piscina inteira (faixa do nome, canto do cabeçalho,
     alça do fim), as raias por cima, as fases (cabeçalho e divisória) por cima das raias e as
     piscinas externas embaixo. Tudo vem de `faixasDoDesenho` (lógico) já na tela. */
  const forma = new Map(formas.map((f) => [f.id, f]))
  const tela = faixasNaTela(faixas, orientacao)
  const caixaNaTela = (r: Retangulo) => ({ position: { x: r.x, y: r.y }, width: r.largura, height: r.altura })
  const temFases = tela.fases.length > 0
  if (tela.piscina) {
    nos.push({ id: 'piscina', type: 'piscina', ...caixaNaTela(tela.piscina), ...FUNDO,
      data: { nome: nomeDoProcesso?.trim() ?? '', largura: faixas.largura, cabecalho: temFases } })
  }
  desenho.raias.forEach((r, i) => {
    const c = tela.raias[i]?.caixa
    if (!c) return
    nos.push({
      id: `raia:${r.id}`, type: 'raia', ...caixaNaTela(c), ...FUNDO,
      data: { id: r.id, nome: r.nome, largura: faixas.largura, altura: r.altura, indice: i, primeira: i === 0, ultima: i === desenho.raias.length - 1, bordaDeCima: i === 0 && !temFases },
    })
  })
  tela.fases.forEach((g, i) => {
    nos.push({ id: `fase:${g.id}`, type: 'fase', ...caixaNaTela(g.coluna), ...FUNDO,
      data: { id: g.id, nome: g.nome, largura: faixas.fases[i].cabecalho.largura, primeira: g.primeira, ultima: g.ultima } })
  })
  for (const p of tela.externas) {
    // conectável: o corpo recebe a ponta do fluxo de mensagem (as alças decidem, pelo conector)
    nos.push({ id: NO_EXTERNA + p.id, type: 'externa', ...caixaNaTela(p.caixa), ...FUNDO, connectable: true, data: { id: p.id, nome: p.nome } })
  }

  for (const n of grafo.nodes) {
    const { w, h } = tamanho(n, tamanhos)
    const p = pos(n.id)
    const t = paraTela({ id: n.id, x: p.x, y: p.y, largura: w, altura: h }, orientacao)
    const comum = { id: n.id, position: { x: t.x, y: t.y }, width: w, height: h, selected: n.id === selecionado || selecionadas.has(n.id), deletable: false }
    const problemas = [...problemasDe(n.id)]
    const f = forma.get(n.id)
    /* sem forma gravada (não deveria acontecer) vale a variante padrão do tipo */
    const variante = varianteDe({ tipo: n.type as TipoForma, variante: f?.variante })
    let no: NoBpmn
    if ((n.type as string) === 'subProcess') {
      const sub = variante === 'embutido' ? 'embutido' : 'chamada'
      const nome = n.name?.trim() || f?.nome?.trim() || 'Subprocesso sem nome'
      no = { ...comum, type: 'tarefa', data: { nome, automatica: false, meta: '', problemas, largura: w, altura: h, variante: sub, subprocesso: sub } }
    } else if (ehAtividade(n.type)) {
      const automatica = n.type === 'serviceTask'
      const responsavel = responsavelDe(n.id)
      if (desenho.raias.length) {
        const i = raiaNaAltura(desenho.raias, pos(n.id).y + h / 2)
        const raia = i === -1 ? undefined : desenho.raias[i]
        const aviso = raia ? avisoDeRaia(raia, steps[n.id], { daRaia: rotuloDoExecutorDaRaia(raia.executor), responsavel }) : null
        if (aviso) problemas.push(aviso)
      }
      const nome = n.name?.trim() || steps[n.id]?.stepName?.trim() || (automatica ? 'Ação automática' : 'Tarefa sem nome')
      const meta = [responsavel ?? (automatica ? 'Automática' : 'Sem responsável'), prazoDe(n.id)].filter(Boolean).join(' · ')
      no = { ...comum, type: 'tarefa', data: { nome, automatica, meta, problemas, largura: w, altura: h, variante } }
    } else if (ehLosango(n.type)) {
      no = { ...comum, type: 'losango', data: { tipo: TIPO_LOSANGO[n.type]!, nome: n.name?.trim() || undefined, reencontro: n.id.endsWith(SUFIXO_REENCONTRO), problemas } }
    } else {
      // o nome vem da forma: no grafo, início e fim levam sempre "Início"/"Fim"
      no = { ...comum, type: 'evento', data: { tipo: tipoDoEvento(n.type), variante: variante ?? 'simples', nome: f?.nome?.trim() || undefined, problemas } }
    }
    no.ariaLabel = rotuloDaForma(no)
    nos.push(no)
  }
  return nos
}

/** Setas de sequência com as alças LÓGICAS (a tela troca o lado na vertical: `alcaNaTela`). */
type PontasGravadas = ReadonlyMap<string, Pick<SetaDesenho, 'saida' | 'entrada'>>
const SEM_PONTAS: PontasGravadas = new Map()

function projetarSetas(grafo: GrafoGerado, desenho: DesenhoBpmn, marcador: string, tamanhos: Tamanhos = SEM_TAMANHOS, pontas: PontasGravadas = SEM_PONTAS): SetaDeSequencia[] {
  const tipo = new Map(grafo.nodes.map((n) => [n.id, n.type]))
  const caixa = new Map(grafo.nodes.map((n) => [n.id, tamanho(n, tamanhos)]))
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
    const livres = pontas.get(e.id)
    return {
      id: e.id, source: e.from, target: e.to, sourceHandle, targetHandle, type: 'seta',
      data: { rotulo, senao: !!e.isDefault, ...(livres?.saida ? { saida: livres.saida } : {}), ...(livres?.entrada ? { entrada: livres.entrada } : {}) }, markerEnd: marcador,
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

function geometria(grafo: GrafoGerado, desenho: DesenhoBpmn, tamanhos: Tamanhos = SEM_TAMANHOS) {
  const nos = new Map(grafo.nodes.map((n) => [n.id, n]))
  const pos = (id: string): Pt => desenho.posicoes[id] ?? { x: 0, y: 0 }
  const caixa = (id: string): Caixa => { const n = nos.get(id); return n ? tamanho(n, tamanhos) : { w: 0, h: 0 } }
  const alca = (id: string, lado: LadoDaSeta): Pt => {
    const recuo = ehEvento(nos.get(id)?.type) ? EVENTO_RECUO : 0
    return pontoDaAlca(pos(id), caixa(id), lado, recuo)
  }
  const posicionado = (id: string) => !!desenho.posicoes[id]
  /** Contorno LÓGICO da forma (o das pontas livres). */
  const contorno = (id: string): ContornoDaPonta | null => {
    const t = nos.get(id)?.type
    if (!t) return null
    const p = pos(id), c = caixa(id)
    return contornoDoNo(tipoDoNo(t), p.x, p.y, c.w, c.h)
  }
  return { pos, caixa, alca, posicionado, contorno }
}

/** O tipo de nó do canvas (o que decide o contorno) a partir do tipo do grafo. */
const tipoDoNo = (t: No['type']): 'tarefa' | 'losango' | 'evento' =>
  (t as string) === 'subProcess' || ehAtividade(t) ? 'tarefa' : ehLosango(t) ? 'losango' : 'evento'

/** Só as setas com as duas pontas já posicionadas: as outras ainda estariam em (0, 0). */
function tracarSetas(setas: SetaDeSequencia[], g: ReturnType<typeof geometria>): Tracado[] {
  return setas.filter((s) => g.posicionado(s.source) && g.posicionado(s.target)).map((s) => {
    const ladoS = LADO_DA_ALCA[s.sourceHandle ?? 's-r'], ladoT = LADO_DA_ALCA[s.targetHandle ?? 'e-l']
    // pontas livres: o traço sai e chega nelas (lógico; a ponta que falta é a da alça)
    const a = s.data?.saida || s.data?.entrada ? g.contorno(s.source) : null, b = a ? g.contorno(s.target) : null
    if (a && b) {
      const pontos = rotaEntreContornos(a, s.data?.saida ?? pontaDaAlca(s.sourceHandle ?? 's-r'), b, s.data?.entrada ?? pontaDaAlca(s.targetHandle ?? 'e-l'))
      return { id: s.id, de: s.source, para: s.target, pontos }
    }
    return { id: s.id, de: s.source, para: s.target, pontos: polilinhaDaSeta(g.alca(s.source, ladoS), ladoS, g.alca(s.target, ladoT), ladoT) }
  })
}

/* ─── Exportação (JPG/PDF) do desenho BPMN ────────────────────────────────── */

/** Textos de cada forma no arquivo (nome, tipo, responsável…) — quem tem os passos é a página. */
export type InfoDaExportacao = (n: No) => Pick<ExportNode, 'name' | 'typeLabel' | 'meta' | 'isFork'>

/** O arquivo exportado é o desenho da TELA: as mesmas posições, raias e setas (o mesmo
 *  traçado em cantos retos). Antes ele saía do layout antigo, de raias por papel, e não
 *  batia com o que a pessoa desenhou. Tudo é deslocado para começar em (0, 0). */
export function modeloDeExportacao(grafo: GrafoGerado, desenho: DesenhoBpmn, info: InfoDaExportacao, tamanhos: Tamanhos = SEM_TAMANHOS, pontas: PontasGravadas = SEM_PONTAS): ExportModel {
  const posicionados = grafo.nodes.filter((n) => desenho.posicoes[n.id])
  const xs = posicionados.map((n) => desenho.posicoes[n.id].x), ys = posicionados.map((n) => desenho.posicoes[n.id].y)
  const dx = -Math.min(0, ...xs), dy = -Math.min(0, ...ys)
  const nodes: ExportNode[] = posicionados.map((n) => {
    const p = desenho.posicoes[n.id], { w, h } = tamanho(n, tamanhos)
    return { id: n.id, type: n.type as ExportNodeType, x: p.x + dx, y: p.y + dy, w, h, ...info(n) }
  })
  const setas = projetarSetas(grafo, desenho, '', tamanhos, pontas)
  const rotulo = new Map(setas.map((s) => [s.id, s.data?.rotulo]))
  const edges = tracarSetas(setas, geometria(grafo, desenho, tamanhos)).filter((t) => t.pontos.length > 1).map((t) => {
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

/** Caixa que a forma nova vai ocupar (para centrá-la no ponto de soltar). */
const caixaNova = (tipo: NovoItem): Caixa =>
  nodeSize({ id: 'nova', type: tipo === 'escolha' ? 'exclusiveGateway' : tipo === 'paralelo' ? 'parallelGateway' : tipo }, 0, 0)
/** Caixa da forma que o item da paleta cria. */
const caixaDoItem = (item: ItemCatalogo): Caixa => nodeSize({ id: 'nova', type: item.tipo as FlowNodeType }, 0, 0)

/** Tipo do `dataTransfer` com o id da forma de onde o próximo item foi arrastado. */
const TIPO_ARRASTO_PROXIMO = 'application/nxt-proximo-de'

/** Tempo que o aviso de seta recusada fica na tela. */
const RECUSA_MS = 4000
/** Distância (px na tela) até a qual o ponteiro "está sobre" a seta; limites em unidades do fluxo. */
const TOLERANCIA_TELA = 12
const TOLERANCIA_MIN = 6
const TOLERANCIA_MAX = 40
const COR_RECUSA = '#D64535'
/** Sequência não chega a uma piscina externa: o participante só conversa por mensagem. */
const MENSAGEM_PELA_PALETA = 'Uma piscina externa só recebe fluxo de mensagem. Escolha "Fluxo de mensagem" na paleta e ligue de novo.'
/** O que a gaveta abre para a seta (a de sequência ou o fluxo de mensagem). */
const alvoDaSeta = (id: string): AlvoDaGaveta => (ehMensagem(id) ? { k: 'mensagem', id: id.slice(SETA_MENSAGEM.length) } : { k: 'seta', id })

type Recusa = { motivo: string; pontos: Pt[]; vez: number }

/* ─── Componente ──────────────────────────────────────────────────────────── */
export function CanvasBpmn(props: CanvasBpmnProps): JSX.Element {
  const {
    fluxo, grafo, desenho, doc, steps, selecionado, nomeDoProcesso, revisaoDasConsultas, somenteLeitura = false,
    onSelecionar, onAbrir, onProximo, gavetaAberta = false, orientacao, grade, conector, onSelecaoMultipla, onLayout, onDesenho, onSoltar, onMoverItem, onLigar, onReligar, onReligarSaida, onPontas, onTamanho, onApagarSeta, onSelecionarSeta, setasComProblema, onRemover, vinculaveis, onInserirVinculada, focoEm, enquadrar,
  } = props
  const vertical = orientacao === 'vertical'
  const { resolvedTheme } = useTheme()
  const escuro = resolvedTheme === 'dark'
  /* O React Flow (fundo, pontos da grade) precisa de cor RESOLVIDA: as `var(--e-…)` do tema viram o
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
  const marcadorCirculo = `${MARCADOR_SETA}-circulo-${sufixoId}`
  const marcadorVazado = `${MARCADOR_SETA}-vazada-${sufixoId}`
  const instancia = useRef<ReactFlowInstance<NoBpmn, SetaBpmn> | null>(null)

  /* As funções de consulta costumam nascer a cada render do pai: ficam numa ref (sempre a
     mais nova, atribuída no render para a projeção nunca ler uma antiga) e a projeção só
     refaz quando os DADOS mudam (grafo deriva do fluxo) ou quando `revisaoDasConsultas` muda. */
  const consultas = useRef({ responsavelDe: props.responsavelDe, rotuloDoExecutorDaRaia: props.rotuloDoExecutorDaRaia, prazoDe: props.prazoDe, problemasDe: props.problemasDe })
  consultas.current = { responsavelDe: props.responsavelDe, rotuloDoExecutorDaRaia: props.rotuloDoExecutorDaRaia, prazoDe: props.prazoDe, problemasDe: props.problemasDe }
  /** Altura provisória da raia enquanto a alça é arrastada (só na tela; grava ao soltar). */
  const [previa, setPrevia] = useState<{ id: string; altura: number } | null>(null)
  // a raia da prévia sumiu ou o desenho virou só leitura: descarta (ajuste durante o render)
  if (previa && (somenteLeitura || !desenho.raias.some((r) => r.id === previa.id))) setPrevia(null)
  /** Largura provisória da fase/piscina enquanto a alça é arrastada (grava ao soltar). */
  const [previaLargura, setPreviaLargura] = useState<{ alvo: AlvoDeLargura; largura: number } | null>(null)
  if (previaLargura && somenteLeitura) setPreviaLargura(null)
  const layout = layoutDe(doc)
  /** Tamanhos gravados das tarefas/subprocessos redimensionados. */
  const tamanhos = layout.tamanhos
  /** O layout como está na tela (com a prévia da alça de fase/piscina). */
  const layoutVisto = useMemo(() => {
    if (!previaLargura) return layout
    const { alvo, largura } = previaLargura
    return layoutDe(alvo.k === 'fase' ? redimensionarFase(doc, alvo.id, largura) : larguraDaPiscina(doc, largura))
  }, [doc, layout, previaLargura])
  /** Altura de cada forma: as edições de raia levam as formas pelo CENTRO delas. */
  const alturaDe = useMemo(() => {
    const h = new Map(grafo.nodes.map((n) => [n.id, tamanho(n, tamanhos).h]))
    return (id: string) => h.get(id) ?? 0
  }, [grafo, tamanhos])
  const desenhoVisto = useMemo(() => (previa ? redimensionarRaia(desenho, previa.id, previa.altura, alturaDe) : desenho), [desenho, previa, alturaDe])
  /** Piscina, raias, fases e piscinas externas, no lógico. */
  const faixas = useMemo(() => {
    const pos = (id: string) => desenhoVisto.posicoes[id] ?? { x: 0, y: 0 }
    const direita = grafo.nodes.reduce((m, n) => Math.max(m, pos(n.id).x + tamanho(n, tamanhos).w), 0)
    const fundo = grafo.nodes.reduce((m, n) => Math.max(m, pos(n.id).y + tamanho(n, tamanhos).h), 0)
    return faixasDoDesenho(desenhoVisto.raias, layoutVisto, { direita, fundo })
  }, [grafo, desenhoVisto, layoutVisto, tamanhos])

  /** Seleção múltipla (laço ou Shift+clique): 2+ formas. Com ela, `selecionado` fica null. */
  const [multi, setMulti] = useState<string[]>([])
  // só leitura, uma forma escolhida por fora (paleta, próximo item) ou formas que sumiram: ajusta
  if (multi.length && (somenteLeitura || selecionado)) setMulti([])
  else if (multi.some((id) => !desenho.posicoes[id])) {
    const ficam = multi.filter((id) => desenho.posicoes[id])
    setMulti(ficam.length >= 2 ? ficam : [])
  }
  const selecionadas = useMemo(() => new Set(multi), [multi])
  const avisarMulti = useRef(onSelecaoMultipla)
  avisarMulti.current = onSelecaoMultipla
  useEffect(() => { avisarMulti.current(multi.length >= 2 ? multi : []) }, [multi])

  const projetados = useMemo(
    () => projetarNos({ grafo, desenho: desenhoVisto, steps, selecionado, nomeDoProcesso, formas: doc.formas, tamanhos, faixas, orientacao, selecionadas, ...consultas.current }),
    // revisaoDasConsultas não é lida aqui: só sinaliza que as consultas passaram a responder outra coisa
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revisão intencional (ver CanvasBpmnProps)
    [grafo, desenhoVisto, steps, selecionado, nomeDoProcesso, doc.formas, tamanhos, faixas, orientacao, selecionadas, revisaoDasConsultas],
  )
  /** Pontas livres gravadas, por seta (só as que têm alguma). */
  const pontasGravadas = useMemo<PontasGravadas>(
    () => new Map(doc.setas.filter((x) => x.saida || x.entrada).map((x) => [x.id, { saida: x.saida, entrada: x.entrada }])), [doc.setas])
  const setas = useMemo(() => projetarSetas(grafo, desenho, marcador, tamanhos, pontasGravadas), [grafo, desenho, marcador, tamanhos, pontasGravadas])
  const geo = useMemo(() => geometria(grafo, desenho, tamanhos), [grafo, desenho, tamanhos])
  const tracados = useMemo(() => tracarSetas(setas, geo), [setas, geo])

  /* ─── Lógico ↔ tela ─────────────────────────────────────────────────────── */
  /** Canto superior esquerdo NA TELA da forma `id` com o canto lógico `p` (pelo centro). */
  const naTela = useCallback((id: string, p: Pt): Pt => {
    const c = geo.caixa(id)
    const t = paraTela({ id, x: p.x, y: p.y, largura: c.w, altura: c.h }, orientacao)
    return { x: t.x, y: t.y }
  }, [geo, orientacao])
  /** O inverso: canto lógico da forma `id` que está com o canto `p` na tela. */
  const logico = useCallback((id: string, p: Pt): Pt => {
    const c = geo.caixa(id)
    const l = daTela({ id, x: p.x, y: p.y, largura: c.w, altura: c.h }, orientacao)
    return { x: l.x, y: l.y }
  }, [geo, orientacao])
  /** Retângulo lógico de uma forma posicionada ou de uma piscina externa (pelo id do NÓ). */
  const retanguloDoNo = useCallback((no: string): { caixa: Retangulo; piscina: boolean } | null => {
    if (no.startsWith(NO_EXTERNA)) {
      const e = faixas.externas.find((x) => NO_EXTERNA + x.id === no)
      return e ? { caixa: e.caixa, piscina: true } : null
    }
    if (!geo.posicionado(no)) return null
    const p = geo.pos(no), c = geo.caixa(no)
    return { caixa: { x: p.x, y: p.y, largura: c.w, altura: c.h }, piscina: false }
  }, [faixas, geo])

  /* ─── Fluxos de mensagem (forma ↔ piscina externa) ─────────────────────── */
  /** Os fluxos de mensagem e, de cada um, as pontas na tela COMPLETAS (a automática de cada
   *  forma é o meio do lado de cima/baixo, como hoje; `null` na piscina externa). */
  const { mensagens, pontasDasMensagens } = useMemo(() => {
    const externas = new Set(layout.piscinasExternas.map((p) => p.id))
    const noDe = (id: string) => (externas.has(id) ? NO_EXTERNA + id : id)
    const saida: SetaDeMensagem[] = []
    const pontas = new Map<string, { completas: PontasNaTela; ajustada: boolean }>()
    for (const m of layout.fluxosMensagem) {
      const de = noDe(m.de), para = noDe(m.para)
      const a = retanguloDoNo(de), b = retanguloDoNo(para)
      if (!a || !b) continue
      const rota = rotaDaMensagem(a, b)
      const desce = rota[rota.length - 1].y >= rota[0].y
      const sourceHandle = a.piscina ? 'msg-s' : alcaNaTela(desce ? 's-b' : 's-t', orientacao)
      const targetHandle = b.piscina ? 'msg-e' : alcaNaTela(desce ? 'e-t' : 'e-b', orientacao)
      const completas: PontasNaTela = {
        saida: a.piscina ? null : pontaParaTela(m.saida ?? pontaDaAlca(desce ? 's-b' : 's-t'), orientacao),
        entrada: b.piscina ? null : pontaParaTela(m.entrada ?? pontaDaAlca(desce ? 'e-t' : 'e-b'), orientacao),
      }
      const ajustada = !!((!a.piscina && m.saida) || (!b.piscina && m.entrada))
      pontas.set(SETA_MENSAGEM + m.id, { completas, ajustada })
      saida.push({
        id: SETA_MENSAGEM + m.id, source: de, target: para, sourceHandle, targetHandle, type: 'mensagem',
        data: { pontos: rota.map((p) => pontoNaTela(p, orientacao)), rotulo: m.rotulo, ...(ajustada ? { pontas: completas } : {}) },
        markerStart: marcadorCirculo, markerEnd: marcadorVazado, reconnectable: false, deletable: false,
        ariaLabel: `Fluxo de mensagem${m.rotulo ? `: ${m.rotulo}` : ''}`,
      })
    }
    return { mensagens: saida, pontasDasMensagens: pontas }
  }, [layout, retanguloDoNo, orientacao, marcadorCirculo, marcadorVazado])

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
  if (setaSel && (somenteLeitura || !(setas.some((s) => s.id === setaSel) || mensagens.some((m) => m.id === setaSel)))) setSetaSel(null)
  /** Ponta da seta selecionada sendo arrastada: sobre a própria forma (`no` = ela) ou sobre
   *  outra (religar). `ponta` na TELA; `null` = piscina externa. `recusa` = não pode soltar ali. */
  const [pontaArrastada, setPontaArrastada] = useState<{ setaId: string; qual: 'saida' | 'entrada'; no: string; ponta: PontaDaSeta | null; recusa: string | null } | null>(null)
  if (pontaArrastada && pontaArrastada.setaId !== setaSel) setPontaArrastada(null)
  /** As pontas da seta de sequência na tela, completas (a que não é livre é a da alça). */
  const pontasDaSequencia = useCallback((s: SetaDeSequencia): PontasNaTela => ({
    saida: pontaParaTela(s.data?.saida ?? pontaDaAlca(s.sourceHandle ?? 's-r'), orientacao),
    entrada: pontaParaTela(s.data?.entrada ?? pontaDaAlca(s.targetHandle ?? 'e-l'), orientacao),
  }), [orientacao])
  /** A seta selecionada como as alças das pontas a veem: as pontas completas, quais pontas são
   *  formas (a piscina externa não tem alça) e se alguma foi ajustada à mão. */
  const selDasPontas = useMemo(() => {
    if (!setaSel) return null
    if (ehMensagem(setaSel)) {
      const m = mensagens.find((x) => x.id === setaSel), p = pontasDasMensagens.get(setaSel)
      if (!m || !p) return null
      // sem ajuste, o traço é o de sempre (a rota do lógico): as alças ficam nas pontas dele
      const pts = m.data?.pontos ?? []
      const extremos = !p.ajustada && pts.length > 1 ? { saida: pts[0], entrada: pts[pts.length - 1] } : undefined
      return { id: m.id, source: m.source, target: m.target, pontas: p.completas, ajustada: p.ajustada, alcas: { saida: !!p.completas.saida, entrada: !!p.completas.entrada }, extremos }
    }
    const s = setas.find((x) => x.id === setaSel)
    if (!s) return null
    return { id: s.id, source: s.source, target: s.target, pontas: pontasDaSequencia(s), ajustada: !!(s.data?.saida || s.data?.entrada), alcas: { saida: true, entrada: true }, extremos: undefined }
  }, [setaSel, mensagens, pontasDasMensagens, setas, pontasDaSequencia])
  /** As pontas da seta durante o arrasto: a arrastada segue o ponteiro. */
  const previaDasPontas = useMemo((): PontasNaTela | null => {
    if (!pontaArrastada || !selDasPontas) return null
    const proprio = pontaArrastada.qual === 'saida' ? selDasPontas.source : selDasPontas.target
    return {
      ...selDasPontas.pontas, [pontaArrastada.qual]: pontaArrastada.ponta,
      ...(pontaArrastada.no !== proprio ? { trocar: { qual: pontaArrastada.qual, no: pontaArrastada.no } } : {}),
    }
  }, [pontaArrastada, selDasPontas])
  const avisarSeta = useRef(onSelecionarSeta)
  avisarSeta.current = onSelecionarSeta
  // a página só conhece as setas de sequência (a condição); a mensagem não é dela
  useEffect(() => { avisarSeta.current?.(setaSel && !ehMensagem(setaSel) ? setaSel : null) }, [setaSel])
  const setasVistas = useMemo<SetaBpmn[]>(() => [
    ...setas.map((s): SetaDeSequencia => {
      const arrastada = previaDasPontas && pontaArrastada?.setaId === s.id
      // pontas livres (gravadas ou no arrasto): o traço sai e chega nelas
      // sem nenhuma ponta livre: undefined, e a seta segue no traço automático de sempre
      const pontas = arrastada ? previaDasPontas : pontasLivresNaTela(s.data ?? {}, s.sourceHandle ?? 's-r', s.targetHandle ?? 'e-l', orientacao)
      return {
        ...s,
        // alças lógicas → lado na tela (na vertical, a saída da direita vira a de baixo)
        sourceHandle: alcaNaTela(s.sourceHandle ?? 's-r', orientacao), targetHandle: alcaNaTela(s.targetHandle ?? 'e-l', orientacao),
        // a seta é escolhida pelo clique; as pontas andam pelas alças da seleção (PontasDaSeta)
        selectable: !somenteLeitura, focusable: !somenteLeitura, selected: s.id === setaSel,
        reconnectable: false,
        data: {
          ...s.data!,
          ...(pontas ? { pontas } : {}),
          ...(s.id === destaque ? { destacada: true } : {}),
          ...(setasComProblema?.includes(s.id) || (arrastada && pontaArrastada?.recusa) ? { problema: true } : {}),
        },
      }
    }),
    ...mensagens.map((m): SetaDeMensagem => {
      const arrastada = previaDasPontas && pontaArrastada?.setaId === m.id
      return {
        ...m, selectable: !somenteLeitura, focusable: !somenteLeitura, selected: m.id === setaSel,
        ...(arrastada ? { data: { ...m.data!, pontas: previaDasPontas, ...(pontaArrastada?.recusa ? { problema: true } : {}) } } : {}),
      }
    }),
  ], [setas, mensagens, destaque, setaSel, somenteLeitura, setasComProblema, orientacao, previaDasPontas, pontaArrastada])

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

  /** Ponto do ponteiro no fluxo, em coordenada LÓGICA (transposto na vertical). */
  const noFluxo = useCallback((e: Parameters<typeof ponteiro>[0]): Pt | null => {
    const q = ponteiro(e)
    return q && instancia.current ? pontoNaTela(instancia.current.screenToFlowPosition({ x: q.clientX, y: q.clientY }), orientacao) : null
  }, [orientacao])

  /** Grava as posições LÓGICAS de uma vez; só as que mudaram (clique sem mover não grava). */
  const gravarVarias = useCallback((novas: Record<string, Pt>) => {
    const mudaram = Object.entries(novas).filter(([id, p]) => { const a = desenho.posicoes[id]; return !a || a.x !== p.x || a.y !== p.y })
    if (!mudaram.length) return
    onDesenho({ ...desenho, posicoes: { ...desenho.posicoes, ...Object.fromEntries(mudaram.map(([id, p]) => [id, { x: p.x, y: p.y }])) } })
  }, [desenho, onDesenho])
  /** Grava a posição LÓGICA; não faz nada se a forma ficou onde estava (clique sem mover). */
  const gravar = useCallback((id: string, p: Pt) => gravarVarias({ [id]: p }), [gravarVarias])

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
    setNos((atual) => atual.map((n) => (ficam.has(n.id) || !alvo.posicoes[n.id] ? n : { ...n, position: naTela(n.id, alvo.posicoes[n.id]) })))
  }, [desenhoReordenado, desenho, fluxo, naTela])

  /* ─── Grade e guias durante o arrasto ──────────────────────────────────────
     Cada passo do arrasto passa por `encaixar`: a forma (a primeira, se forem várias) encaixa
     na grade — se ligada — e no centro de outra a até 6 px (`encaixarComGuias`, no lógico); as
     outras arrastadas andam o mesmo tanto. As posições lógicas ficam em `encaixe` (é o que
     grava ao soltar) e as guias, tracejadas em verde, até o fim do arrasto. */
  const encaixe = useRef<Map<string, Pt> | null>(null)
  /** A alça de tamanho de uma tarefa está sendo arrastada (não é um arrasto de forma). */
  const redimensionando = useRef(false)
  const [guias, setGuias] = useState<Array<{ a: Pt; b: Pt }>>([])
  const encaixar = useCallback((mudancas: NodePositionChange[]): NodePositionChange[] => {
    const formas = mudancas.filter((m) => m.position && !ehFaixa(m.id))
    if (!formas.length) return mudancas
    const movendo = new Set(formas.map((m) => m.id))
    const caixaLogica = (id: string, p: Pt): CaixaLogica => { const c = geo.caixa(id), l = logico(id, p); return { id, x: l.x, y: l.y, largura: c.w, altura: c.h } }
    const primeira = caixaLogica(formas[0].id, formas[0].position!)
    const outras = grafo.nodes.filter((n) => !movendo.has(n.id) && geo.posicionado(n.id))
      .map((n): CaixaLogica => { const p = geo.pos(n.id), c = geo.caixa(n.id); return { id: n.id, x: p.x, y: p.y, largura: c.w, altura: c.h } })
    const r = encaixarComGuias(primeira, outras, 6, grade)
    const dx = r.x - primeira.x, dy = r.y - primeira.y
    const posicoes = new Map<string, Pt>()
    for (const m of formas) { const l = caixaLogica(m.id, m.position!); posicoes.set(m.id, { x: l.x + dx, y: l.y + dy }) }
    encaixe.current = posicoes
    // cada guia vai da forma movida até a mais distante das que dividem aquele centro
    const movida = { ...primeira, x: r.x, y: r.y }
    const centro = (c: CaixaLogica) => ({ x: c.x + c.largura / 2, y: c.y + c.altura / 2 })
    setGuias(r.guias.map((g) => {
      const juntas = [movida, ...outras.filter((o) => Math.abs(centro(o)[g.eixo] - g.valor) < 0.5)]
      const outro = g.eixo === 'x' ? 'y' : 'x'
      const min = Math.min(...juntas.map((c) => (outro === 'y' ? c.y : c.x))) - GRADE
      const max = Math.max(...juntas.map((c) => (outro === 'y' ? c.y + c.altura : c.x + c.largura))) + GRADE
      const a = g.eixo === 'x' ? { x: g.valor, y: min } : { x: min, y: g.valor }
      const b = g.eixo === 'x' ? { x: g.valor, y: max } : { x: max, y: g.valor }
      return { a: pontoNaTela(a, orientacao), b: pontoNaTela(b, orientacao) }
    }))
    return mudancas.map((m) => { const l = posicoes.get(m.id); return l ? { ...m, position: naTela(m.id, l) } : m })
  }, [geo, grafo, grade, logico, naTela, orientacao])

  /** Posição lógica da forma solta: a do encaixe (o que se viu) ou a da tela, convertida. */
  const logicaAoSoltar = useCallback((no: NoBpmn) => encaixe.current?.get(no.id) ?? logico(no.id, no.position), [logico])

  const onNodeDragStart = useCallback<OnNodeDrag<NoBpmn>>(() => { vagaDaPrevia.current = null; encaixe.current = null; setArrastando(true) }, [])
  const onNodeDrag = useCallback<OnNodeDrag<NoBpmn>>((e, no, arrastados) => {
    // várias formas juntas só andam: reordenar no fluxo é de uma por vez
    if (arrastados.length > 1 || !reordenavel(no.id)) return
    const p = noFluxo(e)
    const vaga = p ? alvoNoPonto(p, no.id).vaga : null
    setDestaque(vaga?.setaId ?? null)
    mostrarPrevia(no.id, vaga, encaixe.current?.get(no.id)?.y ?? logico(no.id, no.position).y)
  }, [noFluxo, reordenavel, alvoNoPonto, mostrarPrevia, logico])
  const onNodeDragStop = useCallback<OnNodeDrag<NoBpmn>>((e, no, arrastados) => {
    setArrastando(false) // o render seguinte ressincroniza, se a projeção mudou durante o arrasto
    setDestaque(null)
    setGuias([])
    const tevePrevia = vagaDaPrevia.current !== null
    vagaDaPrevia.current = null
    const formas = arrastados.filter((n) => !ehFaixa(n.id))
    const posicoes = Object.fromEntries(formas.map((n) => [n.id, logicaAoSoltar(n)]))
    encaixe.current = null
    if (ehFaixa(no.id)) return
    if (formas.length > 1) { gravarVarias(posicoes); return }
    const aqui = posicoes[no.id] ?? logico(no.id, no.position)
    const p = reordenavel(no.id) ? noFluxo(e) : null
    const vaga = p ? alvoNoPonto(p, no.id).vaga : null
    if (!vaga) {
      if (tevePrevia) setNos(projetados) // a prévia saiu de cima da vaga: as outras voltam
      gravar(no.id, aqui)
      return
    }
    // abre e fecha o espaço (a posição) e muda a ordem (o fluxo): as duas valem juntas
    onDesenho(desenhoReordenado(no.id, vaga.antesDe, aqui.y))
    onMoverItem(no.id, vaga.ponto)
  }, [gravar, gravarVarias, noFluxo, onMoverItem, onDesenho, reordenavel, alvoNoPonto, desenhoReordenado, projetados, logico, logicaAoSoltar])

  /* ─── Soltar da paleta ─────────────────────────────────────────────────── */
  const aceitaArrasto = (e: DragEvent) => !somenteLeitura && e.dataTransfer.types.includes(TIPO_ARRASTO_FORMA)
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!aceitaArrasto(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    // o próximo item arrastado cria a forma onde cair, ligada à base: não entra numa seta
    if (e.dataTransfer.types.includes(TIPO_ARRASTO_PROXIMO)) { setDestaque(null); return }
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
    const item = itemDoArrasto(e.dataTransfer.getData(TIPO_ARRASTO_FORMA))
    const p = noFluxo(e)
    if (!item || !p) return
    const c = caixaDoItem(item)
    const perto = { x: naGrade(p.x - c.w / 2), y: naGrade(p.y - c.h / 2) }
    const base = e.dataTransfer.getData(TIPO_ARRASTO_PROXIMO)
    if (base) { onProximo(base, item, perto); return }
    // em cima de uma seta entra no meio dela; em área vazia fica solta, para ligar à mão
    onSoltar(item, perto, setaNoPonto(p) ?? undefined)
  }

  /* ─── Setas à mão ──────────────────────────────────────────────────────── */
  const [recusa, setRecusa] = useState<Recusa | null>(null)
  useEffect(() => {
    if (!recusa) return
    const t = setTimeout(() => setRecusa(null), RECUSA_MS)
    return () => clearTimeout(t)
  }, [recusa])

  /** Traço da seta recusada (lógico): sai pela direita rumo à frente, por baixo quando volta.
   *  Com uma piscina externa numa das pontas, é o traço do fluxo de mensagem. */
  const tracoRecusado = useCallback((de: string, para: string): Pt[] => {
    if (de.startsWith(NO_EXTERNA) || para.startsWith(NO_EXTERNA)) {
      const a = retanguloDoNo(de), b = retanguloDoNo(para)
      return a && b ? rotaDaMensagem(a, b) : []
    }
    const volta = geo.pos(para).x < geo.pos(de).x
    const ladoS: LadoDaSeta = volta ? 'base' : 'direita', ladoT: LadoDaSeta = volta ? 'base' : 'esquerda'
    return polilinhaDaSeta(geo.alca(de, ladoS), ladoS, geo.alca(para, ladoT), ladoT)
  }, [geo, retanguloDoNo])

  const recusar = useCallback((motivo: string, de: string, para: string) =>
    setRecusa((antes) => ({ motivo, pontos: tracoRecusado(de, para), vez: (antes?.vez ?? 0) + 1 })), [tracoRecusado])
  /** Por que o traço `de` → `para` (ids dos NÓS) não pode existir, no conector ativo; null = pode. */
  const motivoDoTraco = useCallback((de: string, para: string): string | null => {
    if (conector === 'mensagem') return podeLigarMensagem(doc, idDoDesenho(de), idDoDesenho(para))
    if (de.startsWith(NO_EXTERNA) || para.startsWith(NO_EXTERNA)) return MENSAGEM_PELA_PALETA
    return podeLigar(doc, de, para)
  }, [conector, doc])
  /* Qualquer forma liga a qualquer outra: o traço só é recusado no que nunca faz sentido (seta
     no Início, saída do Fim, laço na mesma forma, seta repetida). O resto — uma etapa com duas
     saídas, um caminho sem fim — vira pendência do desenho, não bloqueio do traço. Com o
     conector "Fluxo de mensagem", o traço vira mensagem (só de/para uma piscina externa). */
  const tentarLigar = useCallback((de: string, para: string) => {
    if (somenteLeitura || de === para) return
    const motivo = motivoDoTraco(de, para)
    if (motivo) { recusar(motivo, de, para); return }
    setRecusa(null)
    if (conector === 'mensagem') onLayout(ligarMensagem(doc, idDoDesenho(de), idDoDesenho(para)))
    else onLigar(de, para)
  }, [somenteLeitura, motivoDoTraco, recusar, conector, onLayout, doc, onLigar])

  const isValidConnection = useCallback((c: Edge | Connection) => !motivoDoTraco(c.source, c.target), [motivoDoTraco])
  const onConnect = useCallback((c: Connection) => tentarLigar(c.source, c.target), [tentarLigar])
  /* ─── Pontas livres da seta selecionada (PO, 03/11/2026) ─────────────────────
     Arrastar a alça de uma ponta pelo contorno da PRÓPRIA forma muda onde a seta encosta
     (qualquer lado, qualquer posição); soltar sobre OUTRA forma religa a seta ali, no ponto
     do contorno onde caiu. Tudo na tela durante o arrasto; ao soltar, a ponta volta ao lógico
     (`pontaDaTela`) e vai para a página — um passo do desfazer. */
  /** Forma (ou, para a mensagem, piscina externa) sob o ponto da tela; a menor que o contém. */
  const noSobOPonto = useCallback((p: Pt, comPiscina: boolean, menos: string): NoBpmn | null => {
    let melhor: NoBpmn | null = null, area = Infinity
    for (const n of nos) {
      if (n.id === menos) continue
      if (!(n.type === 'tarefa' || n.type === 'losango' || n.type === 'evento' || (comPiscina && n.type === 'externa'))) continue
      const w = n.width ?? 0, h = n.height ?? 0, folga = 4
      if (p.x < n.position.x - folga || p.x > n.position.x + w + folga || p.y < n.position.y - folga || p.y > n.position.y + h + folga) continue
      if (w * h < area) { area = w * h; melhor = n }
    }
    return melhor
  }, [nos])
  /** Por que a ponta `qual` da seta não pode ir para o nó `alvo`; null = pode. */
  const motivoDaTroca = useCallback((setaId: string, qual: 'saida' | 'entrada', alvo: string): string | null => {
    if (ehMensagem(setaId)) {
      const l = layoutDe(doc), id = setaId.slice(SETA_MENSAGEM.length)
      const m = l.fluxosMensagem.find((x) => x.id === id)
      if (!m) return null
      const semEla = { ...doc, layout: { ...l, fluxosMensagem: l.fluxosMensagem.filter((x) => x.id !== id) } }
      return podeLigarMensagem(semEla, qual === 'saida' ? idDoDesenho(alvo) : m.de, qual === 'entrada' ? idDoDesenho(alvo) : m.para)
    }
    const s = doc.setas.find((x) => x.id === setaId)
    if (!s) return null
    return podeLigar({ ...doc, setas: doc.setas.filter((x) => x.id !== setaId) }, qual === 'saida' ? alvo : s.de, qual === 'entrada' ? alvo : s.para)
  }, [doc])
  const moverPonta = useCallback((qual: 'saida' | 'entrada', p: Pt) => {
    if (!selDasPontas || somenteLeitura) return
    const proprio = qual === 'saida' ? selDasPontas.source : selDasPontas.target
    const outro = noSobOPonto(p, ehMensagem(selDasPontas.id), proprio)
    const no = outro ?? nos.find((n) => n.id === proprio)
    const c = contornoNaTela(no)
    if (!no || !c) return
    setPontaArrastada({
      setaId: selDasPontas.id, qual, no: no.id,
      ponta: c.piscina ? null : pontaMaisProxima(c.caixa, c.forma, p),
      recusa: outro ? motivoDaTroca(selDasPontas.id, qual, outro.id) : null,
    })
  }, [selDasPontas, somenteLeitura, noSobOPonto, nos, motivoDaTroca])
  /** Grava a ponta `qual` na PRÓPRIA forma (na tela → lógico). */
  const gravarPonta = useCallback((setaId: string, qual: 'saida' | 'entrada', ponta: PontaDaSeta) => {
    const logica = pontaDaTela(ponta, orientacao)
    if (ehMensagem(setaId)) {
      const novo = pontasDaMensagem(doc, setaId.slice(SETA_MENSAGEM.length), { [qual]: logica })
      if (novo !== doc) onLayout(novo)
    } else onPontas(setaId, { [qual]: logica })
  }, [orientacao, doc, onLayout, onPontas])
  const soltarPonta = useCallback(() => {
    const a = pontaArrastada
    setPontaArrastada(null)
    if (!a || !selDasPontas || somenteLeitura) return
    const proprio = a.qual === 'saida' ? selDasPontas.source : selDasPontas.target
    if (a.no === proprio) { if (a.ponta) gravarPonta(a.setaId, a.qual, a.ponta); return }
    const de = a.qual === 'saida' ? a.no : selDasPontas.source, para = a.qual === 'entrada' ? a.no : selDasPontas.target
    if (a.recusa) { recusar(a.recusa, de, para); return }
    setRecusa(null)
    const logica = a.ponta ? pontaDaTela(a.ponta, orientacao) : undefined
    if (ehMensagem(a.setaId)) {
      const novo = religarMensagem(doc, a.setaId.slice(SETA_MENSAGEM.length), a.qual === 'saida' ? 'de' : 'para', idDoDesenho(a.no), logica)
      if (novo !== doc) onLayout(novo)
    } else if (a.qual === 'saida') onReligarSaida(a.setaId, a.no, logica)
    else onReligar(a.setaId, a.no, logica)
  }, [pontaArrastada, selDasPontas, somenteLeitura, gravarPonta, recusar, orientacao, doc, onLayout, onReligar, onReligarSaida])
  /** Setas do teclado na alça: a ponta anda meia grade e cai no contorno da própria forma. */
  const pontaPeloTeclado = useCallback((qual: 'saida' | 'entrada', dx: number, dy: number) => {
    if (!selDasPontas || somenteLeitura) return
    const ponta = selDasPontas.pontas[qual]
    const c = contornoNaTela(nos.find((n) => n.id === (qual === 'saida' ? selDasPontas.source : selDasPontas.target)))
    if (!ponta || !c || c.piscina) return
    const p = pontoDoContorno(c.caixa, c.forma, ponta)
    const nova = pontaMaisProxima(c.caixa, c.forma, { x: p.x + dx * (GRADE / 2), y: p.y + dy * (GRADE / 2) })
    if (nova.lado !== ponta.lado || Math.abs(nova.t - ponta.t) > 1e-6) gravarPonta(selDasPontas.id, qual, nova)
  }, [selDasPontas, somenteLeitura, nos, gravarPonta])
  /** "Caminho automático": as pontas da seta selecionada voltam ao traçado automático. */
  const caminhoAutomatico = useCallback((setaId: string) => {
    if (somenteLeitura) return
    if (ehMensagem(setaId)) {
      const novo = pontasDaMensagem(doc, setaId.slice(SETA_MENSAGEM.length), { saida: null, entrada: null })
      if (novo !== doc) onLayout(novo)
    } else onPontas(setaId, { saida: null, entrada: null })
  }, [somenteLeitura, doc, onLayout, onPontas])
  const apagarSetaSel = useCallback(() => {
    if (!setaSel || somenteLeitura) return
    if (ehMensagem(setaSel)) onLayout(apagarMensagem(doc, setaSel.slice(SETA_MENSAGEM.length)))
    else onApagarSeta(setaSel)
    setSetaSel(null)
  }, [setaSel, somenteLeitura, onApagarSeta, onLayout, doc])
  /* Com uma gaveta já aberta, a seleção a leva junto (como no mockup): clicar noutra seta ou
     forma troca o que a gaveta mostra. Sem gaveta aberta, o clique só seleciona. */
  const onEdgeClick = useCallback((_e: unknown, s: SetaBpmn) => {
    if (somenteLeitura) return
    setSetaSel(s.id)
    setMulti((m) => (m.length ? [] : m))
    onSelecionar(null)
    if (gavetaAberta) onAbrir(alvoDaSeta(s.id))
  }, [somenteLeitura, onSelecionar, gavetaAberta, onAbrir])
  const onEdgeDoubleClick = useCallback((_e: unknown, s: SetaBpmn) => {
    if (somenteLeitura) return
    setSetaSel(s.id)
    onAbrir(alvoDaSeta(s.id))
  }, [somenteLeitura, onAbrir])
  /** Soltou fora de uma alça válida: se caiu numa forma (ou piscina externa), julga a ligação. */
  const onConnectEnd = useCallback<OnConnectEnd>((e, estado) => {
    if (estado.isValid || !estado.fromNode) return
    let alvo = estado.toNode?.id ?? null
    if (!alvo) {
      const q = ponteiro(e)
      const el = q ? document.elementFromPoint(q.clientX, q.clientY) : null
      alvo = el?.closest('.react-flow__node')?.getAttribute('data-id') ?? null
      /* o corpo da piscina externa deixa o ponteiro passar (fora do modo mensagem): o ponto
         dentro dela também é ela — a Sequência ali é recusada com o aviso, não some calada */
      if (!alvo || ehFaixa(alvo)) {
        const p = noFluxo(e)
        const ext = p && faixas.externas.find((x) => p.x >= x.caixa.x && p.x <= x.caixa.x + x.caixa.largura && p.y >= x.caixa.y && p.y <= x.caixa.y + x.caixa.altura)
        if (ext) alvo = NO_EXTERNA + ext.id
      }
    }
    if (alvo && (!ehFaixa(alvo) || alvo.startsWith(NO_EXTERNA))) tentarLigar(estado.fromNode.id, alvo)
  }, [tentarLigar, noFluxo, faixas])

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
  /* Clique só seleciona (o React Flow avisa por `onNodesChange`); o duplo clique abre a gaveta.
     Raia, fase e piscinas abrem pelo duplo clique na faixa do nome (ver formas.tsx). */
  const ehForma = (id: string | null | undefined) => !!id && !ehFaixa(id)
  const onNodeDoubleClick = useCallback((_e: unknown, n: NoBpmn) => {
    if (ehForma(n.id) && !ligandoDe) onAbrir({ k: 'forma', id: n.id })
  }, [ligandoDe, onAbrir])
  /** Enter na forma (ou na seta selecionada) abre a gaveta; espaço só seleciona (React Flow). */
  const teclaNaForma = (e: TeclaReact<HTMLDivElement>) => {
    const alvo = e.target as HTMLElement
    const campo = alvo.closest?.('input, textarea, select, [contenteditable="true"]')
    if ((e.key === 'Delete' || e.key === 'Backspace') && setaSel && !campo) { e.preventDefault(); apagarSetaSel(); return }
    if (e.key !== 'Enter' || campo || ligandoDe) return
    const id = alvo.closest?.('.react-flow__node')?.getAttribute('data-id')
    if (id && ehForma(id)) { e.preventDefault(); onAbrir({ k: 'forma', id }); return }
    // a seta com foco (o teclado não passa pelo clique): seleciona e abre
    const seta = alvo.closest?.('.react-flow__edge')?.getAttribute('data-id')
    if (seta && !somenteLeitura) { e.preventDefault(); setSetaSel(seta); onSelecionar(null); onAbrir(alvoDaSeta(seta)) }
  }

  /* ─── Seleção: uma forma (página) ou várias (laço, Shift+clique) ─────────── */
  /** A seleção de agora, como o React Flow a vê (lida no render: as mudanças do mesmo gesto
   *  chegam antes do próximo render). */
  const selecaoVista = useRef<string[]>([])
  selecaoVista.current = multi.length ? multi : selecionado ? [selecionado] : []
  /** Laço em andamento: `somar` = a seleção de antes (com Ctrl/⌘), `ids` = as formas dentro. */
  const laco = useRef<{ somar: string[]; ids: Set<string> } | null>(null)
  const confirmarSelecao = useCallback((ids: string[]) => {
    if (ids.length >= 2) {
      setMulti(ids); setSetaSel(null); setLigandoDe(null)
      onSelecionar(null)
      return
    }
    setMulti((m) => (m.length ? [] : m))
    if (ids.length === 1) {
      setSetaSel(null)
      if (gavetaAberta && !ligandoDe) onAbrir({ k: 'forma', id: ids[0] })
      else onSelecionar(ids[0])
    } else onSelecionar(null)
  }, [onSelecionar, onAbrir, gavetaAberta, ligandoDe])
  const onSelectionStart = useCallback((e: ReactMouseEvent) => {
    // o laço já pede Shift; somar à seleção de antes é com Ctrl (⌘ no Mac) junto
    laco.current = { somar: e.ctrlKey || e.metaKey ? selecaoVista.current : [], ids: new Set() }
  }, [])
  const onSelectionEnd = useCallback(() => {
    const l = laco.current
    laco.current = null
    if (!l) return
    confirmarSelecao([...new Set([...l.somar, ...l.ids])].filter((id) => !ehFaixa(id)))
  }, [confirmarSelecao])

  const onNodesChange = useCallback((mudancas: NodeChange<NoBpmn>[]) => {
    const sel = mudancas.filter((m): m is NodeSelectionChange => m.type === 'select' && !ehFaixa(m.id))
    if (laco.current && sel.length) {
      // durante o laço, só a tela acompanha; a seleção vale ao soltar (onSelectionEnd)
      for (const m of sel) { if (m.selected) laco.current.ids.add(m.id); else laco.current.ids.delete(m.id) }
      setNos((atual) => applyNodeChanges(sel, atual))
    } else if (sel.length) {
      // seleção é controlada por fora: só repassa a intenção
      const escolhido = sel.find((m) => m.selected)
      // no modo "Ligar com seta", escolher uma forma (clique, ou Enter/espaço no teclado) é o destino
      if (ligandoDe && escolhido) { setLigandoDe(null); tentarLigar(ligandoDe, escolhido.id) }
      const ids = new Set(selecaoVista.current)
      for (const m of sel) { if (m.selected) ids.add(m.id); else ids.delete(m.id) }
      confirmarSelecao([...ids])
    }
    let posicoes = mudancas.filter((m): m is NodePositionChange => m.type === 'position')
    // o arrasto (inclusive o último passo, que já chega sem `dragging`) encaixa na grade e nas guias
    if (redimensionando.current) { /* a alça de tamanho: a caixa segue o ponteiro, sem encaixe */ }
    else if (arrastando || posicoes.some((m) => m.dragging)) posicoes = encaixar(posicoes)
    else {
      // mover pelo teclado não passa por onNodeDragStop: grava aqui (todas as selecionadas juntas)
      const teclado = posicoes.filter((m) => m.position && !m.dragging && !ehFaixa(m.id))
      if (teclado.length) gravarVarias(Object.fromEntries(teclado.map((m) => [m.id, logico(m.id, m.position!)])))
    }
    const resto = [...posicoes, ...mudancas.filter((m) => m.type === 'dimensions')]
    if (resto.length) setNos((atual) => applyNodeChanges(resto, atual))
  }, [arrastando, encaixar, gravarVarias, logico, ligandoDe, tentarLigar, confirmarSelecao])

  /* ─── Menu da seleção, próximo item ────────────────────────────────────── */
  const itemSel = selecionado ? acharItem(fluxo, selecionado) : undefined
  const acoes = !somenteLeitura && !arrastando && itemSel ? itemSel : null
  /* O menu pequeno (Parametrizar, Apagar…) e o próximo item valem para QUALQUER forma do
     desenho (losango solto, o que junta, e também com o desenho incompleto); "mesma
     configuração de…" precisa do lugar no fluxo (`acoes`). Com a gaveta aberta, recolhem. */
  const formaSel = selecionado ? doc.formas.find((f) => f.id === selecionado) : undefined
  const menuSel = !somenteLeitura && !arrastando && !gavetaAberta && formaSel ? formaSel : null
  /** Ligar: não vale para Início e Fim. */
  const editavelSel = menuSel && menuSel.tipo !== 'start' && menuSel.tipo !== 'end' ? menuSel : null
  const podeLigarDaqui = !!editavelSel
  /** Apagar: qualquer forma, menos o único Início e o último Fim (um a mais se apaga). */
  const apagavelSel = menuSel && (editavelSel || doc.formas.filter((f) => f.tipo === menuSel.tipo).length > 1) ? menuSel : null
  /** Do Fim não sai seta: ele não tem próximo item. */
  const proximoDe = menuSel && menuSel.tipo !== 'end' ? menuSel : null
  const ladoDoProximo = orientacao === 'vertical' ? Position.Bottom : Position.Right
  const arrastarProximo = (item: ItemCatalogo, e: DragEvent) => {
    if (!proximoDe) return
    e.dataTransfer.setData(TIPO_ARRASTO_FORMA, JSON.stringify({ grupo: item.grupo, indice: indiceNaPaleta(item) }))
    e.dataTransfer.setData(TIPO_ARRASTO_PROXIMO, proximoDe.id)
    e.dataTransfer.effectAllowed = 'copy'
  }
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
  /* "Próxima: mesma configuração de…": menu com as atividades que podem ser repetidas. */
  /* aberto PARA uma forma: selecionar outra fecha o menu */
  const [menuVinculoDe, setMenuVinculoDe] = useState<string | null>(null)
  const podeVincular = !!onInserirVinculada && !!vinculaveis?.length
  const menuVinculo = !!acoes && podeVincular && menuVinculoDe === acoes.id
  const botoesDoMenu = 1 + (acoes && podeVincular ? 1 : 0) + (podeLigarDaqui ? 1 : 0) + (apagavelSel ? 1 : 0)
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
    const centro = pontoNaTela({ x: p.x + c.w / 2, y: p.y + c.h / 2 }, orientacao)
    void i.setCenter(centro.x, centro.y, { zoom: Math.max(i.getZoom(), 0.8), duration: 300 })
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
      abrir: onAbrir,
      vertical,
      conector,
      // fase e piscina principal: o layout novo (um passo do desfazer por soltura)
      largura: (alvo, largura) => {
        const novo = alvo.k === 'fase' ? redimensionarFase(doc, alvo.id, largura) : larguraDaPiscina(doc, largura)
        if (novo !== doc) onLayout(novo)
      },
      previaLargura: (alvo, largura) => setPreviaLargura(largura === null ? null : { alvo, largura }),
    }
  }, [desenho, onDesenho, onAbrir, somenteLeitura, alturaDe, vertical, conector, doc, onLayout])

  /* ─── Tamanho da tarefa/subprocesso (alça no canto da forma selecionada) ── */
  const projetadosAtuais = useRef(projetados)
  projetadosAtuais.current = projetados
  const acoesDeForma = useMemo<AcoesDeForma>(() => ({
    editavel: !somenteLeitura,
    // durante o arrasto da alça, uma projeção nova não pode devolver a caixa ao tamanho velho
    comecarTamanho: () => { redimensionando.current = true; setArrastando(true) },
    redimensionar: (id, tam, canto) => {
      redimensionando.current = false
      setArrastando(false)
      // a caixa volta à projeção: se o tamanho gravado não mudar (mesma grade), nenhuma
      // projeção nova chega para desfazer o arrasto; se mudar, a nova a substitui
      setNos(projetadosAtuais.current)
      onTamanho(id, tam)
      /* Na vertical, a forma fica pelo CENTRO transposto: com o tamanho novo, o canto da tela
         andaria. Grava a posição lógica que mantém o canto onde a alça o deixou (com o tamanho
         como a página vai gravar: na grade, com o mínimo). */
      if (vertical) {
        const w = naGrade(Math.max(FORMA_MINIMA.largura, tam.largura)), h = naGrade(Math.max(FORMA_MINIMA.altura, tam.altura))
        const l = daTela({ id, x: canto.x, y: canto.y, largura: w, altura: h }, orientacao)
        gravar(id, { x: l.x, y: l.y })
      }
    },
    // a bolinha de ligar fica do lado oposto ao próximo item
    ladoDaBolinha: vertical ? Position.Right : Position.Bottom,
    varias: multi.length >= 2,
  }), [somenteLeitura, onTamanho, orientacao, vertical, gravar, multi.length])

  const rotulosDeAcesso = useMemo(() => rotulosAria(somenteLeitura), [somenteLeitura])

  const ACAO = 'flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent hover:bg-[rgba(20,36,32,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:hover:bg-white/5 dark:focus-visible:outline-spark'

  return (
    <div className="desenho-bpmn relative h-full w-full font-sans [--bpmn-fundo:var(--e-F4F7F4)] [--bpmn-seta:var(--e-5E6F66)] [--bpmn-seta-destaque:var(--e-11804F)] dark:[--bpmn-fundo:var(--e-0C1511)] dark:[--bpmn-seta:var(--e-7B8F84)] dark:[--bpmn-seta-destaque:var(--e-C6F24E)]"
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
          {/* fluxo de mensagem: círculo vazado na saída, ponta vazada na chegada */}
          <marker id={marcadorCirculo} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <circle cx="5" cy="5" r="3.6" strokeWidth={1.3} style={{ fill: 'var(--bpmn-fundo)', stroke: 'var(--bpmn-seta)' }} />
          </marker>
          <marker id={marcadorVazado} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M1 1L11 6L1 11z" strokeWidth={1.2} strokeLinejoin="round" style={{ fill: 'var(--bpmn-fundo)', stroke: 'var(--bpmn-seta)' }} />
          </marker>
        </defs>
      </svg>
      <ContextoRaias.Provider value={acoesDeRaia}>
      <ContextoFormas.Provider value={acoesDeForma}>
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
          onNodeDoubleClick={onNodeDoubleClick}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onEdgeClick={onEdgeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          zoomOnDoubleClick={false}
          nodesDraggable={!somenteLeitura}
          nodesConnectable={!somenteLeitura}
          edgesReconnectable={false}
          deleteKeyCode={null}
          // A vista anda como um mapa (PO, 07/11/2026): arrastar no vazio (qualquer botão) e a
          // roda/trackpad movem; Shift + roda, para os lados; zoom com Ctrl + roda e pinça.
          // Laço: Shift + arrastar no vazio (Ctrl junto soma). Shift + clique soma uma forma.
          selectionKeyCode={somenteLeitura ? null : 'Shift'}
          selectionOnDrag={false}
          panOnDrag
          panOnScroll
          multiSelectionKeyCode={somenteLeitura ? null : 'Shift'}
          onSelectionStart={onSelectionStart}
          onSelectionEnd={onSelectionEnd}
          snapToGrid={grade}
          snapGrid={[GRADE, GRADE]}
          fitView
          fitViewOptions={ENQUADRAR}
          minZoom={ZOOM_MIN}
          maxZoom={ZOOM_MAX}
          colorMode={escuro ? 'dark' : 'light'}
          ariaLabelConfig={rotulosDeAcesso}
        >
          {/* sem grade, só o fundo (os pontos somem) */}
          <Background variant={BackgroundVariant.Dots} gap={GRADE} size={grade ? 1.2 : 0} color={grade ? cor.ponto : 'transparent'} bgColor={cor.fundo} />
          <SemCaixaDaSelecao />
          <AlcasNaOrientacao orientacao={orientacao} />
          <Controls showInteractive={false} position="bottom-left" />
          {setaSel && !somenteLeitura && (
            <Panel position="top-left">
              <div role="toolbar" aria-label="Seta selecionada"
                className="flex items-center gap-2 rounded-[10px] bg-white py-1 pl-3 pr-1 font-sans text-[11.5px] text-[var(--e-2E3E36)] shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:text-[var(--e-C9D6CE)] dark:shadow-[0_0_0_1px_var(--e-2A3B32)]">
                {ehMensagem(setaSel) ? 'Fluxo de mensagem selecionado' : 'Seta selecionada'} · arraste uma ponta pelo contorno ou até outra forma
                <button type="button" onClick={() => caminhoAutomatico(setaSel)} disabled={!selDasPontas?.ajustada}
                  title={selDasPontas?.ajustada ? 'Caminho automático: as pontas voltam ao traçado automático' : 'O traçado já é automático'} aria-label="Caminho automático"
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[rgba(20,36,32,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] disabled:pointer-events-none disabled:opacity-35 dark:hover:bg-white/5 dark:focus-visible:outline-spark">
                  <Route aria-hidden className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onAbrir(alvoDaSeta(setaSel))}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 font-bold hover:bg-[rgba(20,36,32,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:hover:bg-white/5">
                  <Settings aria-hidden className="h-3.5 w-3.5" />Parametrizar
                </button>
                <button type="button" onClick={apagarSetaSel}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 font-bold text-[#B42318] hover:bg-[rgba(180,35,24,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:text-[#FDA29B] dark:hover:bg-white/5">
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />Apagar seta
                </button>
              </div>
            </Panel>
          )}
          {selDasPontas && !somenteLeitura && (
            <PontasDaSeta source={selDasPontas.source} target={selDasPontas.target} pontas={previaDasPontas ?? selDasPontas.pontas}
              alcas={selDasPontas.alcas} extremos={pontaArrastada ? undefined : selDasPontas.extremos} arrastando={!!pontaArrastada} onMover={moverPonta} onSoltar={soltarPonta}
              onCancelar={() => setPontaArrastada(null)} onTeclado={pontaPeloTeclado} />
          )}
          {recusa && (
            <ViewportPortal>
              <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
                <path d={'M' + recusa.pontos.map((q) => pontoNaTela(q, orientacao)).map((q) => `${q.x} ${q.y}`).join(' L')} fill="none" stroke={COR_RECUSA}
                  strokeWidth={2} strokeDasharray="6 5" markerEnd={`url(#${marcadorRecusa})`} />
              </svg>
            </ViewportPortal>
          )}
          {/* guias do arrasto: centro alinhado com o de outra forma */}
          {guias.length > 0 && (
            <ViewportPortal>
              <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
                {guias.map((g, i) => (
                  <line key={i} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} strokeWidth={1} strokeDasharray="3 3"
                    style={{ stroke: 'var(--bpmn-seta-destaque)' }} />
                ))}
              </svg>
            </ViewportPortal>
          )}
          {/* menu pequeno da seleção, acima da forma */}
          <MenuAcimaDaForma nodeId={menuSel?.id} botoes={botoesDoMenu} desviarDaColuna={!!proximoDe && !vertical}>
            <div role="toolbar" aria-label="Forma selecionada"
              className="flex items-center gap-0.5 rounded-lg bg-white p-1 font-sans text-[var(--e-2E3E36)] shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:text-[var(--e-C9D6CE)] dark:shadow-[0_0_0_1px_var(--e-2A3B32),0_12px_24px_-12px_rgba(0,0,0,0.7)]">
              <button type="button" className={ACAO} title="Parametrizar (duplo clique ou Enter)" aria-label="Parametrizar"
                onClick={() => menuSel && onAbrir({ k: 'forma', id: menuSel.id })}>
                <Settings aria-hidden className="h-3.5 w-3.5" />
              </button>
              {acoes && podeVincular && (
                <button type="button" title="Próxima: mesma configuração de…" aria-label="Próxima: mesma configuração de…"
                  aria-haspopup="menu" aria-expanded={menuVinculo} data-vinculo-de={sufixoId}
                  className={`${ACAO} text-[#0369A1] dark:text-[#7DD3FC] ${menuVinculo ? 'bg-[rgba(20,36,32,0.08)] dark:bg-white/10' : ''}`}
                  onClick={() => setMenuVinculo((v) => !v)}>
                  <Link2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
              {podeLigarDaqui && (
                <button type="button" title="Ligar com seta (ou arraste a bolinha da forma)" aria-label="Ligar com seta" aria-pressed={ligandoDe === editavelSel?.id}
                  className={`${ACAO} text-[var(--e-142420)] dark:text-white ${ligandoDe === editavelSel?.id ? 'bg-[rgba(198,242,78,0.35)] dark:bg-[rgba(198,242,78,0.14)]' : ''}`}
                  onClick={() => setLigandoDe((x) => (x === editavelSel?.id ? null : editavelSel?.id ?? null))}>
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
              {apagavelSel && (
                <>
                  <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--e-D2DCD5)] dark:bg-[var(--e-2A3B32)]" />
                  <button type="button" title="Apagar (Delete)" aria-label="Apagar"
                    className={`${ACAO} text-[#B42318] hover:bg-[rgba(180,35,24,0.08)] dark:text-[#FDA29B] dark:hover:bg-[rgba(253,162,155,0.12)]`}
                    onClick={() => onRemover(apagavelSel.id)}>
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            {menuVinculo && podeVincular && (
              <div ref={listaVinculo} role="menu" aria-label="Repetir com a mesma configuração de" onKeyDown={teclasDoVinculo}
                className="absolute bottom-full left-0 mb-2 max-h-[260px] w-[240px] overflow-y-auto rounded-lg bg-white p-1 font-sans shadow-[0_0_0_1px_rgba(20,36,32,0.12),0_12px_24px_-12px_rgba(12,20,16,0.45)] dark:bg-[var(--e-0F1914)] dark:shadow-[0_0_0_1px_var(--e-2A3B32),0_12px_24px_-12px_rgba(0,0,0,0.7)]">
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
          </MenuAcimaDaForma>
          {/* próximo item: à direita da forma (embaixo, na vertical) */}
          <NodeToolbar nodeId={proximoDe?.id} isVisible={!!proximoDe} position={ladoDoProximo} offset={12}>
            <ProximoItem onEscolher={(item) => proximoDe && onProximo(proximoDe.id, item)} onArrastar={arrastarProximo} />
          </NodeToolbar>
        </ReactFlow>
      </ContextoFormas.Provider>
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

/** O React Flow mostra uma caixa por cima das formas laçadas (para arrastá-las juntas); aqui
 *  quem arrasta é a própria forma (as outras selecionadas vão junto), e a caixa só atrapalharia
 *  o clique e o duplo clique nelas. */
/** O menu da seleção, ACIMA da forma. Na horizontal, a coluna do próximo item (à direita,
 *  centrada na altura da forma) passa do topo de uma forma baixa — um evento, um losango — e,
 *  se a forma for estreita, o menu centrado chegaria nela: aí ele sobe até passar da coluna.
 *  Medidas na tela: a forma escala com o zoom; menu e coluna, não. Lê a loja do React Flow,
 *  então mora DENTRO do <ReactFlow> (o CanvasBpmn, que o renderiza, não tem a loja). */
function MenuAcimaDaForma({ nodeId, botoes, desviarDaColuna, children }: {
  nodeId: string | undefined; botoes: number; desviarDaColuna: boolean; children: ReactNode
}): JSX.Element {
  const medida = useStore((s) => {
    const n = nodeId ? s.nodeLookup.get(nodeId) : undefined
    const z = s.transform[2]
    return n ? `${(n.measured?.width ?? n.width ?? 0) * z}|${(n.measured?.height ?? n.height ?? 0) * z}` : ''
  })
  let offset = 8
  if (desviarDaColuna && medida) {
    const [w, h] = medida.split('|').map(Number)
    const meioDoMenu = (botoes * 28 + (botoes - 1) * 2 + 8) / 2
    if (w / 2 + 12 < meioDoMenu + 4) offset = Math.max(8, (ALTURA_DA_COLUNA - h) / 2 + 8)
  }
  return <NodeToolbar nodeId={nodeId} isVisible={!!nodeId} position={Position.Top} offset={offset}>{children}</NodeToolbar>
}

/** Contorno NA TELA de um nó do React Flow (forma ou piscina externa). */
const contornoNaTela = (n: NoBpmn | undefined): ContornoDaPonta | null =>
  (n ? contornoDoNo(n.type, n.position.x, n.position.y, n.width ?? 0, n.height ?? 0) : null)

const DIRECAO_DA_TECLA: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** As alças das duas pontas da seta selecionada (na tela, sobre o traço). Arrastar uma pelo
 *  contorno da forma move a ponta; soltar sobre outra forma religa (o canvas decide). As setas
 *  do teclado andam a ponta pelo contorno; Esc cancela o arrasto. Lê a loja do React Flow
 *  (a forma ao vivo, o zoom), então mora DENTRO do <ReactFlow>. */
function PontasDaSeta({ source, target, pontas, alcas, extremos, arrastando, onMover, onSoltar, onCancelar, onTeclado }: {
  source: string; target: string; pontas: PontasNaTela; alcas: { saida: boolean; entrada: boolean }; arrastando: boolean
  /** onde as alças ficam quando o traço não sai das pontas (o fluxo de mensagem sem ajuste) */
  extremos?: { saida: Pt; entrada: Pt }
  onMover: (qual: 'saida' | 'entrada', p: Pt) => void; onSoltar: () => void; onCancelar: () => void
  onTeclado: (qual: 'saida' | 'entrada', dx: number, dy: number) => void
}): JSX.Element | null {
  const rota = useRotaLivre(source, target, pontas)
  const { screenToFlowPosition } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const arrasto = useRef<{ qual: 'saida' | 'entrada'; moveu: boolean } | null>(null)
  if (!rota || rota.length < 2) return null
  const pontos = extremos ?? { saida: rota[0], entrada: rota[rota.length - 1] }
  return (
    <ViewportPortal>
      {(['saida', 'entrada'] as const).filter((q) => alcas[q]).map((qual) => (
        <button key={qual} type="button"
          aria-label={qual === 'saida' ? 'Ponta de saída da seta' : 'Ponta de chegada da seta'}
          title="Arraste pelo contorno da forma para mudar onde a seta encosta, ou até outra forma para religar. Com o foco, as setas do teclado andam a ponta."
          className={`nodrag nopan nowheel pointer-events-auto absolute left-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-[var(--e-11804F)] bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.9)] transition-shadow hover:bg-[rgba(198,242,78,0.9)] hover:shadow-[0_0_0_5px_rgba(17,128,79,0.22)] focus-visible:shadow-[0_0_0_5px_rgba(17,128,79,0.35)] focus-visible:outline-none dark:border-spark dark:bg-[var(--e-0A110D)] dark:shadow-[0_0_0_1px_rgba(0,0,0,0.6)] dark:hover:bg-spark dark:hover:shadow-[0_0_0_5px_rgba(198,242,78,0.25)] dark:focus-visible:shadow-[0_0_0_5px_rgba(198,242,78,0.35)] ${arrastando ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ transform: `translate(${pontos[qual].x}px, ${pontos[qual].y}px) translate(-50%, -50%) scale(${1 / Math.max(zoom, 0.01)})`, zIndex: 1200, touchAction: 'none' }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation(); e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            e.currentTarget.focus()
            arrasto.current = { qual, moveu: false }
          }}
          onPointerMove={(e) => {
            if (arrasto.current?.qual !== qual) return
            e.stopPropagation()
            arrasto.current.moveu = true
            onMover(qual, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
          }}
          onPointerUp={(e) => {
            const a = arrasto.current
            arrasto.current = null
            e.stopPropagation()
            if (a?.moveu) onSoltar(); else onCancelar()
          }}
          onPointerCancel={() => { arrasto.current = null; onCancelar() }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && arrasto.current) { e.preventDefault(); e.stopPropagation(); arrasto.current = null; onCancelar(); return }
            const d = DIRECAO_DA_TECLA[e.key]
            if (!d) return
            e.preventDefault(); e.stopPropagation()
            onTeclado(qual, d[0], d[1])
          }} />
      ))}
    </ViewportPortal>
  )
}

function SemCaixaDaSelecao(): null {
  const ativa = useStore((s) => s.nodesSelectionActive)
  const loja = useStoreApi()
  useEffect(() => { if (ativa) loja.setState({ nodesSelectionActive: false }) }, [ativa, loja])
  return null
}

/** Trocar a orientação muda o lado da bolinha de ligar (e as alças que as setas usam): o
 *  React Flow precisa medir de novo as alças de todas as formas. */
function AlcasNaOrientacao({ orientacao }: { orientacao: Orientacao }): null {
  const atualizar = useUpdateNodeInternals()
  const loja = useStoreApi()
  const vista = useRef(orientacao)
  useEffect(() => {
    if (vista.current === orientacao) return
    vista.current = orientacao
    // um quadro depois: as formas já foram desenhadas no lugar novo
    const raf = requestAnimationFrame(() => atualizar(loja.getState().nodes.map((n) => n.id)))
    return () => cancelAnimationFrame(raf)
  }, [orientacao, atualizar, loja])
  return null
}
