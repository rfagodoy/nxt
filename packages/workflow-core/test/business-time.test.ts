import { describe, it, expect } from 'vitest'
import { addBusinessTime, isBusinessDay, DEFAULT_BUSINESS_CALENDAR, type BusinessCalendar } from '../src/business-time'

// Datas de referência (UTC). 2026-07-20 é SEGUNDA; 2026-07-21 terça; 2026-07-24 sexta;
// 2026-07-25/26 fim de semana; 2026-07-27 segunda.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo, d, h, mi, 0, 0))
const cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR

describe('addBusinessTime', () => {
  it('soma horas úteis dentro do mesmo dia', () => {
    // seg 10:00 + 4h → 14:00 mesmo dia
    expect(addBusinessTime(at(2026, 6, 20, 10), 0, 4, cal).toISOString()).toBe(at(2026, 6, 20, 14).toISOString())
  })

  it('"+1 dia útil" cai no mesmo horário do próximo dia útil', () => {
    // seg 10:00 + 1 dia útil (9h) → 10:00→18:00 (8h) + 1h no dia seguinte → ter 10:00
    expect(addBusinessTime(at(2026, 6, 20, 10), 1, 0, cal).toISOString()).toBe(at(2026, 6, 21, 10).toISOString())
  })

  it('pula o fim de semana', () => {
    // sex 16:00 + 4h → 16:00→18:00 (2h) + 2h na segunda → seg 11:00
    expect(addBusinessTime(at(2026, 6, 24, 16), 0, 4, cal).toISOString()).toBe(at(2026, 6, 27, 11).toISOString())
  })

  it('pula feriado', () => {
    // feriado na terça 2026-07-21; seg 10:00 + 1 dia útil → cai na quarta 10:00
    const comFeriado: BusinessCalendar = { ...cal, holidays: ['2026-07-21'] }
    expect(addBusinessTime(at(2026, 6, 20, 10), 1, 0, comFeriado).toISOString()).toBe(at(2026, 6, 22, 10).toISOString())
  })

  it('antes do expediente → começa a contar do início do expediente', () => {
    // seg 07:00 + 2h → clampa p/ 09:00 + 2h → 11:00
    expect(addBusinessTime(at(2026, 6, 20, 7), 0, 2, cal).toISOString()).toBe(at(2026, 6, 20, 11).toISOString())
  })

  it('depois do expediente → joga p/ o próximo dia útil', () => {
    // seg 19:00 + 1h → seg já fechou → ter 09:00 + 1h → ter 10:00
    expect(addBusinessTime(at(2026, 6, 20, 19), 0, 1, cal).toISOString()).toBe(at(2026, 6, 21, 10).toISOString())
  })

  it('dias + horas combinados', () => {
    // seg 09:00 + 1 dia útil + 4h → ter 09:00 + 4h → ter 13:00
    expect(addBusinessTime(at(2026, 6, 20, 9), 1, 4, cal).toISOString()).toBe(at(2026, 6, 21, 13).toISOString())
  })

  it('prazo zero devolve o próprio instante', () => {
    expect(addBusinessTime(at(2026, 6, 20, 10), 0, 0, cal).toISOString()).toBe(at(2026, 6, 20, 10).toISOString())
  })

  it('isBusinessDay reconhece fim de semana e feriado', () => {
    expect(isBusinessDay(at(2026, 6, 20), cal)).toBe(true) // segunda
    expect(isBusinessDay(at(2026, 6, 25), cal)).toBe(false) // sábado
    expect(isBusinessDay(at(2026, 6, 21), { ...cal, holidays: ['2026-07-21'] })).toBe(false) // feriado
  })
})
