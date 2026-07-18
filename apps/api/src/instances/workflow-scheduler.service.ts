import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { InstancesService } from './instances.service'

/** Varredura periódica de prazos (SLA) das tarefas de workflow: marca as vencidas
 *  como escalonadas. Roda uma vez no boot (após 25s) e a cada 5 minutos. Espelha
 *  o padrão do ContractSchedulerService. */
@Injectable()
export class WorkflowSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('WorkflowScheduler')
  private running = false

  constructor(private readonly instances: InstancesService) {}

  onModuleInit() {
    setTimeout(() => void this.sweep(), 25_000)
    setInterval(() => void this.sweep(), 5 * 60_000)
  }

  private async sweep() {
    if (this.running) return
    this.running = true
    try {
      const n = await this.instances.sweepOverdue()
      if (n > 0) this.logger.warn(`${n} tarefa(s) de workflow venceram o prazo — escalonadas`)
    } catch (e) {
      this.logger.error(`sweepOverdue falhou: ${String(e)}`)
    } finally {
      this.running = false
    }
  }
}
