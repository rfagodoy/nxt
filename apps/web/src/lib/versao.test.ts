import { describe, expect, it } from 'vitest'
import { formatarVersao } from './versao'

describe('formatarVersao', () => {
  it('tag SemVer com codinome vira "número — Codinome"', () => {
    expect(formatarVersao('v1.0.0-ada')).toBe('1.0.0 — Ada')
    expect(formatarVersao('v2.3.1-boole')).toBe('2.3.1 — Boole')
    expect(formatarVersao('v10.0.0-mccarthy')).toBe('10.0.0 — McCarthy')
  })

  it('build depois da tag diz quantos commits passou e qual', () => {
    expect(formatarVersao('v1.0.0-ada-3-gabc1234')).toBe('1.0.0 — Ada (+3, abc1234)')
  })

  it('o que não é tag SemVer passa como veio', () => {
    expect(formatarVersao('v2026.10.18.6')).toBe('v2026.10.18.6')
    expect(formatarVersao('5201472')).toBe('5201472')
    expect(formatarVersao('desenvolvimento')).toBe('desenvolvimento')
  })
})
