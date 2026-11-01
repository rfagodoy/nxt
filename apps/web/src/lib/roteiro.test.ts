import { describe, it, expect } from 'vitest'
import type { FluxoBlocos, ItemFluxo, CaminhoCondicional } from '@nxt/workflow-core'
import type { StepFormSchema } from '@nxt/types'
import { contagem, descreverLugar, destinoVizinho, itensDaLista, listasDoRoteiro, lugaresParaMover, montarRoteiro, podeSoltar, removerCaminhoComVinculos, rotuloDoFimDaLista, secaoDaPendencia, type ConsultasDoRoteiro, type EtapaRoteiro, type EscolhaRoteiro, type ParaleloRoteiro } from './roteiro'

const at = (id: string, tipo: 'userTask' | 'serviceTask' = 'userTask', vinculoDe?: string): ItemFluxo =>
  ({ kind: 'atividade', id, tipo, ...(vinculoDe ? { vinculoDe } : {}) })
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })
const passo = (id: string, p: Partial<StepFormSchema> = {}): StepFormSchema =>
  ({ stepId: id, stepName: `Etapa ${id}`, stepType: 'userTask', executor: { papelId: 'p1' }, slaBusinessDays: 1, ...p }) as StepFormSchema

const NOMES: Record<string, string> = { a1: 'Analisar', a2: 'Assinar', a3: 'Arquivar' }
function consultas(steps: Record<string, StepFormSchema>, sobre: Partial<ConsultasDoRoteiro> = {}): ConsultasDoRoteiro {
  return {
    steps,
    quemFaz: (id) => (steps[id]?.executor?.papelId ? 'Analista · Central' : undefined),
    prazo: (id) => ((steps[id]?.slaBusinessDays ?? 0) > 0 ? '1 dia útil' : null),
    tela: () => null,
    devolucao: () => null,
    acao: () => null,
    nomeDe: (id) => NOMES[id] ?? id,
    condicaoDe: (c: CaminhoCondicional) => c.rotulo ?? 'sem condição',
    ...sobre,
  }
}
const textos = (e: EtapaRoteiro) => e.etiquetas.map((x) => x.texto)

