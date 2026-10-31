import { describe, it, expect } from 'vitest'
import type { DesenhoV2 } from '@nxt/types'
import { lerDesenhoV2 } from '../src/desenho-livre'

const base = (): DesenhoV2 => ({
  versao: 2,
  formas: [{ id: 'start', tipo: 'start' }, { id: 'a1', tipo: 'userTask' }, { id: 'end', tipo: 'end' }],
  setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 'end' }],
  posicoes: { a1: { x: 10, y: 20 } },
  raias: [],
})

describe('lerDesenhoV2', () => {
  it('desenho válido passa inteiro', () => {
    expect(lerDesenhoV2(base())).toEqual(base())
  })
  it('versão 1 não é v2', () => {
    expect(lerDesenhoV2({ versao: 1, posicoes: {}, raias: [] })).toBeNull()
  })
  it('seta que aponta para forma que não existe é descartada', () => {
    const d = base()
    d.setas.push({ id: 's3', de: 'a1', para: 'fantasma' })
    expect(lerDesenhoV2(d)?.setas.map((s) => s.id)).toEqual(['s1', 's2'])
  })
  it('forma repetida invalida o desenho', () => {
    const d = base()
    d.formas.push({ id: 'a1', tipo: 'userTask' })
    expect(lerDesenhoV2(d)).toBeNull()
  })
})
