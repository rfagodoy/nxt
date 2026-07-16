import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { ScreensService } from './screens.service'
import { SaveScreenDto, PutValuesDto, BatchValuesDto } from './dto/screen.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('screens')
@ApiBearerAuth()
@Controller()
export class ScreensController {
  constructor(private readonly service: ScreensService) {}

  /* ─── definições ─── */

  @Get('screens')
  @ApiOperation({ summary: 'Lista as Telas (catálogo), opcionalmente por subjectType' })
  @ApiQuery({ name: 'subjectType', required: false })
  list(@CurrentOrg() org: string, @Query('subjectType') subjectType?: string) {
    return this.service.listScreens(org, subjectType)
  }

  @Get('screens/:id')
  @ApiOperation({ summary: 'Lê uma Tela com seções e campos' })
  get(@CurrentOrg() org: string, @Param('id') id: string) {
    return this.service.getScreen(org, id)
  }

  @Post('screens')
  @ApiOperation({ summary: 'Cria uma Tela' })
  create(@CurrentOrg() org: string, @Body() dto: SaveScreenDto) {
    return this.service.create(org, dto)
  }

  @Put('screens/:id')
  @ApiOperation({ summary: 'Atualiza a Tela (definição completa; upsert por id)' })
  update(@CurrentOrg() org: string, @Param('id') id: string, @Body() dto: SaveScreenDto) {
    return this.service.update(org, id, dto)
  }

  @Delete('screens/:id')
  @ApiOperation({ summary: 'Remove a Tela (valores preenchidos permanecem)' })
  remove(@CurrentOrg() org: string, @Param('id') id: string) {
    return this.service.remove(org, id)
  }

  /* ─── valores preenchidos ─── */

  @Get('screen-values')
  @ApiOperation({ summary: 'Valores preenchidos de um subject (parceiro/contrato/instância)' })
  @ApiQuery({ name: 'subjectType', required: true })
  @ApiQuery({ name: 'subjectId', required: true })
  getValues(
    @CurrentOrg() org: string,
    @Query('subjectType') subjectType: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.service.getValues(org, subjectType, subjectId)
  }

  @Put('screen-values')
  @ApiOperation({ summary: 'Grava (upsert) os valores preenchidos de um subject' })
  putValues(@CurrentOrg() org: string, @Body() dto: PutValuesDto) {
    return this.service.putValues(org, dto.subjectType, dto.subjectId, dto.values)
  }

  @Post('screen-values/batch')
  @ApiOperation({ summary: 'Valores preenchidos de vários subjects (listagem/exportação)' })
  getValuesBatch(@CurrentOrg() org: string, @Body() dto: BatchValuesDto) {
    return this.service.getValuesBatch(org, dto.subjectType, dto.subjectIds)
  }
}
