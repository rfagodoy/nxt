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

/** Envio por e-mail dos alertas de CONTRATO (vigência, reajuste, consumo).
 *
 *  Bloco separado do `email` porque o destinatário é de outra natureza: aviso de
 *  workflow tem dono (a tarefa é de alguém), aviso de contrato é da organização —
 *  nasce sem userId. Quem recebe é resolvido em três camadas, nesta ordem:
 *  responsáveis do contrato → destinatários fixos → administradores. */
export interface ContratosEmailParams {
  enabled: boolean
  /** Usuários que recebem TODOS os alertas de contrato, além dos responsáveis.
   *  Vazio é o normal: a maioria das organizações quer só o responsável. */
  destinatarios: string[]
}

export const DEFAULT_CONTRATOS_EMAIL: ContratosEmailParams = { enabled: true, destinatarios: [] }

export function contratosEmailParams(value: unknown): ContratosEmailParams {
  const v = (value as { emailContratos?: Partial<ContratosEmailParams> } | null)?.emailContratos
  if (!v || typeof v !== 'object') return DEFAULT_CONTRATOS_EMAIL
  return {
    enabled: v.enabled ?? DEFAULT_CONTRATOS_EMAIL.enabled,
    destinatarios: Array.isArray(v.destinatarios) ? [...new Set(v.destinatarios.filter((s) => typeof s === 'string' && s))] : [],
  }
}

/** Ordem de gravidade. Existe para duas decisões: ordenar o e-mail (o crítico
 *  primeiro) e detectar ESCALADA — quando um aviso piora, ele volta a ser enviado
 *  mesmo já tendo saído antes. Sem isso, quem recebeu "vence em 60 dias" nunca
 *  receberia o "vence em 7". */
export const SEVERIDADE_RANK: Record<string, number> = { INFO: 0, ALERTA: 1, CRITICO: 2 }

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
