import { Injectable, Logger, type MessageEvent, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { Subject, filter, interval, map, merge, type Observable } from 'rxjs'
import { PrismaService } from '../prisma.service'
import { pertenceA, TODAS_AS_ORGANIZACOES, type Mudanca } from './topicos'

/* Pulso a cada 25s. Não é enfeite: o fetch do Node (usado pelo BFF) derruba resposta
   parada há 5 minutos, e proxies no caminho costumam cortar antes. */
const PULSO_MS = 25_000

/* Barramento ENTRE INSTÂNCIAS, pelo banco.
 *
 * Toda mudança vira uma linha em `realtime_events`; cada instância lê as linhas novas
 * a cada segundo e entrega aos navegadores conectados NELA. Quem grava também recebe o
 * próprio aviso pela leitura — um caminho só, sem dois jeitos de entregar que divergem.
 *
 * Por que reler uma JANELA (e não "id maior que o último"): com duas instâncias
 * gravando juntas, o id 101 pode ser confirmado depois do 102. Quem já tivesse lido o
 * 102 nunca veria o 101. Relendo os últimos segundos e ignorando o que já foi visto,
 * a ordem de confirmação deixa de importar. A janela também absorve diferença pequena
 * entre os relógios dos servidores. */
const LEITURA_MS  = 1_000
const JANELA_MS   = 10_000
const RETENCAO_MS = 10 * 60_000
const LIMPEZA_MS  = 5 * 60_000

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Realtime')
  private readonly mudancas = new Subject<Mudanca>()
  /** id do evento → quando foi visto; impede entregar duas vezes o que a janela relê */
  private readonly vistos = new Map<string, number>()
  private preparado = false
  private lendo = false
  private timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timers.push(setInterval(() => void this.ler(), LEITURA_MS))
    this.timers.push(setInterval(() => void this.limpar(), LIMPEZA_MS))
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval)
    this.timers = []
  }

  /** Registra a mudança para TODAS as instâncias. Falhar aqui não pode derrubar a
   *  gravação que a originou: o dado já foi salvo; no pior caso a tela atualiza depois. */
  async emitir(organizationId: string, topicos: string[]): Promise<void> {
    if (!organizationId || topicos.length === 0) return
    try {
      /* `em` vem da aplicação, não do default do banco: o CURRENT_TIMESTAMP do SQL
         Server segue o fuso do servidor do cliente, e a janela de leitura compara em UTC. */
      await this.prisma.realtimeEvent.create({ data: { organizationId, topicos: topicos.join(','), em: new Date() } })
    } catch (e) {
      this.logger.warn(`aviso de tempo real não gravado: ${String(e)}`)
    }
  }

  emitirParaTodas(topicos: string[]): Promise<void> {
    return this.emitir(TODAS_AS_ORGANIZACOES, topicos)
  }

  /** Lê o que chegou de qualquer instância e entrega aos fluxos abertos nesta. */
  async ler(): Promise<void> {
    if (this.lendo) return
    this.lendo = true
    try {
      const agora = Date.now()
      const recentes = await this.prisma.realtimeEvent.findMany({
        where: { em: { gte: new Date(agora - JANELA_MS) } },
        orderBy: { id: 'asc' },
        take: 1000,
      })
      for (const e of recentes) {
        const id = String(e.id)
        if (this.vistos.has(id)) continue
        this.vistos.set(id, agora)
        /* A primeira leitura só marca o que já existia: a instância acabou de subir e
           ninguém conectado nela precisa do que aconteceu antes. */
        if (this.preparado) {
          this.mudancas.next({ organizationId: e.organizationId, topicos: e.topicos.split(',').filter(Boolean), em: e.em.toISOString() })
        }
      }
      this.preparado = true
      for (const [id, visto] of this.vistos) if (agora - visto > JANELA_MS * 3) this.vistos.delete(id)
    } catch (e) {
      this.logger.warn(`leitura dos avisos de tempo real falhou: ${String(e)}`)
    } finally {
      this.lendo = false
    }
  }

  /** Aviso só serve enquanto é novidade: apaga os antigos para a tabela não crescer. */
  async limpar(): Promise<void> {
    try {
      await this.prisma.realtimeEvent.deleteMany({ where: { em: { lt: new Date(Date.now() - RETENCAO_MS) } } })
    } catch (e) {
      this.logger.warn(`limpeza dos avisos de tempo real falhou: ${String(e)}`)
    }
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
