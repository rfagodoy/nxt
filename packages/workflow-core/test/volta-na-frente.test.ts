import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { blocosParaGrafo, destinosDeVolta, grafoParaMotor, validarBlocos, type BlocoEscolha, type FluxoBlocos, type ItemAtividade, type ItemFluxo } from '../src/blocos'
import { MSG_PARALELO, ligacaoPermitida } from '../src/desenho'
import { desenhoParaBlocos } from '../src/desenho-livre'
import { compileBpmn } from '../src/compile'
import { generateBpmn } from '../src/generate'
import { completeToken, makeCounterRuntime, startProcess } from '../src/interpreter'
import type { WfGraph, WfState } from '../src/types'

const at = (id: string): ItemAtividade => ({ kind: 'atividade', id, tipo: 'userTask', nome: id })
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })

/** Escolha "Possui erros?": `sim` passa por Corrigir e volta para `alvo`; `nao` segue. */
const erros = (alvo: string): BlocoEscolha => ({
  kind: 'escolha', id: 'erros', modo: 'primeiro', pergunta: 'Possui erros?',
  caminhos: [
    { id: 'sim', condition: 'erros > 0', itens: [at('corrigir')], fim: { tipo: 'volta', alvoId: alvo } },
    { id: 'nao', condition: 'erros == 0', itens: [], fim: { tipo: 'segue' } },
  ],
  casoContrario: { id: 'cc', itens: [], fim: { tipo: 'segue' } },
})

/** preencher → ao mesmo tempo [analisar → erros? → contabil] e [ciencia]. */
const comVoltaPara = (alvo: string): FluxoBlocos => fluxo([
  at('preencher'),
  { kind: 'paralelo', id: 'par', caminhos: [
    { id: 'principal', itens: [at('analisar'), erros(alvo), at('contabil')] },
    { id: 'lateral', itens: [at('ciencia')] },
  ] },
])

const tipos = (f: FluxoBlocos) => validarBlocos(f).map((p) => p.tipo)

describe('volta dentro de uma frente do "ao mesmo tempo"', () => {
  it('a escolha oferece só as atividades anteriores da própria frente', () => {
    expect(destinosDeVolta(comVoltaPara('analisar'), 'erros').map((a) => a.id)).toEqual(['analisar'])
  })

  it('voltar para atividade anterior da mesma frente não tem pendência', () => {
    expect(tipos(comVoltaPara('analisar'))).toEqual([])
  })

  it('voltar para antes do paralelo é recusado', () => {
    expect(tipos(comVoltaPara('preencher'))).toEqual(['saida-dentro-de-paralelo'])
  })

  it('voltar para a frente irmã é recusado', () => {
    expect(tipos(comVoltaPara('ciencia'))).toEqual(['saida-dentro-de-paralelo'])
  })

  it('a recusa diz que a volta só vale dentro da frente', () => {
    const [p] = validarBlocos(comVoltaPara('preencher'))
    expect(p.mensagem).toContain('mesma frente')
  })

  describe('paralelo dentro de uma frente', () => {
    const aninhado = (alvo: string): FluxoBlocos => fluxo([
      { kind: 'paralelo', id: 'fora', caminhos: [
        { id: 'f1', itens: [at('antes'), { kind: 'paralelo', id: 'dentro', caminhos: [
          { id: 'd1', itens: [at('analisar'), erros(alvo)] },
          { id: 'd2', itens: [at('irma')] },
        ] }] },
        { id: 'f2', itens: [at('outra')] },
      ] },
    ])

    it('não oferece a atividade da frente de fora', () => {
      expect(destinosDeVolta(aninhado('analisar'), 'erros').map((a) => a.id)).toEqual(['analisar'])
    })
    it('recusa voltar para a frente de fora', () => {
      expect(tipos(aninhado('antes'))).toEqual(['saida-dentro-de-paralelo'])
    })
  })

  describe('seta desenhada à mão', () => {
    it('Corrigir → Analisar vira volta', () => {
      expect(ligacaoPermitida(comVoltaPara('analisar'), 'corrigir', 'analisar')).toEqual({ ok: true, caminhoId: 'sim', fim: { tipo: 'volta', alvoId: 'analisar' } })
    })
    it('para antes do paralelo é recusada', () => {
      expect(ligacaoPermitida(comVoltaPara('analisar'), 'corrigir', 'preencher')).toEqual({ ok: false, motivo: MSG_PARALELO })
    })
    it('para o Fim vale: o processo só encerra quando as outras frentes terminarem', () => {
      expect(ligacaoPermitida(comVoltaPara('analisar'), 'corrigir', 'end')).toEqual({ ok: true, caminhoId: 'sim', fim: { tipo: 'encerra' } })
    })
  })
})

/* ── o cenário que originou a regra: Solicitação de contratos ─────────────────── */

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const escolha = (id: string) => F(id, 'exclusiveGateway', { modo: 'primeiro', pergunta: `${id}?` })
const junta = (id: string, tipo: FormaDesenho['tipo'] = 'exclusiveGateway') => F(id, tipo, { junta: true })

