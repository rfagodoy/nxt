import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { OrgUnitsService } from './org-units.service'
import { CreateOrgUnitDto } from './dto/create-org-unit.dto'
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('org-units')
@ApiBearerAuth()
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly service: OrgUnitsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma unidade organizacional' })
  create(@Body() dto: CreateOrgUnitDto, @CurrentOrg() organizationId: string) {
    return this.service.create(dto, organizationId)
  }

  @Get()
  @ApiOperation({
    summary:
      'Sem groupCompanyId: busca em toda a organização. Com groupCompanyId: busca/navega na empresa.',
  })
  @ApiQuery({ name: 'groupCompanyId', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentOrg() organizationId: string,
    @Query('groupCompanyId') groupCompanyId?: string,
    @Query('parentId') parentId?: string,
    @Query('search') search?: string,
  ) {
    // O tenant vem sempre do token. O modo é definido pela presença de groupCompanyId:
    // sem empresa => busca org-wide; com empresa => busca/navegação dentro dela.
    if (!groupCompanyId) return this.service.searchForOrg(organizationId, search ?? '')
    if (search && search.trim()) return this.service.search(groupCompanyId, search.trim(), organizationId)
    return this.service.findChildren(groupCompanyId, parentId, organizationId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza unidade organizacional' })
  update(@Param('id') id: string, @Body() dto: UpdateOrgUnitDto, @CurrentOrg() organizationId: string) {
    return this.service.update(id, dto, organizationId)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove unidade organizacional (e suas filhas)' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.service.remove(id, organizationId)
  }
}
