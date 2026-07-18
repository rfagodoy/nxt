/* ─── Modelo de grafo normalizado ──────────────────────────────────────────────
   O grafo é a forma "compilada" do diagrama BPMN. O designer (bpmn-js) produz XML
   BPMN 2.0; o compilador (compile.ts, na F1) o traduz para este grafo, que é o que
   o interpretador executa. Manter o interpretador sobre uma forma normalizada — e
   não sobre o XML cru — nos dá um motor limpo, testável e independente do BPMN. */

/** Tipos de nó suportados pelo motor.
 *  - start/end: eventos de início e fim.
 *  - userTask: atividade humana — o token DESCANSA aqui até uma pessoa concluir.
 *  - serviceTask: atividade automática — o backend executa um conector (domínio).
 *  - exclusiveGateway: escolhe UM caminho de saída (primeira condição verdadeira / default).
 *  - parallelGateway: bifurca (fork) em todos os caminhos e/ou sincroniza (join). */
export type WfNodeType =
  | 'start'
  | 'end'
  | 'userTask'
  | 'serviceTask'
  | 'exclusiveGateway'
  | 'parallelGateway'

/** Nó do grafo. Campos além de id/type/name são opcionais e por-tipo. */
export interface WfNode {
  id: string
  type: WfNodeType
  name?: string

  // ── userTask ──────────────────────────────────────────────────────────────
  /** Executor por PAPEL (lane do BPMN). Quem tiver o papel vê a tarefa. (F2) */
  role?: string
  /** Executor por USUÁRIO direto (atribuição fixa). (F2) */
  assignee?: string
  /** Tela/formulário associado à atividade — id de uma tela da Personalização de
   *  Telas. É o que a pessoa preenche ao executar a tarefa. (F3) */
  formRef?: string
  /** SLA da atividade em minutos a partir da criação da tarefa. (F4) */
  slaMinutes?: number

  // ── serviceTask ───────────────────────────────────────────────────────────
  /** Conector de domínio a executar, ex.: 'contracts.create'. O backend resolve
   *  o conector e roda ContractsService/PartnersService. (F5) */
  connector?: string

  /** Metadados livres preservados do diagrama (para o designer/UX). */
  meta?: Record<string, unknown>
}

/** Aresta = fluxo de sequência (sequenceFlow do BPMN). */
export interface WfEdge {
  id: string
  from: string
  to: string
  /** Expressão avaliada sobre as variáveis da instância (ex.: "valor > 100000").
   *  Só faz sentido nas saídas de um exclusiveGateway. Ver conditions.ts. */
  condition?: string
  /** Fluxo default do gateway — usado quando nenhuma condição casa. */
  isDefault?: boolean
}

/** Grafo compilado, pronto para execução. `nodes` é um mapa por id. */
export interface WfGraph {
  nodes: Record<string, WfNode>
  edges: WfEdge[]
  /** id do nó start. */
  startId: string
}

/** Um token vivo, descansando sobre um nó de espera (userTask/serviceTask). */
export interface WfToken {
  id: string
  nodeId: string
}

export type WfStatus = 'running' | 'completed' | 'canceled'

/** Estado de execução de UMA instância. É serializável (vira JSON na instância). */
export interface WfState {
  status: WfStatus
  /** Tokens que estão descansando em nós de espera. */
  tokens: WfToken[]
  /** Variáveis do processo — acumuladas pelos dados das tarefas e lidas pelas
   *  condições dos gateways. */
  variables: Record<string, unknown>
  /** Contagem de chegadas por parallelGateway (para o join sincronizar). Interno
   *  ao motor, mas persistido junto ao estado para sobreviver entre chamadas. */
  joinCounts: Record<string, number>
}

/** Efeito que o interpretador PEDE ao backend para executar. O motor é puro:
 *  ele não cria linhas no banco nem chama serviço de domínio — ele descreve o
 *  que precisa acontecer, e o backend materializa. */
export type WfEffect =
  /** Uma userTask ficou ativa → criar a tarefa na caixa (inbox). */
  | { kind: 'createTask'; token: WfToken; node: WfNode }
  /** Um serviceTask precisa ser executado pelo backend (conector de domínio). */
  | { kind: 'runService'; token: WfToken; node: WfNode }
  /** A instância chegou ao fim (não há mais tokens vivos). */
  | { kind: 'completed' }

/** Resultado de uma operação do motor: o próximo estado + os efeitos a executar. */
export interface WfRunResult {
  state: WfState
  effects: WfEffect[]
}

/** Dependências injetadas no motor para mantê-lo PURO (sem Math.random/Date). */
export interface WfRuntime {
  /** Gera ids de token únicos. No backend: cuid/uuid; nos testes: contador. */
  genId: () => string
}
