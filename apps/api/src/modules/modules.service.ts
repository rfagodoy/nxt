import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ModuleSchema } from '@primeapps/types'

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.module.findMany({
      where: { organizationId },
      include: { processDefinition: { select: { name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findBySlug(organizationId: string, slug: string) {
    const module = await this.prisma.module.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    })
    if (!module) throw new NotFoundException('Módulo não encontrado')
    return module
  }

  async getRecords(
    organizationId: string,
    slug: string,
    page = 1,
    pageSize = 20,
    search?: string,
  ) {
    const module = await this.findBySlug(organizationId, slug)
    const schema = module.schema as unknown as ModuleSchema
    const searchableColumns = schema.columns.filter((c) => c.searchable).map((c) => c.name)

    const where: Record<string, unknown> = { moduleId: module.id }

    if (search && searchableColumns.length > 0) {
      where.OR = searchableColumns.map((col) => ({
        data: { path: [col], string_contains: search, mode: 'insensitive' },
      }))
    }

    const [records, total] = await Promise.all([
      this.prisma.moduleRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          documents: { select: { id: true, name: true, mimeType: true } },
          processInstance: { select: { status: true, currentStep: true } },
        },
      }),
      this.prisma.moduleRecord.count({ where }),
    ])

    return {
      data: records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  async getRecord(organizationId: string, slug: string, recordId: string) {
    const module = await this.findBySlug(organizationId, slug)
    const record = await this.prisma.moduleRecord.findFirst({
      where: { id: recordId, moduleId: module.id },
      include: {
        documents: true,
        processInstance: true,
      },
    })
    if (!record) throw new NotFoundException('Registro não encontrado')
    return record
  }

  async getDashboard(organizationId: string, slug: string) {
    const module = await this.findBySlug(organizationId, slug)

    const [total, byInstanceStatus] = await Promise.all([
      this.prisma.moduleRecord.count({ where: { moduleId: module.id } }),
      this.prisma.moduleRecord.groupBy({
        by: ['moduleId'],
        where: { moduleId: module.id },
        _count: true,
      }),
    ])

    const statusCounts = await this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT pi.status, COUNT(*) as count
      FROM module_records mr
      JOIN process_instances pi ON pi.id = mr.process_instance_id
      WHERE mr.module_id = ${module.id}
      GROUP BY pi.status
    `

    return {
      total,
      byStatus: statusCounts.map((r) => ({ status: r.status, count: Number(r.count) })),
    }
  }
}
