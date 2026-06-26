import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { ModulesService } from './modules.service'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('modules')
@ApiBearerAuth()
@Controller('modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista módulos da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.modulesService.findAll(organizationId)
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Busca módulo pelo slug' })
  findBySlug(
    @Param('slug') slug: string,
    @CurrentOrg() organizationId: string,
  ) {
    return this.modulesService.findBySlug(organizationId, slug)
  }

  @Get(':slug/dashboard')
  @ApiOperation({ summary: 'Dashboard gerencial do módulo' })
  getDashboard(
    @Param('slug') slug: string,
    @CurrentOrg() organizationId: string,
  ) {
    return this.modulesService.getDashboard(organizationId, slug)
  }

  @Get(':slug/records')
  @ApiOperation({ summary: 'Lista registros do módulo' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'search', required: false })
  getRecords(
    @Param('slug') slug: string,
    @CurrentOrg() organizationId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
  ) {
    return this.modulesService.getRecords(
      organizationId,
      slug,
      parseInt(page),
      parseInt(pageSize),
      search,
    )
  }

  @Get(':slug/records/:recordId')
  @ApiOperation({ summary: 'Detalhe de um registro' })
  getRecord(
    @Param('slug') slug: string,
    @Param('recordId') recordId: string,
    @CurrentOrg() organizationId: string,
  ) {
    return this.modulesService.getRecord(organizationId, slug, recordId)
  }
}
