import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { ContractSchedulerService } from './contract-scheduler.service'
import { WorkflowNotifierService } from './workflow-notifier.service'
import { SettingsModule } from '../settings/settings.module'
import { ContractsModule } from '../contracts/contracts.module'
import { FilesModule } from '../files/files.module'
import { PrismaService } from '../prisma.service'

@Module({
  imports: [SettingsModule, ContractsModule, FilesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, ContractSchedulerService, WorkflowNotifierService, PrismaService],
  // o motor de workflow (InstancesModule) emite avisos por aqui
  exports: [WorkflowNotifierService],
})
export class NotificationsModule {}
