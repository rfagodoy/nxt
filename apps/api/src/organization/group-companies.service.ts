import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateGroupCompanyDto } from './dto/create-group-company.dto'
import { UpdateGroupCompanyDto } from './dto/update-group-company.dto'

@Injectable()
export class GroupCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateGroupCompanyDto, organizationId: string) {
    return this.prisma.groupCompany.create({ data: { ...dto, organizationId } as never })
  }

  async findAll(organizationId: string) {
    const rows = await this.prisma.groupCompany.findMany({
      where:   { organizationId },
      orderBy: { razaoSocial: 'asc' },
      include: { _count: { select: { orgUnits: true } } },
    })
    return {
      rows: rows.map(c => ({
        id:           c.id,
        codigo:       c.codigo,
        razaoSocial:  c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        cnpj:         c.cnpj,
        status:       c.status,
        unidades:     c._count.orgUnits,
      })),
    }
  }

  async findOne(id: string, organizationId: string) {
    const c = await this.prisma.groupCompany.findFirst({ where: { id, organizationId } })
    if (!c) throw new NotFoundException('Empresa não encontrada')
    return c
  }

  async update(id: string, dto: UpdateGroupCompanyDto, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.groupCompany.update({ where: { id }, data: dto as never })
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.groupCompany.delete({ where: { id } }) // cascade remove orgUnits
  }
}
