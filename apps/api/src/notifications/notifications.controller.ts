import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { NotificationsService } from './notifications.service'
import { ContractSchedulerService } from './contract-scheduler.service'
import { MailerService } from './mailer.service'
import { MailDigestService } from './mail-digest.service'
import { ContractAlertsMailService } from './contract-alerts-mail.service'
import { MailSettingsService, type StoredMailConfig } from './mail-settings.service'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly svc: NotificationsService,
    private readonly scheduler: ContractSchedulerService,
    private readonly mailer: MailerService,
    private readonly digest: MailDigestService,
    private readonly contractAlerts: ContractAlertsMailService,
    private readonly mailSettings: MailSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Painel do sininho: não lidas primeiro, com limite (+ contador de não lidas)' })
  list(@CurrentOrg() org: string, @CurrentUser() user: CurrentUserData) {
    return this.svc.list(org, user.sub)
  }

  // Rota estática ANTES de qualquer param, como no resto da casa.
  @Get('history')
  @ApiOperation({ summary: 'Histórico de notificações do usuário, paginado no banco' })
  history(
    @CurrentOrg() org: string,
    @CurrentUser() user: CurrentUserData,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('tipo') tipo?: string,
    @Query('unread') unread?: string,
  ) {
    return this.svc.history(org, user.sub, {
      page: Number(page) || 1,
      pageSize: Number(pageSize) || undefined,
      tipo: tipo || undefined,
      unread: unread === '1' || unread === 'true',
    })
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marca uma notificação como lida' })
  read(@Param('id') id: string, @CurrentOrg() org: string, @CurrentUser() user: CurrentUserData) {
    return this.svc.markRead(org, id, user.sub)
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marca todas como lidas' })
  readAll(@CurrentOrg() org: string, @CurrentUser() user: CurrentUserData) {
    return this.svc.markAllRead(org, user.sub)
  }

  @Post('run')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Executa o motor de datas/notificações e o import de índices na hora (admin). Com dryRun=1 calcula tudo e NÃO grava nada.' })
  run(@CurrentOrg() org: string, @Query('dryRun') dryRun?: string) {
    return this.scheduler.runNow(org, dryRun === '1' || dryRun === 'true')
  }

  @Get('email-config')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Configuração do servidor de e-mail (sem a senha) — admin' })
  emailConfig(@CurrentOrg() org: string) {
    return this.mailSettings.view(org)
  }

  @Put('email-config')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Grava a configuração do servidor de e-mail — admin' })
  async saveEmailConfig(@CurrentOrg() org: string, @Body() body: Partial<StoredMailConfig> & { password?: string }) {
    try {
      return await this.mailSettings.put(org, body)
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Não foi possível salvar a configuração.')
    }
  }

  @Delete('email-config')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Remove a configuração de e-mail da organização — admin' })
  clearEmailConfig(@CurrentOrg() org: string) {
    return this.mailSettings.clear(org)
  }

  @Post('email-verify')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Testa a conexão com o servidor (handshake + autenticação), sem enviar mensagem — admin' })
  emailVerify(@CurrentOrg() org: string) {
    return this.mailer.verify(org)
  }

  @Post('email-test')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Dispara um e-mail de teste para o próprio usuário — admin' })
  async emailTest(@CurrentOrg() org: string, @CurrentUser() user: CurrentUserData) {
    // manda para quem pediu — testar envio para terceiro seria porta para usar o
    // servidor como disparador de mensagem a endereço arbitrário
    if (!user.email) return { ok: false, error: 'Seu usuário não tem e-mail cadastrado.' }
    return this.mailer.sendTest(org, user.email)
  }

  @Get('email-recipients-check')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Usuários ativos cujo e-mail nunca seria entregue — admin' })
  recipientsCheck(@CurrentOrg() org: string) {
    return this.svc.destinatariosInvalidos(org)
  }

  @Post('email-digest')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Dispara agora as saídas diárias (resumo pessoal + alertas de contrato), sem esperar o horário — admin' })
  async emailDigest(@CurrentOrg() org: string) {
    // as duas saídas do relógio diário, para o teste manual provar o mesmo caminho
    // que a execução automática percorre — testar metade não prova nada
    const pessoas = await this.digest.enviar(org)
    const contratos = await this.contractAlerts.enviar(org)
    return { pessoas, contratos }
  }

  @Post('sweep-orfaos')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Varredura de anexos órfãos do storage (admin). graceHours=0 ignora a janela de graça (não recomendado com usuários ativos).' })
  sweepOrfaos(@Query('graceHours') graceHours?: string) {
    const g = graceHours != null && graceHours !== '' ? Math.max(0, Number(graceHours) || 0) : undefined
    return this.scheduler.sweepOrphans(g)
  }
}
