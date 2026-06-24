import { Controller, Get, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { OrganizationsService } from './organizations.service'

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.organizationsService.findBySlug(slug)
  }
}
