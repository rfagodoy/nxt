import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { CatalogsService } from './catalogs.service'

@ApiTags('catalogs')
@ApiBearerAuth()
@Controller()
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  @Get('cnae')
  @ApiOperation({ summary: 'Busca CNAE por código ou descrição' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  cnae(@Query('search') search?: string, @Query('limit') limit?: string) {
    return this.service.searchCnae(search ?? '', Number(limit) || 30)
  }

  @Get('cnae/by-codes')
  @ApiOperation({ summary: 'Resolve descrição de CNAEs por lista de códigos' })
  @ApiQuery({ name: 'codes', required: false, description: 'Códigos separados por vírgula' })
  cnaeByCodes(@Query('codes') codes?: string) {
    return this.service.cnaeByCodes((codes ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  }

  @Get('natureza-juridica')
  @ApiOperation({ summary: 'Lista as naturezas jurídicas obrigadas ao QSA' })
  naturezas() {
    return this.service.naturezas()
  }
}
