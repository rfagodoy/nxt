import { Body, Controller, Get, Put, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { RoleAssignmentsService } from './role-assignments.service'
import { SetAssignmentsDto } from './dto/set-assignments.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

// Responsáveis (papel de PESSOA → usuário) por entidade. Liberado a qualquer
// autenticado (como contratos/parceiros) — quem edita o cadastro gerencia a lista.
@ApiTags('role-assignments')
@ApiBearerAuth()
@Controller('role-assignments')
export class RoleAssignmentsController {
  constructor(private readonly svc: RoleAssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Responsáveis de uma entidade (entityId ausente = ORG/global)' })
  list(
    @CurrentOrg() organizationId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.svc.listByEntity(organizationId, entityType, entityId || undefined)
  }

  @Put()
  @ApiOperation({ summary: 'Substitui em bloco os responsáveis de uma entidade' })
  set(@CurrentOrg() organizationId: string, @Body() dto: SetAssignmentsDto) {
    return this.svc.setForEntity(organizationId, dto.entityType, dto.entityId, dto.items)
  }
}
