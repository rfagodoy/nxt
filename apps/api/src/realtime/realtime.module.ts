import { Global, Module } from '@nestjs/common'
import { RealtimeController } from './realtime.controller'
import { RealtimeService } from './realtime.service'

/** Global: agendadores e serviços de qualquer módulo podem avisar sem importar nada. */
@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
