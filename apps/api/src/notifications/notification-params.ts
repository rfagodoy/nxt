/* Parâmetros de notificação da organização (AppSetting único, editado em
   /settings/notificacoes). Os blocos de CONTRATO (vigência/reajuste/consumo)
   moram no ContractSchedulerService; aqui ficam a chave compartilhada e o bloco
   de TAREFAS, lido pelo motor de workflow — que não deve depender do scheduler
   de contratos só para saber uma chave de configuração. */

export const NOTIF_PARAMS_KEY = 'nxt:settings:notificacoes'

/** Avisos de prazo das tarefas de workflow. */
export interface TarefasParams {
  /** liga/desliga o aviso PREVENTIVO (o de prazo vencido é sempre enviado) */
  enabled: boolean
  /** Antecedência do aviso, em horas ÚTEIS — mesmo calendário comercial que define
   *  o prazo. Medir em horas de relógio mandaria o alerta de uma segunda-feira no
   *  sábado, quando ninguém pode agir. */
  antecedenciaHoras: number
  /** De quantos em quantos DIAS insistir com o responsável enquanto a tarefa segue
   *  vencida. 0 desliga o reaviso (o primeiro aviso de vencimento continua saindo). */
  reavisoDias: number
}

export const DEFAULT_TAREFAS: TarefasParams = { enabled: true, antecedenciaHoras: 24, reavisoDias: 1 }

/** Envio por e-mail dos avisos. O canal só existe se o servidor tiver SMTP
 *  configurado (MAIL_HOST); estes campos dizem COMO usá-lo quando existe. */
export interface EmailParams {
  /** avisos pessoais saem por e-mail no momento em que nascem */
  imediato: boolean
  /** um e-mail por pessoa, por dia, com o que ainda não foi enviado */
  resumoDiario: boolean
  /** hora local (0–23) em que o resumo é disparado */
  horaResumo: number
}

export const DEFAULT_EMAIL: EmailParams = { imediato: true, resumoDiario: true, horaResumo: 8 }

export function emailParams(value: unknown): EmailParams {
  const v = (value as { email?: Partial<EmailParams> } | null)?.email
  if (!v || typeof v !== 'object') return DEFAULT_EMAIL
  const hora = Number(v.horaResumo)
  return {
    imediato: v.imediato ?? DEFAULT_EMAIL.imediato,
    resumoDiario: v.resumoDiario ?? DEFAULT_EMAIL.resumoDiario,
    horaResumo: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : DEFAULT_EMAIL.horaResumo,
  }
}

/** Lê o bloco `tarefas` de um valor de AppSetting, tolerando ausência/lixo. */
export function tarefasParams(value: unknown): TarefasParams {
  const v = (value as { tarefas?: Partial<TarefasParams> } | null)?.tarefas
  if (!v || typeof v !== 'object') return DEFAULT_TAREFAS
  const horas = Number(v.antecedenciaHoras)
  const reaviso = Number(v.reavisoDias)
  return {
    enabled: v.enabled ?? DEFAULT_TAREFAS.enabled,
    antecedenciaHoras: Number.isFinite(horas) && horas > 0 ? horas : DEFAULT_TAREFAS.antecedenciaHoras,
    // 0 é válido aqui (desliga o reaviso); só negativo/lixo cai no padrão
    reavisoDias: Number.isFinite(reaviso) && reaviso >= 0 ? reaviso : DEFAULT_TAREFAS.reavisoDias,
  }
}
