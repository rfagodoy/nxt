/* Regras puras da tela de calendário comercial. Separadas do componente porque
   decidem o que o usuário vê como "possível emenda" — e um palpite errado aqui
   convida a marcar folga onde não há. */

export type CalendarKind = 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL' | 'EMENDA' | 'FOLGA'

export interface CalendarDay {
  date: string
  name: string
  kind: CalendarKind
}

/** Tipos que o usuário escolhe ao marcar um dia. NACIONAL fica de fora: ele só entra
 *  pelo catálogo calculado — deixar alguém rotular um dia qualquer de "feriado
 *  nacional" à mão faria a origem do dia mentir. */
export const KIND_OPTIONS: Array<{ value: CalendarKind; label: string; hint: string }> = [
  { value: 'ESTADUAL',  label: 'Feriado estadual',  hint: 'Ex.: Revolução Constitucionalista (SP), Independência da Bahia' },
  { value: 'MUNICIPAL', label: 'Feriado municipal', hint: 'Aniversário da cidade, padroeiro' },
  { value: 'EMENDA',    label: 'Emenda de feriado', hint: 'Ponte entre feriado e fim de semana' },
  { value: 'FOLGA',     label: 'Folga / recesso',   hint: 'Recesso de fim de ano, ponto facultativo adotado' },
]

export const KIND_LABEL: Record<CalendarKind, string> = {
  NACIONAL: 'Feriado nacional', ESTADUAL: 'Feriado estadual', MUNICIPAL: 'Feriado municipal',
  EMENDA: 'Emenda', FOLGA: 'Folga',
}

const shift = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay()

/** O dia é não útil? Ou está fora do expediente semanal, ou foi marcado. */
export function isNonWorking(date: string, workdays: number[], marked: Set<string>): boolean {
  return !workdays.includes(weekdayOf(date)) || marked.has(date)
}

/**
 * O dia é candidato a EMENDA: um dia de expediente, ainda não marcado, espremido
 * entre dois dias não úteis — a sexta depois do feriado de quinta, a segunda antes
 * do feriado de terça. Só sugere; marcar continua sendo decisão de quem opera,
 * porque emendar é política da empresa e não consequência do calendário.
 */
export function isBridgeCandidate(date: string, workdays: number[], marked: Set<string>): boolean {
  if (marked.has(date)) return false
  if (!workdays.includes(weekdayOf(date))) return false
  return isNonWorking(shift(date, -1), workdays, marked) && isNonWorking(shift(date, 1), workdays, marked)
}

/** Nome e tipo sugeridos ao marcar um dia: ponte vira Emenda já nomeada; o resto
 *  nasce como Folga, e o usuário corrige no editor. */
export function suggestDay(date: string, workdays: number[], marked: Set<string>): { name: string; kind: CalendarKind } {
  return isBridgeCandidate(date, workdays, marked)
    ? { name: 'Emenda de feriado', kind: 'EMENDA' }
    : { name: '', kind: 'FOLGA' }
}
