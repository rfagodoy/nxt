import { describe, it, expect } from 'vitest'
import type { WfEffect, WfState } from '../src/types'
import { startProcess, completeToken, makeCounterRuntime } from '../src/interpreter'
import { generateBpmn } from '../src/generate'
import { compileBpmn } from '../src/compile'
import { validarDesenho, validarDecisoes, bloqueantes } from '../src/activation-guard'
import {
  blocosParaGrafo, grafoParaMotor, grafoParaBlocos, validarBlocos, destinosDeVolta, listarAtividades,
  inserirItem, removerItem, moverItem, adicionarCaminho, removerCaminho, atualizarCaminho, novoFluxo,
  SUFIXO_REENCONTRO,
  type FluxoBlocos, type ItemAtividade, type ItemFluxo,
} from '../src/blocos'

const at = (id: string, tipo: ItemAtividade['tipo'] = 'userTask'): ItemAtividade => ({ kind: 'atividade', id, tipo, nome: id })
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })

/** O processo de exemplo do mockup: cadastrar → escolha por valor → pareceres ao mesmo tempo → assinatura. */
const exemplo = () => fluxo([
  at('cadastrar'),
  {
    kind: 'escolha', id: 'valor', pergunta: 'Passa de R$ 100 mil?',
    caminhos: [{ id: 'c-alto', condition: 'valor > 100000', itens: [at('diretoria')], fim: { tipo: 'segue' } }],
    casoContrario: { id: 'c-padrao', itens: [at('gestor')], fim: { tipo: 'segue' } },
  },
  { kind: 'paralelo', id: 'pareceres', nome: 'Pareceres', caminhos: [{ id: 'p-jur', itens: [at('juridico')] }, { id: 'p-fin', itens: [at('financeiro')] }] },
  at('assinatura'),
])

/* ── executar no motor de verdade ──────────────────────────────────────────── */
function executar(f: FluxoBlocos, vars: Record<string, unknown> = {}) {
  const g = grafoParaMotor(blocosParaGrafo(f))
  const rt = makeCounterRuntime()
  let { state } = startProcess(g, vars, rt)
  const passo = (nodeId: string, dados: Record<string, unknown> = {}) => {
    const tok = state.tokens.find((t) => t.nodeId === nodeId)
    if (!tok) throw new Error(`sem tarefa aberta em "${nodeId}" (abertas: ${state.tokens.map((t) => t.nodeId).join(', ') || 'nenhuma'})`)
    const r = completeToken(g, state, tok.id, dados, rt)
    state = r.state
    return r.effects as WfEffect[]
  }
  return { abertas: () => state.tokens.map((t) => t.nodeId).sort(), passo, estado: (): WfState => state }
}

