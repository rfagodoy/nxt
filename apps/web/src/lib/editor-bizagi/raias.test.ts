import { describe, expect, it } from 'vitest'
import type { DesenhoV2, StepFormSchema } from '@nxt/types'
import { aplicarExecutorDasRaias, avisoDeRaia, herdaDaRaia, raiaDaForma } from './raias'

const EXEC_A = { papelId: 'papel-a', entityType: 'ORG', mode: 'FIXA' } as const
const EXEC_B = { papelId: 'papel-b', entityType: 'ORG', mode: 'FIXA' } as const

const desenho = (posY: number, raias: DesenhoV2['raias'] = [
  { id: 'r1', nome: 'Jurídico', altura: 200, executor: { ...EXEC_A } },
  { id: 'r2', nome: 'Comercial', altura: 200, executor: { ...EXEC_B } },
]): DesenhoV2 => ({
  versao: 2, formas: [], setas: [], raias,
  posicoes: { t1: { x: 0, y: posY } },
})
const alturaDe = () => 80
const passo = (p: Partial<StepFormSchema> = {}): StepFormSchema =>
  ({ stepId: 't1', stepName: 'Tarefa', fields: [], stepType: 'userTask', ...p } as StepFormSchema)

describe('herdaDaRaia', () => {
  it('herda quando não tem executor', () => {
    expect(herdaDaRaia(passo())).toBe(true)
  })
  it('não herda quando escolheu à mão (executorDaRaia: false)', () => {
    expect(herdaDaRaia(passo({ executorDaRaia: false }))).toBe(false)
  })
  it('passo antigo com executor e sem a marca não herda', () => {
    expect(herdaDaRaia(passo({ executor: { ...EXEC_B } }))).toBe(false)
  })
})

describe('raiaDaForma', () => {
  it('decide pelo centro da forma', () => {
    // topo em 170, altura 80 -> centro 210 -> segunda raia
    expect(raiaDaForma(desenho(170), 't1', alturaDe)?.id).toBe('r2')
    expect(raiaDaForma(desenho(100), 't1', alturaDe)?.id).toBe('r1')
  })
  it('sem posição, undefined', () => {
    expect(raiaDaForma(desenho(0), 'x', alturaDe)).toBeUndefined()
  })
})

describe('aplicarExecutorDasRaias', () => {
  it('a tarefa que herda recebe o executor da raia', () => {
    const [r] = aplicarExecutorDasRaias([passo()], desenho(0), alturaDe)
    expect(r.executor).toEqual(EXEC_A)
    expect(r.executorDaRaia).toBe(true)
  })
  it('ida e volta: gravar, reabrir, mover para outra raia e gravar de novo', () => {
    const gravado = aplicarExecutorDasRaias([passo()], desenho(0), alturaDe)
    expect(herdaDaRaia(gravado[0])).toBe(true)
    const [r] = aplicarExecutorDasRaias(gravado, desenho(250), alturaDe)
    expect(r.executor).toEqual(EXEC_B)
  })
  it('mover a forma para outra raia troca o executor', () => {
    const [r] = aplicarExecutorDasRaias([passo({ executor: { ...EXEC_A } , executorDaRaia: true })], desenho(250), alturaDe)
    expect(r.executor).toEqual(EXEC_B)
  })
  it('escolhida à mão não muda, e volta o mesmo objeto', () => {
    const p = passo({ executor: { ...EXEC_B }, executorDaRaia: false })
    expect(aplicarExecutorDasRaias([p], desenho(0), alturaDe)[0]).toBe(p)
  })
  it('raia sem executor não apaga o executor da tarefa', () => {
    const p = passo({ executor: { ...EXEC_B }, executorDaRaia: true })
    const d = desenho(0, [{ id: 'r1', nome: 'Livre', altura: 400 }])
    expect(aplicarExecutorDasRaias([p], d, alturaDe)[0]).toBe(p)
  })
  it('serviceTask não herda', () => {
    const p = passo({ stepType: 'serviceTask' })
    expect(aplicarExecutorDasRaias([p], desenho(0), alturaDe)[0]).toBe(p)
  })
})

describe('avisoDeRaia', () => {
  const raia = { nome: 'Solicitante', executor: { papelId: 'p1', entityType: 'ORG', mode: 'FIXA' } as const }
  const outro = { papelId: 'p2', entityType: 'ORG', mode: 'FIXA' } as const
  const nomes = { daRaia: 'Gestor', responsavel: 'Analista' }
  const FRASE = 'Está na raia “Solicitante”, cujo executor padrão é Gestor, mas quem executa é Analista.'

  it('raia sem executor padrão não avisa', () => {
    expect(avisoDeRaia({ nome: 'Solicitante' }, passo({ executorDaRaia: false, executor: { ...outro } }), nomes)).toBeNull()
    expect(avisoDeRaia({ nome: 'Solicitante' }, passo({ executorDaRaia: false, executor: { papelId: '@iniciador', entityType: 'ORG', mode: 'FIXA' } }), nomes)).toBeNull()
  })
  it('tarefa que herda não avisa', () => {
    expect(avisoDeRaia(raia, passo({ executorDaRaia: true, executor: { ...outro } }), nomes)).toBeNull()
  })
  it('mesmo executor não avisa', () => {
    expect(avisoDeRaia(raia, passo({ executorDaRaia: false, executor: { ...raia.executor } }), nomes)).toBeNull()
  })
  it('tarefa automática não avisa', () => {
    expect(avisoDeRaia(raia, passo({ stepType: 'serviceTask', executorDaRaia: false, executor: { ...outro } }), nomes)).toBeNull()
  })
  it('sem etapa não avisa', () => {
    expect(avisoDeRaia(raia, undefined, nomes)).toBeNull()
  })
  it('outro papel avisa com a frase', () => {
    expect(avisoDeRaia(raia, passo({ executorDaRaia: false, executor: { ...outro } }), nomes)).toBe(FRASE)
  })
  it('mesmo papel em outra entidade avisa', () => {
    expect(avisoDeRaia(raia, passo({ executorDaRaia: false, executor: { ...raia.executor, entityId: 'e2' } }), nomes)).toBe(FRASE)
  })
})
