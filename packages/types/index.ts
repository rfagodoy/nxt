// ─── Form Schema (define campos coletados em cada step do processo) ──────────

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'file'
  | 'email'
  | 'phone'

export interface FormField {
  id: string
  name: string
  label: string
  type: FieldType
  required: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }> // para select/multiselect
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
}

export interface StepFormSchema {
  stepId: string
  stepName: string
  fields: FormField[]
  /** Executor da atividade (papel). Alternativa às raias do BPMN; definido no
   *  painel "Atividade" do designer. Mesclado ao grafo na ativação. */
  role?: string
  /** Prazo/SLA da atividade em MINUTOS. O designer coleta em horas e converte. */
  slaMinutes?: number
  /** Conector de domínio de uma atividade de serviço (ação automática). Ex.:
   *  'contracts.create', 'contracts.aditivo', 'contracts.distrato',
   *  'partners.create', 'partners.activate'. Mesclado ao grafo na ativação
   *  (vira node.connector, executado pelo motor no serviceTask). */
  connector?: string
  /** Mapa entrada-do-conector → variável-do-processo (nome de um campo coletado
   *  numa atividade anterior, ou saída de um conector anterior). Definido no
   *  designer; mesclado ao grafo na ativação (vira node.connectorInputs). Quando
   *  uma entrada não é mapeada, o backend usa a convenção de nome. */
  connectorInputs?: Record<string, string>
}

// ─── Manifesto dos conectores de domínio (F5) ────────────────────────────────
// Fonte ÚNICA (front renderiza o mapeamento no designer; o backend resolve as
// entradas). A `key` de cada entrada é EXATAMENTE o nome de variável que o
// conector já lê por convenção — assim mapear é só re-ligar (retrocompatível).

export type ConnectorInputKind = 'ref' | 'money' | 'date' | 'text'

export interface ConnectorInput {
  /** Nome de variável que o conector espera (chave de convenção). */
  key: string
  label: string
  required?: boolean
  /** Dica de tipo (informativa, para a UI). `ref` = id de uma entidade. */
  kind?: ConnectorInputKind
  hint?: string
}

export interface ConnectorManifest {
  value: string
  label: string
  /** Entidade que a ação toca — só p/ agrupar/ilustrar no designer. */
  domain: 'contract' | 'partner'
  inputs: ConnectorInput[]
  /** Variáveis que o conector PRODUZ (viram disponíveis para conectores seguintes). */
  outputs: string[]
}

export const CONNECTORS: ConnectorManifest[] = [
  {
    value: 'contracts.create', label: 'Criar contrato', domain: 'contract',
    inputs: [
      { key: 'titulo', label: 'Título', required: true, kind: 'text' },
      { key: 'tipo', label: 'Tipo (id da tabela)', kind: 'text' },
      { key: 'numero', label: 'Número (vazio = automático)', kind: 'text' },
      { key: 'natureza', label: 'Natureza', kind: 'text' },
      { key: 'descricao', label: 'Descrição', kind: 'text' },
      { key: 'valor', label: 'Valor total', kind: 'money' },
      { key: 'moeda', label: 'Moeda', kind: 'text' },
      { key: 'inicioVigencia', label: 'Início da vigência', kind: 'date' },
      { key: 'terminoVigencia', label: 'Término da vigência', kind: 'date' },
    ],
    outputs: ['contratoId', 'contratoNumero'],
  },
  {
    value: 'contracts.aditivo', label: 'Registrar aditivo', domain: 'contract',
    inputs: [
      { key: 'contratoId', label: 'Contrato-alvo', required: true, kind: 'ref', hint: 'id do contrato a aditar' },
      { key: 'aditivoAcrescimoValor', label: 'Acréscimo ao valor total', kind: 'money', hint: 'somado ao valor vigente' },
      { key: 'aditivoNovoTermino', label: 'Novo término (prorrogação)', kind: 'date' },
      { key: 'aditivoNovaParcela', label: 'Nova parcela (valor absoluto)', kind: 'money' },
      { key: 'aditivoNumero', label: 'Número do aditivo', kind: 'text' },
    ],
    outputs: ['aditivoId', 'contratoSituacao'],
  },
  {
    value: 'contracts.distrato', label: 'Registrar distrato (rescisão)', domain: 'contract',
    inputs: [
      { key: 'contratoId', label: 'Contrato-alvo', required: true, kind: 'ref' },
      { key: 'motivo', label: 'Motivo da rescisão', kind: 'text' },
    ],
    outputs: ['contratoSituacao'],
  },
  {
    value: 'partners.create', label: 'Criar parceiro', domain: 'partner',
    inputs: [
      { key: 'razaoSocial', label: 'Razão social', required: true, kind: 'text' },
      { key: 'categoria', label: 'Categoria (PJ_BR/PF_BR/…)', kind: 'text' },
      { key: 'documento', label: 'Documento (CNPJ/CPF)', kind: 'text' },
      { key: 'nomeFantasia', label: 'Nome fantasia', kind: 'text' },
      { key: 'email', label: 'E-mail', kind: 'text' },
    ],
    outputs: ['partnerId', 'partnerStatus'],
  },
  {
    value: 'partners.activate', label: 'Ativar parceiro', domain: 'partner',
    inputs: [
      { key: 'partnerId', label: 'Parceiro-alvo', required: true, kind: 'ref' },
      { key: 'motivo', label: 'Motivo/observação', kind: 'text' },
    ],
    outputs: ['partnerStatus'],
  },
]

export interface ProcessFormSchema {
  steps: StepFormSchema[]
}

// ─── Module Schema (estrutura do módulo gerado) ──────────────────────────────

export interface ModuleColumn {
  id: string
  name: string
  label: string
  type: FieldType
  stepId: string
  showInList: boolean
  searchable: boolean
  sortable: boolean
}

export interface ModuleSchema {
  columns: ModuleColumn[]
}

// ─── API Response types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiError {
  message: string
  statusCode: number
  errors?: Record<string, string[]>
}

// ─── Process types ────────────────────────────────────────────────────────────

export type ProcessStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type InstanceStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'ERROR'
