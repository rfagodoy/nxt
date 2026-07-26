/* ─── Calendário comercial: soma de tempo ÚTIL ─────────────────────────────────
   Cálculo PURO do prazo (dueAt) de uma atividade em DIAS ÚTEIS + HORAS ÚTEIS,
   contando só dentro do expediente e pulando fim de semana, feriados e o intervalo
   do almoço. Usado pelo backend ao criar a tarefa (WorkflowTask.dueAt). Mantido
   puro/sem relógio para ser testável: recebe o instante inicial e o calendário,
   devolve o instante-limite.

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
  /** Início do intervalo (almoço) em minutos. Ausente = expediente contínuo. */
  breakStartMinute?: number | null
  /** Fim do intervalo em minutos. Só vale com `breakStartMinute` definido. */
  breakEndMinute?: number | null
  /** Feriados (dias inteiros não úteis) em 'YYYY-MM-DD' (UTC). */
  holidays: string[]
}

/** Expediente padrão: seg–sex, 09:00–18:00, CONTÍNUO e sem feriados.
 *  O intervalo fica de fora do padrão de propósito: ligá-lo aqui encurtaria o dia
 *  útil (9h → 8h) de toda instalação que ainda não configurou o calendário, mudando
 *  prazos futuros sem ninguém ter pedido. Quem configura escolhe — e a tela já
 *  sugere 12:00–13:00. */
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

/** As JANELAS de trabalho de um dia, em minutos: uma quando o expediente é contínuo,
 *  duas quando há intervalo. É o que permite ao motor pular o almoço sem espalhar
 *  `if (temIntervalo)` por todo o cálculo. */
export function dayWindows(cal: BusinessCalendar): Array<[number, number]> {
  const { startMinute: ini, endMinute: fim, breakStartMinute: bi, breakEndMinute: bf } = cal
  if (fim <= ini) return []
  // intervalo só conta se estiver DENTRO do expediente e for um trecho real
  if (bi == null || bf == null || bf <= bi || bi <= ini || bf >= fim) return [[ini, fim]]
  return [[ini, bi], [bf, fim]]
}

/** Minutos de trabalho de um dia útil (expediente menos o intervalo). É a duração de
 *  "1 dia útil" — por isso o intervalo muda o significado de um prazo em dias. */
export function workdayMinutes(cal: BusinessCalendar): number {
  return dayWindows(cal).reduce((total, [ini, fim]) => total + (fim - ini), 0)
}

/** Soma `days` dias úteis + `hours` horas úteis a `from`, acumulando tempo APENAS
 *  dentro do expediente (pula fora-de-hora, intervalo, fins de semana e feriados).
 *  Um "dia útil" = a duração do expediente descontado o intervalo; assim, começando
 *  dentro do expediente, "+1 dia útil" cai no mesmo horário do próximo dia útil. */
export function addBusinessTime(
  from: Date,
  days: number,
  hours: number,
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): Date {
  const dayLen = workdayMinutes(cal)
  let remaining = Math.round((days || 0) * dayLen + (hours || 0) * 60)
  let cur = new Date(from.getTime())
  if (remaining <= 0 || dayLen === 0) return cur

  const windows = dayWindows(cal)
  let guard = 0
  while (remaining > 0) {
    if (guard++ > 100_000) break // trava de segurança (não deve ocorrer)
    if (!isBusinessDay(cur, cal)) {
      cur = nextDayStart(cur, cal)
      continue
    }
    const m = minuteOfDay(cur)
    // primeira janela do dia que ainda tem tempo à frente do instante atual
    const janela = windows.find(([, fim]) => m < fim)
    if (!janela) {
      cur = nextDayStart(cur, cal)
      continue
    }
    const [ini, fim] = janela
    const atual = Math.max(m, ini)   // antes do expediente/no almoço → pula para o início da janela
    const disponivel = fim - atual
    if (remaining <= disponivel) {
      cur = atMinuteOfDay(cur, atual + remaining)
      remaining = 0
    } else {
      remaining -= disponivel
      cur = atMinuteOfDay(cur, fim)  // consome a janela e segue para a próxima (ou para o dia seguinte)
    }
  }
  return cur
}

/** Quanto tempo ÚTIL (em minutos) existe entre `from` e `to` — a operação inversa
 *  de `addBusinessTime`. Serve para responder "quanto tempo de trabalho ainda falta
 *  até o prazo?", que é diferente de "quantas horas de relógio faltam": às 17h de
 *  sexta, um prazo de segunda às 10h está a 2 horas ÚTEIS de distância, não a 65.
 *  Devolve 0 quando `to` não é posterior a `from`. */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): number {
  if (workdayMinutes(cal) === 0 || to.getTime() <= from.getTime()) return 0

  const windows = dayWindows(cal)
  let total = 0
  let cur = new Date(from.getTime())
  let guard = 0
  while (cur.getTime() < to.getTime()) {
    if (guard++ > 100_000) break // trava de segurança (não deve ocorrer)
    if (!isBusinessDay(cur, cal)) {
      cur = nextDayStart(cur, cal)
      continue
    }
    const m = minuteOfDay(cur)
    const janela = windows.find(([, fim]) => m < fim)
    if (!janela) {
      cur = nextDayStart(cur, cal)
      continue
    }
    const [ini, fim] = janela
    const inicioJanela = atMinuteOfDay(cur, Math.max(m, ini))
    const fimJanela = atMinuteOfDay(cur, fim)
    const ate = to.getTime() < fimJanela.getTime() ? to : fimJanela
    total += Math.max(0, Math.round((ate.getTime() - inicioJanela.getTime()) / 60_000))
    cur = ate.getTime() < fimJanela.getTime() ? new Date(to.getTime()) : fimJanela
  }
  return total
}
