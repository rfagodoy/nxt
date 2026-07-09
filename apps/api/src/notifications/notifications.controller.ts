import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { NotificationsService } from './notifications.service'
import { ContractSchedulerService } from './contract-scheduler.service'
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
  ) {}

  @Get()
  @ApiOperation({ summary: 'Notificações ativas (com status de leitura do usuário)' })
  list(@CurrentOrg() org: string, @CurrentUser() user: CurrentUserData) {
    return this.svc.list(org, user.sub)
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
  @ApiOperation({ summary: 'Executa o motor de datas/notificações e o import de índices na hora (admin)' })
  run(@CurrentOrg() org: string) {
    return this.scheduler.runNow(org)
  }
}
