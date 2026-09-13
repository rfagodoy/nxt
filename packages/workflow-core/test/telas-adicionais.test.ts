import { describe, it, expect } from 'vitest'
import { validarTelasDasAtividades } from '../src/activation-guard'

const telas = [
  { id: 'dados', name: 'Dados do contrato', readOnly: false },
  { id: 'pagtos', name: 'Pagamentos (consulta)', readOnly: true },
]

describe('validarTelasDasAtividades — telas adicionais', () => {
  it('aba adicional para EDITAR numa tela somente consulta é pendência, dizendo qual aba', () => {
    const ps = validarTelasDasAtividades([
      { stepId: 'rev', stepName: 'Revisar contrato', screenRef: 'dados', entityMode: 'EDIT', extraScreens: [{ screenRef: 'pagtos', mode: 'EDIT' }] },
    ], telas)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ tipo: 'tela-so-consulta', nodeId: 'rev' })
    expect(ps[0].mensagem).toContain('"Pagamentos (consulta)"')
    expect(ps[0].mensagem).toContain('Consultar')
  })

  it('aba adicional de CONSULTA numa tela somente consulta é o par certo', () => {
    expect(validarTelasDasAtividades([
      { stepId: 'rev', screenRef: 'dados', entityMode: 'EDIT', extraScreens: [{ screenRef: 'pagtos', mode: 'VIEW' }] },
    ], telas)).toEqual([])
  })

  it('atividade de CONSULTA não cobra nada das abas (todas abrem em leitura)', () => {
    expect(validarTelasDasAtividades([
      { stepId: 'ver', screenRef: 'pagtos', entityMode: 'VIEW', extraScreens: [{ screenRef: 'pagtos', mode: 'EDIT' }] },
    ], telas)).toEqual([])
  })

  it('principal somente consulta continua sendo cobrada, e as abas também', () => {
    const ps = validarTelasDasAtividades([
      { stepId: 'cad', screenRef: 'pagtos', entityMode: 'CREATE', extraScreens: [{ screenRef: 'pagtos', mode: 'EDIT' }] },
    ], telas)
    expect(ps).toHaveLength(2)
  })
})
