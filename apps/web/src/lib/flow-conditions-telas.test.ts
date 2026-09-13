import { describe, it, expect } from 'vitest'
import { camposDisponiveis } from './flow-conditions'

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
