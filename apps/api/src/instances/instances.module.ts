import { Module } from '@nestjs/common'
import { InstancesService } from './instances.service'
import { InstancesController } from './instances.controller'
import { WorkflowSchedulerService } from './workflow-scheduler.service'
import { PrismaService } from '../prisma.service'
import { WorkflowRolesModule } from '../workflow-roles/workflow-roles.module'
import { ContractsModule } from '../contracts/contracts.module'
import { PartnersModule } from '../partners/partners.module'

@Module({
  imports: [WorkflowRolesModule, ContractsModule, PartnersModule],
  controllers: [InstancesController],
  providers: [InstancesService, WorkflowSchedulerService, PrismaService],
  exports: [InstancesService],
})
export class InstancesModule {}
