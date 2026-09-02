import { Module } from '@nestjs/common'
import { ProcessesService } from './processes.service'
import { ProcessesController } from './processes.controller'
import { PrismaService } from '../prisma.service'
import { RoleAssignmentsModule } from '../role-assignments/role-assignments.module'

@Module({
  imports: [RoleAssignmentsModule], // prévia de início resolve papel+entidade → pessoas
  controllers: [ProcessesController],
  providers: [ProcessesService, PrismaService],
  exports: [ProcessesService],
})
export class ProcessesModule {}
