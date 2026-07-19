import type { LookupEntry } from '@/hooks/use-lookup-table'

/**
 * Referência do papel: o que o papel aponta no fim.
 * - ENTIDADE: uma organização (empresa do grupo / parceiro / unidade) — é o que já
 *   existia; alimenta as "Partes envolvidas" (entidades) do CONTRATO.
 * - PESSOA: um usuário do sistema — o novo; alimenta os "Responsáveis" (pessoas) de
 *   uma entidade (empresa/parceiro/unidade/contrato) e roteia tarefas do workflow.
 * Papel legado sem `referencia` é tratado como ENTIDADE (back-compat do contrato).
 */
export const REFERENCIA = {
  ENTIDADE: 'ENTIDADE',
  PESSOA:   'PESSOA',
} as const

/**
 * Origem: o CONTEXTO do papel. O sentido depende da referência (por isso a UI
 * rotula diferente), mas o valor é um só campo — sem colidir:
 * - Referência ENTIDADE (partes do contrato) → de ONDE a entidade é escolhida:
 *   EMPRESA_PARCEIRO (empresas do grupo + parceiros) ou UNIDADE (comportamento atual).
 * - Referência PESSOA (responsáveis) → em QUAL cadastro o papel é atribuído:
 *   EMPRESA, PARCEIRO, UNIDADE, CONTRATO, ou ORG (organização — papel global).
 */
export const ORIGEM = {
  // entidade (partes do contrato) — preserva os valores atuais
  EMPRESA_PARCEIRO: 'EMPRESA_PARCEIRO',
  UNIDADE:          'UNIDADE',
  // pessoa (responsáveis) — cadastros-anfitriões
  EMPRESA:          'EMPRESA',
  PARCEIRO:         'PARCEIRO',
  CONTRATO:         'CONTRATO',
  ORG:              'ORG',
} as const

/** Opções de origem quando o papel referencia uma ENTIDADE (partes do contrato). */
export const ORIGEM_OPTIONS_ENTIDADE = [
  { value: ORIGEM.EMPRESA_PARCEIRO, label: 'Empresas do grupo + Parceiros' },
  { value: ORIGEM.UNIDADE,          label: 'Unidades da estrutura' },
]

/** Opções de origem quando o papel referencia uma PESSOA (responsáveis). */
export const ORIGEM_OPTIONS_PESSOA = [
  { value: ORIGEM.EMPRESA,  label: 'Empresas do grupo' },
  { value: ORIGEM.PARCEIRO, label: 'Parceiros' },
  { value: ORIGEM.UNIDADE,  label: 'Unidades da estrutura' },
  { value: ORIGEM.CONTRATO, label: 'Contratos' },
  { value: ORIGEM.ORG,      label: 'Organização (papel global)' },
]

/** Todas as origens, para resolver rótulo em qualquer contexto. */
export const ORIGEM_OPTIONS = [...ORIGEM_OPTIONS_ENTIDADE, ...ORIGEM_OPTIONS_PESSOA]

/** Referência efetiva de um papel (legado sem o campo → ENTIDADE). */
export function referenciaDoPapelEntry(e: Pick<LookupEntry, 'referencia'>): string {
  return e.referencia ?? REFERENCIA.ENTIDADE
}

/** Chave do AppSetting dos papéis (mantida em v2 — dados legados = ENTIDADE). */
export const PAPEIS_KEY = 'nxt:settings:contratos:papeis:v2'

/** Fonte única dos papéis (semente para instalações novas). */
export const INIT_PAPEIS: LookupEntry[] = [
  { id: '1', label: 'Contratante',          referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.EMPRESA_PARCEIRO, active: true  },
  { id: '2', label: 'Contratada',           referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.EMPRESA_PARCEIRO, active: true  },
  { id: '3', label: 'Unidade contratante',  referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.UNIDADE,           active: true  },
  { id: '4', label: 'Unidade negociadora',  referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.UNIDADE,           active: true  },
  { id: '5', label: 'Unidade de aplicação', referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.UNIDADE,           active: true  },
  { id: '6', label: 'Interveniente',        referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.EMPRESA_PARCEIRO, active: true  },
  { id: '7', label: 'Garantidor',           referencia: REFERENCIA.ENTIDADE, origem: ORIGEM.EMPRESA_PARCEIRO, active: false },
  // Exemplos de papéis de PESSOA (responsáveis) — só semeados em instalações novas.
  { id: '8', label: 'Gestor do contrato',   referencia: REFERENCIA.PESSOA,   origem: ORIGEM.CONTRATO,          active: true  },
  { id: '9', label: 'Responsável da unidade', referencia: REFERENCIA.PESSOA, origem: ORIGEM.UNIDADE,           active: true  },
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