describe('blocosParaGrafo — execução no motor', () => {
  it('fluxo linear vira start → atividades → end', () => {
    const g = blocosParaGrafo(fluxo([at('a'), at('b')]))
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['start>a', 'a>b', 'b>end'])
  })

  it('escolha por valor: acima do limite vai à diretoria e segue aos pareceres', () => {
    const p = executar(exemplo())
    p.passo('cadastrar', { valor: 150000 })
    expect(p.abertas()).toEqual(['diretoria'])
    p.passo('diretoria')
    expect(p.abertas()).toEqual(['financeiro', 'juridico'])
  })

  it('caso contrário leva ao gestor', () => {
    const p = executar(exemplo())
    p.passo('cadastrar', { valor: 1000 })
    expect(p.abertas()).toEqual(['gestor'])
  })

  it('ao mesmo tempo: só segue quando todos os caminhos terminam, e o processo conclui', () => {
    const p = executar(exemplo())
    p.passo('cadastrar', { valor: 1000 })
    p.passo('gestor')
    p.passo('juridico')
    expect(p.abertas()).toEqual(['financeiro'])
    expect(p.estado().status).toBe('running')
    p.passo('financeiro')
    expect(p.abertas()).toEqual(['assinatura'])
    p.passo('assinatura')
    expect(p.estado().status).toBe('completed')
  })

  it('armadilha 1: escolha DENTRO de um caminho paralelo não trava a junção', () => {
    const f = fluxo([
      {
        kind: 'paralelo', id: 'par', caminhos: [
          { id: 'p1', itens: [{ kind: 'escolha', id: 'esc', caminhos: [{ id: 'e1', condition: "rota == 'A'", itens: [at('a')], fim: { tipo: 'segue' } }], casoContrario: { id: 'e2', itens: [at('b')], fim: { tipo: 'segue' } } }] },
          { id: 'p2', itens: [at('c')] },
        ],
      },
      at('depois'),
    ])
    const g = blocosParaGrafo(f)
    // os dois caminhos da escolha se reencontram antes da junção: ela recebe 2 setas, não 3
    expect(g.edges.filter((e) => e.to === 'par' + SUFIXO_REENCONTRO)).toHaveLength(2)
    const p = executar(f, { rota: 'A' })
    p.passo('a')
    p.passo('c')
    expect(p.abertas()).toEqual(['depois'])
  })

  it('bloco ao mesmo tempo DENTRO de um caminho da escolha', () => {
    const f = fluxo([
      at('inicio'),
      {
        kind: 'escolha', id: 'esc', caminhos: [{ id: 'e1', condition: 'grande == true', itens: [{ kind: 'paralelo', id: 'par', caminhos: [{ id: 'p1', itens: [at('x')] }, { id: 'p2', itens: [at('y')] }] }], fim: { tipo: 'segue' } }],
        casoContrario: { id: 'e2', itens: [], fim: { tipo: 'segue' } },
      },
      at('fim-das-contas'),
    ])
    const grande = executar(f)
    grande.passo('inicio', { grande: true })
    expect(grande.abertas()).toEqual(['x', 'y'])
    grande.passo('x'); grande.passo('y')
    expect(grande.abertas()).toEqual(['fim-das-contas'])
    const pequeno = executar(f)
    pequeno.passo('inicio', { grande: false })
    expect(pequeno.abertas()).toEqual(['fim-das-contas'])   // caminho vazio segue direto
  })

  it('caminho que encerra o processo conclui sem passar pelo que vem depois', () => {
    const f = fluxo([
      at('analisar'),
      { kind: 'escolha', id: 'esc', caminhos: [{ id: 'e1', condition: 'ok == true', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'e2', itens: [at('arquivar')], fim: { tipo: 'encerra' } } },
      at('seguir'),
    ])
    const p = executar(f)
    p.passo('analisar', { ok: false })
    p.passo('arquivar')
    expect(p.estado().status).toBe('completed')
  })

  it('caminho que volta reabre a atividade anterior', () => {
    const f = fluxo([
      at('cadastrar'), at('revisar'),
      { kind: 'escolha', id: 'esc', caminhos: [{ id: 'e1', condition: 'aprovado == true', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'e2', itens: [at('corrigir')], fim: { tipo: 'volta', alvoId: 'cadastrar' } } },
      at('assinar'),
    ])
    const p = executar(f)
    p.passo('cadastrar'); p.passo('revisar', { aprovado: false }); p.passo('corrigir')
    expect(p.abertas()).toEqual(['cadastrar'])
    p.passo('cadastrar'); p.passo('revisar', { aprovado: true })
    expect(p.abertas()).toEqual(['assinar'])
  })
})

describe('blocosParaGrafo — compatível com o que já existe', () => {
  it('passa pelo gerador BPMN, pelo compilador e pelas regras de ativação sem bloqueio', () => {
    const g = blocosParaGrafo(exemplo())
    expect(() => compileBpmn(generateBpmn(grafoParaMotor(g)))).not.toThrow()
    expect(bloqueantes([...validarDesenho(g.nodes, g.edges), ...validarDecisoes(g.nodes, g.edges)])).toEqual([])
  })

  it('o caso contrário sai marcado como padrão e rotulado; ids das atividades se mantêm', () => {
    const g = blocosParaGrafo(exemplo())
    const padrao = g.edges.filter((e) => e.from === 'valor' && e.isDefault)
    expect(padrao).toHaveLength(1)
    expect(padrao[0].label).toBe('Caso contrário')
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['cadastrar', 'diretoria', 'gestor', 'juridico', 'financeiro', 'assinatura']))
  })

  it('ids das setas são determinísticos (mesmo fluxo gera o mesmo grafo)', () => {
    expect(blocosParaGrafo(exemplo())).toEqual(blocosParaGrafo(exemplo()))
  })
})

