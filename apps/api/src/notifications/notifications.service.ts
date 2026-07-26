import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

const SEV_RANK: Record<string, number> = { CRITICO: 0, ALERTA: 1, INFO: 2 }

/** Quantos avisos o sininho pede de uma vez. O painel mostra um punhado; o resto
 *  vive na tela de histórico, paginada. */
const BELL_LIMIT = 20
/** Página do histórico. */
const PAGE_SIZE = 25
/** Idade máxima de um aviso já lido (o não lido nunca é apagado por tempo: se ainda
 *  pede ação, ele fica). Um ano cobre "o que aconteceu no último exercício". */
export const PURGE_DAYS = 365

interface Row {
  id: string; tipo: string; severidade: string; titulo: string; mensagem: string
  contractId: string | null; instanceId: string | null; taskId: string | null
  createdAt: Date
  contract?: { numero: string; titulo: string } | null
  reads?: { id: string }[]
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications')

  constructor(private readonly prisma: PrismaService) {}

  private toDto(n: Row, read: boolean) {
    return {
      id: n.id, tipo: n.tipo, severidade: n.severidade, titulo: n.titulo, mensagem: n.mensagem,
      contractId: n.contractId ?? '', contractNumero: n.contract?.numero ?? '', contractTitulo: n.contract?.titulo ?? '',
      instanceId: n.instanceId ?? '', taskId: n.taskId ?? '',
      createdAt: n.createdAt, read,
    }
  }

  /** O que o usuário vê: o que é dele + o que não tem dono (avisos de contrato). */
  private visibleTo(organizationId: string, userId: string) {
    return { organizationId, OR: [{ userId: null }, { userId }] }
  }

  private readonly include = {
    contract: { select: { numero: true, titulo: true } },
  }

  /** Painel do sininho: as NÃO LIDAS primeiro (as que pedem ação) e, se sobrar
   *  espaço, as lidas mais recentes — tudo com limite. A leitura antiga trazia a
   *  tabela inteira da organização e ordenava no Node; com histórico de verdade
   *  isso derrubaria a tela muito antes de o disco pesar. */
  async list(organizationId: string, userId: string) {
    const where = this.visibleTo(organizationId, userId)

    const unread = await this.prisma.notification.findMany({
      where: { ...where, reads: { none: { userId } } },
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: BELL_LIMIT,
    })

    const restante = BELL_LIMIT - unread.length
    const read = restante > 0
      ? await this.prisma.notification.findMany({
          where: { ...where, reads: { some: { userId } } },
          include: this.include,
          orderBy: { createdAt: 'desc' },
          take: restante,
        })
      : []

    // dentro do lote (pequeno), severidade decide a ordem das não lidas
    const ordenadas = [...unread].sort((a, b) => {
      const sr = (SEV_RANK[a.severidade] ?? 9) - (SEV_RANK[b.severidade] ?? 9)
      return sr !== 0 ? sr : (a.createdAt < b.createdAt ? 1 : -1)
    })

    return {
      items: [
        ...ordenadas.map((n) => this.toDto(n as Row, false)),
        ...read.map((n) => this.toDto(n as Row, true)),
      ],
      unread: await this.unreadCount(organizationId, userId),
    }
  }

  /** Contador do badge — `count` no banco, não `length` de um array carregado. */
  unreadCount(organizationId: string, userId: string) {
    return this.prisma.notification.count({
      where: { ...this.visibleTo(organizationId, userId), reads: { none: { userId } } },
    })
  }

  /** Histórico completo, paginado no BANCO. É a tela que torna seguro guardar o
   *  passado: nada aqui carrega a organização inteira em memória. */
  async history(
    organizationId: string,
    userId: string,
    opts: { page?: number; pageSize?: number; tipo?: string; unread?: boolean } = {},
  ) {
    const page = Math.max(1, Number(opts.page) || 1)
    const pageSize = Math.min(100, Math.max(5, Number(opts.pageSize) || PAGE_SIZE))
    const where: Record<string, unknown> = { ...this.visibleTo(organizationId, userId) }
    if (opts.tipo) where.tipo = opts.tipo
    if (opts.unread) where.reads = { none: { userId } }

    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        include: { ...this.include, reads: { where: { userId }, select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      items: rows.map((n) => this.toDto(n as Row, (n.reads?.length ?? 0) > 0)),
      total, page, pageSize,
    }
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

  /** Marca tudo o que ele vê como lido. Antes era um upsert POR AVISO, em laço —
   *  com histórico, marcar tudo viraria milhares de idas ao banco. Agora busca só
   *  os ids não lidos e grava em UMA operação. */
  async markAllRead(organizationId: string, userId: string) {
    const pendentes = await this.prisma.notification.findMany({
      where: { ...this.visibleTo(organizationId, userId), reads: { none: { userId } } },
      select: { id: true },
    })
    if (pendentes.length === 0) return { ok: true, count: 0 }
    await this.prisma.notificationRead.createMany({
      data: pendentes.map((n) => ({ notificationId: n.id, userId })),
    })
    return { ok: true, count: pendentes.length }
  }

  /** Expurgo por idade: apaga avisos JÁ LIDOS com mais de `days` dias. O não lido
   *  fica — se ninguém o viu, apagá-lo é esconder o problema, não resolvê-lo.
   *  Roda no agendador (uma vez ao dia). */
  async purgeOld(days = PURGE_DAYS): Promise<number> {
    const limite = new Date(Date.now() - days * 86_400_000)
    try {
      // só o que TODO destinatário já leu: aviso sem dono lido por um e não por
      // outro continua valendo para o segundo.
      const antigos = await this.prisma.notification.findMany({
        where: { createdAt: { lt: limite }, reads: { some: {} } },
        select: { id: true },
        take: 5_000, // teto por execução: expurgo não pode virar transação gigante
      })
      if (antigos.length === 0) return 0
      const ids = antigos.map((n) => n.id)
      await this.prisma.notificationRead.deleteMany({ where: { notificationId: { in: ids } } })
      const del = await this.prisma.notification.deleteMany({ where: { id: { in: ids } } })
      return del.count
    } catch (e) {
      this.logger.error(`expurgo de notificações falhou: ${String(e)}`)
      return 0
    }
  }
}
