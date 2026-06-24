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
}

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
