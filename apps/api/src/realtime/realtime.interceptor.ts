import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { tap, type Observable } from 'rxjs'
import { RealtimeService } from './realtime.service'
import { topicosDaRota } from './topicos'

const ORG_CLAIM = process.env.OIDC_ORG_CLAIM || 'org_id'

/** Depois de toda gravação que DEU CERTO, avisa a organização. Um lugar só, em vez de
 *  lembrar de emitir em cada serviço — o serviço novo de amanhã já nasce avisando.
 *  Erro não avisa: nada mudou. */
@Injectable()
export class RealtimeInterceptor implements NestInterceptor {
  constructor(private readonly realtime: RealtimeService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle()
    const req = ctx.switchToHttp().getRequest<{ method: string; originalUrl?: string; url: string; user?: Record<string, unknown> }>()
    const topicos = topicosDaRota(req.method, req.originalUrl ?? req.url)
    const org = req.user?.[ORG_CLAIM]
    if (topicos.length === 0 || typeof org !== 'string' || !org) return next.handle()
    return next.handle().pipe(tap({ complete: () => this.realtime.emitir(org, topicos) }))
  }
}
