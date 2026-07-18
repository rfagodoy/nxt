import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProcessesService } from './processes.service'
import { CreateProcessDto } from './dto/create-process.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

@ApiTags('processes')
@ApiBearerAuth()
@Controller('processes')
export class ProcessesController {
  constructor(private readonly processesService: ProcessesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista processos da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.processesService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca processo por ID' })
  findOne(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.processesService.findOne(id, organizationId)
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Cria novo processo — admin' })
  create(@Body() dto: CreateProcessDto, @CurrentOrg() organizationId: string) {
    return this.processesService.create(dto, organizationId)
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Ativa processo e gera módulo dinâmico — admin' })
  activate(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.processesService.activate(id, organizationId)
  }
}
