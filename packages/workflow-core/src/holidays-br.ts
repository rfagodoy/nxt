/* ─── Feriados nacionais brasileiros ───────────────────────────────────────────
   Calculados aqui, sem rede: instalação on-premise pode não ter internet, e um
   prazo não pode depender de um serviço de terceiro estar de pé. Fixos são tabela;
   móveis derivam da Páscoa.

   Feriados ESTADUAIS e MUNICIPAIS não entram — são milhares e variam por cidade;
   o cliente cadastra os dele na tela de calendário. */

/** Domingo de Páscoa do ano (algoritmo de Meeus/Butcher, calendário gregoriano). */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)      // 3=março, 4=abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, mes - 1, dia))
}

const iso = (d: Date): string => d.toISOString().slice(0, 10)
const plus = (d: Date, dias: number): Date => new Date(d.getTime() + dias * 86_400_000)

export interface Holiday {
  /** 'YYYY-MM-DD' */
  date: string
  name: string
  /** móvel = depende da Páscoa (muda de data todo ano) */
  movel: boolean
}

/** Feriados nacionais do ano, em ordem de data.
 *  Consciência Negra (20/11) entra: é feriado nacional desde a Lei 14.759/2023. */
export function nationalHolidaysBR(year: number): Holiday[] {
  const pascoa = easterSunday(year)

  const fixos: Array<[number, number, string]> = [
    [1, 1, 'Confraternização Universal'],
    [4, 21, 'Tiradentes'],
    [5, 1, 'Dia do Trabalho'],
    [9, 7, 'Independência do Brasil'],
    [10, 12, 'Nossa Senhora Aparecida'],
    [11, 2, 'Finados'],
    [11, 15, 'Proclamação da República'],
    [11, 20, 'Consciência Negra'],
    [12, 25, 'Natal'],
  ]

  const moveis: Array<[number, string]> = [
    [-48, 'Carnaval (segunda-feira)'],
    [-47, 'Carnaval (terça-feira)'],
    [-2, 'Sexta-feira Santa'],
    [60, 'Corpus Christi'],
  ]

  const lista: Holiday[] = [
    ...fixos.map(([mes, dia, name]) => ({ date: iso(new Date(Date.UTC(year, mes - 1, dia))), name, movel: false })),
    ...moveis.map(([offset, name]) => ({ date: iso(plus(pascoa, offset)), name, movel: true })),
  ]

  return lista.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