describe('montarRoteiro', () => {
  it('linear: uma etapa por atividade, com ref e índice', () => {
    const f = fluxo([at('a1'), at('a2'), at('a3')])
    const nos = montarRoteiro(f, consultas({ a1: passo('a1'), a2: passo('a2'), a3: passo('a3') }))
    expect(nos.map((n) => [n.kind, n.id, n.ref, n.indice])).toEqual([
      ['etapa', 'a1', 'raiz', 0], ['etapa', 'a2', 'raiz', 1], ['etapa', 'a3', 'raiz', 2],
    ])
  })

  it('etapa completa: quem, prazo e tela, e completa = true', () => {
    const f = fluxo([at('a1')])
    const [e] = montarRoteiro(f, consultas({ a1: passo('a1') }, { tela: () => 'Consulta aos dados · consultar' })) as EtapaRoteiro[]
    expect(e.etiquetas.map((x) => x.tipo)).toEqual(['quem', 'prazo', 'tela'])
    expect(e.completa).toBe(true)
    expect(e.nome).toBe('Etapa a1')
  })

  it('faltas: etiquetas tracejadas e completa = false', () => {
    const f = fluxo([at('a1')])
    const [e] = montarRoteiro(f, consultas({ a1: passo('a1', { executor: undefined, slaBusinessDays: 0 }) })) as EtapaRoteiro[]
    expect(e.etiquetas).toContainEqual({ tipo: 'falta', texto: 'falta quem faz' })
    expect(e.etiquetas).toContainEqual({ tipo: 'falta', texto: 'falta prazo' })
    expect(e.completa).toBe(false)
  })

  it('papel ainda carregando: "carregando…" e nenhuma "falta quem faz"', () => {
    const f = fluxo([at('a1')])
    const [e] = montarRoteiro(f, consultas({ a1: passo('a1') }, { quemFaz: () => null })) as EtapaRoteiro[]
    expect(e.etiquetas).toContainEqual({ tipo: 'carregando', texto: 'carregando…' })
    expect(textos(e)).not.toContain('falta quem faz')
  })

  it('papel excluído (lista já carregada): aviso para escolher outro, sem "carregando…"', () => {
    const f = fluxo([at('a1')])
    const [e] = montarRoteiro(f, consultas({ a1: passo('a1') }, { quemFaz: () => false })) as EtapaRoteiro[]
    expect(e.etiquetas).toContainEqual({ tipo: 'aviso', texto: 'Papel removido — escolha outro' })
    expect(e.etiquetas.map((x) => x.tipo)).not.toContain('carregando')
    expect(textos(e)).not.toContain('falta quem faz')
    expect(e.completa).toBe(false)
  })

  it('escolha: condição, itens com ref do caminho e fim em frase', () => {
    const f = fluxo([at('a1'), {
      kind: 'escolha', id: 'e1', pergunta: 'Aprovado?', modo: 'primeiro',
      caminhos: [
        { id: 'c1', rotulo: 'Não', itens: [at('a2')], fim: { tipo: 'volta', alvoId: 'a1' } },
        { id: 'c2', rotulo: 'Cancelado', itens: [], fim: { tipo: 'encerra' } },
      ],
      casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } },
    }])
    const [, esc] = montarRoteiro(f, consultas({ a1: passo('a1'), a2: passo('a2') }))
    const e = esc as EscolhaRoteiro
    expect(e.kind).toBe('escolha')
    expect(e.nome).toBe('Aprovado?')
    expect(e.modo).toBe('primeiro')
    expect(e.caminhos.map((c) => [c.condicao, c.fimTexto])).toEqual([['Não', 'volta para Analisar'], ['Cancelado', 'encerra o processo']])
    expect(e.caminhos[0].itens[0]).toMatchObject({ kind: 'etapa', id: 'a2', ref: 'c1', indice: 0 })
    expect(e.senaoAntigo).toBe(false)
  })

  it('ao mesmo tempo com escolha dentro: árvore preservada', () => {
    const f = fluxo([{
      kind: 'paralelo', id: 'p1', nome: '',
      caminhos: [
        { id: 'r1', itens: [at('a1')] },
        { id: 'r2', itens: [{ kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', itens: [at('a2')], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } }] },
      ],
    }])
    const [p] = montarRoteiro(f, consultas({ a1: passo('a1'), a2: passo('a2') })) as ParaleloRoteiro[]
    expect(p.kind).toBe('paralelo')
    expect(p.ramos[1].itens[0].kind).toBe('escolha')
    expect((p.ramos[1].itens[0] as EscolhaRoteiro).caminhos[0].itens[0]).toMatchObject({ id: 'a2', ref: 'c1' })
  })

  it('vinculada: "mesma etapa que X" e etiquetas do passo da raiz', () => {
    const f = fluxo([at('a1'), at('a9', 'userTask', 'a1')])
    const [, v] = montarRoteiro(f, consultas({ a1: passo('a1') })) as EtapaRoteiro[]
    expect(v.etiquetas).toContainEqual({ tipo: 'vinculo', texto: 'mesma etapa que Analisar' })
    expect(v.etiquetas.map((x) => x.tipo)).toContain('quem')
    expect(v.completa).toBe(true)
  })

  it('automática: etiqueta da ação; sem conector, "falta ação"', () => {
    const f = fluxo([at('s1', 'serviceTask'), at('s2', 'serviceTask')])
    const steps = { s1: passo('s1', { stepType: 'serviceTask' }), s2: passo('s2', { stepType: 'serviceTask' }) }
    const [s1, s2] = montarRoteiro(f, consultas(steps, { acao: (id) => (id === 's1' ? 'Cadastrar contrato' : null) })) as EtapaRoteiro[]
    expect(s1.etiquetas).toEqual([{ tipo: 'acao', texto: 'Cadastrar contrato' }])
    expect(s2.etiquetas).toContainEqual({ tipo: 'falta', texto: 'falta ação' })
    expect(s1.tipo).toBe('serviceTask')
  })

  it('Senão antigo: marcado e listado por último como "Senão"', () => {
    const f = fluxo([{
      kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', rotulo: 'Sim', itens: [], fim: { tipo: 'segue' } }],
      casoContrario: { id: 'cc', itens: [at('a1')], fim: { tipo: 'segue' } },
    }])
    const [e] = montarRoteiro(f, consultas({ a1: passo('a1') })) as EscolhaRoteiro[]
    expect(e.senaoAntigo).toBe(true)
    expect(e.caminhos.map((c) => c.condicao)).toEqual(['Sim', 'Senão'])
  })
})

describe('podeSoltar', () => {
  const comCond = (id: string, itens: ItemFluxo[], fim: CaminhoCondicional['fim']): CaminhoCondicional =>
    ({ id, condition: "x == 'Sim'", itens, fim })
  const escolha = (id: string, caminhos: CaminhoCondicional[]): ItemFluxo =>
    ({ kind: 'escolha', id, modo: 'primeiro', caminhos, casoContrario: { id: `${id}-cc`, itens: [], fim: { tipo: 'segue' } } })
  const ids = (f: FluxoBlocos) => f.itens.map((i) => i.id)

  it('destino válido: muda a ordem', () => {
    const f = fluxo([at('a1'), at('a2'), at('a3')])
    const s = podeSoltar(f, 'a3', { ref: 'raiz', indice: 0 })
    expect(s.ok).toBe(true)
    if (s.ok) expect(ids(s.fluxo)).toEqual(['a3', 'a1', 'a2'])
  })

  it('no mesmo lugar: ok e o fluxo não muda', () => {
    const f = fluxo([at('a1'), at('a2')])
    const s = podeSoltar(f, 'a1', { ref: 'raiz', indice: 1 })
    expect(s).toEqual({ ok: true, fluxo: f })
  })

  it('escolha que encerra não entra num ao mesmo tempo', () => {
    const f = fluxo([
      escolha('e1', [comCond('c1', [], { tipo: 'segue' }), comCond('c2', [], { tipo: 'encerra' })]),
      { kind: 'paralelo', id: 'p1', caminhos: [{ id: 'r1', itens: [at('a1')] }, { id: 'r2', itens: [at('a2')] }] },
    ])
    const s = podeSoltar(f, 'e1', { ref: 'r1', indice: 1 })
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.motivo).toContain('ao mesmo tempo')
  })

  it('volta não pode passar a apontar para frente', () => {
    const f = fluxo([at('a1'), escolha('e1', [comCond('c1', [], { tipo: 'volta', alvoId: 'a1' })]), at('a2')])
    const s = podeSoltar(f, 'a1', { ref: 'raiz', indice: 3 })
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.motivo).toContain('não vem antes')
  })

  it('bloco não entra nele mesmo', () => {
    const f = fluxo([{ kind: 'paralelo', id: 'p1', caminhos: [{ id: 'r1', itens: [at('a1')] }, { id: 'r2', itens: [] }] }])
    expect(podeSoltar(f, 'p1', { ref: 'r2', indice: 0 })).toEqual({ ok: false, motivo: 'Um bloco não pode entrar nele mesmo.' })
  })

  it('erro que já existia antes do arrasto não impede', () => {
    const f = fluxo([at('a1'), { kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', itens: [], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } }, at('a2')])
    const s = podeSoltar(f, 'a2', { ref: 'raiz', indice: 0 })
    expect(s.ok).toBe(true)
  })
})

describe('itensDaLista', () => {
  const f = fluxo([at('a1'), {
    kind: 'paralelo', id: 'p1', caminhos: [
      { id: 'r1', itens: [{ kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', itens: [at('a2')], fim: { tipo: 'segue' } }], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } }] },
      { id: 'r2', itens: [at('a3')] },
    ],
  }])
  it('raiz, ramo de ao mesmo tempo e caminho de escolha aninhado', () => {
    expect(itensDaLista(f, 'raiz')?.map((i) => i.id)).toEqual(['a1', 'p1'])
    expect(itensDaLista(f, 'r2')?.map((i) => i.id)).toEqual(['a3'])
    expect(itensDaLista(f, 'c1')?.map((i) => i.id)).toEqual(['a2'])
  })
  it('lista que não existe: undefined', () => {
    expect(itensDaLista(f, 'nada')).toBeUndefined()
  })
})

describe('revisão final', () => {
  it('pendência abre a etapa na pergunta que falta', () => {
    expect(secaoDaPendencia({ tipo: 'atividade-incompleta' }, passo('a1', { stepName: '' }))).toBe('identificacao')
    expect(secaoDaPendencia({ tipo: 'atividade-incompleta' }, passo('a1', { executor: undefined }))).toBe('executor')
    expect(secaoDaPendencia({ tipo: 'atividade-incompleta' }, passo('a1', { slaBusinessDays: 0 }))).toBe('prazo')
    expect(secaoDaPendencia({ tipo: 'executor-vago' })).toBe('executor')
    expect(secaoDaPendencia({ tipo: 'tela-so-consulta' })).toBe('formulario')
    expect(secaoDaPendencia({ tipo: 'juncao-travada' })).toBeUndefined()
  })

  it('escolha e ao mesmo tempo trazem suas pendências; caminho sem condição e Senão marcados', () => {
    const f = fluxo([
      { kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', itens: [], fim: { tipo: 'segue' } }, { id: 'c2', condition: "x == 'S'", itens: [], fim: { tipo: 'segue' } }],
        casoContrario: { id: 'cc', itens: [at('a1')], fim: { tipo: 'segue' } } },
      { kind: 'paralelo', id: 'p1', caminhos: [{ id: 'r1', itens: [] }] },
    ])
    const [e, p] = montarRoteiro(f, consultas({ a1: passo('a1') }, { problemasDe: (id) => (id === 'e1' ? ['Falta condição'] : id === 'p1' ? ['Só um ramo'] : []) }))
    expect((e as EscolhaRoteiro).problemas).toEqual(['Falta condição'])
    expect((p as ParaleloRoteiro).problemas).toEqual(['Só um ramo'])
    expect((e as EscolhaRoteiro).caminhos.map((c) => [c.semCondicao, c.senao])).toEqual([[true, false], [false, false], [false, true]])
  })

  it('remover caminho com a raiz de uma etapa vinculada promove a cópia', () => {
    const f = fluxo([
      { kind: 'escolha', id: 'e1', caminhos: [{ id: 'c1', condition: 'x', itens: [at('a1')], fim: { tipo: 'segue' } }, { id: 'c2', condition: 'y', itens: [], fim: { tipo: 'segue' } }],
        casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } },
      at('a9', 'userTask', 'a1'),
    ])
    const r = removerCaminhoComVinculos(f, 'e1', 'c1')
    expect(r.promovidas).toEqual([{ de: 'a1', para: 'a9' }])
    const copia = r.fluxo.itens[1]
    expect(copia.kind === 'atividade' && copia.vinculoDe).toBeFalsy()
  })

  it('arrasto que cria uma segunda volta inválida na mesma escolha é recusado', () => {
    const cond = (id: string, alvoId: string): CaminhoCondicional => ({ id, condition: 'x', itens: [], fim: { tipo: 'volta', alvoId } })
    const f = fluxo([at('a1'), { kind: 'escolha', id: 'e1', modo: 'primeiro', caminhos: [cond('c1', 'a1'), cond('c2', 'a3')], casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } } }, at('a3')])
    expect(podeSoltar(f, 'a1', { ref: 'raiz', indice: 3 }).ok).toBe(false)
  })
})

describe('textos', () => {
  it('contagem no singular e no plural', () => {
    expect(contagem(1, 'ramo', 'ramos')).toBe('1 ramo')
    expect(contagem(2, 'ramo', 'ramos')).toBe('2 ramos')
    expect(contagem(0, 'ramo', 'ramos')).toBe('0 ramos')
    expect(contagem(1, 'frente', 'frentes')).toBe('1 frente')
  })

  it('"+" do fim da lista: primeira etapa no workflow vazio, no fim ou no caminho nos demais', () => {
    expect(rotuloDoFimDaLista('raiz', 0)).toBe('Primeira etapa')
    expect(rotuloDoFimDaLista('raiz', 2)).toBe('Etapa no fim')
    expect(rotuloDoFimDaLista('c1', 0)).toBe('Etapa neste caminho')
    expect(rotuloDoFimDaLista('c1', 3)).toBe('Etapa neste caminho')
  })
})

describe('mover pelo teclado e pelo menu', () => {
  const cond = (id: string, rotulo: string, itens: ItemFluxo[], fim: CaminhoCondicional['fim'] = { tipo: 'segue' }): CaminhoCondicional =>
    ({ id, rotulo, condition: 'x', itens, fim })
  const escolha = (id: string, caminhos: CaminhoCondicional[], pergunta = 'Aprovado?'): ItemFluxo =>
    ({ kind: 'escolha', id, pergunta, modo: 'primeiro', caminhos, casoContrario: { id: `${id}-cc`, itens: [], fim: { tipo: 'segue' } } })
  const paralelo = (id: string, ramos: ItemFluxo[][]): ItemFluxo =>
    ({ kind: 'paralelo', id, nome: 'Pareceres', caminhos: ramos.map((itens, i) => ({ id: `${id}-r${i + 1}`, itens })) })
  const steps = { a1: passo('a1'), a2: passo('a2'), a3: passo('a3'), a4: passo('a4') }
  const nosDe = (f: FluxoBlocos) => montarRoteiro(f, consultas(steps))

  it('listas do roteiro na ordem da leitura, com rótulo e os blocos em volta', () => {
    const f = fluxo([at('a1'), escolha('e1', [cond('c1', 'Sim', [at('a2')]), cond('c2', 'Não', [paralelo('p1', [[], [at('a3')]])])])])
    expect(listasDoRoteiro(nosDe(f)).map((l) => [l.ref, l.rotulo, l.quantos, l.dentroDe])).toEqual([
      ['raiz', 'Lista principal', 2, []],
      ['c1', 'Aprovado? → Se Sim', 1, ['e1']],
      ['c2', 'Aprovado? → Se Não', 1, ['e1']],
      ['p1-r1', 'Pareceres → Ramo 1', 0, ['e1', 'p1']],
      ['p1-r2', 'Pareceres → Ramo 2', 1, ['e1', 'p1']],
    ])
  })

  it('menu: outras listas onde o arrasto soltaria (no fim de cada uma); nem a própria, nem dentro de si', () => {
    const f = fluxo([at('a1'), escolha('e1', [cond('c1', 'Sim', [at('a2')]), cond('c2', 'Não', [])])])
    const nos = nosDe(f)
    expect(lugaresParaMover(f, nos, 'a1').map((l) => [l.rotulo, l.destino])).toEqual([
      ['Aprovado? → Se Sim', { ref: 'c1', indice: 1 }],
      ['Aprovado? → Se Não', { ref: 'c2', indice: 0 }],
    ])
    expect(lugaresParaMover(f, nos, 'a2').map((l) => l.destino)).toEqual([{ ref: 'raiz', indice: 2 }, { ref: 'c2', indice: 0 }])
    expect(lugaresParaMover(f, nos, 'e1')).toEqual([])
  })

  it('menu: lugar que o motor recusa fica de fora', () => {
    // a escolha que encerra não entra num ao mesmo tempo
    const f = fluxo([escolha('e1', [cond('c1', 'Sim', []), cond('c2', 'Não', [], { tipo: 'encerra' })]), paralelo('p1', [[at('a1')], [at('a2')]])])
    expect(lugaresParaMover(f, nosDe(f), 'e1')).toEqual([])
    expect(lugaresParaMover(f, nosDe(f), 'a1').map((l) => l.destino.ref)).toEqual(['raiz', 'c1', 'c2', 'p1-r2'])
  })

  it('teclado: desce e sobe uma vaga por vez, entrando e saindo dos caminhos', () => {
    const f = fluxo([at('a1'), escolha('e1', [cond('c1', 'Sim', [at('a2')]), cond('c2', 'Não', [])]), at('a3')])
    const nos = nosDe(f)
    expect(destinoVizinho(f, nos, 'a1', 1)).toEqual({ ref: 'c1', indice: 0 })
    expect(destinoVizinho(f, nos, 'a2', 1)).toEqual({ ref: 'c2', indice: 0 })
    expect(destinoVizinho(f, nos, 'a2', -1)).toEqual({ ref: 'raiz', indice: 1 })
    expect(destinoVizinho(f, nos, 'a3', -1)).toEqual({ ref: 'c2', indice: 0 })
    expect(destinoVizinho(f, nos, 'e1', 1)).toEqual({ ref: 'raiz', indice: 3 })
  })

  it('teclado: nas pontas não há para onde ir', () => {
    const f = fluxo([at('a1'), at('a2')])
    expect(destinoVizinho(f, nosDe(f), 'a1', -1)).toBeNull()
    expect(destinoVizinho(f, nosDe(f), 'a2', 1)).toBeNull()
    expect(destinoVizinho(f, nosDe(f), 'a1', 1)).toEqual({ ref: 'raiz', indice: 2 })
  })

  it('teclado: pula as vagas que o motor recusa', () => {
    // a escolha que encerra não entra nos ramos do ao mesmo tempo: desce direto para depois dele
    const f = fluxo([escolha('e1', [cond('c1', 'Sim', []), cond('c2', 'Não', [], { tipo: 'encerra' })]), paralelo('p1', [[at('a1')], [at('a2')]])])
    expect(podeSoltar(f, 'e1', { ref: 'p1-r1', indice: 0 }).ok).toBe(false)
    expect(destinoVizinho(f, nosDe(f), 'e1', 1)).toEqual({ ref: 'raiz', indice: 2 })
    // a volta não pode passar a apontar para frente: a1 não tem para onde descer
    const g = fluxo([at('a1'), escolha('e1', [cond('c1', 'Sim', [], { tipo: 'volta', alvoId: 'a1' })])])
    expect(destinoVizinho(g, nosDe(g), 'a1', 1)).toBeNull()
  })

  it('lugar em palavras, para anunciar depois de mover', () => {
    const f = fluxo([at('a1'), escolha('e1', [cond('c1', 'Sim', [at('a2'), at('a3')])])])
    expect(descreverLugar(nosDe(f), 'a3')).toBe('Aprovado? → Se Sim, posição 2 de 2')
    expect(descreverLugar(nosDe(f), 'a1')).toBe('Lista principal, posição 1 de 2')
    expect(descreverLugar(nosDe(f), 'nada')).toBeUndefined()
  })
})
