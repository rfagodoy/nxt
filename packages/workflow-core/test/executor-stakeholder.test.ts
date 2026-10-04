import { describe, expect, it } from 'vitest'
import { validarExecutores, validarOrigemDoRegistro, stakeholderCombina, formatarProblemas, type PapelDoCatalogo } from '../index'

const PAPEIS: PapelDoCatalogo[] = [
  { id: 'sol', label: 'Solicitante', referencia: 'PESSOA', origem: 'UNIDADE' },
  { id: 'dir', label: 'Diretor financeiro', referencia: 'PESSOA', origem: 'EMPRESA' },
  { id: 'ges', label: 'Gestor do contrato', referencia: 'PESSOA', origem: 'CONTRATO' },
  { id: '1', label: 'Contratante', referencia: 'ENTIDADE', origem: 'EMPRESA_PARCEIRO' },
  { id: '3', label: 'Unidade contratante', referencia: 'ENTIDADE', origem: 'UNIDADE' },
]
const solicitanteDaUC = { papelId: 'sol', entityType: 'UNIDADE', mode: 'VARIAVEL', stakeholder: '3' }
const edges = [{ from: 'cria', to: 'aprova' }]

describe('combinação papel × stakeholder', () => {
  it.each([
    ['UNIDADE', '3', true], ['UNIDADE', '1', false],
    ['EMPRESA', '1', true], ['EMPRESA', '3', false],
    ['CONTRATO', '@contrato', true], ['UNIDADE', '@contrato', false],
    ['UNIDADE', 'sol', false], // papel de PESSOA não é stakeholder
  ])('%s + %s → %s', (tipo, st, ok) => expect(stakeholderCombina(tipo, st, PAPEIS)).toBe(ok))
})

describe('validarExecutores', () => {
  it('Aditivo/Encerramento: o contrato vem da partida → passa', () => {
    expect(validarExecutores([], [{ stepId: 'aprova', stepName: 'Aprovar', executor: solicitanteDaUC }], PAPEIS, ['contratoId'])).toEqual([])
  })
  it('Novo contrato: passa quando uma atividade antes cria o contrato', () => {
    const steps = [
      { stepId: 'cria', screenRef: 't', screenSubject: 'CONTRATO', entityMode: 'CREATE' },
      { stepId: 'aprova', stepName: 'Aprovar', executor: solicitanteDaUC },
    ]
    expect(validarExecutores(edges, steps, PAPEIS)).toEqual([])
  })
  it('sem contrato até ali → erro que diz o que fazer', () => {
    const r = validarExecutores([], [{ stepId: 'aprova', stepName: 'Aprovar', executor: solicitanteDaUC }], PAPEIS)
    expect(r.map(p => p.tipo)).toEqual(['executor-sem-contrato'])
    expect(formatarProblemas(r)).toMatch(/ainda não tem contrato/)
  })
  it('"da variável" sem stakeholder → erro', () => {
    const r = validarExecutores([], [{ stepId: 'a', executor: { papelId: 'sol', entityType: 'UNIDADE', mode: 'VARIAVEL' } }], PAPEIS, ['contratoId'])
    expect(r.map(p => p.tipo)).toEqual(['executor-sem-stakeholder'])
  })
  it('combinação que nunca acharia ninguém → erro com os dois nomes', () => {
    const r = validarExecutores([], [{ stepId: 'a', stepName: 'Aprovar', executor: { ...solicitanteDaUC, stakeholder: '1' } }], PAPEIS, ['contratoId'])
    expect(r[0].mensagem).toContain('"Solicitante" na parte "Contratante"')
  })
  it('variável técnica antiga e entidade fixa não são acusadas', () => {
    const r = validarExecutores([], [
      { stepId: 'a', executor: { papelId: 'sol', entityType: 'UNIDADE', mode: 'VARIAVEL', entityVar: 'unidadeId' } },
      { stepId: 'b', executor: { papelId: 'sol', entityType: 'UNIDADE', mode: 'FIXA', entityId: 'u1' } },
    ], PAPEIS)
    expect(r).toEqual([])
  })
})

describe('registro do processo vindo da partida', () => {
  it('Aditivo: editar o contrato sem etapa que o crie não é mais acusado', () => {
    const s = [{ stepId: 'e', stepName: 'Editar', screenRef: 't', screenSubject: 'CONTRATO', entityMode: 'EDIT' }]
    expect(validarOrigemDoRegistro([], s)).toHaveLength(1)
    expect(validarOrigemDoRegistro([], s, ['contratoId'])).toEqual([])
  })
})
