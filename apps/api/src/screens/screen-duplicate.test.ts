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

  it('NÃO come o sufixo de um nome que o usuário escolheu', () => {
    // "Contrato (2)" é nome legítimo: cortar virava "Cópia de Contrato", que já não diz
    // de qual original a cópia veio.
    expect(nomeDaCopia('Contrato (2)', [])).toBe('Cópia de Contrato (2)')
    expect(nomeDaCopia('Aditivo (12)', [])).toBe('Cópia de Aditivo (12)')
  })

  it('distingue duas telas cujo nome só difere pelo sufixo', () => {
    const usados = ['Cópia de Contrato (1)']
    expect(nomeDaCopia('Contrato (1)', usados)).toBe('Cópia de Contrato (1) (2)')
    expect(nomeDaCopia('Contrato (2)', usados)).toBe('Cópia de Contrato (2)')
  })
})
