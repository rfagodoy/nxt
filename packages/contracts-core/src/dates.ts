/* Aritmética de datas em ISO (YYYY-MM-DD) e competências (YYYY-MM).
   Tudo em UTC: datas de contrato são civis, não instantes — usar o fuso local
   faria o mesmo contrato render datas diferentes em servidores diferentes. */

const pad = (n: number) => String(n).padStart(2, '0')

/** Data de hoje em ISO. Único ponto do core que lê o relógio — as demais funções
 *  recebem `today` por parâmetro para permanecerem puras e testáveis. */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Competência (YYYY-MM) do mês corrente. */
export function currentComp(): string {
  return todayISO().slice(0, 7)
}

/** Soma anos/meses/dias a uma data ISO. '' se a data for inválida. */
export function addToDate(iso: string, anos: number, meses: number, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCFullYear(dt.getUTCFullYear() + anos)
  dt.setUTCMonth(dt.getUTCMonth() + meses)
  dt.setUTCDate(dt.getUTCDate() + dias)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Soma N meses a uma data ISO. */
export const addMesesISO = (iso: string, meses: number) => addToDate(iso, 0, meses, 0)

/** Soma N meses a uma competência YYYY-MM. '' se inválida. */
export function addMesesComp(yyyymm: string, meses: number): string {
  const [y, m] = yyyymm.slice(0, 7).split('-').map(Number)
  if (!y || !m) return ''
  const dt = new Date(Date.UTC(y, m - 1 + meses, 1))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`
}

/** Dias entre duas datas ISO (b − a). */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(toISO.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Dia seguinte a uma data ISO. '' se inválida. */
export function proximoDiaISO(iso: string): string {
  if (!iso) return ''
  return addToDate(iso, 0, 0, 1)
}

/** Competência (YYYY-MM) de uma data ISO ou de uma competência já normalizada. */
export const comp = (iso: string) => (iso ? iso.slice(0, 7) : '')
