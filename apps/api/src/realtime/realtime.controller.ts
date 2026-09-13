import { Controller, Sse, type MessageEvent } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Observable } from 'rxjs'
import { CurrentOrg } from '../auth/current-org.decorator'
import { RealtimeService } from './realtime.service'

@ApiTags('realtime')
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /** Conexão aberta (Server-Sent Events) por onde a tela fica sabendo que algo mudou.
   *  Autenticada como qualquer rota: a organização vem do token, nunca do cliente. */
  @Sse('eventos')
  @ApiOperation({ summary: 'Fluxo de mudanças da organização (SSE)' })
  eventos(@CurrentOrg() organizationId: string): Observable<MessageEvent> {
    return this.realtime.fluxo(organizationId)
  }
}
