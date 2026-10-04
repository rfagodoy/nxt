import type { StepFormSchema } from '@nxt/types'
import type { PrismaService } from '../prisma.service'

type FormSchema = { steps?: StepFormSchema[] } | null

/**
 * Formulário da definição COMO ESTAVA quando a instância nasceu. O grafo já é congelado
 * (`graphSnapshot`), mas a configuração de tela de cada etapa (tela, abas, campos
 * travados) só vivia na definição viva — editar o processo depois mudava o que uma
 * instância em andamento deixava gravar. O retrato da ATIVAÇÃO daquela versão é a fonte;
 * sem ele (instância anterior aos retratos), vale a definição viva, como antes.
 *
 * A tela da tarefa e a conferência da API leem DAQUI — as duas têm de ver a mesma etapa.
 */
export async function formSchemaDaInstancia(
  prisma: PrismaService,
  inst: { definitionVersion: number | null; processDefinition: { id: string; formSchema: unknown } },
): Promise<FormSchema> {
  if (inst.definitionVersion != null) {
    const retrato = await prisma.processDefinitionVersion.findFirst({
      where:   { processId: inst.processDefinition.id, version: inst.definitionVersion, reason: 'ATIVACAO' },
      orderBy: { createdAt: 'desc' },
      select:  { formSchema: true },
    })
    if (retrato?.formSchema) return retrato.formSchema as unknown as FormSchema
  }
  return (inst.processDefinition.formSchema ?? null) as FormSchema
}
