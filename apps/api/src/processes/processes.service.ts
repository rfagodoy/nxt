import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ModuleGeneratorService } from '../modules/module-generator.service'
import { CreateProcessDto } from './dto/create-process.dto'
import { ProcessFormSchema } from '@primeapps/types'

@Injectable()
export class ProcessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleGenerator: ModuleGeneratorService,
  ) {}

  async findAll(organizationId: string) {
    return this.prisma.processDefinition.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, organizationId: string) {
    const process = await this.prisma.processDefinition.findFirst({
      where: { id, organizationId },
      include: { module: true },
    })
    if (!process) throw new NotFoundException('Processo não encontrado')
    return process
  }

  async create(dto: CreateProcessDto) {
    return this.prisma.processDefinition.create({
      data: {
        name: dto.name,
        description: dto.description,
        bpmnXml: dto.bpmnXml,
        formSchema: dto.formSchema as never,
        organizationId: dto.organizationId,
        status: 'DRAFT',
      },
    })
  }

  async activate(id: string, organizationId: string) {
    const process = await this.findOne(id, organizationId)

    if (process.status === 'ACTIVE') {
      throw new BadRequestException('Processo já está ativo')
    }

    const formSchema = process.formSchema as unknown as ProcessFormSchema
    const slug = process.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const [updatedProcess] = await this.prisma.$transaction([
      this.prisma.processDefinition.update({
        where: { id },
        data: { status: 'ACTIVE' },
      }),
    ])

    // Gera o módulo dinamicamente a partir do formSchema
    await this.moduleGenerator.generate({
      processDefinitionId: id,
      organizationId,
      processName: process.name,
      slug,
      formSchema,
    })

    return updatedProcess
  }

  async updateBpmn(id: string, organizationId: string, bpmnXml: string, formSchema: ProcessFormSchema) {
    await this.findOne(id, organizationId)
    return this.prisma.processDefinition.update({
      where: { id },
      data: { bpmnXml, formSchema: formSchema as never },
    })
  }
}
