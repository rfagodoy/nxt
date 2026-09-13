import { describe, it, expect } from 'vitest'
import {
  blocosParaGrafo, grafoParaMotor, moverCaminho, lerFluxoBlocos, pendenciasDosBlocos, resumoDeInicio,
  startProcess, completeToken, makeCounterRuntime,
  type FluxoBlocos,
} from '../index'

const fluxo = (): FluxoBlocos => ({
  versao: 1, inicioId: 'start', fimId: 'end',
  itens: [
    { kind: 'atividade', id: 'cad', tipo: 'userTask', nome: 'Cadastrar' },
    {
      kind: 'escolha', id: 'valor', pergunta: 'Valor alto?',
      caminhos: [
        { id: 'c1', condition: 'valor > 100', itens: [{ kind: 'atividade', id: 'dir', tipo: 'userTask' }], fim: { tipo: 'segue' } },
        { id: 'c2', condition: 'valor > 50', itens: [], fim: { tipo: 'segue' } },
      ],
      casoContrario: { id: 'cc', itens: [{ kind: 'atividade', id: 'ger', tipo: 'userTask' }], fim: { tipo: 'segue' } },
    },
    {
      kind: 'paralelo', id: 'par', nome: 'Pareceres',
      caminhos: [
        { id: 'p1', itens: [{ kind: 'atividade', id: 'jur', tipo: 'userTask' }] },
        { id: 'p2', itens: [{ kind: 'atividade', id: 'fin', tipo: 'serviceTask' }] },
      ],
    },
  ],
})

describe('moverCaminho', () => {
  it('troca a ordem dos caminhos — e a ordem das saídas geradas acompanha', () => {
    const f = moverCaminho(fluxo(), 'valor', 'c2', -1)
    const escolha = f.itens[1] as Extract<FluxoBlocos['itens'][number], { kind: 'escolha' }>
    expect(escolha.caminhos.map((c) => c.id)).toEqual(['c2', 'c1'])
    const saidas = blocosParaGrafo(f).edges.filter((e) => e.from === 'valor')
    expect(saidas.map((e) => e.to)).toEqual(['valor__fim', 'dir', 'ger'])
    expect(saidas.at(-1)?.isDefault).toBe(true) // caso contrário continua por último
  })
  it('fora dos limites ou bloco inexistente não muda nada', () => {
    const f = fluxo()
    expect(moverCaminho(f, 'valor', 'c1', -1)).toBe(f)
    expect(moverCaminho(f, 'valor', 'c2', 1)).toBe(f)
    expect(moverCaminho(f, 'nao-existe', 'c1', 1)).toBe(f)
    expect(moverCaminho(f, 'cad', 'c1', 1)).toBe(f)
  })
  it('também reordena caminhos de um "ao mesmo tempo"', () => {
    const f = moverCaminho(fluxo(), 'par', 'p2', -1)
    const par = f.itens[2] as Extract<FluxoBlocos['itens'][number], { kind: 'paralelo' }>
    expect(par.caminhos.map((c) => c.id)).toEqual(['p2', 'p1'])
  })
})

describe('lerFluxoBlocos', () => {
  const json = () => JSON.parse(JSON.stringify(fluxo()))
  it('aceita o fluxo gravado pelo editor', () => {
    expect(lerFluxoBlocos(json())).not.toBeNull()
  })
  it('recusa id repetido (geraria dois nós com o mesmo id)', () => {
    const f = json(); f.itens[2].caminhos[0].itens[0].id = 'cad'
    expect(lerFluxoBlocos(f)).toBeNull()
  })
  it('recusa id com o sufixo reservado do reencontro', () => {
    const f = json(); f.itens[0].id = 'valor__fim'
    expect(lerFluxoBlocos(f)).toBeNull()
  })
  it('recusa id que não serve de elemento BPMN', () => {
    const f = json(); f.itens[0].id = 'a b<c>'
    expect(lerFluxoBlocos(f)).toBeNull()
  })
  it('recusa tipo desconhecido, volta sem destino e versão diferente', () => {
    const a = json(); a.itens[0].kind = 'losango'
    const b = json(); b.itens[1].caminhos[0].fim = { tipo: 'volta' }
    const c = json(); c.versao = 2
    const d = json(); d.itens[1].casoContrario = undefined
    expect(lerFluxoBlocos(a)).toBeNull()
    expect(lerFluxoBlocos(b)).toBeNull()
    expect(lerFluxoBlocos(c)).toBeNull()
    expect(lerFluxoBlocos(d)).toBeNull()
    expect(lerFluxoBlocos(null)).toBeNull()
    expect(lerFluxoBlocos('texto')).toBeNull()
  })
})

describe('ordem de avaliação no motor', () => {
  /* Executa de verdade: com valor 150 as DUAS condições são verdadeiras, então vence a que
     vem primeiro. Antes da correção o caminho vazio era testado por último mesmo em 1º. */
  const executar = (f: FluxoBlocos) => {
    const g = grafoParaMotor(blocosParaGrafo(f))
    const rt = makeCounterRuntime()
    let { state } = startProcess(g, { valor: 150 }, rt)
    const tok = state.tokens.find((t) => t.nodeId === 'cad')!
    state = completeToken(g, state, tok.id, {}, rt).state
    return state.tokens.map((t) => t.nodeId).sort()
  }
  it('caminho VAZIO em 1º lugar é testado primeiro', () => {
    expect(executar(moverCaminho(fluxo(), 'valor', 'c2', -1))).toEqual(['fin', 'jur'])
  })
  it('na ordem original vence o 1º caminho (diretoria)', () => {
    expect(executar(fluxo())).toEqual(['dir'])
  })
})

describe('pendenciasDosBlocos', () => {
  it('traduz os problemas do bloco para pendências de ativação apontando o bloco', () => {
    const f = fluxo()
    ;(f.itens[1] as { caminhos: Array<{ condition?: string }> }).caminhos[1].condition = ''
    const ps = pendenciasDosBlocos(f)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ tipo: 'caminho-sem-condicao', severidade: 'erro', nodeId: 'valor' })
  })
})

describe('prévia de início com fluxo em blocos', () => {
  it('o losango de reencontro não conta como decisão', () => {
    const r = resumoDeInicio(grafoParaMotor(blocosParaGrafo(fluxo())))
    expect(r.totais).toEqual({ atividades: 5, decisoes: 1 })
    expect(r.primeira?.id).toBe('cad')
    // o caminho vazio leva direto ao paralelo, então a prévia alcança as quatro
    expect([...r.proximas, ...r.frentes].map((e) => e.id).sort()).toEqual(['dir', 'fin', 'ger', 'jur'])
  })
})
