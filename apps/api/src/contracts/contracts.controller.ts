import { Controller, Get, Post, Patch, Delete, Param, Body, Headers, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ContractsService } from './contracts.service'
import { CreateContractDto } from './dto/create-contract.dto'
import { UpdateContractDto } from './dto/update-contract.dto'
import { QueryContractsDto } from './dto/query-contracts.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'
import { ConferenciaTelaService } from '../screens/conferencia-tela.service'
import { ScreensService } from '../screens/screens.service'

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly conferencia: ConferenciaTelaService,
    private readonly screens: ScreensService,
  ) {}

  /* As Telas valem AQUI, no pedido da tela — antes de gravar qualquer coisa, a gravação
     (registro + personalizados que vêm junto) é conferida contra a tela que vale: a padrão,
     ou a da aba da tarefa (cabeçalhos x-nxt-tarefa/x-nxt-tela). Travas e obrigatórios são
     os do @nxt/screens-core, os mesmos da tela. Importação, rotina automática e conectores
     do workflow chamam o service direto e não passam por aqui. */
  private async gravarPersonalizados(organizationId: string, id: string, valores: Record<string, string> | undefined, actor: CurrentUserData) {
    if (!valores) return
    await this.screens.putValues(organizationId, 'CONTRACT', id,
      Object.entries(valores).map(([fieldId, value]) => ({ fieldId, value: value == null ? '' : String(value) })),
      { nome: actor.name, id: actor.sub })
  }

  @Post()
  @ApiOperation({ summary: 'Cria um novo contrato' })
  async create(@Body() dto: CreateContractDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData, @Headers() headers: Record<string, unknown>) {
    const { valoresPersonalizados, ...dados } = dto
    await this.conferencia.conferir({
      organizationId, subject: 'CONTRATO', actor, origem: ConferenciaTelaService.origemDe(headers),
      entidadeId: null, antes: null, depois: dados, customDepois: valoresPersonalizados,
    })
    const criado = await this.contractsService.create(dados, organizationId, actor.name, actor.sub)
    await this.gravarPersonalizados(organizationId, criado.id, valoresPersonalizados, actor)
    return criado
  }

  @Get()
  @ApiOperation({ summary: 'Lista contratos da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.contractsService.findAll(organizationId)
  }

  /* Rota literal ANTES de ':id' para não ser capturada como um id. */
  @Post('query')
  @ApiOperation({ summary: 'Consulta paginada da listagem (busca/filtros/ordenação server-side)' })
  query(@Body() dto: QueryContractsDto, @CurrentOrg() organizationId: string) {
    return this.contractsService.query(dto, organizationId)
  }

  /* Import de valores mensais de índice do Banco Central (série SGS). Rota literal ANTES
     de ':id' para não ser capturada como um id. Opcional (Fase 3): só quando há internet. */
  @Get('indices/bcb')
  @ApiOperation({ summary: 'Importa a série mensal de um índice do Banco Central (SGS)' })
  importBcb(@Query('code') code: string, @Query('from') from?: string, @Query('to') to?: string, @Query('full') full?: string) {
    return this.contractsService.importBcb(code, from, to, full === '1' || full === 'true')
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca contrato por ID' })
  findOne(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.contractsService.findOne(id, organizationId)
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Histórico de auditoria (alterações) do contrato' })
  audit(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.contractsService.getAuditLogs(id, organizationId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza contrato' })
  async update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData, @Headers() headers: Record<string, unknown>) {
    const { valoresPersonalizados, ...dados } = dto
    const antes = await this.conferencia.registro(organizationId, 'CONTRATO', id)
    await this.conferencia.conferir({
      organizationId, subject: 'CONTRATO', actor, origem: ConferenciaTelaService.origemDe(headers),
      entidadeId: id, antes, depois: dados, customDepois: valoresPersonalizados,
    })
    const salvo = await this.contractsService.update(id, dados, organizationId, actor.name, actor.sub)
    await this.gravarPersonalizados(organizationId, id, valoresPersonalizados, actor)
    return salvo
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove contrato' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.contractsService.remove(id, organizationId)
  }
}
