import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateOrgUnitDto } from './dto/create-org-unit.dto'
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto'

@Injectable()
export class OrgUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOrgUnitDto, organizationId: string) {
    return this.prisma.orgUnit.create({ data: { ...dto, organizationId } as never })
  }

  private toNode(u: Record<string, unknown> & { _count: { children: number } }) {
    const { _count, ...rest } = u
    return { ...rest, childrenCount: _count.children }
  }

  /** Filhos diretos de um nó (parentId vazio = raízes). Carga sob demanda. */
  async findChildren(groupCompanyId: string, parentId: string | undefined, organizationId: string) {
    const rows = await this.prisma.orgUnit.findMany({
      where:   { organizationId, groupCompanyId, parentId: parentId ?? null },
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
          { nome:   { contains: t } },
          { codigo: { contains: t } },
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
  async search(groupCompanyId: string, term: string, organizationId: string) {
    const rows = await this.prisma.orgUnit.findMany({
      where: {
        organizationId,
        groupCompanyId,
        OR: [
          { nome:        { contains: term } },
          { codigo:      { contains: term } },
          { responsavel: { contains: term } },
        ],
      },
      orderBy: [{ codigo: 'asc' }, { nome: 'asc' }],
      take:    200,
      include: { _count: { select: { children: true } } },
    })
    return rows.map(u => this.toNode(u))
  }

  private async ensure(id: string, organizationId: string) {
    const u = await this.prisma.orgUnit.findFirst({ where: { id, organizationId } })
    if (!u) throw new NotFoundException('Unidade não encontrada')
    return u
  }

  async update(id: string, dto: UpdateOrgUnitDto, organizationId: string) {
    await this.ensure(id, organizationId)
    return this.prisma.orgUnit.update({ where: { id }, data: dto as never })
  }

  async remove(id: string, organizationId: string) {
    await this.ensure(id, organizationId)
    // No SQL Server a self-relation usa NoAction (cascade cíclico é proibido), então
    // o banco não apaga os filhos sozinho — fazemos o cascade na aplicação: coleta a
    // subárvore (BFS) e remove tudo num único deleteMany (satisfaz a FK no mesmo statement).
    const ids = [id]
    let frontier = [id]
    while (frontier.length) {
      const children = await this.prisma.orgUnit.findMany({
        where: { organizationId, parentId: { in: frontier } },
        select: { id: true },
      })
      frontier = children.map((c) => c.id)
      ids.push(...frontier)
    }
    return this.prisma.orgUnit.deleteMany({ where: { id: { in: ids } } })
  }
}
