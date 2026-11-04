import { describe, expect, it } from 'vitest'
import type { DesenhoV2, FormaDesenho, StepFormSchema } from '@nxt/types'
import { LAYOUT_PADRAO } from '@nxt/workflow-core'
import {
  camposDoTexto, comConfig, configFim, configLivre, configSubprocesso, configTemporizador, ENVIO_PADRAO, executorDaRaia,
  formasNaFase, gavetaDaForma, gavetaDoAlvo, nomeDaRaia, nomeDoElemento, restaurarAlvo, tarefasNaRaia, workflowsAtivos,
} from './gavetas'

const EXEC = { papelId: 'p1', entityType: 'ORG', mode: 'FIXA' } as const

const base = (extra: Partial<DesenhoV2> = {}): DesenhoV2 => ({
  versao: 2,
  formas: [
    { id: 'i', tipo: 'start' },
    { id: 't1', tipo: 'userTask' },
    { id: 't2', tipo: 'userTask', variante: 'envio' },
    { id: 'tm', tipo: 'intermediateEvent', variante: 'temporizador', config: { espera: 'prazo', n: 5, unidade: 'diasUteis' } },
    { id: 'f', tipo: 'end' },
  ],
  setas: [{ id: 's1', de: 'i', para: 't1' }],
  posicoes: { i: { x: 0, y: 40 }, t1: { x: 100, y: 40 }, t2: { x: 300, y: 240 }, tm: { x: 500, y: 40 }, f: { x: 700, y: 40 } },
  raias: [{ id: 'r1', nome: 'Jurídico', altura: 200 }, { id: 'r2', nome: 'Comercial', altura: 200 }],
  layout: {
    ...LAYOUT_PADRAO,
    fases: [{ id: 'fa', nome: 'Fase 1', largura: 400 }, { id: 'fb', nome: 'Fase 2', largura: 320, prazoDiasUteis: 3 }],
    piscinasExternas: [{ id: 'ext', nome: 'Fornecedor', altura: 96, quem: 'contratada', canal: 'portal' }],
    fluxosMensagem: [{ id: 'm1', de: 't2', para: 'ext', rotulo: 'Minuta' }],
  },
  ...extra,
})

describe('gavetaDaForma', () => {
  it('tarefa de usuário e ação automática abrem as perguntas de hoje', () => {
    expect(gavetaDaForma({ tipo: 'userTask' }, false)).toBe('etapa')
    expect(gavetaDaForma({ tipo: 'userTask', variante: 'usuario' }, false)).toBe('etapa')
    expect(gavetaDaForma({ tipo: 'serviceTask' }, false)).toBe('etapa')
  })
  it('envio e recebimento de mensagem abrem a gaveta nova', () => {
    expect(gavetaDaForma({ tipo: 'userTask', variante: 'envio' }, false)).toBe('forma')
    expect(gavetaDaForma({ tipo: 'userTask', variante: 'recebimento' }, false)).toBe('forma')
  })
  it('escolha abre a de hoje; ao mesmo tempo só é bloco quando o fluxo o tem', () => {
    expect(gavetaDaForma({ tipo: 'exclusiveGateway' }, false)).toBe('escolha')
    expect(gavetaDaForma({ tipo: 'parallelGateway' }, true)).toBe('bloco')
    expect(gavetaDaForma({ tipo: 'parallelGateway' }, false)).toBe('forma')
  })
  it('início, fim (de toda variante), intermediários, subprocesso e baseado em evento abrem a nova', () => {
    for (const f of [{ tipo: 'start' }, { tipo: 'end' }, { tipo: 'end', variante: 'erro' }, { tipo: 'intermediateEvent' },
      { tipo: 'subProcess' }, { tipo: 'eventGateway' }] as FormaDesenho[]) expect(gavetaDaForma(f, false)).toBe('forma')
  })
})

