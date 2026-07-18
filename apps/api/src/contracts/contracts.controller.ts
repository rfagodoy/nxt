import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ContractsService } from './contracts.service'
import { CreateContractDto } from './dto/create-contract.dto'
import { UpdateContractDto } from './dto/update-contract.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo contrato' })
  create(@Body() dto: CreateContractDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.contractsService.create(dto, organizationId, actor.name, actor.sub)
  }

  @Get()
  @ApiOperation({ summary: 'Lista contratos da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.contractsService.findAll(organizationId)
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
  update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.contractsService.update(id, dto, organizationId, actor.name, actor.sub)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove contrato' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.contractsService.remove(id, organizationId)
  }
}
