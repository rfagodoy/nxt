import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { PartnersService } from './partners.service'
import { CreatePartnerDto } from './dto/create-partner.dto'
import { UpdatePartnerDto } from './dto/update-partner.dto'
import { QueryPartnersDto } from './dto/query-partners.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo parceiro' })
  create(@Body() dto: CreatePartnerDto, @CurrentOrg() organizationId: string) {
    return this.partnersService.create(dto, organizationId)
  }

  @Post('query')
  @ApiOperation({ summary: 'Consulta parceiros com paginação server-side, filtros e ordenação' })
  query(@Body() dto: QueryPartnersDto, @CurrentOrg() organizationId: string) {
    return this.partnersService.query(dto, organizationId)
  }

  @Get()
  @ApiOperation({ summary: 'Lista parceiros da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.partnersService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca parceiro por ID' })
  findOne(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.partnersService.findOne(id, organizationId)
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Histórico de auditoria (alterações) do parceiro' })
  audit(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.partnersService.getAuditLogs(id, organizationId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza parceiro' })
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto, @CurrentOrg() organizationId: string) {
    return this.partnersService.update(id, dto, organizationId)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove parceiro' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.partnersService.remove(id, organizationId)
  }
}
