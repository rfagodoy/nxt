import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ModuleGeneratorService } from '../modules/module-generator.service'
import { CreateProcessDto } from './dto/create-process.dto'
import { ProcessFormSchema } from '@nxt/types'
import { compileBpmn, CompileError, type WfGraph } from '@nxt/workflow-core'

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

  async create(dto: CreateProcessDto, organizationId: string) {
    return this.prisma.processDefinition.create({
      data: {
        name: dto.name,
        description: dto.description,
        bpmnXml: dto.bpmnXml,
        formSchema: dto.formSchema as never,
        organizationId,
        status: 'DRAFT',
      },
    })
  }

  async activate(id: string, organizationId: string) {
    const process = await this.findOne(id, organizationId)

    // Compila o BPMN → grafo executável. É AQUI que o diagrama deixa de ser
    // cosmético: se o desenho for inválido (seta órfã, sem início, construção
    // não suportada), a ativação FALHA com a causa — em vez de "ativar" algo
    // que o motor não consegue executar.
    let graph: WfGraph
    try {
      graph = compileBpmn(process.bpmnXml)
    } catch (e) {
      if (e instanceof CompileError) throw new BadRequestException(`Diagrama inválido: ${e.message}`)
      throw e
    }

    // Mescla o que foi configurado no painel "Atividade" do designer (guardado no
    // formSchema por nó): executor (papel) e prazo/SLA. É a forma explícita de
    // definir esses atributos sem depender de raias/extensões no XML.
    const formSchema = process.formSchema as unknown as ProcessFormSchema
    for (const step of formSchema.steps ?? []) {
      const node = graph.nodes[step.stepId]
      if (!node) continue
      if (step.role) node.role = step.role
      if (typeof step.slaMinutes === 'number' && step.slaMinutes > 0) node.slaMinutes = step.slaMinutes
      // Conector de domínio da atividade de serviço (ação automática). Definido no
      // painel "Ação automática" do designer; tem precedência sobre nxt:connector do XML.
      if (step.connector) node.connector = step.connector
      // Mapa entrada-do-conector → variável-do-processo (re-liga nomes no designer).
      if (step.connectorInputs && Object.keys(step.connectorInputs).length) {
        node.connectorInputs = step.connectorInputs
      }
      // Executor por papel+entidade (resolve para usuário(s) responsável(is) em runtime).
      if (step.executor?.papelId) node.executor = step.executor
    }

    const updatedProcess = await this.prisma.processDefinition.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        compiledGraph: graph as never,
        version: { increment: 1 },
      },
    })

    // Módulo legado (listagem genérica) — gera só se ainda não existir, para
    // permitir reativar/recompilar o processo depois de editar o diagrama.
    const existingModule = await this.prisma.module.findUnique({
      where: { processDefinitionId: id },
    })
    if (!existingModule) {
      const formSchema = process.formSchema as unknown as ProcessFormSchema
      const slug = process.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      await this.moduleGenerator.generate({
        processDefinitionId: id,
        organizationId,
        processName: process.name,
        slug,
        formSchema,
      })
    }

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
