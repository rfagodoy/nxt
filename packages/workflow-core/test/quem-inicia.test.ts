import { describe, it, expect } from 'vitest'
import { validarQuemInicia, type PapelDoCatalogo } from '../index'

const PAPEIS: PapelDoCatalogo[] = [
  { id: 'sol', label: 'Solicitante', referencia: 'PESSOA', origem: 'UNIDADE' },
  { id: '3', label: 'Unidade contratante', referencia: 'ENTIDADE', origem: 'UNIDADE' },
  { id: '1', label: 'Contratante', referencia: 'ENTIDADE', origem: 'EMPRESA_PARCEIRO' },
]

describe('validarQuemInicia', () => {
  it('restrito sem regra → erro', () => {
    expect(validarQuemInicia({ modo: 'PAPEIS', regras: [] }, PAPEIS).map((p) => p.tipo)).toEqual(['quem-inicia-vazio'])
  })
  it('Solicitante da Unidade contratante num workflow de contrato → ok', () => {
    expect(validarQuemInicia({ modo: 'PAPEIS', regras: [{ papelId: 'sol', entityType: 'UNIDADE', stakeholder: '3' }] }, PAPEIS, { kind: 'CONTRATO' })).toEqual([])
  })
  it('stakeholder que não combina, papel de entidade, ou sem contrato → erro', () => {
    const tipos = (r: { papelId: string; entityType: string; stakeholder?: string }, kind = 'ADITIVO') =>
      validarQuemInicia({ modo: 'PAPEIS', regras: [r] }, PAPEIS, { kind }).map((p) => p.tipo)
    expect(tipos({ papelId: 'sol', entityType: 'UNIDADE', stakeholder: '1' })).toEqual(['quem-inicia-invalido'])
    expect(tipos({ papelId: '3', entityType: 'UNIDADE' })).toEqual(['quem-inicia-invalido'])
    expect(tipos({ papelId: 'sol', entityType: 'UNIDADE', stakeholder: '3' }, 'PARCEIRO')).toEqual(['quem-inicia-invalido'])
    // "do contrato" num contrato novo: ninguém ocupa o papel ainda
    const PC = [...PAPEIS, { id: 'gc', label: 'Gestor do contrato', referencia: 'PESSOA', origem: 'CONTRATO' }]
    expect(validarQuemInicia({ modo: 'PAPEIS', regras: [{ papelId: 'gc', entityType: 'CONTRATO', stakeholder: '@contrato' }] }, PC, { kind: 'CONTRATO' }).map((p) => p.tipo)).toEqual(['quem-inicia-invalido'])
    expect(validarQuemInicia({ modo: 'PAPEIS', regras: [{ papelId: 'gc', entityType: 'CONTRATO', stakeholder: '@contrato' }] }, PC, { kind: 'ADITIVO' })).toEqual([])
  })
  it('1ª atividade de "Quem iniciou" com início aberto → só AVISO', () => {
    const r = validarQuemInicia(undefined, PAPEIS, { primeiraAtividade: { stepId: 'a', stepName: 'Preencher', executor: { papelId: '@iniciador' } } })
    expect(r.map((p) => [p.tipo, p.severidade])).toEqual([['iniciador-sem-regra', 'aviso']])
  })
})
