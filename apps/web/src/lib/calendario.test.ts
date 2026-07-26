import { describe, it, expect } from 'vitest'
import { isBridgeCandidate, isNonWorking, suggestDay } from './calendario'

/* Semana de referência (2026): 13/07 seg · 14 ter · 15 qua · 16 qui · 17 sex ·
   18 sáb · 19 dom · 20 seg · 21 ter. */
const SEMANA = [1, 2, 3, 4, 5]

describe('isNonWorking', () => {
  it('sábado e domingo não são úteis no expediente padrão', () => {
    expect(isNonWorking('2026-07-18', SEMANA, new Set())).toBe(true)
    expect(isNonWorking('2026-07-19', SEMANA, new Set())).toBe(true)
  })
  it('dia marcado não é útil, mesmo sendo dia de semana', () => {
    expect(isNonWorking('2026-07-15', SEMANA, new Set(['2026-07-15']))).toBe(true)
  })
  it('dia de semana sem marca é útil', () => {
    expect(isNonWorking('2026-07-15', SEMANA, new Set())).toBe(false)
  })
})

describe('isBridgeCandidate', () => {
  it('sexta após feriado de quinta é ponte', () => {
    // quinta 16/07 feriado + sábado 18/07 → sexta 17/07 fica isolada
    expect(isBridgeCandidate('2026-07-17', SEMANA, new Set(['2026-07-16']))).toBe(true)
  })

  it('segunda antes de feriado de terça é ponte', () => {
    // domingo 19/07 + terça 21/07 feriado → segunda 20/07 fica isolada
    expect(isBridgeCandidate('2026-07-20', SEMANA, new Set(['2026-07-21']))).toBe(true)
  })

  it('quarta entre dois dias úteis NÃO é ponte', () => {
    expect(isBridgeCandidate('2026-07-15', SEMANA, new Set())).toBe(false)
  })

  it('dia já marcado não é sugerido de novo', () => {
    expect(isBridgeCandidate('2026-07-17', SEMANA, new Set(['2026-07-16', '2026-07-17']))).toBe(false)
  })

  it('fim de semana nunca é ponte (já não é útil)', () => {
    expect(isBridgeCandidate('2026-07-18', SEMANA, new Set(['2026-07-17']))).toBe(false)
  })

  it('quinta entre feriados de quarta e sexta é ponte', () => {
    expect(isBridgeCandidate('2026-07-16', SEMANA, new Set(['2026-07-15', '2026-07-17']))).toBe(true)
  })

  it('num expediente de 6 dias, o sábado deixa de fazer ponte na sexta', () => {
    const seisDias = [1, 2, 3, 4, 5, 6]
    // sexta 17/07 com quinta 16 feriada, mas sábado 18 agora é útil → não isola
    expect(isBridgeCandidate('2026-07-17', seisDias, new Set(['2026-07-16']))).toBe(false)
  })
})

describe('suggestDay', () => {
  it('ponte já nasce nomeada como emenda', () => {
    expect(suggestDay('2026-07-17', SEMANA, new Set(['2026-07-16'])))
      .toEqual({ name: 'Emenda de feriado', kind: 'EMENDA' })
  })

  it('dia comum nasce sem nome, para o usuário dizer o que é', () => {
    expect(suggestDay('2026-07-15', SEMANA, new Set())).toEqual({ name: '', kind: 'FOLGA' })
  })
})
