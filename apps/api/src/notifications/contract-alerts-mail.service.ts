import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'
import { MailerService, layout, escapeHtml } from './mailer.service'
import { NOTIF_PARAMS_KEY, contratosEmailParams, SEVERIDADE_RANK } from './notification-params'

/* Alertas de CONTRATO por e-mail — vigência, reajuste e consumo.
 *
 *  Estes avisos nascem SEM DESTINATÁRIO (`userId` nulo): são da organização, não de
 *  uma pessoa, e por isso ficavam presos no sininho enquanto os avisos de workflow
 *  saíam por e-mail. Num sistema de contratos é justamente "seu contrato vence em 30
 *  dias" que precisa chegar em quem não abriu o sistema hoje.
 *
 *  QUEM RECEBE, em três camadas — a última existe para que o alerta nunca morra em
 *  silêncio, que é o pior desfecho possível para um aviso de prazo:
 *    1. responsáveis do contrato (RoleAssignment CONTRATO — quem tem o contrato na mão);
 *    2. destinatários fixos configurados (o gestor que quer ver tudo);
 *    3. nenhum dos dois → administradores ativos, com registro no log.
 *
 *  UM E-MAIL POR PESSOA, com todos os avisos dela. Um por alerta transformaria a
 *  primeira execução numa avalanche de dezenas de mensagens e o canal seria desligado
 *  no dia seguinte — o resumo diário já resolveu esse problema uma vez.
 *
 *  NÃO REPETE: `emailedAt` marca o que já saiu. O aviso volta a ser enviado só quando
 *  PIORA (o scheduler limpa `emailedAt` na escalada de severidade). */

const TIPOS_CONTRATO = ['VIGENCIA', 'REAJUSTE', 'CONSUMO']

interface Aviso {
  id: string
  contractId: string | null
  severidade: string
  titulo: string
  mensagem: string
}

@Injectable()
export class ContractAlertsMailService {
  private readonly logger = new Logger('ContractAlertsMail')

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
  ) {}

  /** Envia os alertas de contrato pendentes. Devolve quantas PESSOAS receberam.
   *  Público: roda no relógio diário (MailDigestService) e no disparo manual da tela. */
  async enviar(organizationId: string): Promise<number> {
    const params = contratosEmailParams((await this.settings.get(organizationId, NOTIF_PARAMS_KEY)).value)
    if (!params.enabled) return 0
    if (!(await this.mailer.enabled(organizationId))) return 0

    const pendentes = (await this.prisma.notification.findMany({
      where: { organizationId, tipo: { in: TIPOS_CONTRATO }, emailedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, contractId: true, severidade: true, titulo: true, mensagem: true },
    })) as Aviso[]
    if (pendentes.length === 0) return 0

    const responsaveis = await this.responsaveisPorContrato(organizationId, pendentes)

    /* monta a caixa de cada pessoa */
    const porUsuario = new Map<string, Aviso[]>()
    const empurrar = (userId: string, aviso: Aviso) => {
      const lista = porUsuario.get(userId) ?? []
      lista.push(aviso)
      porUsuario.set(userId, lista)
    }

    let semDono = 0
    let admins: string[] | null = null
    for (const aviso of pendentes) {
      const doContrato = aviso.contractId ? (responsaveis.get(aviso.contractId) ?? []) : []
      const alvos = new Set([...doContrato, ...params.destinatarios])
      if (alvos.size === 0) {
        // camada 3: ninguém responde por este contrato — o aviso vai para quem administra
        admins ??= await this.admins(organizationId)
        for (const id of admins) alvos.add(id)
        semDono++
      }
      for (const userId of alvos) empurrar(userId, aviso)
    }
    if (semDono > 0) {
      this.logger.warn(`${semDono} alerta(s) de contrato sem responsável — enviados aos administradores. Defina responsáveis no contrato ou destinatários fixos em Notificações.`)
    }

    /* só usuários ATIVOS e com e-mail: um destinatário desativado não recebe, e o
       alerta segue pendente para a próxima execução (quando alguém assumir o contrato). */
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...porUsuario.keys()] }, organizationId, status: 'ATIVO' },
      select: { id: true, email: true, name: true },
    })

    const entregues = new Set<string>()
    let pessoas = 0
    for (const u of users) {
      const itens = (porUsuario.get(u.id) ?? []).sort(
        (a, b) => (SEVERIDADE_RANK[b.severidade] ?? 0) - (SEVERIDADE_RANK[a.severidade] ?? 0),
      )
      if (itens.length === 0 || !u.email) continue

      const ok = await this.mailer.send(organizationId, this.mensagem(u.name, u.email, itens))
      if (!ok) continue
      for (const i of itens) entregues.add(i.id)
      pessoas++
    }

    /* marca só o que chegou a sair. Um aviso enviado a duas pessoas com uma falha
       conta como enviado — ele saiu; insistir puniria quem já recebeu. */
    if (entregues.size > 0) {
      await this.prisma.notification.updateMany({
        where: { id: { in: [...entregues] } },
        data: { emailedAt: new Date() },
      })
      this.logger.log(`alertas de contrato: ${entregues.size} aviso(s) para ${pessoas} pessoa(s)`)
    }
    return pessoas
  }

  /** contractId → userIds responsáveis, numa consulta só (papel não importa aqui:
   *  quem responde pelo contrato, em qualquer papel, precisa saber que ele vence). */
  private async responsaveisPorContrato(organizationId: string, avisos: Aviso[]): Promise<Map<string, string[]>> {
    const contractIds = [...new Set(avisos.map((a) => a.contractId).filter((id): id is string => !!id))]
    const mapa = new Map<string, string[]>()
    if (contractIds.length === 0) return mapa
    const vinculos = await this.prisma.roleAssignment.findMany({
      where: { organizationId, entityType: 'CONTRATO', entityId: { in: contractIds } },
      select: { entityId: true, userId: true },
    })
    for (const v of vinculos) {
      if (!v.entityId) continue
      const lista = mapa.get(v.entityId) ?? []
      if (!lista.includes(v.userId)) lista.push(v.userId)
      mapa.set(v.entityId, lista)
    }
    return mapa
  }

  private async admins(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { organizationId, role: 'admin', status: 'ATIVO' },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }

  /** Mesmo formato do resumo diário (título + mensagem, um bloco por aviso): quem
   *  recebe os dois não precisa aprender dois layouts. O rodapé de `layout` já
   *  explica por que a mensagem chegou. */
  private mensagem(nome: string, to: string, itens: Aviso[]) {
    const n = itens.length
    const plural = n === 1 ? '' : 's'
    const linhas = itens
      .map(
        (i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eef1f0">
            <div style="font-weight:600">${escapeHtml(i.titulo)}</div>
            <div style="color:#4b5551">${escapeHtml(i.mensagem)}</div>
          </td>
        </tr>`,
      )
      .join('')

    return {
      to,
      subject: `[Nxt] Contratos: ${n} aviso${plural}`,
      text: `Olá, ${nome}.\n\n${itens.map((i) => `- ${i.titulo}: ${i.mensagem}`).join('\n')}\n\nAbra o Nxt para agir.`,
      html: layout(
        `Olá, ${escapeHtml(nome)} — ${n} aviso${plural} de contrato`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
         <p style="color:#6b7772;margin-top:14px">Abra o Nxt para agir.</p>`,
      ),
    }
  }
}
