import { Injectable, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ProcessFormSchema, ModuleSchema, ModuleColumn } from '@nxt/types'

interface GenerateModuleInput {
  processDefinitionId: string
  organizationId: string
  processName: string
  slug: string
  formSchema: ProcessFormSchema
}

@Injectable()
export class ModuleGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(input: GenerateModuleInput) {
    const existing = await this.prisma.module.findUnique({
      where: { processDefinitionId: input.processDefinitionId },
    })

    if (existing) throw new ConflictException('Módulo já gerado para este processo')

    const columns: ModuleColumn[] = input.formSchema.steps.flatMap((step) =>
      step.fields.map((field) => ({
        id: field.id,
        name: field.name,
        label: field.label,
        type: field.type,
        stepId: step.stepId,
        showInList: this.shouldShowInList(field.type),
        searchable: ['text', 'email', 'phone'].includes(field.type),
        sortable: ['text', 'number', 'currency', 'date'].includes(field.type),
      })),
    )

    const schema: ModuleSchema = { columns }

    return this.prisma.module.create({
      data: {
        organizationId: input.organizationId,
        processDefinitionId: input.processDefinitionId,
        name: input.processName,
        slug: input.slug,
        schema: schema as never,
      },
    })
  }

  private shouldShowInList(type: string): boolean {
    return ['text', 'number', 'currency', 'date', 'select', 'email'].includes(type)
  }
}
