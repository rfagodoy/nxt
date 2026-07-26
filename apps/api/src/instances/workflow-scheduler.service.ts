import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { InstancesService } from './instances.service'
import { NotificationsService } from '../notifications/notifications.service'

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
  ) {}

  onModuleInit() {
    setTimeout(() => void this.sweep(), 25_000)
    setInterval(() => void this.sweep(), 5 * 60_000)
    // expurgo do histórico: caro e sem pressa — uma vez por dia, longe do boot.
    setTimeout(() => void this.purge(), 3 * 60_000)
    setInterval(() => void this.purge(), 24 * 60 * 60_000)
  }

  private async purge() {
    const n = await this.notifications.purgeOld()
    if (n > 0) this.logger.log(`${n} notificação(ões) antigas removidas do histórico`)
  }

  private async sweep() {
    if (this.running) return
    this.running = true
    try {
      // preventivo primeiro: uma tarefa que acabou de vencer não deve receber, no
      // mesmo ciclo, o aviso de "está para vencer".
      const soon = await this.instances.sweepDueSoon()
      if (soon > 0) this.logger.log(`${soon} tarefa(s) de workflow perto do prazo — avisadas`)
      const n = await this.instances.sweepOverdue()
      if (n > 0) this.logger.warn(`${n} tarefa(s) de workflow venceram o prazo — escalonadas`)
      const again = await this.instances.sweepOverdueReminders()
      if (again > 0) this.logger.warn(`${again} tarefa(s) seguem vencidas — responsáveis reavisados`)
    } catch (e) {
      this.logger.error(`varredura de prazos falhou: ${String(e)}`)
    } finally {
      this.running = false
    }
  }
}
