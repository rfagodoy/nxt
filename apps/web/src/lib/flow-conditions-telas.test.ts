import { describe, it, expect } from 'vitest'
import { camposDisponiveis, camposDasTelasDasAtividades } from './flow-conditions'

describe('camposDasTelasDasAtividades — campos do caminho vêm da tela da atividade dele', () => {
  const screens = [
    { id: 'consulta', name: 'Consulta aos dados', subjectType: 'CONTRATO', fields: [
      { id: 'r1', fieldKey: 'sf_patrimonio', label: 'Necessita de parecer do Patrimônio?', type: 'select', source: 'CUSTOM', visible: true, options: [{ label: 'Sim', value: 'Sim' }, { label: 'Não', value: 'Não' }] },
      { id: 'r2', fieldKey: 'sf_oculto', label: 'Campo oculto', type: 'select', source: 'CUSTOM', visible: false },
    ] },
    { id: 'aba', name: 'Aba extra', subjectType: 'CONTRATO', fields: [{ id: 'r3', fieldKey: 'sf_multa', label: 'Multa', type: 'number', source: 'CUSTOM' }] },
    { id: 'parceiro', name: 'Fornecedor', subjectType: 'FORNECEDOR', fields: [{ id: 'r4', fieldKey: 'sf_p', label: 'Campo do parceiro', type: 'text', source: 'CUSTOM' }] },
  ]

  it('tela de contrato da atividade: nativos + personalizados visíveis (com opções)', () => {
    const campos = camposDasTelasDasAtividades([{ screenRef: 'consulta', screenSubject: 'CONTRATO' }], screens)
    expect(campos.find((c) => c.key === 'contrato.sf_patrimonio')).toMatchObject({ tipo: 'selecao', origem: 'Consulta aos dados' })
    expect(campos.find((c) => c.key === 'contrato.sf_patrimonio')?.options).toHaveLength(2)
    expect(campos.some((c) => c.key === 'contrato.valorTotal')).toBe(true)
    expect(campos.some((c) => c.key === 'contrato.sf_oculto')).toBe(false)
  })

  it('as abas adicionais da atividade também contam', () => {
    const campos = camposDasTelasDasAtividades([{ screenRef: 'consulta', screenSubject: 'CONTRATO', extraScreens: [{ screenRef: 'aba' }] }], screens)
    expect(campos.some((c) => c.key === 'contrato.sf_multa')).toBe(true)
  })

  it('atividade sem tela, ou com tela de parceiro → nenhum campo', () => {
    expect(camposDasTelasDasAtividades([{}], screens)).toEqual([])
    expect(camposDasTelasDasAtividades([{ screenRef: 'parceiro', screenSubject: 'FORNECEDOR' }], screens)).toEqual([])
  })
})

describe('camposDisponiveis — telas adicionais da atividade', () => {
  const screens = [
    { id: 'principal', name: 'Dados do contrato', subjectType: 'CONTRATO', fields: [] },
    { id: 'extra', name: 'Pagamentos', subjectType: 'CONTRATO', fields: [{ id: 'row1', fieldKey: 'fld_multa', label: 'Multa', type: 'number', source: 'CUSTOM' }] },
  ]
  const edges = [{ from: 'rev', to: 'gw' }]

  it('o campo personalizado de uma aba adicional entra no vocabulário da escolha', () => {
    const nodes = [{ id: 'rev', type: 'userTask', step: { stepName: 'Revisar', screenRef: 'principal', screenSubject: 'CONTRATO', extraScreens: [{ screenRef: 'extra' }] } }]
    const campos = camposDisponiveis(nodes, edges, 'gw', screens)
    expect(campos.find((c) => c.key === 'contrato.fld_multa')).toMatchObject({ label: 'Multa', tipo: 'numero', origem: 'Pagamentos' })
  })

  it('sem a aba adicional, o campo não aparece', () => {
    const nodes = [{ id: 'rev', type: 'userTask', step: { stepName: 'Revisar', screenRef: 'principal', screenSubject: 'CONTRATO' } }]
    expect(camposDisponiveis(nodes, edges, 'gw', screens).some((c) => c.key === 'contrato.fld_multa')).toBe(false)
  })
})
