import { Module } from '@nestjs/common'
import { RoleAssignmentsService } from './role-assignments.service'
import { RoleAssignmentsController } from './role-assignments.controller'
import { PrismaService } from '../prisma.service'

@Module({
  controllers: [RoleAssignmentsController],
  providers: [RoleAssignmentsService, PrismaService],
  exports: [RoleAssignmentsService], // exportado para o motor de workflow resolver executores (Fase 3)
})
export class RoleAssignmentsModule {}
