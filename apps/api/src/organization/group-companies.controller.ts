import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { GroupCompaniesService } from './group-companies.service'
import { CreateGroupCompanyDto } from './dto/create-group-company.dto'
import { UpdateGroupCompanyDto } from './dto/update-group-company.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('group-companies')
@ApiBearerAuth()
@Controller('group-companies')
export class GroupCompaniesController {
  constructor(private readonly service: GroupCompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma empresa do grupo' })
  create(@Body() dto: CreateGroupCompanyDto, @CurrentOrg() organizationId: string) {
    return this.service.create(dto, organizationId)
  }

  @Get()
  @ApiOperation({ summary: 'Lista empresas do grupo da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.service.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca empresa do grupo por ID' })
  findOne(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.service.findOne(id, organizationId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza empresa do grupo' })
  update(@Param('id') id: string, @Body() dto: UpdateGroupCompanyDto, @CurrentOrg() organizationId: string) {
    return this.service.update(id, dto, organizationId)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove empresa do grupo (e suas unidades)' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.service.remove(id, organizationId)
  }
}
