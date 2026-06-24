import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ProcessesService } from './processes.service'
import { CreateProcessDto } from './dto/create-process.dto'

@ApiTags('processes')
@Controller('processes')
export class ProcessesController {
  constructor(private readonly processesService: ProcessesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista processos da organização' })
  findAll(@Query('organizationId') organizationId: string) {
    return this.processesService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca processo por ID' })
  findOne(@Param('id') id: string, @Query('organizationId') organizationId: string) {
    return this.processesService.findOne(id, organizationId)
  }

  @Post()
  @ApiOperation({ summary: 'Cria novo processo' })
  create(@Body() dto: CreateProcessDto) {
    return this.processesService.create(dto)
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Ativa processo e gera módulo dinâmico' })
  activate(@Param('id') id: string, @Query('organizationId') organizationId: string) {
    return this.processesService.activate(id, organizationId)
  }
}
