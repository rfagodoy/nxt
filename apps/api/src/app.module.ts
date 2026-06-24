import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ProcessesModule } from './processes/processes.module'
import { ModulesModule } from './modules/modules.module'
import { OrganizationsModule } from './organizations/organizations.module'
import { WebhooksModule } from './webhooks/webhooks.module'
import { InstancesModule } from './instances/instances.module'
import { PartnersModule } from './partners/partners.module'
import { ContractsModule } from './contracts/contracts.module'
import { SettingsModule } from './settings/settings.module'
import { OrganizationModule } from './organization/organization.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    OrganizationsModule,
    ProcessesModule,
    ModulesModule,
    InstancesModule,
    WebhooksModule,
    PartnersModule,
    ContractsModule,
    SettingsModule,
    OrganizationModule,
  ],
})
export class AppModule {}