describe('nomeDoElemento', () => {
  it('o nome da paleta pela variante (e o padrão sem variante gravada)', () => {
    expect(nomeDoElemento({ tipo: 'end' })).toBe('Fim')
    expect(nomeDoElemento({ tipo: 'end', variante: 'erro' })).toBe('Fim com erro')
    expect(nomeDoElemento({ tipo: 'intermediateEvent' })).toBe('Temporizador')
    expect(nomeDoElemento({ tipo: 'userTask', variante: 'envio' })).toBe('Envio de mensagem')
    expect(nomeDoElemento({ tipo: 'exclusiveGateway', modo: 'todos' })).toBe('Inclusivo')
    expect(nomeDoElemento({ tipo: 'eventGateway' })).toBe('Baseado em evento')
    expect(nomeDoElemento({ tipo: 'serviceTask' })).toBe('Ação automática')
  })
})

describe('gavetaDoAlvo', () => {
  const d = base()
  it('acha cada tipo de alvo', () => {
    expect(gavetaDoAlvo({ k: 'forma', id: 't1' }, d)).toBe('etapa')
    expect(gavetaDoAlvo({ k: 'forma', id: 'tm' }, d)).toBe('forma')
    expect(gavetaDoAlvo({ k: 'seta', id: 's1' }, d)).toBe('seta')
    expect(gavetaDoAlvo({ k: 'raia', id: 'r2' }, d)).toBe('raia')
    expect(gavetaDoAlvo({ k: 'fase', id: 'fb' }, d)).toBe('fase')
    expect(gavetaDoAlvo({ k: 'piscina', id: 'principal' }, d)).toBe('piscinaPrincipal')
    expect(gavetaDoAlvo({ k: 'piscina', id: 'ext' }, d)).toBe('piscinaExterna')
    expect(gavetaDoAlvo({ k: 'mensagem', id: 'm1' }, d)).toBe('mensagem')
  })
  it('alvo que não existe mais não abre nada', () => {
    expect(gavetaDoAlvo({ k: 'forma', id: 'x' }, d)).toBeNull()
    expect(gavetaDoAlvo({ k: 'fase', id: 'x' }, d)).toBeNull()
    expect(gavetaDoAlvo({ k: 'piscina', id: 'x' }, d)).toBeNull()
    expect(gavetaDoAlvo({ k: 'fase', id: 'fa' }, base({ layout: undefined }))).toBeNull()
  })
  it('consulta o bloco para o ao mesmo tempo', () => {
    const p = base({ formas: [{ id: 'p', tipo: 'parallelGateway' }] })
    expect(gavetaDoAlvo({ k: 'forma', id: 'p' }, p, (id) => id === 'p')).toBe('bloco')
    expect(gavetaDoAlvo({ k: 'forma', id: 'p' }, p)).toBe('forma')
  })
})

describe('configurações', () => {
  it('temporizador: completa o gravado e troca os padrões pela espera', () => {
    expect(configTemporizador(undefined)).toEqual({ espera: 'prazo', n: 1, unidade: 'diasUteis' })
    expect(configTemporizador({ espera: 'prazo', n: 5, unidade: 'horasUteis' })).toEqual({ espera: 'prazo', n: 5, unidade: 'horasUteis' })
    expect(configTemporizador({ espera: 'data' })).toEqual({ espera: 'data', n: 30, unidade: 'diasUteis', campoData: 'vencimento', sentido: 'antes' })
    expect(configTemporizador({ espera: 'data', n: 10, campoData: 'assinatura', sentido: 'depois' }))
      .toMatchObject({ n: 10, campoData: 'assinatura', sentido: 'depois' })
    expect(configTemporizador({ unidade: 'semanas', n: -2 } as never)).toEqual({ espera: 'prazo', n: 1, unidade: 'diasUteis' })
  })
  it('subprocesso: ativa, leva o contrato e espera por padrão; versão fixa só com a versão', () => {
    expect(configSubprocesso(undefined)).toEqual({ versao: 'ativa', levarContrato: true, campos: [], esperar: true })
    expect(configSubprocesso({ processId: 'w1', versao: 'fixa', versaoFixa: 3, levarContrato: false, campos: ['a', 2 as never], esperar: false }))
      .toEqual({ processId: 'w1', versao: 'fixa', versaoFixa: 3, levarContrato: false, campos: ['a'], esperar: false })
    expect(configSubprocesso({ versao: 'ativa', versaoFixa: 3 } as never)).not.toHaveProperty('versaoFixa')
  })
  it('fim: avisar quem iniciou nasce marcado', () => {
    expect(configFim(undefined)).toEqual({ avisarQuemIniciou: true })
    expect(configFim({ motivo: 'x', codigo: 'Y', avisarQuemIniciou: false })).toEqual({ motivo: 'x', codigo: 'Y', avisarQuemIniciou: false })
  })
  it('livre: só as chaves e os tipos do padrão', () => {
    expect(configLivre({ canal: 'email', levaAnexos: true, estranho: 1, para: 3 } as never, ENVIO_PADRAO))
      .toEqual({ ...ENVIO_PADRAO, canal: 'email', levaAnexos: true })
  })
  it('comConfig: mescla, tira com undefined e devolve a mesma forma sem mudança', () => {
    const f: FormaDesenho = { id: 'x', tipo: 'end', variante: 'erro', config: { motivo: 'a' } }
    expect(comConfig(f, { motivo: 'a' })).toBe(f)
    expect(comConfig(f, { codigo: 'C' }).config).toEqual({ motivo: 'a', codigo: 'C' })
    expect(comConfig(f, { motivo: undefined }).config).toEqual({})
    expect(comConfig({ id: 'y', tipo: 'start' }, { quando: 'mes' }).config).toEqual({ quando: 'mes' })
  })
  it('camposDoTexto', () => {
    expect(camposDoTexto(' Objeto, Valor estimado , ,')).toEqual(['Objeto', 'Valor estimado'])
  })
})

