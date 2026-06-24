import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateOrgUnitDto } from './dto/create-org-unit.dto'
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto'

@Injectable()
export class OrgUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOrgUnitDto) {
    return this.prisma.orgUnit.create({ data: dto as never })
  }

  private toNode(u: Record<string, unknown> & { _count: { children: number } }) {
    const { _count, ...rest } = u
    return { ...rest, childrenCount: _count.children }
  }

  /** Filhos diretos de um nó (parentId vazio = raízes). Carga sob demanda. */
  async findChildren(groupCompanyId: string, parentId?: string) {
    const rows = await this.prisma.orgUnit.findMany({
      where:   { groupCompanyId, parentId: parentId ?? null },
      orderBy: [{ codigo: 'asc' }, { nome: 'asc' }],
      include: { _count: { select: { children: true } } },
    })
    return rows.map(u => this.toNode(u))
  }

  /** Busca de unidades em toda a organização (para seleção como parte do contrato). */
  async searchForOrg(organizationId: string, term: string) {
    const t = term.trim()
    const rows = await this.prisma.orgUnit.findMany({
      where: {
        organizationId,
        ...(t ? { OR: [
          { nome:   { contains: t, mode: 'insensitive' } },
          { codigo: { contains: t, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: [{ codigo: 'asc' }, { nome: 'asc' }],
      take:    50,
      include: { groupCompany: { select: { razaoSocial: true, nomeFantasia: true } } },
    })
    return rows.map(u => ({
      id:       u.id,
      codigo:   u.codigo,
      nome:     u.nome,
      natureza: u.natureza,
      empresa:  u.groupCompany.nomeFantasia || u.groupCompany.razaoSocial,
    }))
  }

  /** Busca plana por código/nome/responsável (limite de 200). */
  async search(groupCompanyId: string, term: string) {
    const rows = await this.prisma.orgUnit.findMany({
      where: {
        groupCompanyId,
        OR: [
          { nome:        { contains: term, mode: 'insensitive' } },
          { codigo:      { contains: term, mode: 'insensitive' } },
          { responsavel: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ codigo: 'asc' }, { nome: 'asc' }],
      take:    200,
      include: { _count: { select: { children: true } } },
    })
    return rows.map(u => this.toNode(u))
  }

  private async ensure(id: string) {
    const u = await this.prisma.orgUnit.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Unidade não encontrada')
    return u
  }

  async update(id: string, dto: UpdateOrgUnitDto) {
    await this.ensure(id)
    return this.prisma.orgUnit.update({ where: { id }, data: dto as never })
  }

  async remove(id: string) {
    await this.ensure(id)
    return this.prisma.orgUnit.delete({ where: { id } }) // cascade remove filhos
  }
}
