import {
  abasDaAtividade, acaoDaGravacao, faltantesDaGravacao, faltantesDaTarefa, reconcileNative, screenEntityFromVars, travasDaEtapa,
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

/**
 * Ativação do contrato AO CONCLUIR (PO, 22/11/2026): a atividade marcada com
 * `ativaContratoAoConcluir` leva o contrato do processo para Vigente. Antes, confere os
 * obrigatórios de ATIVAR pela tela principal da etapa (a mesma regra do botão Ativar).
 * `null` = nada a ativar (sem a marca, sem contrato ou contrato que já não está em cadastro).
 */
export async function ativacaoAoConcluir(
  prisma: PrismaService,
  organizationId: string,
  step: StepFormSchema | undefined,
  variaveis: Record<string, unknown>,
): Promise<{ contratoId: string; faltantes: CampoFaltante[] } | null> {
  if (!step?.ativaContratoAoConcluir || !step.screenRef || step.screenSubject !== 'CONTRATO' || step.entityMode === 'VIEW') return null
  const contratoId = screenEntityFromVars(step, variaveis)
  if (!contratoId) return null
  const [contrato, tela, valores] = await Promise.all([
    prisma.contract.findFirst({ where: { id: contratoId, organizationId } }),
    prisma.screen.findFirst({
      where:   { id: step.screenRef, organizationId, subjectType: 'CONTRATO' },
      include: { sections: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } } },
    }),
    prisma.screenFieldValue.findMany({
      where:  { organizationId, subjectType: 'CONTRACT', subjectId: contratoId },
      select: { fieldId: true, value: true },
    }),
  ])
  if (!contrato) return null
  const antes = contrato as unknown as Record<string, unknown>
  const depois = { situacao: 'VIGENTE' }
  if (acaoDaGravacao('CONTRATO', antes, depois) !== 'ativar') return null
  const faltantes = faltantesDaGravacao({
    subject: 'CONTRATO',
    screen:  tela ? reconcileNative(tela as unknown as Screen) : null,
    lock:    travasDaEtapa(step, step.screenRef) ?? {},
    antes, depois,
    customAntes: Object.fromEntries(valores.map(r => [r.fieldId, r.value])),
  })
  return { contratoId, faltantes }
}
