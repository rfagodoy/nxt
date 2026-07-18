import { describe, it, expect } from 'vitest'
import { evalCondition, parseCondition, ConditionError } from '../src/conditions'

describe('evalCondition', () => {
  it('vazia = true (fluxo livre)', () => {
    expect(evalCondition('', {})).toBe(true)
    expect(evalCondition(undefined, {})).toBe(true)
    expect(evalCondition('   ', {})).toBe(true)
  })

  it('comparações numéricas', () => {
    expect(evalCondition('valor > 100000', { valor: 150000 })).toBe(true)
    expect(evalCondition('valor > 100000', { valor: 50000 })).toBe(false)
    expect(evalCondition('valor >= 100', { valor: 100 })).toBe(true)
    expect(evalCondition('valor < 10', { valor: 10 })).toBe(false)
    expect(evalCondition('valor <= 10', { valor: 10 })).toBe(true)
  })

  it('número↔string permissivo (valor vem do form como texto)', () => {
    expect(evalCondition('valor > 100000', { valor: '150000' })).toBe(true)
    expect(evalCondition("valor == 100", { valor: '100' })).toBe(true)
  })

  it('igualdade de string', () => {
    expect(evalCondition("tipo == 'aditivo'", { tipo: 'aditivo' })).toBe(true)
    expect(evalCondition("tipo == 'aditivo'", { tipo: 'distrato' })).toBe(false)
    expect(evalCondition("tipo != 'aditivo'", { tipo: 'distrato' })).toBe(true)
  })

  it('booleanos e negação', () => {
    expect(evalCondition('aprovado', { aprovado: true })).toBe(true)
    expect(evalCondition('!aprovado', { aprovado: false })).toBe(true)
    expect(evalCondition('aprovado == true', { aprovado: true })).toBe(true)
  })

  it('&& || com precedência e curto-circuito', () => {
    expect(evalCondition("valor > 100000 && tipo == 'aditivo'", { valor: 150000, tipo: 'aditivo' })).toBe(true)
    expect(evalCondition("valor > 100000 && tipo == 'aditivo'", { valor: 150000, tipo: 'x' })).toBe(false)
    expect(evalCondition('a || b', { a: false, b: true })).toBe(true)
    // curto-circuito: b indefinido não quebra
    expect(evalCondition('a || b > 5', { a: true })).toBe(true)
  })

  it('parênteses mudam a precedência', () => {
    expect(evalCondition('(a || b) && c', { a: true, b: false, c: false })).toBe(false)
    expect(evalCondition('a || b && c', { a: true, b: false, c: false })).toBe(true)
  })

  it('caminho por ponto', () => {
    expect(evalCondition('contrato.valor > 100', { contrato: { valor: 200 } })).toBe(true)
    expect(evalCondition('a.b.c == 1', { a: { b: { c: 1 } } })).toBe(true)
    // caminho inexistente = undefined, não quebra
    expect(evalCondition('a.b.c == 1', {})).toBe(false)
  })

  it('aritmética', () => {
    expect(evalCondition('a + b > 10', { a: 6, b: 5 })).toBe(true)
    expect(evalCondition('a * 2 == 10', { a: 5 })).toBe(true)
  })

  it('string vazia e "false" são falsy', () => {
    expect(evalCondition('nome', { nome: '' })).toBe(false)
    expect(evalCondition('flag', { flag: 'false' })).toBe(false)
    expect(evalCondition('nome', { nome: 'Rafael' })).toBe(true)
  })

  it('sintaxe inválida lança ConditionError', () => {
    expect(() => parseCondition('valor >')).toThrow(ConditionError)
    expect(() => parseCondition('(a || b')).toThrow(ConditionError)
    expect(() => parseCondition("'sem fim")).toThrow(ConditionError)
    expect(() => parseCondition('a b c')).toThrow(ConditionError)
  })
})
