import {
  abasDaAtividade, faltantesDaTarefa, reconcileNative, screenEntityFromVars,
  type CampoFaltante, type Screen,
} from '@nxt/screens-core'
import type { StepFormSchema } from '@nxt/types'
import type { PrismaService } from '../prisma.service'

/**
 * Campos obrigatórios das telas da atividade que ainda estão em branco no contrato GRAVADO
 * (PO, 09/11/2026). "Concluir" não salva: o que vale é o que já foi gravado, e o contrato
 * é o mesmo que as escolhas à frente vão ler. Atividade sem Tela de contrato não cobra.
 */
export async function faltantesAoConcluir(
  prisma: PrismaService,
  organizationId: string,
  step: StepFormSchema | undefined,
  variaveis: Record<string, unknown>,
): Promise<CampoFaltante[]> {
  if (!step?.screenRef || step.screenSubject !== 'CONTRATO' || step.entityMode === 'VIEW') return []
  const contratoId = screenEntityFromVars(step, variaveis)
  if (!contratoId) return []

  const [contrato, telas, valores] = await Promise.all([
    prisma.contract.findFirst({ where: { id: contratoId, organizationId } }),
    prisma.screen.findMany({
      where:   { id: { in: abasDaAtividade(step).map(a => a.screenRef) }, organizationId, subjectType: 'CONTRATO' },
      include: { sections: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } } },
    }),
    prisma.screenFieldValue.findMany({
      where:  { organizationId, subjectType: 'CONTRACT', subjectId: contratoId },
      select: { fieldId: true, value: true },
    }),
  ])
  if (!contrato) return []

  return faltantesDaTarefa({
    step,
    telas: (telas as unknown as Screen[]).map(reconcileNative),
    registro: contrato as unknown as Record<string, unknown>,
    valores: Object.fromEntries(valores.map(r => [r.fieldId, r.value])),
  })
}
