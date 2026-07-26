import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'
import { MailerService, layout, escapeHtml } from './mailer.service'
import { NOTIF_PARAMS_KEY, emailParams } from './notification-params'

/* Resumo diário: um e-mail por pessoa com o que ela ainda não recebeu por e-mail.
   Trabalha junto com o envio imediato e não em cima dele — o filtro é `emailedAt`
   nulo, então o que já chegou na hora não volta no resumo. Sem esse controle, quem
   liga as duas coisas recebe tudo em dobro e desliga o canal no dia seguinte.

   O disparo é por HORA LOCAL configurada (padrão 8h) e uma vez por dia por
   organização: o agendador tem granularidade de 5 minutos, então a marca do último
   envio evita repetir dentro da mesma hora. */

const CICLO_MS = 5 * 60_000

@Injectable()
export class MailDigestService implements OnModuleInit {
  private readonly logger = new Logger('MailDigest')
  /** organizationId → 'YYYY-MM-DD' do último resumo enviado */
  private ultimoEnvio = new Map<string, string>()
  private rodando = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.tick(), 90_000)
    setInterval(() => void this.tick(), CICLO_MS)
  }

  private async tick() {
    if (this.rodando) return
    this.rodando = true
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true } })
      // o canal é POR ORGANIZAÇÃO: uma pode ter SMTP e outra não
      for (const org of orgs) {
        if (await this.mailer.enabled(org.id)) await this.runOrg(org.id)
      }
    } catch (e) {
      this.logger.error(`resumo diário falhou: ${String(e)}`)
    } finally {
      this.rodando = false
    }
  }

  /** Envia o resumo de UMA organização, se estiver na hora e ainda não tiver saído hoje. */
  private async runOrg(organizationId: string): Promise<number> {
    const params = emailParams((await this.settings.get(organizationId, NOTIF_PARAMS_KEY)).value)
    if (!params.resumoDiario) return 0

    const agora = new Date()
    const hoje = agora.toISOString().slice(0, 10)
    if (agora.getHours() !== params.horaResumo) return 0
    if (this.ultimoEnvio.get(organizationId) === hoje) return 0

    const enviados = await this.enviar(organizationId)
    this.ultimoEnvio.set(organizationId, hoje)
    if (enviados > 0) this.logger.log(`resumo diário enviado para ${enviados} pessoa(s)`)
    return enviados
  }

  /** Monta e envia o resumo. Público para o disparo manual da tela (admin). */
  async enviar(organizationId: string): Promise<number> {
    // pendentes de e-mail: com destinatário, ainda não enviados e ainda NÃO LIDOS —
    // resumir o que a pessoa já viu no sininho é encher a caixa dela com passado.
    const pendentes = await this.prisma.notification.findMany({
      where: { organizationId, userId: { not: null }, emailedAt: null, reads: { none: {} } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, titulo: true, mensagem: true, severidade: true, createdAt: true },
    })
    if (pendentes.length === 0) return 0

    const porUsuario = new Map<string, typeof pendentes>()
    for (const n of pendentes) {
      const lista = porUsuario.get(n.userId!) ?? []
      lista.push(n)
      porUsuario.set(n.userId!, lista)
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...porUsuario.keys()] }, organizationId, status: 'ATIVO' },
      select: { id: true, email: true, name: true },
    })

    let pessoas = 0
    for (const u of users) {
      const itens = porUsuario.get(u.id) ?? []
      if (itens.length === 0 || !u.email) continue

      const linhas = itens.map((n) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eef1f0">
            <div style="font-weight:600">${escapeHtml(n.titulo)}</div>
            <div style="color:#4b5551">${escapeHtml(n.mensagem)}</div>
          </td>
        </tr>`).join('')

      const ok = await this.mailer.send(organizationId, {
        to: u.email,
        subject: `[Nxt] Seu resumo: ${itens.length} aviso${itens.length === 1 ? '' : 's'}`,
        text: `Olá, ${u.name}.\n\n${itens.map((n) => `- ${n.titulo}: ${n.mensagem}`).join('\n')}\n\nAbra o Nxt para agir.`,
        html: layout(
          `Olá, ${escapeHtml(u.name)} — ${itens.length} aviso${itens.length === 1 ? '' : 's'} esperando`,
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
           <p style="color:#6b7772;margin-top:14px">Abra o Nxt para agir.</p>`,
        ),
      })
      if (!ok) continue

      await this.prisma.notification.updateMany({
        where: { id: { in: itens.map((n) => n.id) } },
        data: { emailedAt: new Date() },
      })
      pessoas++
    }
    return pessoas
  }
}
