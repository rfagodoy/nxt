import { describe, it, expect } from 'vitest'
import { parsePapeis } from './role-assignments.service'

/* O catálogo de papéis mora numa coluna de TEXTO com JSON dentro. O código antigo
   fazia cast direto para array — `.map` numa string estoura, e o erro só aparecia
   em runtime, sem mensagem útil. Estes testes fixam o contrato do leitor. */
describe('parsePapeis', () => {
  it('lê o catálogo guardado como texto JSON', () => {
    const json = '[{"id":"e_1","label":"Solicitante"},{"id":"e_2","label":"Executor cadastral"}]'
    expect(parsePapeis(json)).toEqual([
      { id: 'e_1', label: 'Solicitante' },
      { id: 'e_2', label: 'Executor cadastral' },
    ])
  })

  it('aceita o valor já em array (se a coluna virar Json um dia)', () => {
    const arr = [{ id: 'e_1', label: 'Solicitante' }]
    expect(parsePapeis(arr)).toEqual(arr)
  })

  it('devolve vazio em vez de estourar quando o catálogo é ilegível', () => {
    expect(parsePapeis('{isso não é json')).toEqual([])
    expect(parsePapeis('{"id":"x"}')).toEqual([]) // objeto, não lista
    expect(parsePapeis(null)).toEqual([])
    expect(parsePapeis(undefined)).toEqual([])
    expect(parsePapeis('')).toEqual([])
  })
})
