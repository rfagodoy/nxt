import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProcessesService } from './processes.service'
import { CreateProcessDto } from './dto/create-process.dto'
import { UpdateProcessDto } from './dto/update-process.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'
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
  create(@Body() dto: CreateProcessDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.processesService.create(dto, organizationId, { name: actor.name, sub: actor.sub })
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Versões guardadas da definição (para restaurar)' })
  versions(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.processesService.listVersions(id, organizationId)
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Auditoria da definição: quem alterou o desenho e quando' })
  audit(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.processesService.listAudit(id, organizationId)
  }

  @Post(':id/versions/:versionId/restore')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Repõe uma versão anterior da definição — admin' })
  restore(@Param('id') id: string, @Param('versionId') versionId: string, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.processesService.restoreVersion(id, versionId, organizationId, { name: actor.name, sub: actor.sub })
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Ativa processo e gera módulo dinâmico — admin' })
  activate(@Param('id') id: string, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.processesService.activate(id, organizationId, { name: actor.name, sub: actor.sub })
  }

  @Patch(':id/inactivate')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Inativa um workflow ativo (sai de "Novo processo") — admin' })
  inactivate(@Param('id') id: string, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.processesService.inactivate(id, organizationId, { name: actor.name, sub: actor.sub })
  }

  @Patch(':id/reactivate')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Reativa um workflow inativo — admin' })
  reactivate(@Param('id') id: string, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.processesService.reactivate(id, organizationId, { name: actor.name, sub: actor.sub })
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Edita um processo (diagrama/campos volta a Rascunho) — admin' })
  update(@Param('id') id: string, @Body() dto: UpdateProcessDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData) {
    return this.processesService.update(id, organizationId, dto, { name: actor.name, sub: actor.sub })
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Exclui um processo sem histórico, ou arquiva se houver instâncias — admin' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.processesService.remove(id, organizationId)
  }
}
