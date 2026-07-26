import { describe, it, expect } from 'vitest'
import { easterSunday, nationalHolidaysBR } from '../src/holidays-br'

/* Feriado errado = prazo errado, silenciosamente. Como o cálculo roda offline (sem
   consultar ninguém), ele precisa estar certo por conta própria — datas conferidas
   contra o calendário oficial. */

const dia = (h: { date: string; name: string }[], nome: string) => h.find((x) => x.name.startsWith(nome))?.date

describe('easterSunday', () => {
  it('acerta a Páscoa de anos conhecidos', () => {
    expect(easterSunday(2024).toISOString().slice(0, 10)).toBe('2024-03-31')
    expect(easterSunday(2025).toISOString().slice(0, 10)).toBe('2025-04-20')
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05')
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe('2027-03-28')
  })
})

describe('nationalHolidaysBR', () => {
  it('traz os móveis ancorados na Páscoa (2026)', () => {
    const h = nationalHolidaysBR(2026)
    // Páscoa 05/04/2026 → carnaval 16 e 17/02, sexta santa 03/04, corpus christi 04/06
    expect(dia(h, 'Carnaval (segunda')).toBe('2026-02-16')
    expect(dia(h, 'Carnaval (terça')).toBe('2026-02-17')
    expect(dia(h, 'Sexta-feira Santa')).toBe('2026-04-03')
    expect(dia(h, 'Corpus Christi')).toBe('2026-06-04')
  })

  it('traz os fixos, incluindo Consciência Negra (nacional desde 2024)', () => {
    const h = nationalHolidaysBR(2026)
    expect(dia(h, 'Confraternização')).toBe('2026-01-01')
    expect(dia(h, 'Tiradentes')).toBe('2026-04-21')
    expect(dia(h, 'Consciência Negra')).toBe('2026-11-20')
    expect(dia(h, 'Natal')).toBe('2026-12-25')
  })

  it('vem ordenado por data e sem repetição', () => {
    const h = nationalHolidaysBR(2027)
    const datas = h.map((x) => x.date)
    expect([...datas].sort()).toEqual(datas)
    expect(new Set(datas).size).toBe(datas.length)
  })

  it('todas as datas caem no ano pedido', () => {
    for (const ano of [2024, 2025, 2026, 2030]) {
      for (const h of nationalHolidaysBR(ano)) expect(h.date.startsWith(String(ano))).toBe(true)
    }
  })
})
