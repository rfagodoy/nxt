/**
 * Tipos da personalização de telas (Screens) — espelham o backend (screens module).
 * Uma Tela é reutilizável (por perfil de acesso e por etapa de processo). Cada campo
 * é NATIVE (visão de um dado nativo) ou CUSTOM (captura de dado novo, persistido).
 */

export type ScreenSubject = 'FORNECEDOR' | 'CONTRATO' | 'GENERICA'
export type ScreenStatus  = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type ScreenFieldType =
  | 'text' | 'textarea' | 'number' | 'currency'
  | 'date' | 'time' | 'datetime'
  | 'select' | 'multiselect' | 'checkbox'
  | 'email' | 'phone'

export type FieldSource = 'NATIVE' | 'CUSTOM'
export type FieldMode   = 'VIEW' | 'EDIT'

export interface ScreenFieldOption { value: string; label: string }
export interface ScreenFieldValidation { maxLength?: number; min?: number; max?: number; pattern?: string }

export interface ScreenField {
  id: string
  sectionId?: string
  name: string
  label: string
  type: ScreenFieldType
  source: FieldSource
  nativeKey?: string
  mode: FieldMode
  visible?: boolean        // nativo: liga/desliga no cadastro (custom sempre visível)
  required: boolean
  placeholder?: string
  options?: ScreenFieldOption[]
  validation?: ScreenFieldValidation
  order: number
}

export interface ScreenSection {
  id: string
  label: string
  name: string
  source?: FieldSource     // NATIVE (seção nativa da entidade) | CUSTOM
  nativeKey?: string       // seção nativa: ex. 'identificacao'
  visible?: boolean
  order: number
  defaultOpen: boolean
}

export interface Screen {
  id: string
  name: string
  description?: string | null
  subjectType: ScreenSubject
  status: ScreenStatus
  isDefault?: boolean
  isSystem?: boolean
  sections: ScreenSection[]
  fields: ScreenField[]
}

export const SUBJECT_LABELS: Record<ScreenSubject, string> = {
  FORNECEDOR: 'Fornecedor',
  CONTRATO:   'Contrato',
  GENERICA:   'Genérica',
}

export const STATUS_LABELS: Record<ScreenStatus, string> = {
  DRAFT:    'Rascunho',
  ACTIVE:   'Ativa',
  ARCHIVED: 'Arquivada',
}

export const FIELD_TYPE_LABELS: Record<ScreenFieldType, string> = {
  text:        'Texto',
  textarea:    'Texto longo',
  number:      'Numérico',
  currency:    'Valor (R$)',
  date:        'Data',
  time:        'Hora',
  datetime:    'Data/hora',
  select:      'Lista de opções',
  multiselect: 'Lista (múltipla)',
  checkbox:    'Check-box',
  email:       'E-mail',
  phone:       'Telefone',
}

/** Tipos oferecidos no construtor para campos CUSTOM (captura). */
export const CUSTOM_FIELD_TYPES: ScreenFieldType[] = [
  'text', 'textarea', 'number', 'currency', 'date', 'time', 'datetime',
  'select', 'multiselect', 'checkbox', 'email', 'phone',
]

export function slug(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}
