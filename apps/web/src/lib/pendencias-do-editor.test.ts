import { describe, it, expect } from 'vitest'
import type { FluxoBlocos, ItemFluxo } from '@nxt/workflow-core'
import type { StepFormSchema } from '@nxt/types'
import { removerCaminhoComVinculos, secaoDaPendencia } from './pendencias-do-editor'

const at = (id: string, tipo: 'userTask' | 'serviceTask' = 'userTask', vinculoDe?: string): ItemFluxo =>
  ({ kind: 'atividade', id, tipo, ...(vinculoDe ? { vinculoDe } : {}) })
const fluxo = (itens: ItemFluxo[]): FluxoBlocos => ({ versao: 1, inicioId: 'start', fimId: 'end', itens })
const passo = (id: string, p: Partial<StepFormSchema> = {}): StepFormSchema =>
  ({ stepId: id, stepName: `Etapa ${id}`, stepType: 'userTask', executor: { papelId: 'p1' }, slaBusinessDays: 1, ...p }) as StepFormSchema

describe('secaoDaPendencia', () => {
  it('pendência abre a etapa na pergunta que falta', () => {
    expect(secaoDaPendencia({ tipo: 'atividade-incompleta' }, passo('a1', { stepName: '' }))).toBe('identificacao')
    expect(secaoDaPendencia({ tipo: 'atividade-incompleta' }, passo('a1', { executor: undefined }))).toBe('executor')
    expect(secaoDaPendencia({ tipo: 'atividade-incompleta' }, passo('a1', { slaBusinessDays: 0 }))).toBe('prazo')
    expect(secaoDaPendencia({ tipo: 'executor-vago' })).toBe('executor')
    expect(secaoDaPendencia({ tipo: 'tela-so-consulta' })).toBe('formulario')
    expect(secaoDaPendencia({ tipo: 'juncao-travada' })).toBeUndefined()
  })
})

describe('removerCaminhoComVinculos', () => {
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

  it('remover frente de ao mesmo tempo (painel do bloco no Desenho) também promove a cópia', () => {
    const f = fluxo([
      { kind: 'paralelo', id: 'p1', caminhos: [{ id: 'r1', itens: [at('a1')] }, { id: 'r2', itens: [] }, { id: 'r3', itens: [] }] },
      at('a9', 'userTask', 'a1'), at('a8', 'userTask', 'a1'),
    ])
    const r = removerCaminhoComVinculos(f, 'p1', 'r1')
    expect(r.promovidas).toEqual([{ de: 'a1', para: 'a9' }])
    expect(r.fluxo.itens.slice(1)).toEqual([at('a9'), at('a8', 'userTask', 'a9')])
  })
})
