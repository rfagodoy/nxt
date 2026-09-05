import { describe, it, expect } from 'vitest'
import { nomeDaCopia } from './screen-policy'

describe('nomeDaCopia', () => {
  it('prefixa com "Cópia de"', () => {
    expect(nomeDaCopia('Dados do contrato', [])).toBe('Cópia de Dados do contrato')
  })

  it('numera quando o nome já está em uso', () => {
    expect(nomeDaCopia('Tela A', ['Cópia de Tela A'])).toBe('Cópia de Tela A (2)')
    expect(nomeDaCopia('Tela A', ['Cópia de Tela A', 'Cópia de Tela A (2)'])).toBe('Cópia de Tela A (3)')
  })

  it('duplicar uma cópia não empilha prefixo nem número', () => {
    expect(nomeDaCopia('Cópia de Tela A', ['Cópia de Tela A'])).toBe('Cópia de Tela A (2)')
    expect(nomeDaCopia('Cópia de Tela A (2)', ['Cópia de Tela A', 'Cópia de Tela A (2)'])).toBe('Cópia de Tela A (3)')
  })

  it('não devolve string vazia quando o nome é só o prefixo', () => {
    expect(nomeDaCopia('Cópia de ', [])).toBe('Cópia de Cópia de ')
  })
})
