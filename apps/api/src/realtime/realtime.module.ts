import { Global, Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { RealtimeController } from './realtime.controller'
import { RealtimeService } from './realtime.service'
import { TravaService } from './trava.service'

/** Coordenação entre instâncias da API: avisos de tempo real e trava das rotinas
 *  automáticas, os dois pelo banco. Global: agendadores e serviços de qualquer módulo
 *  usam sem importar nada. */
@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService, TravaService, PrismaService],
  exports: [RealtimeService, TravaService],
})
export class RealtimeModule {}
