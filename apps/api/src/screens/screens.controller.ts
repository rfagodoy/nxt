import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { ScreensService } from './screens.service'
import { SaveScreenDto, PutValuesDto, BatchValuesDto } from './dto/screen.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'

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
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@CurrentOrg() org: string, @Body() dto: SaveScreenDto) {
    return this.service.create(org, dto)
  }

  @Put('screens/:id')
  @ApiOperation({ summary: 'Atualiza a Tela (definição completa; upsert por id)' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@CurrentOrg() org: string, @Param('id') id: string, @Body() dto: SaveScreenDto) {
    return this.service.update(org, id, dto)
  }

  @Post('screens/:id/duplicate')
  @ApiOperation({ summary: 'Duplica a Tela (rascunho; campos do tipo são referenciados, não recriados)' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  duplicate(@CurrentOrg() org: string, @Param('id') id: string, @Body() body?: { name?: string }) {
    return this.service.duplicate(org, id, body?.name)
  }

  @Delete('screens/:id')
  @ApiOperation({ summary: 'Remove a Tela (valores preenchidos permanecem)' })
  @UseGuards(RolesGuard)
  @Roles('admin')
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
  putValues(@CurrentOrg() org: string, @Body() dto: PutValuesDto, @CurrentUser() user: CurrentUserData) {
    /* O autor vem do TOKEN, nunca do corpo: é ele que assina o histórico, e cliente
       não pode escolher em nome de quem grava. */
    return this.service.putValues(org, dto.subjectType, dto.subjectId, dto.values, {
      nome: user.name ?? user.email ?? 'Usuário do sistema',
      id: user.sub,
    })
  }

  @Post('screen-values/batch')
  @ApiOperation({ summary: 'Valores preenchidos de vários subjects (listagem/exportação)' })
  getValuesBatch(@CurrentOrg() org: string, @Body() dto: BatchValuesDto) {
    return this.service.getValuesBatch(org, dto.subjectType, dto.subjectIds)
  }
}
