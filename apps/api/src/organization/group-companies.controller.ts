import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { GroupCompaniesService } from './group-companies.service'
import { CreateGroupCompanyDto } from './dto/create-group-company.dto'
import { UpdateGroupCompanyDto } from './dto/update-group-company.dto'

@ApiTags('group-companies')
@Controller('group-companies')
export class GroupCompaniesController {
  constructor(private readonly service: GroupCompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma empresa do grupo' })
  create(@Body() dto: CreateGroupCompanyDto) {
    return this.service.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Lista empresas do grupo da organização' })
  @ApiQuery({ name: 'organizationId', required: true })
  findAll(@Query('organizationId') organizationId: string) {
    return this.service.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca empresa do grupo por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza empresa do grupo' })
  update(@Param('id') id: string, @Body() dto: UpdateGroupCompanyDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove empresa do grupo (e suas unidades)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
