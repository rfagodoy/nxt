import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { GroupCompaniesService } from './group-companies.service'
import { GroupCompaniesController } from './group-companies.controller'
import { OrgUnitsService } from './org-units.service'
import { OrgUnitsController } from './org-units.controller'

@Module({
  controllers: [GroupCompaniesController, OrgUnitsController],
  providers:   [GroupCompaniesService, OrgUnitsService, PrismaService],
  exports:     [GroupCompaniesService, OrgUnitsService],
})
export class OrganizationModule {}
