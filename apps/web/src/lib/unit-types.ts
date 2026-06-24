import type { LookupEntry } from '@/hooks/use-lookup-table'

/**
 * Tipos de unidade da estrutura organizacional — configuráveis pelo usuário.
 * Cada tipo tem uma CLASSIFICAÇÃO que o sistema entende (Custo / Lucro / Neutro),
 * usada para a cor no organograma e para a lógica financeira futura (pagamentos/
 * recebimentos). O usuário pode criar quantos tipos quiser, sempre amarrados a uma
 * dessas 3 classificações.
 *
 * `OrgUnit.natureza` guarda o **id do tipo**. Os 3 tipos-semente usam ids iguais
 * aos enums antigos (ADMINISTRATIVA/CENTRO_CUSTO/CENTRO_LUCRO), então as unidades
 * já cadastradas continuam válidas sem migração.
 */

export const CLASSIFICACAO = { CUSTO: 'CUSTO', LUCRO: 'LUCRO', NEUTRO: 'NEUTRO' } as const

export const CLASSIFICACAO_OPTIONS = [
  { value: 'NEUTRO', label: 'Neutra' },
  { value: 'CUSTO',  label: 'Centro de custo' },
  { value: 'LUCRO',  label: 'Centro de lucro' },
]

export const CLASS_COLOR: Record<string, { dot: string; label: string; cls: string }> = {
  NEUTRO: { dot: 'bg-gray-400',    label: 'Neutro', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'           },
  CUSTO:  { dot: 'bg-rose-500',    label: 'Custo',  cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'        },
  LUCRO:  { dot: 'bg-emerald-500', label: 'Lucro',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
}

export const TIPOS_UNIDADE_KEY = 'primeapps:settings:org:tiposUnidade'

export const INIT_TIPOS_UNIDADE: LookupEntry[] = [
  { id: 'ADMINISTRATIVA', label: 'Administrativa',  classificacao: CLASSIFICACAO.NEUTRO, active: true },
  { id: 'CENTRO_CUSTO',   label: 'Centro de custo', classificacao: CLASSIFICACAO.CUSTO,  active: true },
  { id: 'CENTRO_LUCRO',   label: 'Centro de lucro', classificacao: CLASSIFICACAO.LUCRO,  active: true },
]
