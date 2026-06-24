import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ProcessFormSchema } from '@primeapps/types'
import { StartInstanceDto } from './dto/start-instance.dto'
import { AdvanceStepDto } from './dto/advance-step.dto'

@Injectable()
export class InstancesService {
  constructor(private readonly prisma: PrismaService) {}

  async start(dto: StartInstanceDto) {
    const process = await this.prisma.processDefinition.findFirst({
      where: { id: dto.processDefinitionId, organizationId: dto.organizationId, status: 'ACTIVE' },
      include: { module: true },
    })

    if (!process) throw new NotFoundException('Processo não encontrado ou inativo')
    if (!process.module) throw new BadRequestException('Processo sem módulo gerado — ative-o primeiro')

    const schema = process.formSchema as unknown as ProcessFormSchema
    const firstStep = schema.steps[0]
    if (!firstStep) throw new BadRequestException('Processo sem etapas definidas')

    const instance = await this.prisma.processInstance.create({
      data: {
        processDefinitionId: process.id,
        currentStep: firstStep.stepId,
        status: 'RUNNING',
        data: {},
      },
    })

    // Cria o ModuleRecord já vinculado à instância
    await this.prisma.moduleRecord.create({
      data: {
        moduleId: process.module.id,
        processInstanceId: instance.id,
        data: {},
      },
    })

    return {
      instance,
      currentStep: firstStep,
      totalSteps: schema.steps.length,
      stepIndex: 0,
    }
  }

  async advanceStep(instanceId: string, dto: AdvanceStepDto) {
    const instance = await this.prisma.processInstance.findUnique({
      where: { id: instanceId },
      include: {
        processDefinition: { include: { module: true } },
        records: true,
      },
    })

    if (!instance) throw new NotFoundException('Instância não encontrada')
    if (instance.status !== 'RUNNING') throw new BadRequestException('Instância não está em execução')

    const schema = instance.processDefinition.formSchema as unknown as ProcessFormSchema
    const currentIdx = schema.steps.findIndex((s) => s.stepId === instance.currentStep)
    if (currentIdx === -1) throw new BadRequestException('Etapa atual inválida')

    // Mescla dados acumulados
    const accumulatedData = {
      ...(instance.data as Record<string, unknown>),
      [instance.currentStep]: dto.data,
    }

    const nextStep = schema.steps[currentIdx + 1]
    const isLastStep = !nextStep

    if (isLastStep) {
      // Completa a instância e atualiza o registro do módulo
      const [updatedInstance] = await this.prisma.$transaction([
        this.prisma.processInstance.update({
          where: { id: instanceId },
          data: { status: 'COMPLETED', data: accumulatedData as never, completedAt: new Date() },
        }),
        this.prisma.moduleRecord.update({
          where: { processInstanceId: instanceId },
          data: { data: this.flattenStepData(accumulatedData) as never },
        }),
      ])

      return { instance: updatedInstance, completed: true, currentStep: null, stepIndex: currentIdx }
    }

    // Avança para próxima etapa
    const updatedInstance = await this.prisma.processInstance.update({
      where: { id: instanceId },
      data: { currentStep: nextStep.stepId, data: accumulatedData as never },
    })

    return {
      instance: updatedInstance,
      completed: false,
      currentStep: nextStep,
      stepIndex: currentIdx + 1,
      totalSteps: schema.steps.length,
    }
  }

  async getInstanceWithContext(instanceId: string) {
    const instance = await this.prisma.processInstance.findUnique({
      where: { id: instanceId },
      include: { processDefinition: true },
    })
    if (!instance) throw new NotFoundException('Instância não encontrada')

    const schema = instance.processDefinition.formSchema as unknown as ProcessFormSchema
    const currentStepIdx = schema.steps.findIndex((s) => s.stepId === instance.currentStep)
    const currentStep = schema.steps[currentStepIdx] ?? null

    return {
      instance,
      schema,
      currentStep,
      stepIndex: currentStepIdx,
      totalSteps: schema.steps.length,
    }
  }

  async cancel(instanceId: string) {
    const instance = await this.prisma.processInstance.findUnique({ where: { id: instanceId } })
    if (!instance) throw new NotFoundException('Instância não encontrada')
    if (instance.status !== 'RUNNING') throw new BadRequestException('Só é possível cancelar instâncias em execução')

    return this.prisma.processInstance.update({
      where: { id: instanceId },
      data: { status: 'CANCELLED' },
    })
  }

  private flattenStepData(accumulatedData: Record<string, unknown>): Record<string, unknown> {
    const flat: Record<string, unknown> = {}
    for (const stepData of Object.values(accumulatedData)) {
      if (stepData && typeof stepData === 'object') {
        Object.assign(flat, stepData)
      }
    }
    return flat
  }
}
