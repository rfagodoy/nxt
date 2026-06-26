import { Controller, Post, Patch, Get, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { InstancesService } from './instances.service'
import { StartInstanceDto } from './dto/start-instance.dto'
import { AdvanceStepDto } from './dto/advance-step.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('instances')
@ApiBearerAuth()
@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Post()
  @ApiOperation({ summary: 'Inicia uma nova instância de processo' })
  start(@Body() dto: StartInstanceDto, @CurrentOrg() organizationId: string) {
    return this.instancesService.start(dto, organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca instância com contexto da etapa atual' })
  getWithContext(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.instancesService.getInstanceWithContext(id, organizationId)
  }

  @Patch(':id/advance')
  @ApiOperation({ summary: 'Avança a instância para a próxima etapa com os dados coletados' })
  advanceStep(@Param('id') id: string, @Body() dto: AdvanceStepDto, @CurrentOrg() organizationId: string) {
    return this.instancesService.advanceStep(id, dto, organizationId)
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela uma instância em execução' })
  cancel(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.instancesService.cancel(id, organizationId)
  }
}
