/* Os TIPOS da tela moram em @nxt/screens-core (o servidor aplica as mesmas travas e
   obrigatoriedades). Aqui ficam só os rótulos e utilidades de UI. */
export * from '@nxt/screens-core'
import type { ScreenSubject, ScreenStatus, ScreenFieldType } from '@nxt/screens-core'

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
