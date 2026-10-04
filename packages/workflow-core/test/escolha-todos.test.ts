import { describe, it, expect } from 'vitest'
import {
  blocosParaGrafo, grafoParaMotor, generateBpmn, compileBpmn, validarBlocos, lerFluxoBlocos,
  startProcess, completeToken, returnToken, makeCounterRuntime, WfSemCaminho, temSenaoAntigo,
  type FluxoBlocos, type WfState, type WfGraph,
} from '../index'

/* "Quem precisa analisar?" — todos os que servirem; depois, "Assinar". */
const fluxo = (senao: FluxoBlocos['itens'] = [], extra: Partial<FluxoBlocos['itens'][number]> = {}): FluxoBlocos => ({
  versao: 1, inicioId: 'start', fimId: 'end',
  itens: [
    { kind: 'atividade', id: 'preencher', tipo: 'userTask', nome: 'Preencher' },
    {
      kind: 'escolha', id: 'quem', pergunta: 'Quem analisa?', modo: 'todos',
      caminhos: [
        { id: 'c_valor', condition: 'valor > 100000', itens: [{ kind: 'atividade', id: 'diretoria', tipo: 'userTask' }], fim: { tipo: 'segue' } },
        { id: 'c_mo', condition: 'maoDeObra == true', itens: [{ kind: 'atividade', id: 'juridico', tipo: 'userTask' }], fim: { tipo: 'segue' } },
      ],
      casoContrario: { id: 'c_senao', itens: senao, fim: { tipo: 'segue' } },
      ...extra,
    } as FluxoBlocos['itens'][number],
    { kind: 'atividade', id: 'assinar', tipo: 'userTask', nome: 'Assinar' },
  ],
})

const grafo = (f: FluxoBlocos): WfGraph => grafoParaMotor(blocosParaGrafo(f))
const ondeEsta = (s: WfState) => s.tokens.map((t) => t.nodeId).sort()
const concluir = (g: WfGraph, s: WfState, nodeId: string, data: Record<string, unknown> = {}) => {
  const t = s.tokens.find((x) => x.nodeId === nodeId)!
  return completeToken(g, s, t.id, data, makeCounterRuntime('c')).state
}
/** do início até depois de "Preencher", com as variáveis dadas */
const ateAEscolha = (g: WfGraph, vars: Record<string, unknown>) => {
  const s = startProcess(g, {}, makeCounterRuntime()).state
  return concluir(g, s, 'preencher', vars)
}

describe('escolha "todos os que servirem"', () => {
  const g = grafo(fluxo())

  it('dois filtros verdadeiros → os dois acontecem juntos e o processo espera os dois', () => {
    let s = ateAEscolha(g, { valor: 150000, maoDeObra: true })
    expect(ondeEsta(s)).toEqual(['diretoria', 'juridico'])
    s = concluir(g, s, 'juridico')
    expect(ondeEsta(s)).toEqual(['diretoria'])           // ainda espera a diretoria
    s = concluir(g, s, 'diretoria')
    expect(ondeEsta(s)).toEqual(['assinar'])
  })

  it('um filtro verdadeiro → só ele, e segue ao terminar', () => {
    let s = ateAEscolha(g, { valor: 50000, maoDeObra: true })
    expect(ondeEsta(s)).toEqual(['juridico'])
    s = concluir(g, s, 'juridico')
    expect(ondeEsta(s)).toEqual(['assinar'])
  })

  it('nenhum filtro (sem Senão) → o processo PARA com erro próprio, que diz qual escolha', () => {
    expect(() => ateAEscolha(g, { valor: 50000, maoDeObra: false })).toThrow(WfSemCaminho)
    expect(() => ateAEscolha(g, { valor: 50000, maoDeObra: false })).toThrow("“Quem analisa?”")
  })

  it('nenhum filtro com Senão → vai pelo Senão', () => {
    const g2 = grafo(fluxo([{ kind: 'atividade', id: 'revisao', tipo: 'userTask' }]))
    let s = ateAEscolha(g2, { valor: 1, maoDeObra: false })
    expect(ondeEsta(s)).toEqual(['revisao'])
    s = concluir(g2, s, 'revisao')
    expect(ondeEsta(s)).toEqual(['assinar'])
  })

  it('sobrevive à ida e volta pelo BPMN (a ativação compila o XML gerado)', () => {
    const g3 = compileBpmn(generateBpmn(g))
    expect(g3.nodes['quem'].type).toBe('inclusiveGateway')
    let s = ateAEscolha(g3, { valor: 150000, maoDeObra: true })
    s = concluir(g3, s, 'diretoria')
    s = concluir(g3, s, 'juridico')
    expect(ondeEsta(s)).toEqual(['assinar'])
  })

  it('devolver de um caminho para antes da escolha cancela o irmão e zera a espera', () => {
    let s = ateAEscolha(g, { valor: 150000, maoDeObra: true })
    const tok = s.tokens.find((t) => t.nodeId === 'juridico')!
    const r = returnToken(g, s, tok.id, 'preencher', makeCounterRuntime('r'))
    expect(r.effects.filter((e) => e.kind === 'cancelTask')).toHaveLength(2)
    s = r.state
    expect(ondeEsta(s)).toEqual(['preencher'])
    s = concluir(g, s, 'preencher', { valor: 1, maoDeObra: true })   // agora só o jurídico serve
    s = concluir(g, s, 'juridico')
    expect(ondeEsta(s)).toEqual(['assinar'])
  })

  it('"o primeiro que servir" continua como sempre (só um caminho)', () => {
    const g4 = grafo(fluxo([], { modo: 'primeiro' }))
    expect(g4.nodes['quem'].type).toBe('exclusiveGateway')
    const s = ateAEscolha(g4, { valor: 150000, maoDeObra: true })
    expect(ondeEsta(s)).toEqual(['diretoria'])
  })
})

describe('validação e leitura', () => {
  it('em "todos", caminho com filtro que encerra ou volta é erro; o Senão pode', () => {
    const f = fluxo()
    const esc = f.itens[1] as Extract<FluxoBlocos['itens'][number], { kind: 'escolha' }>
    esc.caminhos[0].fim = { tipo: 'encerra' }
    esc.casoContrario.fim = { tipo: 'volta', alvoId: 'preencher' }
    const tipos = validarBlocos(f).map((p) => p.tipo)
    expect(tipos.filter((t) => t === 'todos-com-saida')).toHaveLength(1)
    expect(tipos).not.toContain('volta-invalida')
  })
  it('lerFluxoBlocos aceita o modo e recusa modo desconhecido', () => {
    expect(lerFluxoBlocos(JSON.parse(JSON.stringify(fluxo())))).not.toBeNull()
    expect(lerFluxoBlocos(JSON.parse(JSON.stringify(fluxo([], { modo: 'alguns' } as never))))).toBeNull()
  })
})
