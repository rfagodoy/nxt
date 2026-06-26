import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ModuleSchema } from '@nxt/types'

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

    const include = {
      documents: { select: { id: true, name: true, mimeType: true } },
      processInstance: { select: { status: true, currentStep: true } },
    }

    const term = search?.trim()
    if (term) {
      const result = await this.searchRecords(module.id, module.schema, term, page, pageSize, include)
      if (result) return result
      // sem colunas pesquisáveis válidas → cai para a listagem sem filtro
    }

    const where = { moduleId: module.id }
    const [records, total] = await Promise.all([
      this.prisma.moduleRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.moduleRecord.count({ where }),
    ])

    return { data: records, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /**
   * Busca por conteúdo de campos pesquisáveis. O conector SQL Server do Prisma não
   * suporta filtros JSON, então o filtro é T-SQL cru com `JSON_VALUE(data, '$.campo')`
   * (case-insensitive pela collation). Como `$queryRaw` ignora a Client Extension e os
   * includes, usamos o cru só para obter os IDs da página + total, e o Prisma para
   * hidratar (mantendo includes e a desserialização JSON). Retorna null se não houver
   * coluna pesquisável válida (o chamador então lista sem filtro).
   */
  private async searchRecords(
    moduleId: string,
    moduleSchema: unknown,
    term: string,
    page: number,
    pageSize: number,
    include: object,
  ) {
    const schema = moduleSchema as unknown as ModuleSchema
    // allow-list: só colunas marcadas como pesquisáveis e com nome seguro
    // (defesa em profundidade — o nome vai concatenado no path do JSON_VALUE).
    const cols = schema.columns
      .filter((c) => c.searchable && /^[A-Za-z0-9_]+$/.test(c.name))
      .map((c) => c.name)
    if (cols.length === 0) return null

    const like = `%${term}%`
    const offset = (page - 1) * pageSize

    // condições com placeholders posicionais únicos (@P1, @P2, ...) — termo parametrizado
    const buildConds = (params: unknown[]) =>
      cols
        .map((c) => {
          params.push(like)
          return `JSON_VALUE(data, '$.${c}') LIKE @P${params.length}`
        })
        .join(' OR ')

    const idParams: unknown[] = []
    const idConds = buildConds(idParams)
    idParams.push(moduleId)
    const pModule = idParams.length
    idParams.push(offset)
    const pOffset = idParams.length
    idParams.push(pageSize)
    const pSize = idParams.length
    const idsSql =
      `SELECT id FROM module_records WHERE moduleId = @P${pModule} AND (${idConds}) ` +
      `ORDER BY createdAt DESC OFFSET @P${pOffset} ROWS FETCH NEXT @P${pSize} ROWS ONLY`

    const countParams: unknown[] = []
    const countConds = buildConds(countParams)
    countParams.push(moduleId)
    const countSql = `SELECT COUNT(*) AS total FROM module_records WHERE moduleId = @P${countParams.length} AND (${countConds})`

    const idRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(idsSql, ...idParams)
    const ids = idRows.map((r) => r.id)
    const countRows = await this.prisma.$queryRawUnsafe<Array<{ total: number }>>(countSql, ...countParams)
    const total = Number(countRows[0]?.total ?? 0)

    const found = ids.length
      ? await this.prisma.moduleRecord.findMany({ where: { id: { in: ids } }, include })
      : []
    const byId = new Map(found.map((r) => [r.id, r]))
    const data = ids.map((id) => byId.get(id)).filter(Boolean)

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
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
      JOIN process_instances pi ON pi.id = mr.processInstanceId
      WHERE mr.moduleId = ${module.id}
      GROUP BY pi.status
    `

    return {
      total,
      byStatus: statusCounts.map((r) => ({ status: r.status, count: Number(r.count) })),
    }
  }
}
