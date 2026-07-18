import { Controller, Post, Patch, Get, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { InstancesService } from './instances.service'
import { StartInstanceDto } from './dto/start-instance.dto'
import { CompleteTaskDto } from './dto/complete-task.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, type CurrentUserData } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

@ApiTags('instances')
@ApiBearerAuth()
@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Post()
  @ApiOperation({ summary: 'Inicia uma nova instância de processo' })
  start(@Body() dto: StartInstanceDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.instancesService.start(dto, organizationId, actor)
  }

  // Rota estática ANTES da param `:id` para não colidir com ela.
  @Get('tasks')
  @ApiOperation({ summary: 'Caixa de tarefas: minhas tarefas (padrão) ou todas (mine=false)' })
  listTasks(
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    return this.instancesService.listTasks(organizationId, {
      status: status || 'PENDING',
      mine: mine !== 'false',
      actor,
    })
  }

  @Patch('tasks/:taskId/complete')
  @ApiOperation({ summary: 'Conclui uma tarefa (userTask) e avança o motor' })
  completeTask(
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTaskDto,
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.instancesService.completeTask(taskId, dto, organizationId, actor)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca instância com estado, grafo e tarefas pendentes' })
  getWithContext(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.instancesService.getInstanceWithContext(id, organizationId)
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Cancela uma instância em execução ou com erro — admin' })
  cancel(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.instancesService.cancel(id, organizationId)
  }

  @Post(':id/retry')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Reprocessa a etapa automática que falhou (instância em ERRO) — admin' })
  retry(@Param('id') id: string, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.instancesService.retry(id, organizationId, actor)
  }

  @Post('sweep-overdue')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Varre e escalona tarefas vencidas da organização (SLA) — admin' })
  async sweepOverdue(@CurrentOrg() organizationId: string) {
    const escalated = await this.instancesService.sweepOverdue(organizationId)
    return { escalated }
  }
}
