import type { LookupEntry } from '@/hooks/use-lookup-table'

/**
 * Origem da parte: define, a partir do PAPEL, de onde o usuário escolhe a entidade
 * na tela de Partes do contrato.
 * - EMPRESA_PARCEIRO: empresas do grupo + parceiros externos
 * - UNIDADE: unidades da estrutura organizacional (que não são empresas do grupo)
 */
export const ORIGEM = {
  EMPRESA_PARCEIRO: 'EMPRESA_PARCEIRO',
  UNIDADE:          'UNIDADE',
} as const

export const ORIGEM_OPTIONS = [
  { value: ORIGEM.EMPRESA_PARCEIRO, label: 'Empresas do grupo + Parceiros' },
  { value: ORIGEM.UNIDADE,          label: 'Unidades da estrutura' },
]

/** Chave versionada para forçar o re-seed com o campo `origem`. */
export const PAPEIS_KEY = 'nxt:settings:contratos:papeis:v2'

/** Fonte única dos papéis (usada pela tela de configuração e pelo formulário). */
export const INIT_PAPEIS: LookupEntry[] = [
  { id: '1', label: 'Contratante',          origem: ORIGEM.EMPRESA_PARCEIRO, active: true  },
  { id: '2', label: 'Contratada',           origem: ORIGEM.EMPRESA_PARCEIRO, active: true  },
  { id: '3', label: 'Unidade contratante',  origem: ORIGEM.UNIDADE,           active: true  },
  { id: '4', label: 'Unidade negociadora',  origem: ORIGEM.UNIDADE,           active: true  },
  { id: '5', label: 'Unidade de aplicação', origem: ORIGEM.UNIDADE,           active: true  },
  { id: '6', label: 'Interveniente',        origem: ORIGEM.EMPRESA_PARCEIRO, active: true  },
  { id: '7', label: 'Garantidor',           origem: ORIGEM.EMPRESA_PARCEIRO, active: false },
]

/** Descobre a origem de um papel pelo seu id (com fallback por rótulo para dados legados). */
export function origemDoPapel(papeis: LookupEntry[], papel: string): string {
  const found = papeis.find(p => p.id === papel) ?? papeis.find(p => p.label === papel)
  return found?.origem ?? ORIGEM.EMPRESA_PARCEIRO
}
