import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/jwt-auth.guard'
import { HealthController } from './health/health.controller'
import { ProcessesModule } from './processes/processes.module'
import { ModulesModule } from './modules/modules.module'
import { OrganizationsModule } from './organizations/organizations.module'
import { InstancesModule } from './instances/instances.module'
import { PartnersModule } from './partners/partners.module'
import { ContractsModule } from './contracts/contracts.module'
import { SettingsModule } from './settings/settings.module'
import { OrganizationModule } from './organization/organization.module'
import { FilesModule } from './files/files.module'
import { DashboardModule } from './dashboard/dashboard.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    OrganizationsModule,
    ProcessesModule,
    ModulesModule,
    InstancesModule,
    PartnersModule,
    ContractsModule,
    SettingsModule,
    OrganizationModule,
    FilesModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
