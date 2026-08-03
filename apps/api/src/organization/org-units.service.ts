import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateOrgUnitDto } from './dto/create-org-unit.dto'
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto'

@Injectable()
export class OrgUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOrgUnitDto, organizationId: string) {
    const { user, ...data } = dto; void user  // `user` é só p/ auditoria futura
    return this.prisma.orgUnit.create({ data: { ...data, organizationId } as never })
  }

  async findOne(id: string, organizationId: string) {
    const u = await this.prisma.orgUnit.findFirst({ where: { id, organizationId } })
    if (!u) throw new NotFoundException('Unidade não encontrada')
    return u
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

  /** Busca de unidades em toda a organização (seleção como parte do contrato e como
   *  entidade do executor no workflow).
   *  ⚠️ SEM termo isto é a LISTA INTEIRA, e quem consome filtra do lado do cliente —
   *  um `take` baixo aqui esconderia unidades sem avisar ninguém (o seletor pareceria
   *  simplesmente não ter aquela unidade). O teto alto existe só como barreira contra
   *  consulta desgovernada; se uma organização real chegar perto dele, o seletor tem
   *  de passar a buscar no servidor em vez de filtrar na tela. */
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
      take:    1000,
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

  /** A unidade e TODA a sua subárvore. O `visto` não é zelo excessivo: se um ciclo
   *  chegar a existir no banco, sem ele este laço não termina — e é justamente esta
   *  função que impede o ciclo de nascer. */
  private async subtreeIds(id: string, organizationId: string): Promise<string[]> {
    const ids = [id]
    const visto = new Set(ids)
    let frente = [id]
    while (frente.length) {
      const filhos = await this.prisma.orgUnit.findMany({
        where: { organizationId, parentId: { in: frente } },
        select: { id: true },
      })
      frente = filhos.map((c) => c.id).filter((c) => !visto.has(c))
      for (const c of frente) { visto.add(c); ids.push(c) }
    }
    return ids
  }

  /** Destinos VÁLIDOS para mover uma unidade: as demais da mesma empresa, menos ela
   *  própria e menos a sua subárvore (mover para baixo de si mesma soltaria o ramo
   *  da árvore — some do organograma e nunca mais é alcançável pela raiz). */
  async moveTargets(id: string, organizationId: string) {
    const u = await this.ensure(id, organizationId)
    const proibidos = await this.subtreeIds(id, organizationId)
    const rows = await this.prisma.orgUnit.findMany({
      where: { organizationId, groupCompanyId: u.groupCompanyId, id: { notIn: proibidos } },
      orderBy: [{ codigo: 'asc' }, { nome: 'asc' }],
      select: { id: true, codigo: true, nome: true, natureza: true, parentId: true },
    })
    return { atual: { id: u.id, nome: u.nome, parentId: u.parentId }, destinos: rows }
  }

  async update(id: string, dto: UpdateOrgUnitDto, organizationId: string) {
    const atual = await this.ensure(id, organizationId)
    const { user, ...data } = dto; void user

    // ── MOVER: trocar de pai exige checar o destino, senão a árvore se corrompe ──
    if (data.parentId !== undefined && data.parentId !== atual.parentId) {
      const destinoId = data.parentId || null
      if (destinoId) {
        if (destinoId === id) throw new BadRequestException('Uma unidade não pode ser subordinada a si mesma.')
        const destino = await this.prisma.orgUnit.findFirst({ where: { id: destinoId, organizationId } })
        if (!destino) throw new NotFoundException('Unidade de destino não encontrada')
        if (destino.groupCompanyId !== atual.groupCompanyId) {
          throw new BadRequestException('A unidade de destino é de outra empresa do grupo. Mover entre empresas não é permitido.')
        }
        const proibidos = await this.subtreeIds(id, organizationId)
        if (proibidos.includes(destinoId)) {
          throw new BadRequestException(`Não dá para mover "${atual.nome}" para dentro de "${destino.nome}": o destino está abaixo dela. O ramo se soltaria da árvore e sumiria do organograma.`)
        }
      }
      data.parentId = destinoId
    }

    return this.prisma.orgUnit.update({ where: { id }, data: data as never })
  }

  async remove(id: string, organizationId: string) {
    await this.ensure(id, organizationId)
    // No SQL Server a self-relation usa NoAction (cascade cíclico é proibido), então
    // o banco não apaga os filhos sozinho — fazemos o cascade na aplicação: coleta a
    // subárvore e remove tudo num único deleteMany (satisfaz a FK no mesmo statement).
    const ids = await this.subtreeIds(id, organizationId)
    return this.prisma.orgUnit.deleteMany({ where: { id: { in: ids } } })
  }
}
