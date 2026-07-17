import { describe, it, expect } from 'vitest'
import { addToDate, addMesesISO, addMesesComp, proximoDiaISO } from '../src/dates'

describe('addToDate / addMesesISO — clamp end-of-month (sem overflow de mês)', () => {
  it('soma de mês CLAMPA o dia ao último dia do mês de destino (não pula fevereiro)', () => {
    expect(addMesesISO('2024-01-31', 1)).toBe('2024-02-29') // bissexto
    expect(addMesesISO('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMesesISO('2024-01-30', 1)).toBe('2024-02-29')
    expect(addMesesISO('2025-01-30', 1)).toBe('2025-02-28')
    expect(addMesesISO('2024-03-31', 1)).toBe('2024-04-30') // abril tem 30
  })

  it('renovação anual de 29/02 (bissexto) cai em 28/02 do ano seguinte', () => {
    expect(addToDate('2024-02-29', 1, 0, 0)).toBe('2025-02-28')
    expect(addToDate('2020-02-29', 0, 12, 0)).toBe('2021-02-28')
  })

  it('casos normais (dia ≤ 28) intactos', () => {
    expect(addMesesISO('2024-01-15', 1)).toBe('2024-02-15')
    expect(addMesesISO('2024-01-31', 2)).toBe('2024-03-31') // março tem 31
    expect(addToDate('2024-06-10', 1, 2, 0)).toBe('2025-08-10')
  })

  it('meses negativos também clampam', () => {
    expect(addMesesISO('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMesesISO('2025-03-31', -1)).toBe('2025-02-28')
  })

  it('dias são somados APÓS o clamp de mês', () => {
    expect(proximoDiaISO('2024-02-29')).toBe('2024-03-01')
    expect(proximoDiaISO('2024-01-31')).toBe('2024-02-01')
    expect(addToDate('2024-01-31', 0, 1, 1)).toBe('2024-03-01') // 31/01+1m=29/02, +1d=01/03
  })

  it('data inválida → ""', () => {
    expect(addToDate('', 0, 1, 0)).toBe('')
  })

  it('addMesesComp (dia 1, imune a overflow) segue correto', () => {
    expect(addMesesComp('2024-01', 1)).toBe('2024-02')
    expect(addMesesComp('2024-12', 1)).toBe('2025-01')
  })
})
