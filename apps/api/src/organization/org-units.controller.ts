import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { OrgUnitsService } from './org-units.service'
import { CreateOrgUnitDto } from './dto/create-org-unit.dto'
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto'

@ApiTags('org-units')
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly service: OrgUnitsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma unidade organizacional' })
  create(@Body() dto: CreateOrgUnitDto) {
    return this.service.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Filhos de um nó, busca na empresa, ou busca na organização' })
  @ApiQuery({ name: 'groupCompanyId', required: false })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('groupCompanyId') groupCompanyId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('parentId') parentId?: string,
    @Query('search') search?: string,
  ) {
    if (organizationId) return this.service.searchForOrg(organizationId, search ?? '')
    if (search && search.trim()) return this.service.search(groupCompanyId ?? '', search.trim())
    return this.service.findChildren(groupCompanyId ?? '', parentId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza unidade organizacional' })
  update(@Param('id') id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove unidade organizacional (e suas filhas)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
