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

/**
 * Polo do papel: os dois lados opostos de um contrato. Uma mesma entidade não pode
 * estar nos dois lados (contratante E contratada). Inferido pelo rótulo do papel.
 */
export function ladoDoPapel(papeis: LookupEntry[], papel: string): 'CONTRATANTE' | 'CONTRATADA' | 'NEUTRO' {
  const found = papeis.find(p => p.id === papel) ?? papeis.find(p => p.label === papel)
  const label = (found?.label ?? papel).toLowerCase()
  if (label.includes('contratante')) return 'CONTRATANTE'
  if (/contratad[ao]/.test(label))   return 'CONTRATADA'
  return 'NEUTRO'
}

/**
 * Valida as Partes envolvidas:
 * 1. a MESMA entidade não pode repetir no MESMO papel;
 * 2. a MESMA entidade não pode ser contratante E contratada no mesmo contrato.
 * Retorna a 1ª mensagem de erro, ou null.
 */
export function validatePartes(partes: { papel: string; ref_id: string }[], papeis: LookupEntry[]): string | null {
  const noMesmoPapel = new Set<string>()
  const contratantes = new Set<string>()
  const contratadas  = new Set<string>()
  for (const p of partes) {
    if (!p.papel || !p.ref_id) continue
    const chave = `${p.papel}::${p.ref_id}`
    if (noMesmoPapel.has(chave)) return 'A mesma entidade não pode ser usada duas vezes no mesmo papel (Partes envolvidas).'
    noMesmoPapel.add(chave)
    const lado = ladoDoPapel(papeis, p.papel)
    if (lado === 'CONTRATANTE') contratantes.add(p.ref_id)
    if (lado === 'CONTRATADA')  contratadas.add(p.ref_id)
  }
  for (const id of contratantes) if (contratadas.has(id)) {
    return 'A mesma entidade não pode ser contratante e contratada no mesmo contrato (Partes envolvidas).'
  }
  return null
}
