import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

const SEV_RANK: Record<string, number> = { CRITICO: 0, ALERTA: 1, INFO: 2 }

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notificações ativas para o usuário, com status de leitura dele. Avisos de
   *  workflow nascem endereçados (`userId`); os de contrato nascem sem dono e
   *  seguem visíveis para toda a organização. */
  async list(organizationId: string, userId: string) {
    const rows = await this.prisma.notification.findMany({
      where:   { organizationId, OR: [{ userId: null }, { userId }] },
      include: { reads: { where: { userId }, select: { id: true } }, contract: { select: { numero: true, titulo: true } } },
    })
    return rows
      .map(n => ({
        id: n.id, tipo: n.tipo, severidade: n.severidade, titulo: n.titulo, mensagem: n.mensagem,
        contractId: n.contractId ?? '', contractNumero: n.contract?.numero ?? '', contractTitulo: n.contract?.titulo ?? '',
        instanceId: n.instanceId ?? '', taskId: n.taskId ?? '',
        createdAt: n.createdAt, read: n.reads.length > 0,
      }))
      .sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1                     // não-lidas primeiro
        const sr = (SEV_RANK[a.severidade] ?? 9) - (SEV_RANK[b.severidade] ?? 9)
        if (sr !== 0) return sr                                            // depois por severidade
        return a.createdAt < b.createdAt ? 1 : -1                          // depois mais recentes
      })
  }

  async markRead(organizationId: string, id: string, userId: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, organizationId }, select: { id: true } })
    if (!n) return { ok: false }
    await this.prisma.notificationRead.upsert({
      where:  { notificationId_userId: { notificationId: id, userId } },
      create: { notificationId: id, userId },
      update: {},
    })
    return { ok: true }
  }

  async markAllRead(organizationId: string, userId: string) {
    // só o que o usuário de fato vê (não marca por ele o que é de outro destinatário)
    const rows = await this.prisma.notification.findMany({
      where: { organizationId, OR: [{ userId: null }, { userId }] },
      select: { id: true },
    })
    for (const r of rows) {
      await this.prisma.notificationRead.upsert({
        where:  { notificationId_userId: { notificationId: r.id, userId } },
        create: { notificationId: r.id, userId },
        update: {},
      })
    }
    return { ok: true, count: rows.length }
  }
}
