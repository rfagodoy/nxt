import { describe, expect, it } from 'vitest'
import { acaoDaGravacao, buildNativeSeed, faltantesDaGravacao, fraseDosFaltantes, reconcileNative, type Screen, type ScreenField } from '../index'

const telaContrato = (custom: Partial<ScreenField>[] = []): Screen => {
  const seed = buildNativeSeed('CONTRATO')
  return reconcileNative({
    id: 't', name: 'T', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: true, sections: seed.sections,
    fields: [...seed.fields, ...custom.map((c, i) => ({
      id: `c${i}`, fieldKey: c.fieldKey, sectionId: seed.sections[0].id, name: 'x', label: c.label ?? 'X', type: 'text',
      source: 'CUSTOM', mode: 'EDIT', visible: true, required: !!c.required, locked: !!c.locked, order: 50,
    } as ScreenField))],
  })
}

describe('qual ação a gravação representa', () => {
  it('contrato', () => {
    expect(acaoDaGravacao('CONTRATO', null, { situacao: 'EM_CADASTRO' })).toBe('rascunho')
    expect(acaoDaGravacao('CONTRATO', null, { situacao: 'VIGENTE' })).toBe('ativar')
    expect(acaoDaGravacao('CONTRATO', { situacao: 'EM_CADASTRO' }, { situacao: 'VIGENTE' })).toBe('ativar')
    expect(acaoDaGravacao('CONTRATO', { situacao: 'EM_CADASTRO' }, { titulo: 'x' })).toBe('rascunho')
    expect(acaoDaGravacao('CONTRATO', { situacao: 'VIGENTE' }, { titulo: 'x' })).toBeNull()
    expect(acaoDaGravacao('CONTRATO', { situacao: 'VIGENTE' }, { situacao: 'ENCERRADO' })).toBeNull()
  })
  it('parceiro', () => {
    expect(acaoDaGravacao('FORNECEDOR', null, { status: 'ATIVO' })).toBe('ativar')
    expect(acaoDaGravacao('FORNECEDOR', null, {})).toBe('rascunho')
    expect(acaoDaGravacao('FORNECEDOR', { status: 'INATIVO' }, { status: 'ATIVO' })).toBe('ativar')
    expect(acaoDaGravacao('FORNECEDOR', { status: 'ATIVO' }, { status: 'ATIVO', razaoSocial: 'x' })).toBe('rascunho')
    expect(acaoDaGravacao('FORNECEDOR', { status: 'ATIVO' }, { status: 'INATIVO' })).toBeNull()
  })
})

describe('obrigatórios na gravação', () => {
  const rascunho = { numero: 'C-1', titulo: 'T', situacao: 'EM_CADASTRO', partes: [] }

  it('ativar cobra o que o contrato precisa para valer, inclusive personalizado obrigatório', () => {
    const r = faltantesDaGravacao({
      subject: 'CONTRATO', screen: telaContrato([{ fieldKey: 'cc', label: 'Centro de custo', required: true }]),
      antes: rascunho, depois: { situacao: 'VIGENTE' }, customAntes: {},
    })
    expect(r.map(x => x.campo)).toEqual(['Tipo de contrato', 'Início da vigência', 'Ao menos uma parte', 'Valor total do contrato', 'Centro de custo'])
    expect(fraseDosFaltantes(r, 'ativar')).toMatch(/^Para ativar, preencha: “Tipo de contrato”/)
  })

  it('personalizado gravado antes conta; travado obrigatório não é cobrado', () => {
    const r = faltantesDaGravacao({
      subject: 'CONTRATO', screen: telaContrato([{ fieldKey: 'cc', required: true }, { fieldKey: 'tr', required: true, locked: true }]),
      antes: { ...rascunho, tipo: 'S', inicioVigencia: '2026-01-01', valorTotal: 10, partes: [{ nome: 'ACME' }] },
      depois: { situacao: 'VIGENTE' }, customAntes: { cc: 'X' },
    })
    expect(r).toEqual([])
  })

  it('rascunho só exige identificar; numeração automática não cobra número', () => {
    expect(faltantesDaGravacao({ subject: 'CONTRATO', screen: null, antes: null, depois: { situacao: 'EM_CADASTRO', titulo: '' } }).map(x => x.campo))
      .toEqual(['Número', 'Título'])
    expect(faltantesDaGravacao({ subject: 'CONTRATO', screen: null, antes: null, autoNumero: true, depois: { situacao: 'EM_CADASTRO', titulo: 'T' } }))
      .toEqual([])
  })

  it('contrato vigente salvo (aditivo, baixa) não é cobrado', () => {
    expect(faltantesDaGravacao({ subject: 'CONTRATO', screen: null, antes: { situacao: 'VIGENTE' }, depois: { titulo: '' } })).toEqual([])
  })

  it('parceiro: ativar PJ BR cobra documento e endereço do primeiro', () => {
    const r = faltantesDaGravacao({
      subject: 'FORNECEDOR', screen: null, antes: null,
      depois: { categoria: 'PJ_BR', status: 'ATIVO', razaoSocial: 'ACME', enderecos: [{ cep: '01000-000', estado: 'SP', logradouro: 'Rua', numero: '1', bairro: 'Centro' }] },
    })
    expect(r.map(x => x.campo)).toEqual(['CNPJ', 'Cidade'])
  })
})
