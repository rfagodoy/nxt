import { describe, it, expect } from 'vitest'
import { formatarCodigo, prefixoDoCodigo, proximoCodigo, usoDasTelas } from './screen-policy'

describe('código da tela', () => {
  it('prefixo pelo tipo: CTR, PAR (fornecedor/parceiro) e GEN para o resto', () => {
    expect(prefixoDoCodigo('CONTRATO')).toBe('TELA_CTR_')
    expect(prefixoDoCodigo('FORNECEDOR')).toBe('TELA_PAR_')
    expect(prefixoDoCodigo('GENERICA')).toBe('TELA_GEN_')
  })
  it('3 dígitos no mínimo, sem limite', () => {
    expect(formatarCodigo('CONTRATO', 7)).toBe('TELA_CTR_007')
    expect(formatarCodigo('CONTRATO', 1000)).toBe('TELA_CTR_1000')
  })
  it('próximo: maior do mesmo tipo + 1; outros tipos e lixo não contam; buraco não é reaproveitado', () => {
    expect(proximoCodigo('CONTRATO', [])).toBe('TELA_CTR_001')
    expect(proximoCodigo('CONTRATO', ['TELA_CTR_001', 'TELA_CTR_004', 'TELA_PAR_009', 'TELA_CTR_x'])).toBe('TELA_CTR_005')
    expect(proximoCodigo('FORNECEDOR', ['TELA_CTR_001', 'TELA_PAR_999'])).toBe('TELA_PAR_1000')
  })
})

describe('usoDasTelas', () => {
  const formSchema = (steps: unknown[]) => JSON.stringify({ steps })
  it('junta principal e adicionais por workflow, com as atividades; tela repetida na mesma atividade conta uma vez', () => {
    const uso = usoDasTelas([
      { id: 'w2', name: 'Solicitação', status: 'ACTIVE', formSchema: formSchema([
        { stepName: 'Preencher', screenRef: 't1', extraScreens: [{ screenRef: 't2' }, { screenRef: 't1' }] },
        { stepName: 'Analisar', screenRef: 't2' },
        { stepName: 'Aprovar' },
      ]) },
      { id: 'w1', name: 'Aditivo', status: 'DRAFT', formSchema: formSchema([{ stepName: '', screenRef: 't1' }]) },
      { id: 'w3', name: 'Quebrado', status: 'DRAFT', formSchema: '{' },
    ])
    expect(uso.t1).toEqual([
      { workflowId: 'w1', workflow: 'Aditivo', status: 'DRAFT', atividades: ['Atividade sem nome'] },
      { workflowId: 'w2', workflow: 'Solicitação', status: 'ACTIVE', atividades: ['Preencher'] },
    ])
    expect(uso.t2).toEqual([{ workflowId: 'w2', workflow: 'Solicitação', status: 'ACTIVE', atividades: ['Preencher', 'Analisar'] }])
    expect(uso.t3).toBeUndefined()
  })
  it('aceita o formSchema já desserializado (como o PrismaService entrega)', () => {
    const uso = usoDasTelas([{ id: 'w', name: 'W', status: 'ACTIVE', formSchema: { steps: [{ stepName: 'A', screenRef: 't9' }] } }])
    expect(uso.t9?.[0].atividades).toEqual(['A'])
  })
})
