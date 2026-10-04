import { Module } from '@nestjs/common'
import { ScreensController } from './screens.controller'
import { ScreensService } from './screens.service'
import { PrismaService } from '../prisma.service'
import { ConferenciaTelaService } from './conferencia-tela.service'
import { WorkflowRolesModule } from '../workflow-roles/workflow-roles.module'
import { RoleAssignmentsModule } from '../role-assignments/role-assignments.module'

/* ConferenciaTelaService: as Telas valendo na API — Parceiros e Contratos conferem cada
   gravação por ela (travas + obrigatórios), por isso o módulo a exporta. */
@Module({
  imports: [WorkflowRolesModule, RoleAssignmentsModule],
  controllers: [ScreensController],
  providers: [ScreensService, ConferenciaTelaService, PrismaService],
  exports: [ScreensService, ConferenciaTelaService],
})
export class ScreensModule {}
