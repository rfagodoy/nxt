import { Controller, Get, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentOrg } from '../auth/current-org.decorator'
import { OrganizationsService } from './organizations.service'

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // O slug precisa ser o da PRÓPRIA organização do token — impede um usuário
  // de ler os dados de outra org (IDOR cross-tenant) informando um slug alheio.
  @Get(':slug')
  findBySlug(@Param('slug') slug: string, @CurrentOrg() organizationId: string) {
    return this.organizationsService.findBySlug(slug, organizationId)
  }
}
