import { Controller, Post, Patch, Get, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { InstancesService } from './instances.service'
import { StartInstanceDto } from './dto/start-instance.dto'
import { AdvanceStepDto } from './dto/advance-step.dto'

@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Post()
  @ApiOperation({ summary: 'Inicia uma nova instância de processo' })
  start(@Body() dto: StartInstanceDto) {
    return this.instancesService.start(dto)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca instância com contexto da etapa atual' })
  getWithContext(@Param('id') id: string) {
    return this.instancesService.getInstanceWithContext(id)
  }

  @Patch(':id/advance')
  @ApiOperation({ summary: 'Avança a instância para a próxima etapa com os dados coletados' })
  advanceStep(@Param('id') id: string, @Body() dto: AdvanceStepDto) {
    return this.instancesService.advanceStep(id, dto)
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela uma instância em execução' })
  cancel(@Param('id') id: string) {
    return this.instancesService.cancel(id)
  }
}
