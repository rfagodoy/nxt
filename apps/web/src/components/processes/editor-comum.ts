import type { StepFormSchema, EdgeConditionSpec } from '@nxt/types'
import type { FlowNodeType } from '@/lib/flow-layout'
import type { useScreens } from '@/hooks/use-screens'
import type { useLookupTable } from '@/hooks/use-lookup-table'

/* Peças compartilhadas pelo editor de workflow (process-flow) e pelas perguntas da etapa. */

type NType = FlowNodeType

/** Nó do grafo DERIVADO — dos blocos, ou do desenho antigo aberto só para leitura.
 *  Atividades carregam a config (StepFormSchema); gateways/eventos só nome. */
export interface ENode { id: string; type: NType; name: string; step?: StepFormSchema }
export interface EEdge { id: string; from: string; to: string; condition?: string; isDefault?: boolean; label?: string; conditionSpec?: EdgeConditionSpec }

export const ENTITY_KIND_LABEL: Record<string, string> = { EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato' }
export const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'

export const STEP_TONE: Record<string, string> = {
  userTask: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  serviceTask: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
}

export function dueText(step?: StepFormSchema): string | null {
  const d = step?.slaBusinessDays ?? 0, h = step?.slaBusinessHours ?? 0, m = step?.slaBusinessMinutes ?? 0
  const parts: string[] = []
  if (d) parts.push(`${d} ${d > 1 ? 'dias úteis' : 'dia útil'}`)
  if (h) parts.push(`${h} h úteis`)
  if (m) parts.push(`${m} min úteis`)
  return parts.length ? parts.join(' · ') : null
}

export type Papeis = ReturnType<typeof useLookupTable>
export type Screens = ReturnType<typeof useScreens>['screens']
