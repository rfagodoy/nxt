import { Injectable, type MessageEvent } from '@nestjs/common'
import { Subject, filter, interval, map, merge, type Observable } from 'rxjs'
import { pertenceA, TODAS_AS_ORGANIZACOES, type Mudanca } from './topicos'

/* Pulso a cada 25s. Não é enfeite: o fetch do Node (usado pelo BFF) derruba resposta
   parada há 5 minutos, e proxies no caminho costumam cortar antes. Sem pulso, uma tela
   parada perderia a conexão justamente na hora de sossego — quando o motor de datas roda. */
const PULSO_MS = 25_000

/** Barramento de mudanças em memória. A implantação é uma instância só (VM on-premise);
 *  se um dia houver várias, esta é a peça a trocar por um pub/sub. */
@Injectable()
export class RealtimeService {
  private readonly mudancas = new Subject<Mudanca>()

  emitir(organizationId: string, topicos: string[]): void {
    if (!organizationId || topicos.length === 0) return
    this.mudancas.next({ organizationId, topicos, em: new Date().toISOString() })
  }

  emitirParaTodas(topicos: string[]): void {
    this.emitir(TODAS_AS_ORGANIZACOES, topicos)
  }

  /** Fluxo SSE de UMA organização: só as mudanças dela (e as globais) + o pulso. */
  fluxo(organizationId: string, pulsoMs = PULSO_MS): Observable<MessageEvent> {
    const eventos = this.mudancas.pipe(
      filter(m => pertenceA(m, organizationId)),
      map((m): MessageEvent => ({ type: 'mudanca', data: { topicos: m.topicos, em: m.em } })),
    )
    const pulso = interval(pulsoMs).pipe(map((): MessageEvent => ({ type: 'pulso', data: {} })))
    return merge(eventos, pulso)
  }
}
