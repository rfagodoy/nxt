import { Module } from '@nestjs/common'
import { WorkflowRolesService } from './workflow-roles.service'
import { WorkflowRolesController } from './workflow-roles.controller'
import { PrismaService } from '../prisma.service'

@Module({
  controllers: [WorkflowRolesController],
  providers: [WorkflowRolesService, PrismaService],
  exports: [WorkflowRolesService],
})
export class WorkflowRolesModule {}
