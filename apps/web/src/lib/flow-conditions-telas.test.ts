import { describe, it, expect } from 'vitest'
import { camposDaEscolha, camposDisponiveis, camposDasTelasDasAtividades } from './flow-conditions'

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

describe('camposDaEscolha — campos das atividades anteriores e do caminho', () => {
  const campo = (fieldKey: string, label: string, visible = true) => ({ id: `r_${fieldKey}`, fieldKey, label, type: 'select', source: 'CUSTOM', visible })
  const screens = [
    { id: 'analise', name: 'Validação cadastral', subjectType: 'CONTRATO', fields: [campo('sf_erros', 'Possui erros?')] },
    { id: 'contabil', name: 'Contábil', subjectType: 'CONTRATO', fields: [campo('sf_centro', 'Centro de custo')] },
    { id: 'irma', name: 'Outro caminho', subjectType: 'CONTRATO', fields: [campo('sf_irma', 'Campo da irmã')] },
    { id: 'oculta', name: 'Com campo oculto', subjectType: 'CONTRATO', fields: [campo('sf_oculto', 'Oculto', false)] },
  ]
  const telaDe = (screenRef: string) => ({ screenRef, screenSubject: 'CONTRATO' })
  const steps = { analisar: telaDe('analise'), corrigir: telaDe('irma'), oculta: telaDe('oculta') }
  const edges = [
    { from: 'oculta', to: 'analisar' }, { from: 'analisar', to: 'erros' }, { from: 'erros', to: 'corrigir' }, { from: 'erros', to: 'contabil' },
  ]
  const chaves = (doCaminho: Array<{ screenRef?: string; screenSubject?: string }>, arestas = edges) =>
    camposDaEscolha(doCaminho, steps, arestas, 'erros', screens).map((c) => c.key).filter((k) => k.includes('.sf_'))

  it('caminho cuja atividade não tem tela lista os campos da atividade anterior', () => {
    expect(chaves([{}])).toEqual(['contrato.sf_erros'])
  })
  it('lista juntos os campos do caminho e os das atividades anteriores', () => {
    expect(chaves([telaDe('contabil')]).sort()).toEqual(['contrato.sf_centro', 'contrato.sf_erros'])
  })
  it('atividade de outro caminho, que vem depois da escolha, não entra', () => {
    expect(chaves([telaDe('contabil')])).not.toContain('contrato.sf_irma')
  })
  it('campo oculto na tela da atividade anterior não entra', () => {
    expect(chaves([{}])).not.toContain('contrato.sf_oculto')
  })
  it('laço de correção: a atividade que volta conta como anterior, sem travar', () => {
    const comVolta = [...edges, { from: 'corrigir', to: 'analisar' }]
    expect(chaves([{}], comVolta).sort()).toEqual(['contrato.sf_erros', 'contrato.sf_irma'])
  })
  it('sem nenhuma tela antes nem no caminho, não há campos', () => {
    expect(camposDaEscolha([{}], {}, edges, 'erros', screens)).toEqual([])
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
