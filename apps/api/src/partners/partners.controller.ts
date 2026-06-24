import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { PartnersService } from './partners.service'
import { CreatePartnerDto } from './dto/create-partner.dto'
import { UpdatePartnerDto } from './dto/update-partner.dto'
import { QueryPartnersDto } from './dto/query-partners.dto'

@ApiTags('partners')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo parceiro' })
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.create(dto)
  }

  @Post('query')
  @ApiOperation({ summary: 'Consulta parceiros com paginação server-side, filtros e ordenação' })
  query(@Body() dto: QueryPartnersDto) {
    return this.partnersService.query(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Lista parceiros da organização' })
  @ApiQuery({ name: 'organizationId', required: true })
  findAll(@Query('organizationId') organizationId: string) {
    return this.partnersService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca parceiro por ID' })
  findOne(@Param('id') id: string) {
    return this.partnersService.findOne(id)
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Histórico de auditoria (alterações) do parceiro' })
  audit(@Param('id') id: string) {
    return this.partnersService.getAuditLogs(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza parceiro' })
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove parceiro' })
  remove(@Param('id') id: string) {
    return this.partnersService.remove(id)
  }
}
