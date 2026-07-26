/* Parâmetros de notificação da organização (AppSetting único, editado em
   /settings/notificacoes). Os blocos de CONTRATO (vigência/reajuste/consumo)
   moram no ContractSchedulerService; aqui ficam a chave compartilhada e o bloco
   de TAREFAS, lido pelo motor de workflow — que não deve depender do scheduler
   de contratos só para saber uma chave de configuração. */

export const NOTIF_PARAMS_KEY = 'nxt:settings:notificacoes'

/** Aviso PREVENTIVO de prazo das tarefas de workflow. */
export interface TarefasParams {
  enabled: boolean
  /** Antecedência do aviso, em horas de RELÓGIO (o prazo em si é contado em
   *  tempo útil; o aviso não — quem chega na segunda encontra o aviso do fim de
   *  semana esperando, que é o comportamento desejado para um lembrete). */
  antecedenciaHoras: number
}

export const DEFAULT_TAREFAS: TarefasParams = { enabled: true, antecedenciaHoras: 24 }

/** Lê o bloco `tarefas` de um valor de AppSetting, tolerando ausência/lixo. */
export function tarefasParams(value: unknown): TarefasParams {
  const v = (value as { tarefas?: Partial<TarefasParams> } | null)?.tarefas
  if (!v || typeof v !== 'object') return DEFAULT_TAREFAS
  const horas = Number(v.antecedenciaHoras)
  return {
    enabled: v.enabled ?? DEFAULT_TAREFAS.enabled,
    antecedenciaHoras: Number.isFinite(horas) && horas > 0 ? horas : DEFAULT_TAREFAS.antecedenciaHoras,
  }
}
