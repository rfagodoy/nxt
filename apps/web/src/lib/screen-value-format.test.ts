import { describe, it, expect } from 'vitest'
import { formatScreenCellValue } from './screen-value-format'
import type { ScreenField } from './screen-types'

function field(partial: Partial<ScreenField>): ScreenField {
  return {
    id: 'f1', name: 'campo', label: 'Campo', type: 'text', source: 'CUSTOM',
    mode: 'EDIT', required: false, order: 0, ...partial,
  }
}

/** Intl usa espaço não-quebrável (U+00A0) no Linux/CI e normal no Windows — normaliza. */
const norm = (s: string) => s.replace(/\s/g, ' ')

describe('formatScreenCellValue', () => {
  it('vazio/null → string vazia (sem "—", quem exibe decide)', () => {
    expect(formatScreenCellValue(field({ type: 'text' }), '')).toBe('')
    expect(formatScreenCellValue(field({ type: 'text' }), null)).toBe('')
    expect(formatScreenCellValue(field({ type: 'text' }), undefined)).toBe('')
  })

  it('texto passa direto', () => {
    expect(formatScreenCellValue(field({ type: 'text' }), 'ACME')).toBe('ACME')
  })

  it('checkbox: "1" → Sim, resto → Não', () => {
    expect(formatScreenCellValue(field({ type: 'checkbox' }), '1')).toBe('Sim')
    expect(formatScreenCellValue(field({ type: 'checkbox' }), '0')).toBe('Não')
  })

  it('select resolve o rótulo da opção; sem match cai no valor', () => {
    const f = field({ type: 'select', options: [{ value: 'a', label: 'Opção A' }] })
    expect(formatScreenCellValue(f, 'a')).toBe('Opção A')
    expect(formatScreenCellValue(f, 'z')).toBe('z')
  })

  it('multiselect (JSON de values) → rótulos separados por vírgula', () => {
    const f = field({ type: 'multiselect', options: [
      { value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' },
    ] })
    expect(formatScreenCellValue(f, JSON.stringify(['a', 'b']))).toBe('Alfa, Beta')
    expect(formatScreenCellValue(f, JSON.stringify(['a', 'x']))).toBe('Alfa, x')
  })

  it('multiselect com valor não-JSON degrada para o valor único', () => {
    const f = field({ type: 'multiselect', options: [{ value: 'a', label: 'Alfa' }] })
    expect(formatScreenCellValue(f, 'a')).toBe('Alfa')
  })

  it('currency formata em pt-BR; não-numérico passa direto', () => {
    const f = field({ type: 'currency' })
    expect(norm(formatScreenCellValue(f, '1234.5'))).toBe('R$ 1.234,50')
    expect(formatScreenCellValue(f, 'abc')).toBe('abc')
  })

  it('date yyyy-mm-dd → dd/mm/yyyy; outro formato passa direto', () => {
    const f = field({ type: 'date' })
    expect(formatScreenCellValue(f, '2026-07-16')).toBe('16/07/2026')
    expect(formatScreenCellValue(f, '16/07/2026')).toBe('16/07/2026')
  })
})
