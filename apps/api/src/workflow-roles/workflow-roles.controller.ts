import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { WorkflowRolesService } from './workflow-roles.service'
import { CreateWorkflowRoleDto, UpdateWorkflowRoleDto } from './dto/workflow-role.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('workflow-roles')
@ApiBearerAuth()
@Controller('workflow-roles')
export class WorkflowRolesController {
  constructor(private readonly service: WorkflowRolesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os papéis (executores) da organização' })
  list(@CurrentOrg() organizationId: string) {
    return this.service.list(organizationId)
  }

  @Post()
  @ApiOperation({ summary: 'Cria um papel' })
  create(@Body() dto: CreateWorkflowRoleDto, @CurrentOrg() organizationId: string) {
    return this.service.create(organizationId, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um papel (nome/descrição/participantes)' })
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowRoleDto, @CurrentOrg() organizationId: string) {
    return this.service.update(organizationId, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove um papel' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.service.remove(organizationId, id)
  }
}
