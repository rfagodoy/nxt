import { describe, it, expect } from 'vitest'
import { validarOrigemDoRegistro, bloqueantes } from '../src/activation-guard'

const cria = { stepId: 'cad', stepName: 'Cadastrar contrato', screenRef: 't', screenSubject: 'CONTRATO', entityMode: 'CREATE' }
const consulta = { stepId: 'ver', stepName: 'Analisar situação fiscal', screenRef: 't', screenSubject: 'CONTRATO', entityMode: 'VIEW' }
const edita = { stepId: 'rev', stepName: 'Revisar', screenRef: 't', screenSubject: 'CONTRATO', entityMode: 'EDIT' }

describe('validarOrigemDoRegistro', () => {
  it('consulta sem ninguém antes que crie o contrato → aviso (não bloqueia)', () => {
    const ps = validarOrigemDoRegistro([{ from: 'start', to: 'ver' }, { from: 'ver', to: 'end' }], [consulta])
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ tipo: 'registro-sem-origem', severidade: 'aviso', nodeId: 'ver' })
    expect(ps[0].mensagem).toContain('consulta o contrato do processo')
    expect(bloqueantes(ps)).toEqual([])
  })

  it('com uma atividade que cria o contrato antes (mesmo passando por escolha) → nada', () => {
    const edges = [{ from: 'start', to: 'cad' }, { from: 'cad', to: 'gw' }, { from: 'gw', to: 'rev' }, { from: 'gw', to: 'end' }, { from: 'rev', to: 'end' }]
    expect(validarOrigemDoRegistro(edges, [cria, edita])).toEqual([])
  })

  it('quem cria vem DEPOIS → aviso', () => {
    const edges = [{ from: 'start', to: 'rev' }, { from: 'rev', to: 'cad' }, { from: 'cad', to: 'end' }]
    expect(validarOrigemDoRegistro(edges, [cria, edita]).map((p) => p.nodeId)).toEqual(['rev'])
  })

  it('criar PARCEIRO não serve de origem para editar CONTRATO', () => {
    const criaParceiro = { ...cria, screenSubject: 'FORNECEDOR' }
    const edges = [{ from: 'cad', to: 'rev' }]
    expect(validarOrigemDoRegistro(edges, [criaParceiro, edita])).toHaveLength(1)
  })

  it('ação automática cujo conector devolve contratoId serve de origem', () => {
    const acao = { stepId: 'auto', stepName: 'Aditivo', produz: ['contratoId', 'aditivoId'] }
    expect(validarOrigemDoRegistro([{ from: 'auto', to: 'ver' }], [acao, consulta])).toEqual([])
  })

  it('num laço a própria etapa não conta como origem', () => {
    const edges = [{ from: 'start', to: 'rev' }, { from: 'rev', to: 'rev' }]
    expect(validarOrigemDoRegistro(edges, [edita])).toHaveLength(1)
  })
})
