import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { AssignmentItemDto } from './dto/set-assignments.dto'
import type { CurrentUserData } from '../auth/current-user.decorator'

const PAPEIS_KEY = 'nxt:settings:contratos:papeis:v2'
type AuditChange = { field: string; label: string; before: string; after: string }

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

  /** Substitui em bloco os responsáveis de uma entidade (a seção salva a lista inteira).
   *  Registra na auditoria da entidade (contrato/parceiro) o que foi incluído/removido. */
  async setForEntity(
    organizationId: string,
    entityType: string,
    entityId: string | undefined,
    items: AssignmentItemDto[],
    actor?: CurrentUserData,
  ): Promise<HydratedAssignment[]> {
    // ignora linhas incompletas (papel ou usuário em branco)
    const clean = (items ?? []).filter((i) => i.papelId && i.userId)

    // estado ANTES (para o diff da auditoria)
    const before = await this.prisma.roleAssignment.findMany({
      where: { organizationId, entityType, entityId: entityId ?? null },
      select: { papelId: true, userId: true },
    })

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

    await this.audit(organizationId, entityType, entityId, before, clean, actor)
    return this.listByEntity(organizationId, entityType, entityId)
  }

  /** Escreve na auditoria da entidade (só CONTRATO→ContractAuditLog e PARCEIRO→
   *  PartnerAuditLog têm trilha) as inclusões/remoções de responsáveis desta gravação. */
  private async audit(
    organizationId: string,
    entityType: string,
    entityId: string | undefined,
    before: Array<{ papelId: string; userId: string }>,
    after: Array<{ papelId: string; userId: string }>,
    actor?: CurrentUserData,
  ): Promise<void> {
    if (!entityId || (entityType !== 'CONTRATO' && entityType !== 'PARCEIRO')) return
    const key = (a: { papelId: string; userId: string }) => `${a.papelId}::${a.userId}`
    const beforeSet = new Set(before.map(key))
    const afterSet = new Set(after.map(key))
    const added = after.filter((a) => !beforeSet.has(key(a)))
    const removed = before.filter((a) => !afterSet.has(key(a)))
    if (added.length === 0 && removed.length === 0) return

    // rótulos legíveis: papel (do catálogo AppSetting) + nome do usuário
    const papelLabels = await this.papelLabels(organizationId)
    const userIds = [...new Set([...added, ...removed].map((a) => a.userId))]
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { organizationId, id: { in: userIds } }, select: { id: true, name: true } })
      : []
    const userName = new Map(users.map((u) => [u.id, u.name]))
    const desc = (a: { papelId: string; userId: string }) =>
      `${papelLabels.get(a.papelId) ?? a.papelId} · ${userName.get(a.userId) ?? '(usuário)'}`

    const changes: AuditChange[] = [
      ...added.map((a) => ({ field: `responsavel.${key(a)}`, label: 'Responsável incluído', before: '—', after: desc(a) })),
      ...removed.map((a) => ({ field: `responsavel.${key(a)}`, label: 'Responsável removido', before: desc(a), after: '—' })),
    ]

    const data = {
      user: actor?.name ?? 'Usuário do sistema',
      userId: actor?.sub ?? null,
      event: 'RESPONSAVEL',
      changes: changes as never,
    }
    if (entityType === 'CONTRATO') {
      await this.prisma.contractAuditLog.create({ data: { contractId: entityId, ...data } })
    } else {
      await this.prisma.partnerAuditLog.create({ data: { partnerId: entityId, ...data } })
    }
  }

  /** Mapa papelId → rótulo, lido do catálogo de papéis (AppSetting da organização). */
  private async papelLabels(organizationId: string): Promise<Map<string, string>> {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId: '', key: PAPEIS_KEY } },
    })
    const entries = (row?.value as unknown as Array<{ id: string; label: string }> | null) ?? []
    return new Map(entries.map((e) => [e.id, e.label]))
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
