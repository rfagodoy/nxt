/* ─── Calendário comercial: soma de tempo ÚTIL ─────────────────────────────────
   Cálculo PURO do prazo (dueAt) de uma atividade em DIAS ÚTEIS + HORAS ÚTEIS,
   contando só dentro do expediente e pulando fim de semana e feriados. Usado pelo
   backend ao criar a tarefa (WorkflowTask.dueAt). Mantido puro/sem relógio para ser
   testável: recebe o instante inicial e o calendário, devolve o instante-limite.

   ⚠️ Fuso: a função opera nos componentes UTC do Date (getUTC*). O backend deve
   passar/interpretar o instante já no "relógio de parede" da organização (aplicar o
   offset do fuso antes/depois). Assim os testes são determinísticos, independentes do
   fuso da máquina. */

export interface BusinessCalendar {
  /** Dias úteis da semana: 0=domingo … 6=sábado. Ex.: [1,2,3,4,5] = seg–sex. */
  workdays: number[]
  /** Início do expediente em MINUTOS desde 00:00. Ex.: 540 = 09:00. */
  startMinute: number
  /** Fim do expediente em MINUTOS desde 00:00. Ex.: 1080 = 18:00. */
  endMinute: number
  /** Feriados (dias inteiros não úteis) em 'YYYY-MM-DD' (UTC). */
  holidays: string[]
}

/** Expediente padrão: seg–sex, 09:00–18:00, sem feriados. */
export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = {
  workdays: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  holidays: [],
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10)
const minuteOfDay = (d: Date): number => d.getUTCHours() * 60 + d.getUTCMinutes()

/** Mesmo dia de `d`, no minuto `minute` (00:00 + minute). */
function atMinuteOfDay(d: Date, minute: number): Date {
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  return new Date(base + minute * 60_000)
}

/** Próximo dia calendário de `d`, no início do expediente. */
function nextDayStart(d: Date, cal: BusinessCalendar): Date {
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)
  return new Date(base + cal.startMinute * 60_000)
}

/** `d` cai num dia útil (dia da semana previsto e não feriado)? */
export function isBusinessDay(d: Date, cal: BusinessCalendar): boolean {
  return cal.workdays.includes(d.getUTCDay()) && !cal.holidays.includes(ymd(d))
}

/** Soma `days` dias úteis + `hours` horas úteis a `from`, acumulando tempo APENAS
 *  dentro do expediente (pula fora-de-hora, fins de semana e feriados). Um "dia útil"
 *  = a duração do expediente (endMinute−startMinute); assim, começando dentro do
 *  expediente, "+1 dia útil" cai no mesmo horário do próximo dia útil. */
export function addBusinessTime(
  from: Date,
  days: number,
  hours: number,
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): Date {
  const dayLen = Math.max(0, cal.endMinute - cal.startMinute)
  let remaining = Math.round((days || 0) * dayLen + (hours || 0) * 60)
  let cur = new Date(from.getTime())
  if (remaining <= 0 || dayLen === 0) return cur

  let guard = 0
  while (remaining > 0) {
    if (guard++ > 100_000) break // trava de segurança (não deve ocorrer)
    if (!isBusinessDay(cur, cal)) {
      cur = nextDayStart(cur, cal)
      continue
    }
    let m = minuteOfDay(cur)
    if (m < cal.startMinute) {
      cur = atMinuteOfDay(cur, cal.startMinute)
      m = cal.startMinute
    }
    if (m >= cal.endMinute) {
      cur = nextDayStart(cur, cal)
      continue
    }
    const availToday = cal.endMinute - m
    if (remaining <= availToday) {
      cur = atMinuteOfDay(cur, m + remaining)
      remaining = 0
    } else {
      remaining -= availToday
      cur = nextDayStart(cur, cal)
    }
  }
  return cur
}
