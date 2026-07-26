import { describe, it, expect } from 'vitest'
import { addBusinessTime, businessMinutesBetween, workdayMinutes, isBusinessDay, DEFAULT_BUSINESS_CALENDAR, type BusinessCalendar } from '../src/business-time'

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

/* businessMinutesBetween é a operação INVERSA de addBusinessTime: responde "quanto
   tempo de trabalho ainda falta?", que é o que decide quando o aviso preventivo sai.
   Medir em horas de relógio mandaria o alerta de uma segunda-feira no sábado. */
describe('businessMinutesBetween', () => {
  it('conta só o que cabe no expediente do mesmo dia', () => {
    // seg 10:00 → seg 14:00 = 4h úteis
    expect(businessMinutesBetween(at(2026, 6, 20, 10), at(2026, 6, 20, 14), cal)).toBe(240)
  })

  it('ignora a madrugada entre dois dias úteis', () => {
    // seg 17:00 → ter 10:00: 1h (até as 18) + 1h (das 9 às 10) = 2h úteis, não 17
    expect(businessMinutesBetween(at(2026, 6, 20, 17), at(2026, 6, 21, 10), cal)).toBe(120)
  })

  it('atravessa o fim de semana sem contá-lo', () => {
    // sex 17:00 → seg 10:00 = 2h úteis (o sábado e o domingo não existem para o prazo)
    expect(businessMinutesBetween(at(2026, 6, 24, 17), at(2026, 6, 27, 10), cal)).toBe(120)
  })

  it('não conta feriado', () => {
    const comFeriado: BusinessCalendar = { ...cal, holidays: ['2026-07-21'] }
    // seg 17:00 → qua 10:00, com terça feriada = 2h úteis
    expect(businessMinutesBetween(at(2026, 6, 20, 17), at(2026, 6, 22, 10), comFeriado)).toBe(120)
  })

  it('devolve 0 quando o prazo já passou', () => {
    expect(businessMinutesBetween(at(2026, 6, 21, 10), at(2026, 6, 20, 10), cal)).toBe(0)
    expect(businessMinutesBetween(at(2026, 6, 20, 10), at(2026, 6, 20, 10), cal)).toBe(0)
  })

  it('é coerente com addBusinessTime (ida e volta)', () => {
    const inicio = at(2026, 6, 24, 15) // sexta 15:00
    const due = addBusinessTime(inicio, 1, 2, cal) // +1 dia útil e 2h
    expect(businessMinutesBetween(inicio, due, cal)).toBe(9 * 60 + 2 * 60)
  })
})

/* Intervalo (almoço): o dia útil deixa de ser "do início ao fim do expediente".
   Sem isto, "prazo de 8 horas úteis" num expediente 9–18 significava 9 horas. */
const comAlmoco: BusinessCalendar = { ...cal, breakStartMinute: 12 * 60, breakEndMinute: 13 * 60 }

describe('expediente com intervalo', () => {
  it('o dia útil encurta pelo tamanho do intervalo', () => {
    expect(workdayMinutes(cal)).toBe(9 * 60)
    expect(workdayMinutes(comAlmoco)).toBe(8 * 60)
  })

  it('somar horas atravessando o almoço pula o intervalo', () => {
    // seg 11:00 + 2h úteis → 11:00–12:00 (1h) + 13:00–14:00 (1h) = 14:00
    expect(addBusinessTime(at(2026, 6, 20, 11), 0, 2, comAlmoco).toISOString()).toBe(at(2026, 6, 20, 14).toISOString())
  })

  it('começar DENTRO do almoço vale como começar na volta', () => {
    // seg 12:30 + 1h útil → conta a partir das 13:00 → 14:00
    expect(addBusinessTime(at(2026, 6, 20, 12, 30), 0, 1, comAlmoco).toISOString()).toBe(at(2026, 6, 20, 14).toISOString())
  })

  it('"+1 dia útil" continua caindo no mesmo horário do dia seguinte', () => {
    // com 8h de dia útil: seg 10:00 + 1 dia → ter 10:00
    expect(addBusinessTime(at(2026, 6, 20, 10), 1, 0, comAlmoco).toISOString()).toBe(at(2026, 6, 21, 10).toISOString())
  })

  it('o tempo até o prazo desconta o almoço', () => {
    // seg 11:00 → seg 15:00: 1h + 2h = 3h úteis (a hora do almoço não conta)
    expect(businessMinutesBetween(at(2026, 6, 20, 11), at(2026, 6, 20, 15), comAlmoco)).toBe(180)
  })

  it('intervalo inválido é ignorado (não encurta nem quebra o dia)', () => {
    const invertido: BusinessCalendar = { ...cal, breakStartMinute: 14 * 60, breakEndMinute: 13 * 60 }
    const foraDoExpediente: BusinessCalendar = { ...cal, breakStartMinute: 20 * 60, breakEndMinute: 21 * 60 }
    expect(workdayMinutes(invertido)).toBe(9 * 60)
    expect(workdayMinutes(foraDoExpediente)).toBe(9 * 60)
  })
})