describe('grafoParaBlocos — só o que é linear', () => {
  it('início → fim vira fluxo vazio, preservando os ids', () => {
    expect(grafoParaBlocos([{ id: 'S', type: 'start' }, { id: 'E', type: 'end' }], [{ from: 'S', to: 'E' }]))
      .toEqual({ versao: 1, inicioId: 'S', fimId: 'E', itens: [] })
  })
  it('sequência de atividades vira itens', () => {
    const f = grafoParaBlocos(
      [{ id: 'S', type: 'start' }, { id: 'a', type: 'userTask', name: 'A' }, { id: 'b', type: 'serviceTask' }, { id: 'E', type: 'end' }],
      [{ from: 'S', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'E' }],
    )
    expect(f?.itens.map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('qualquer ramificação ou nó solto devolve null', () => {
    expect(grafoParaBlocos(
      [{ id: 'S', type: 'start' }, { id: 'g', type: 'exclusiveGateway' }, { id: 'E', type: 'end' }],
      [{ from: 'S', to: 'g' }, { from: 'g', to: 'E' }],
    )).toBeNull()
    expect(grafoParaBlocos(
      [{ id: 'S', type: 'start' }, { id: 'a', type: 'userTask' }, { id: 'solto', type: 'userTask' }, { id: 'E', type: 'end' }],
      [{ from: 'S', to: 'a' }, { from: 'a', to: 'E' }],
    )).toBeNull()
  })
})

describe('validarBlocos', () => {
  it('o exemplo bem montado não tem problema', () => {
    expect(validarBlocos(exemplo())).toEqual([])
  })
  it('escolha sem caminho com condição, e caminho sem condição', () => {
    const f = fluxo([
      { kind: 'escolha', id: 'e1', pergunta: 'Vazia', caminhos: [], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } },
      { kind: 'escolha', id: 'e2', pergunta: 'Incompleta', caminhos: [{ id: 'c', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc2', itens: [], fim: { tipo: 'segue' } } },
    ])
    expect(validarBlocos(f).map((p) => p.tipo)).toEqual(['escolha-sem-caminho', 'caminho-sem-condicao'])
  })
  it('armadilhas 3 e 4: encerrar ou voltar dentro de um paralelo', () => {
    const f = fluxo([
      at('a'),
      {
        kind: 'paralelo', id: 'par', caminhos: [
          { id: 'p1', itens: [{ kind: 'escolha', id: 'esc', caminhos: [{ id: 'c', condition: 'x == 1', itens: [], fim: { tipo: 'encerra' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'volta', alvoId: 'a' } } }] },
          { id: 'p2', itens: [at('b')] },
        ],
      },
    ])
    expect(validarBlocos(f).filter((p) => p.tipo === 'saida-dentro-de-paralelo')).toHaveLength(2)
  })
  it('volta para atividade que vem DEPOIS é recusada', () => {
    const f = fluxo([
      { kind: 'escolha', id: 'esc', caminhos: [{ id: 'c', condition: 'x == 1', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'volta', alvoId: 'depois' } } },
      at('depois'),
    ])
    expect(validarBlocos(f).map((p) => p.tipo)).toContain('volta-invalida')
  })
  it('todos os caminhos saindo do fluxo deixam o resto inalcançável', () => {
    const f = fluxo([
      at('a'),
      { kind: 'escolha', id: 'esc', caminhos: [{ id: 'c', condition: 'x == 1', itens: [], fim: { tipo: 'encerra' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'volta', alvoId: 'a' } } },
      at('nunca'),
    ])
    expect(validarBlocos(f).map((p) => p.tipo)).toContain('trecho-inalcancavel')
  })
  it('paralelo com um caminho só é aviso, não erro', () => {
    const p = validarBlocos(fluxo([{ kind: 'paralelo', id: 'par', caminhos: [{ id: 'p1', itens: [at('a')] }] }]))
    expect(p.map((x) => [x.tipo, x.severidade])).toEqual([['paralelo-com-um-caminho', 'aviso']])
  })
})

describe('destinosDeVolta', () => {
  it('oferece só atividades anteriores e fora de paralelos', () => {
    const f = fluxo([
      at('a'),
      { kind: 'paralelo', id: 'par', caminhos: [{ id: 'p1', itens: [at('dentro')] }, { id: 'p2', itens: [] }] },
      at('b'),
      { kind: 'escolha', id: 'esc', caminhos: [{ id: 'c', condition: 'x == 1', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } },
      at('depois'),
    ])
    expect(destinosDeVolta(f, 'esc').map((a) => a.id)).toEqual(['a', 'b'])
  })
})

describe('editar a árvore', () => {
  it('inserir numa lista de caminho e listar atividades em ordem de leitura', () => {
    const f = inserirItem(exemplo(), 'c-padrao', 1, at('conferir'))
    expect(listarAtividades(f).map((a) => a.id)).toEqual(['cadastrar', 'assinatura', 'diretoria', 'gestor', 'conferir', 'juridico', 'financeiro'])
  })
  it('não muta o fluxo original', () => {
    const f = exemplo()
    const antes = JSON.stringify(f)
    inserirItem(f, 'raiz', 0, at('x'))
    removerItem(f, 'cadastrar')
    expect(JSON.stringify(f)).toBe(antes)
  })
  it('remover a atividade de destino de uma volta faz o caminho voltar a seguir', () => {
    const f = fluxo([
      at('a'),
      { kind: 'escolha', id: 'esc', caminhos: [{ id: 'c', condition: 'x == 1', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'volta', alvoId: 'a' } } },
    ])
    const g = removerItem(f, 'a')
    const esc = g.itens[0]
    expect(esc.kind === 'escolha' && esc.casoContrario.fim).toEqual({ tipo: 'segue' })
  })
  it('mover entre listas e impedir um bloco de entrar em si mesmo', () => {
    const f = moverItem(exemplo(), 'assinatura', 'p-jur', 1)
    expect(listarAtividades(f).map((a) => a.id)).toEqual(['cadastrar', 'diretoria', 'gestor', 'juridico', 'assinatura', 'financeiro'])
    expect(moverItem(exemplo(), 'pareceres', 'p-fin', 0)).toEqual(exemplo())
  })
  it('mover dentro da mesma lista para depois', () => {
    const f = moverItem(fluxo([at('a'), at('b'), at('c')]), 'a', 'raiz', 3)
    expect(f.itens.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })
  it('adicionar e remover caminhos; o caso contrário não sai', () => {
    let f = adicionarCaminho(exemplo(), 'valor', 'c-novo')
    f = atualizarCaminho(f, 'c-novo', { condition: 'valor > 500000', rotulo: 'Acima de meio milhão' })
    const esc = f.itens[1]
    expect(esc.kind === 'escolha' && esc.caminhos.map((c) => c.id)).toEqual(['c-alto', 'c-novo'])
    expect(removerCaminho(f, 'valor', 'c-padrao')).toEqual(f)
    f = removerCaminho(f, 'valor', 'c-novo')
    const esc2 = f.itens[1]
    expect(esc2.kind === 'escolha' && esc2.caminhos.map((c) => c.id)).toEqual(['c-alto'])
  })
  it('novoFluxo começa vazio e gera início → fim', () => {
    expect(blocosParaGrafo(novoFluxo()).edges.map((e) => `${e.from}>${e.to}`)).toEqual(['start>end'])
  })
})
