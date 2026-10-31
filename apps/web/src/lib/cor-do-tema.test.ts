import { describe, it, expect } from 'vitest'
import { comAlfa, paraCor, paraHex, misturarHex } from './cor-do-tema'

describe('paraCor (valor de variável CSS → cor usável em canvas/HTML)', () => {
  it('trinca RGB das escalas do tema', () => {
    expect(paraCor('12 20 16')).toBe('rgb(12 20 16)')
  })
  it('trinca HSL dos tokens do shadcn', () => {
    expect(paraCor('154 76% 35%')).toBe('hsl(154 76% 35%)')
  })
  it('cor já pronta passa direto (hex, rgb())', () => {
    expect(paraCor('#18C07A')).toBe('#18C07A')
    expect(paraCor(' rgb(1 2 3 / 0.5) ')).toBe('rgb(1 2 3 / 0.5)')
  })
  it('vazio cai no reserva', () => {
    expect(paraCor('', '#000')).toBe('#000')
  })
})

describe('comAlfa', () => {
  it('rgb e hsl ganham transparência', () => {
    expect(comAlfa('rgb(12 20 16)', 0.12)).toBe('rgb(12 20 16 / 0.12)')
    expect(comAlfa('hsl(154 76% 35%)', 0.5)).toBe('hsl(154 76% 35% / 0.5)')
  })
  it('hex vira rgb com transparência', () => {
    expect(comAlfa('#18C07A', 0.5)).toBe('rgb(24 192 122 / 0.5)')
  })
})

describe('paraHex (Excel pede #RRGGBB)', () => {
  it('hex, rgb() e hsl() viram hex', () => {
    expect(paraHex('#18c07a')).toBe('#18C07A')
    expect(paraHex('rgb(12 20 16)')).toBe('#0C1410')
    expect(paraHex('hsl(154 76% 35%)')).toBe('#159D62')
  })
  it('o que não entende cai no reserva', () => {
    expect(paraHex('var(--x)', '#000000')).toBe('#000000')
  })
})

describe('misturarHex', () => {
  it('mistura com o branco para um fundo suave', () => {
    expect(misturarHex('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })
})
