import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { ScreensService } from './screens.service'
import { SaveScreenDto, PutValuesDto, BatchValuesDto } from './dto/screen.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'
import { ConferenciaTelaService, type SujeitoTela } from './conferencia-tela.service'

@ApiTags('screens')
@ApiBearerAuth()
@Controller()
export class ScreensController {
  constructor(
    private readonly service: ScreensService,
    private readonly conferencia: ConferenciaTelaService,
  ) {}

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
  async putValues(@CurrentOrg() org: string, @Body() dto: PutValuesDto, @CurrentUser() user: CurrentUserData, @Headers() headers: Record<string, unknown>) {
    /* Por aqui também valem as travas da tela (a mesma conferência da gravação do
       registro) — senão este seria o atalho para alterar o personalizado travado. E o
       registro tem de existir NESTA organização: antes, qualquer id era aceito. */
    const subject: SujeitoTela | null = dto.subjectType === 'CONTRACT' ? 'CONTRATO' : dto.subjectType === 'PARTNER' ? 'FORNECEDOR' : null
    if (subject) {
      const antes = await this.conferencia.registro(org, subject, dto.subjectId)
      await this.conferencia.conferir({
        organizationId: org, subject, actor: user, origem: ConferenciaTelaService.origemDe(headers),
        entidadeId: dto.subjectId, antes, depois: {}, soPersonalizados: true,
        customDepois: Object.fromEntries(dto.values.map(v => [v.fieldId, v.value])),
      })
    }
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