describe('workflowsAtivos', () => {
  it('só os ativos, sem o próprio, por nome', () => {
    const l = [
      { id: 'a', name: 'Zeta', status: 'ACTIVE' }, { id: 'b', name: 'Alfa', status: 'ACTIVE' },
      { id: 'c', name: 'Beta', status: 'DRAFT' }, { id: 'eu', name: 'Eu', status: 'ACTIVE' },
    ]
    expect(workflowsAtivos(l, 'eu').map((w) => w.id)).toEqual(['b', 'a'])
    expect(workflowsAtivos(null)).toEqual([])
  })
})

describe('contas das gavetas', () => {
  const alturaDe = () => 80
  it('tarefas de usuário na raia e quantas usam o padrão', () => {
    const d = base({
      formas: [
        { id: 'a', tipo: 'userTask' }, { id: 'b', tipo: 'userTask' }, { id: 'c', tipo: 'userTask' },
        { id: 'env', tipo: 'userTask', variante: 'envio' }, { id: 's', tipo: 'serviceTask' },
      ],
      posicoes: { a: { x: 0, y: 10 }, b: { x: 200, y: 10 }, c: { x: 0, y: 250 }, env: { x: 400, y: 10 }, s: { x: 600, y: 10 } },
    })
    const steps: Record<string, StepFormSchema> = {
      a: { stepId: 'a', stepName: 'A', fields: [] },
      b: { stepId: 'b', stepName: 'B', fields: [], executor: { ...EXEC } },
    }
    expect(tarefasNaRaia(d, 'r1', alturaDe, steps)).toEqual({ total: 2, usamOPadrao: 1 })
    expect(tarefasNaRaia(d, 'r2', alturaDe, steps)).toEqual({ total: 1, usamOPadrao: 1 })
  })
  it('formas na fase pelo centro; antes da primeira e depois da última contam nas pontas', () => {
    const fases = [{ id: 'a', largura: 100 }, { id: 'b', largura: 100 }, { id: 'c', largura: 100 }]
    const xs = [-20, 50, 100, 150, 250, 900]
    expect(formasNaFase(fases, 'a', xs)).toBe(2)
    expect(formasNaFase(fases, 'b', xs)).toBe(2)
    expect(formasNaFase(fases, 'c', xs)).toBe(2)
    expect(formasNaFase(fases, 'x', xs)).toBe(0)
  })
})

describe('raia', () => {
  it('executor padrão: põe, tira e devolve o mesmo sem mudança', () => {
    const d = base()
    const com = executorDaRaia(d, 'r1', { ...EXEC })
    expect(com.raias[0].executor).toEqual(EXEC)
    expect(executorDaRaia(com, 'r1', com.raias[0].executor)).toBe(com)
    expect(executorDaRaia(com, 'r1', undefined).raias[0]).not.toHaveProperty('executor')
    expect(executorDaRaia(d, 'nao', { ...EXEC })).toBe(d)
  })
  it('nome em branco não grava', () => {
    const d = base()
    expect(nomeDaRaia(d, 'r1', '  ')).toBe(d)
    expect(nomeDaRaia(d, 'r1', ' Diretoria ').raias[0].nome).toBe('Diretoria')
  })
})

