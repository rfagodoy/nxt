import { Controller, Post, Patch, Get, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { InstancesService } from './instances.service'
import { StartInstanceDto } from './dto/start-instance.dto'
import { CompleteTaskDto } from './dto/complete-task.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, type CurrentUserData } from '../auth/current-user.decorator'

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
  @ApiOperation({ summary: 'Cancela uma instância em execução' })
  cancel(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.instancesService.cancel(id, organizationId)
  }

  @Post('sweep-overdue')
  @ApiOperation({ summary: 'Varre e escalona tarefas vencidas da organização (SLA)' })
  async sweepOverdue(@CurrentOrg() organizationId: string) {
    const escalated = await this.instancesService.sweepOverdue(organizationId)
    return { escalated }
  }
}
