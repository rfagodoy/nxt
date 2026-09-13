import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { InstancesService } from './instances.service'
import { NotificationsService } from '../notifications/notifications.service'
import { RealtimeService } from '../realtime/realtime.service'
import { TravaService } from '../realtime/trava.service'

/* Travas que ficam até expirar (não são liberadas): viram "no máximo uma vez por janela"
   somando TODAS as instâncias. Um pouco menores que o ciclo, para a próxima rodada da
   mesma instância não esbarrar na trava que ela mesma deixou. */
const JANELA_VARREDURA_MS = 4.5 * 60_000
const JANELA_EXPURGO_MS   = 23 * 60 * 60_000

/** Varredura periódica de prazos (SLA) das tarefas de workflow: avisa quem está
 *  perto de estourar o prazo e marca/avisa as que já venceram. Roda uma vez no
 *  boot (após 25s) e a cada 5 minutos. Espelha o padrão do ContractSchedulerService. */
@Injectable()
export class WorkflowSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('WorkflowScheduler')
  private running = false

  constructor(
    private readonly instances: InstancesService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly trava: TravaService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.sweep(), 25_000)
    setInterval(() => void this.sweep(), 5 * 60_000)
    // expurgo do histórico: caro e sem pressa — uma vez por dia, longe do boot.
    setTimeout(() => void this.purge(), 3 * 60_000)
    setInterval(() => void this.purge(), 24 * 60 * 60_000)
  }

  private async purge() {
    try {
      const r = await this.trava.executar('expurgo-notificacoes', JANELA_EXPURGO_MS, () => this.notifications.purgeOld(), false)
      if (r.executou && r.resultado > 0) this.logger.log(`${r.resultado} notificação(ões) antigas removidas do histórico`)
    } catch (e) {
      this.logger.error(`expurgo do histórico falhou: ${String(e)}`)
    }
  }

  private async sweep() {
    if (this.running) return
    this.running = true
    try {
      await this.trava.executar('varredura-prazos', JANELA_VARREDURA_MS, async () => {
        // preventivo primeiro: uma tarefa que acabou de vencer não deve receber, no
        // mesmo ciclo, o aviso de "está para vencer".
        const soon = await this.instances.sweepDueSoon()
        if (soon > 0) this.logger.log(`${soon} tarefa(s) de workflow perto do prazo — avisadas`)
        const n = await this.instances.sweepOverdue()
        if (n > 0) this.logger.warn(`${n} tarefa(s) de workflow venceram o prazo — escalonadas`)
        const again = await this.instances.sweepOverdueReminders()
        if (again > 0) this.logger.warn(`${again} tarefa(s) seguem vencidas — responsáveis reavisados`)
        /* a varredura roda fora de requisição: sem este aviso, a tela aberta só veria o
           prazo estourado na próxima recarga. Ela devolve contagem, não organização → todas. */
        if (soon + n + again > 0) await this.realtime.emitirParaTodas(['instances', 'notifications'])
      }, false)
    } catch (e) {
      this.logger.error(`varredura de prazos falhou: ${String(e)}`)
    } finally {
      this.running = false
    }
  }
}
