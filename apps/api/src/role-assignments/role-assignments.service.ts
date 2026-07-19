import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { AssignmentItemDto } from './dto/set-assignments.dto'

/** Uma atribuição resolvida (com o nome/e-mail do usuário) para a UI. */
export interface HydratedAssignment {
  id: string
  papelId: string
  userId: string
  userName: string
  userEmail: string
}

@Injectable()
export class RoleAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Responsáveis de uma entidade (ou globais, quando entityId ausente = ORG). */
  async listByEntity(organizationId: string, entityType: string, entityId?: string): Promise<HydratedAssignment[]> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: { organizationId, entityType, entityId: entityId ?? null },
      orderBy: { createdAt: 'asc' },
    })
    return this.hydrate(organizationId, rows)
  }

  /** Substitui em bloco os responsáveis de uma entidade (a seção salva a lista inteira). */
  async setForEntity(
    organizationId: string,
    entityType: string,
    entityId: string | undefined,
    items: AssignmentItemDto[],
  ): Promise<HydratedAssignment[]> {
    // ignora linhas incompletas (papel ou usuário em branco)
    const clean = (items ?? []).filter((i) => i.papelId && i.userId)
    await this.prisma.$transaction([
      this.prisma.roleAssignment.deleteMany({
        where: { organizationId, entityType, entityId: entityId ?? null },
      }),
      ...(clean.length
        ? [this.prisma.roleAssignment.createMany({
            data: clean.map((i) => ({
              organizationId, entityType, entityId: entityId ?? null,
              papelId: i.papelId, userId: i.userId,
            })),
          })]
        : []),
    ])
    return this.listByEntity(organizationId, entityType, entityId)
  }

  /** Resolve os usuários responsáveis por um PAPEL numa entidade — usado pelo motor de
   *  workflow (Fase 3) para rotear a tarefa à(s) pessoa(s) certa(s). */
  async resolveUsers(organizationId: string, papelId: string, entityType: string, entityId?: string): Promise<string[]> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: { organizationId, papelId, entityType, entityId: entityId ?? null },
      select: { userId: true },
    })
    return rows.map((r) => r.userId)
  }

  /** Anexa nome/e-mail do usuário (resolvido ao vivo; cai para rótulo se removido). */
  private async hydrate(
    organizationId: string,
    rows: Array<{ id: string; papelId: string; userId: string }>,
  ): Promise<HydratedAssignment[]> {
    const ids = [...new Set(rows.map((r) => r.userId))]
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { organizationId, id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : []
    const map = new Map(users.map((u) => [u.id, u]))
    return rows.map((r) => ({
      id: r.id,
      papelId: r.papelId,
      userId: r.userId,
      userName: map.get(r.userId)?.name ?? '(usuário removido)',
      userEmail: map.get(r.userId)?.email ?? '',
    }))
  }
}
