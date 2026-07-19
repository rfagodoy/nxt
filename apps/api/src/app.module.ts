import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
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
import { UsersModule } from './users/users.module'
import { NotificationsModule } from './notifications/notifications.module'
import { CatalogsModule } from './catalogs/catalogs.module'
import { ScreensModule } from './screens/screens.module'
import { CepModule } from './cep/cep.module'
import { CnpjModule } from './cnpj/cnpj.module'
import { WorkflowRolesModule } from './workflow-roles/workflow-roles.module'
import { RoleAssignmentsModule } from './role-assignments/role-assignments.module'

// Rede de segurança global contra abuso/força-bruta em toda a API. É intencionalmente
// generoso: o login já tem throttle por IP + lockout de conta; aqui o objetivo é só
// cortar rajadas anômalas. Como parte do tráfego chega pelo BFF (um IP só), o teto é
// alto por padrão. Ajustável por env (TTL em segundos, LIMIT em requisições).
const throttleTtl = Number(process.env.THROTTLE_TTL ?? 60)
const throttleLimit = Number(process.env.THROTTLE_LIMIT ?? 300)

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: throttleTtl * 1000, limit: throttleLimit }]),
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
    UsersModule,
    NotificationsModule,
    CatalogsModule,
    ScreensModule,
    CepModule,
    CnpjModule,
    WorkflowRolesModule,
    RoleAssignmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerGuard antes do JwtAuthGuard: o teto vale mesmo para rotas públicas
    // (login/refresh) e para requisições não autenticadas.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
