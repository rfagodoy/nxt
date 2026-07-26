import { Controller, Post, Patch, Get, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { InstancesService } from './instances.service'
import { StartInstanceDto } from './dto/start-instance.dto'
import { CompleteTaskDto } from './dto/complete-task.dto'
import { ReturnTaskDto } from './dto/return-task.dto'
import { AssignTaskDto } from './dto/assign-task.dto'
import { CancelInstanceDto } from './dto/cancel-instance.dto'
import { TransferTasksDto } from './dto/transfer-tasks.dto'
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

  // Monitoramento (visão gerencial) — admin. Filtra por status (ex.: ?status=ERROR).
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Lista instâncias da org para monitoramento (filtra por status) — admin' })
  list(@CurrentOrg() organizationId: string, @Query('status') status?: string) {
    return this.instancesService.listInstances(organizationId, { status })
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

  // Rota estática ANTES de `:id`. Gargalos/métricas por etapa — admin.
  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Métricas de gargalo: etapas mais lentas (tempo médio) — admin' })
  metrics(@CurrentOrg() organizationId: string) {
    return this.instancesService.stepMetrics(organizationId)
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

  // Rotas de DEVOLUÇÃO — ficam sob `tasks/`, antes da param `:id`, para não colidir.
  @Get('tasks/:taskId/return-targets')
  @ApiOperation({ summary: 'Etapas anteriores para onde a tarefa pode ser devolvida (inclui bloqueadas, com motivo)' })
  returnTargets(
    @Param('taskId') taskId: string,
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.instancesService.returnTargetsFor(taskId, organizationId, actor)
  }

  @Post('tasks/:taskId/return')
  @ApiOperation({ summary: 'Devolve o processo para uma etapa anterior (motivo obrigatório)' })
  returnTask(
    @Param('taskId') taskId: string,
    @Body() dto: ReturnTaskDto,
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.instancesService.returnTask(taskId, dto, organizationId, actor)
  }

  // Rotas estáticas de transferência em massa — antes de qualquer `:id`.
  @Get('transfer-preview')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Tarefas pendentes que seriam movidas de um usuário — admin' })
  transferPreview(@CurrentOrg() organizationId: string, @Query('fromUserId') fromUserId: string) {
    return this.instancesService.previewTransfer(organizationId, fromUserId)
  }

  @Post('transfer')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Transfere todas as tarefas pendentes de um usuário para outro (motivo obrigatório) — admin' })
  transfer(
    @Body() dto: TransferTasksDto,
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.instancesService.transferTasks(dto, organizationId, actor)
  }

  @Patch('tasks/:taskId/assign')
  @ApiOperation({ summary: 'Delega a tarefa a outro usuário (motivo obrigatório) — executor atual ou admin' })
  assignTask(
    @Param('taskId') taskId: string,
    @Body() dto: AssignTaskDto,
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.instancesService.assignTask(taskId, dto, organizationId, actor)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca instância com estado, grafo e tarefas pendentes' })
  getWithContext(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.instancesService.getInstanceWithContext(id, organizationId)
  }

  // Sem RolesGuard de propósito: quem INICIOU o processo também pode cancelá-lo —
  // a regra fica no service, que conhece o dono da instância.
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela uma instância em execução ou com erro, com motivo — admin ou quem iniciou' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelInstanceDto,
    @CurrentOrg() organizationId: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.instancesService.cancel(id, organizationId, dto, actor)
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
  @ApiOperation({ summary: 'Varre prazos das tarefas: avisa as que estão perto de vencer e escalona as vencidas (SLA) — admin' })
  async sweepOverdue(@CurrentOrg() organizationId: string) {
    const avisadas = await this.instancesService.sweepDueSoon(organizationId)
    const escalated = await this.instancesService.sweepOverdue(organizationId)
    const reavisadas = await this.instancesService.sweepOverdueReminders(organizationId)
    return { avisadas, escalated, reavisadas }
  }
}