describe('restaurarAlvo (Cancelar)', () => {
  const antes = base()
  it('forma: volta a forma inteira, sem mexer nas outras nem nas posições', () => {
    const atual = { ...antes, formas: antes.formas.map((f) => (f.id === 'tm' ? { ...f, nome: 'Espera', config: { espera: 'data' as const, n: 3, unidade: 'diasUteis' as const } } : f)), posicoes: { ...antes.posicoes, tm: { x: 900, y: 0 } } }
    const r = restaurarAlvo(atual, antes, { k: 'forma', id: 'tm' })
    expect(r.formas.find((f) => f.id === 'tm')).toBe(antes.formas.find((f) => f.id === 'tm'))
    expect(r.posicoes.tm).toEqual({ x: 900, y: 0 })
    expect(restaurarAlvo(antes, antes, { k: 'forma', id: 'tm' })).toBe(antes)
  })
  it('raia: nome e executor voltam; a altura fica', () => {
    const atual = { ...executorDaRaia(nomeDaRaia(antes, 'r1', 'Outra'), 'r1', { ...EXEC }) }
    atual.raias = atual.raias.map((r) => (r.id === 'r1' ? { ...r, altura: 320 } : r))
    const r = restaurarAlvo(atual, antes, { k: 'raia', id: 'r1' })
    expect(r.raias[0]).toEqual({ id: 'r1', nome: 'Jurídico', altura: 320 })
  })
  it('fase: nome e prazo voltam; a largura fica', () => {
    const l = antes.layout!
    const atual: DesenhoV2 = { ...antes, layout: { ...l, fases: [{ id: 'fa', nome: 'X', largura: 480, prazoDiasUteis: 9 }, l.fases[1]] } }
    expect(restaurarAlvo(atual, antes, { k: 'fase', id: 'fa' }).layout!.fases[0]).toEqual({ id: 'fa', nome: 'Fase 1', largura: 480 })
  })
  it('piscina externa: nome, quem e canal; principal: a orientação', () => {
    const l = antes.layout!
    const atual: DesenhoV2 = { ...antes, layout: { ...l, orientacao: 'vertical', piscinasExternas: [{ ...l.piscinasExternas[0], nome: 'Órgão', quem: 'orgao', canal: 'email', altura: 200 }] } }
    expect(restaurarAlvo(atual, antes, { k: 'piscina', id: 'ext' }).layout!.piscinasExternas[0])
      .toEqual({ id: 'ext', nome: 'Fornecedor', altura: 200, quem: 'contratada', canal: 'portal' })
    expect(restaurarAlvo(atual, antes, { k: 'piscina', id: 'principal' }).layout!.orientacao).toBe('horizontal')
  })
  it('mensagem: o rótulo volta (e some, se não havia)', () => {
    const l = antes.layout!
    const atual: DesenhoV2 = { ...antes, layout: { ...l, fluxosMensagem: [{ id: 'm1', de: 't2', para: 'ext', rotulo: 'Outro' }] } }
    expect(restaurarAlvo(atual, antes, { k: 'mensagem', id: 'm1' }).layout!.fluxosMensagem[0].rotulo).toBe('Minuta')
    const semRotulo: DesenhoV2 = { ...antes, layout: { ...l, fluxosMensagem: [{ id: 'm1', de: 't2', para: 'ext' }] } }
    expect(restaurarAlvo(atual, semRotulo, { k: 'mensagem', id: 'm1' }).layout!.fluxosMensagem[0]).not.toHaveProperty('rotulo')
  })
  it('o que sumiu desde a abertura não volta', () => {
    const atual = { ...antes, formas: antes.formas.filter((f) => f.id !== 'tm') }
    expect(restaurarAlvo(atual, antes, { k: 'forma', id: 'tm' })).toBe(atual)
  })
})
