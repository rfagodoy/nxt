import { describe, it, expect } from 'vitest'
import { TEMAS, TEMA_PADRAO, baseDoTema, temaDoLegado, temaValido } from './temas'

describe('temas', () => {
  it('os oito temas escolhidos pelo PO, na ordem do menu', () => {
    expect(TEMAS.map((t) => t.nome)).toEqual(['Nxt-Claro', 'Nxt-Escuro', 'Porcelana', 'Oceano', 'Cerrado', 'Meia-noite', 'Grafite', 'Alto contraste'])
  })
  it('cada tema tem a base certa (o modo escuro do sistema segue a base)', () => {
    expect(TEMAS.filter((t) => t.base === 'light').map((t) => t.id)).toEqual(['nxt-claro', 'porcelana', 'oceano', 'cerrado'])
    expect(TEMAS.filter((t) => t.base === 'dark').map((t) => t.id)).toEqual(['nxt-escuro', 'meia-noite', 'grafite', 'alto-contraste'])
    expect(baseDoTema('meia-noite')).toBe('dark')
    expect(baseDoTema('porcelana')).toBe('light')
  })
  it('quem já usava claro/escuro continua no mesmo: vira Nxt-Claro / Nxt-Escuro', () => {
    expect(temaDoLegado('dark')).toBe('nxt-escuro')
    expect(temaDoLegado('light')).toBe('nxt-claro')
    expect(temaDoLegado(undefined)).toBe(TEMA_PADRAO)
    expect(TEMA_PADRAO).toBe('nxt-claro')
  })
  it('valor gravado desconhecido não vale', () => {
    expect(temaValido('grafite')).toBe(true)
    expect(temaValido('lavanda')).toBe(false)
    expect(temaValido(null)).toBe(false)
  })
})
