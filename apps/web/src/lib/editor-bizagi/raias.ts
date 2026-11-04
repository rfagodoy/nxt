/* Executor padrão da raia: a tarefa herda o executor da raia onde está desenhada, a menos
   que a pessoa tenha escolhido outro à mão. Puro — o editor chama no Salvar e no Ativar. */
import type { DesenhoV2, RaiaDesenho, StepFormSchema } from '@nxt/types'
import { raiaNaAltura } from '@/lib/desenho-bpmn'

/** `executorDaRaia` explícito manda; sem a marca, só herda quem ainda não tem papel. */
export function herdaDaRaia(step: StepFormSchema): boolean {
  return step.executorDaRaia ?? !step.executor?.papelId
}

/** A raia da forma, pelo CENTRO (y + altura/2) — a mesma regra do canvas. */
export function raiaDaForma(d: DesenhoV2, id: string, alturaDe: (id: string) => number): RaiaDesenho | undefined {
  const p = d.posicoes[id]
  if (!p) return undefined
  const i = raiaNaAltura(d.raias, p.y + alturaDe(id) / 2)
  return i >= 0 ? d.raias[i] : undefined
}

export function aplicarExecutorDasRaias(
  steps: StepFormSchema[], d: DesenhoV2, alturaDe: (id: string) => number,
): StepFormSchema[] {
  return steps.map((s) => {
    if ((s.stepType ?? 'userTask') !== 'userTask' || !herdaDaRaia(s)) return s
    const executor = raiaDaForma(d, s.stepId, alturaDe)?.executor
    return executor ? { ...s, executorDaRaia: true, executor: { ...executor } } : s
  })
}
