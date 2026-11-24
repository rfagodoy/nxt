import { describe, it, expect } from 'vitest'
import { aplicarEstado, estadoDoCampo } from './estado-do-campo'
import type { ScreenField } from '@/lib/screen-types'

const campo = (p: Partial<ScreenField> = {}): ScreenField =>
  ({ id: 'f', name: 'f', label: 'F', type: 'text', source: 'CUSTOM', visible: true, required: false, order: 0, ...p }) as ScreenField

describe('estadoDoCampo', () => {
  it('lê as três marcas como um estado', () => {
    expect(estadoDoCampo(false, true, true)).toBe('OCULTO')
    expect(estadoDoCampo(true, true, false)).toBe('LEITURA')
    expect(estadoDoCampo(true, true, true)).toBe('LEITURA')
    expect(estadoDoCampo(true, false, false)).toBe('EDITAVEL')
    expect(estadoDoCampo(true, false, true)).toBe('OBRIGATORIO')
  })
})

describe('aplicarEstado (telas que não são de Parceiro)', () => {
  const ctx = { aceitaObrigatorio: true }
  it('obrigatório: aparece, destravado e exigido', () => {
    expect(aplicarEstado(campo({ visible: false, locked: true }), 'OBRIGATORIO', ctx)).toMatchObject({ visible: true, locked: false, required: true })
  })
  it('só leitura: trava e deixa de exigir', () => {
    expect(aplicarEstado(campo({ required: true }), 'LEITURA', ctx)).toMatchObject({ visible: true, locked: true, required: false })
  })
  it('editável: destrava e não exige', () => {
    expect(aplicarEstado(campo({ required: true, locked: true }), 'EDITAVEL', ctx)).toMatchObject({ visible: true, locked: false, required: false })
  })
  it('oculto: só esconde; mostrar de novo devolve trava e obrigatório', () => {
    expect(aplicarEstado(campo({ required: true, locked: false }), 'OCULTO', ctx)).toMatchObject({ visible: false, required: true, locked: false })
  })
  it('campo cujo obrigatório é do sistema: o required não muda', () => {
    expect(aplicarEstado(campo({ required: true }), 'EDITAVEL', { aceitaObrigatorio: false })).toMatchObject({ required: true, locked: false })
  })
})

describe('aplicarEstado (Parceiro: visível e obrigatório por categoria)', () => {
  const parceiro = { cat: 'PJ_BR' as const, todas: ['PJ_BR', 'PF_BR', 'PJ_EX'] as never }
  it('oculto só na categoria em edição', () => {
    const g = aplicarEstado(campo({ hiddenCategories: ['PF_BR'] }), 'OCULTO', { aceitaObrigatorio: true, parceiro })
    expect(g.visible).toBe(true)
    expect([...(g.hiddenCategories ?? [])].sort()).toEqual(['PF_BR', 'PJ_BR'])
  })
  it('obrigatório só na categoria em edição; o antigo "obrigatório em todas" vira a lista', () => {
    const g = aplicarEstado(campo({ required: true }), 'EDITAVEL', { aceitaObrigatorio: true, parceiro })
    expect([...(g.requiredCategories ?? [])].sort()).toEqual(['PF_BR', 'PJ_EX'])
    expect(g.required).toBe(true)
  })
})
