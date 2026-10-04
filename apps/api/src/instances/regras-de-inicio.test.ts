import { describe, expect, it } from 'vitest'
import type { QuemInicia } from '@nxt/types'
import { atendeRegra, parteForaDaRestricao, restricaoDeParte } from './regras-de-inicio'

/* Papéis: sol = Solicitante (PESSOA/UNIDADE), uc = Unidade contratante (stakeholder). */
const minhas = [
  { papelId: 'sol', entityType: 'UNIDADE', entityId: 'u1' },
  { papelId: 'sol', entityType: 'UNIDADE', entityId: 'u2' },
  { papelId: 'ger', entityType: 'UNIDADE', entityId: 'u9' },
]
const contrato = (unidade: string) => ({
  id: 'c1', numero: 'C1',
  partes: [{ papel: 'uc', ref_tipo: 'UNIDADE', ref_id: unidade, nome: `Unidade ${unidade}` }],
})
const rotulo = (id: string) => ({ sol: 'Solicitante', uc: 'Unidade contratante' } as Record<string, string>)[id] ?? id

describe('quem pode iniciar', () => {
  it('papel em qualquer entidade do tipo', () => {
    expect(atendeRegra({ papelId: 'sol', entityType: 'UNIDADE' }, minhas)).toBe(true)
    expect(atendeRegra({ papelId: 'dir', entityType: 'UNIDADE' }, minhas)).toBe(false)
  })

  it('entidade fixa', () => {
    expect(atendeRegra({ papelId: 'sol', entityType: 'UNIDADE', entityId: 'u2' }, minhas)).toBe(true)
    expect(atendeRegra({ papelId: 'sol', entityType: 'UNIDADE', entityId: 'u3' }, minhas)).toBe(false)
  })

  it('stakeholder: no Aditivo confere no contrato escolhido', () => {
    const r = { papelId: 'sol', entityType: 'UNIDADE', stakeholder: 'uc' }
    expect(atendeRegra(r, minhas, { contrato: contrato('u1'), nasceDeContrato: true, rotulo })).toBe(true)
    expect(atendeRegra(r, minhas, { contrato: contrato('u7'), nasceDeContrato: true, rotulo })).toBe(false)
    // contrato novo: basta ocupar o papel em alguma unidade
    expect(atendeRegra(r, minhas, { nasceDeContrato: false })).toBe(true)
  })
})

describe('parte restrita no contrato novo', () => {
  const cfg: QuemInicia = { modo: 'PAPEIS', regras: [{ papelId: 'sol', entityType: 'UNIDADE', stakeholder: 'uc' }] }

  it('restringe às unidades em que quem iniciou é Solicitante', () => {
    const r = restricaoDeParte(cfg, minhas)!
    expect(r).toEqual([{ papelId: 'sol', stakeholder: 'uc', ids: ['u1', 'u2'] }])
    expect(parteForaDaRestricao(r, contrato('u2').partes, rotulo)).toBeNull()
    expect(parteForaDaRestricao(r, contrato('u7').partes, rotulo)).toMatch(/Unidade contratante.*Solicitante.*Unidade u7/)
    expect(parteForaDaRestricao(r, [], rotulo)).toBeNull() // vazio é assunto do obrigatório
  })

  it('regra sem stakeholder atendida = sem restrição', () => {
    const aberto: QuemInicia = { modo: 'PAPEIS', regras: [...cfg.regras, { papelId: 'ger', entityType: 'UNIDADE' }] }
    expect(restricaoDeParte(aberto, minhas)).toBeNull()
    expect(restricaoDeParte({ modo: 'TODOS', regras: [] }, minhas)).toBeNull()
  })
})