const desenho: DesenhoV2 = {
  versao: 2,
  formas: [
    F('start', 'start'), F('preencher'), F('par', 'parallelGateway'),
    escolha('patrimonio'), F('ciencia'), junta('j_patrimonio'),
    escolha('rh'), F('validar1'), F('validar2'), junta('j_rh'),
    F('analisar'), escolha('erros'), F('corrigir'), F('contabil'), F('retorno'), junta('j_erros'),
    junta('junta', 'parallelGateway'), F('end', 'end'),
  ],
  setas: [
    S('start', 'preencher'), S('preencher', 'par'), S('par', 'patrimonio'), S('par', 'rh'), S('par', 'analisar'),
    S('patrimonio', 'ciencia', { condition: 'patrimonio == 1' }), S('patrimonio', 'j_patrimonio', { condition: 'patrimonio == 0' }), S('ciencia', 'j_patrimonio'), S('j_patrimonio', 'junta'),
    S('rh', 'validar1', { condition: 'rh == 1' }), S('rh', 'j_rh', { condition: 'rh == 0' }), S('validar1', 'validar2'), S('validar2', 'j_rh'), S('j_rh', 'junta'),
    S('analisar', 'erros'), S('erros', 'corrigir', { condition: 'erros == 1' }), S('corrigir', 'analisar'), S('erros', 'contabil', { condition: 'erros == 0' }),
    S('contabil', 'retorno'), S('retorno', 'j_erros'), S('j_erros', 'junta'), S('junta', 'end'),
  ],
  posicoes: {}, raias: [],
}

const blocosDoDesenho = (): FluxoBlocos => {
  const c = desenhoParaBlocos(desenho)
  if (!c.ok) throw new Error(c.problemas[0].mensagem)
  return c.fluxo
}

/** Executa o que a ativação grava: passa pelo BPMN gerado e compilado. */
function rodar(vars: Record<string, unknown>) {
  const g: WfGraph = compileBpmn(generateBpmn(grafoParaMotor(blocosParaGrafo(blocosDoDesenho()))))
  const rt = makeCounterRuntime()
  let state: WfState = startProcess(g, {}, rt).state
  const concluir = (nodeId: string, dados: Record<string, unknown> = {}) => {
    const tok = state.tokens.find((t) => t.nodeId === nodeId)
    if (!tok) throw new Error(`sem tarefa em "${nodeId}" (abertas: ${abertas().join(', ') || 'nenhuma'})`)
    state = completeToken(g, state, tok.id, dados, rt).state
  }
  const abertas = () => state.tokens.map((t) => t.nodeId).sort()
  concluir('preencher', vars)
  return { concluir, abertas, status: () => state.status }
}

describe('atividades paralelas ao fluxo principal', () => {
  it('o desenho com o laço de correção na frente não tem pendência', () => {
    expect(validarBlocos(blocosDoDesenho())).toEqual([])
  })

  it('terminar a linha principal primeiro não encerra: espera as paralelas', () => {
    const p = rodar({ patrimonio: 1, rh: 1, erros: 0 })
    expect(p.abertas()).toEqual(['analisar', 'ciencia', 'validar1'])
    p.concluir('analisar'); p.concluir('contabil'); p.concluir('retorno')
    expect(p.status()).toBe('running')
    expect(p.abertas()).toEqual(['ciencia', 'validar1'])
    p.concluir('ciencia'); p.concluir('validar1'); p.concluir('validar2')
    expect(p.status()).toBe('completed')
  })

  it('terminar as paralelas primeiro não encerra: espera a linha principal', () => {
    const p = rodar({ patrimonio: 1, rh: 1, erros: 0 })
    p.concluir('ciencia'); p.concluir('validar1'); p.concluir('validar2')
    expect(p.status()).toBe('running')
    expect(p.abertas()).toEqual(['analisar'])
    p.concluir('analisar'); p.concluir('contabil'); p.concluir('retorno')
    expect(p.status()).toBe('completed')
  })

  it('o laço de correção não duplica nem cancela as frentes irmãs', () => {
    const p = rodar({ patrimonio: 1, rh: 1, erros: 1 })
    p.concluir('analisar')
    expect(p.abertas()).toEqual(['ciencia', 'corrigir', 'validar1'])
    p.concluir('corrigir', { erros: 0 })
    expect(p.abertas()).toEqual(['analisar', 'ciencia', 'validar1'])
  })

  it('sem pareceres, só a linha principal roda e o processo conclui', () => {
    const p = rodar({ patrimonio: 0, rh: 0, erros: 0 })
    expect(p.abertas()).toEqual(['analisar'])
    p.concluir('analisar'); p.concluir('contabil'); p.concluir('retorno')
    expect(p.status()).toBe('completed')
  })
})
