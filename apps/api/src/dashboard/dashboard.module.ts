import { Module } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { DashboardController } from './dashboard.controller'
import { PrismaService } from '../prisma.service'
import { InstancesModule } from '../instances/instances.module'

@Module({
  /* O atraso de um processo é derivado do grafo compilado + calendário comercial.
     Reimplementar esse cálculo aqui criaria uma SEGUNDA definição de "atrasado" —
     e duas definições da mesma regra divergem, sempre. */
  imports: [InstancesModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService],
})
export class DashboardModule {}
