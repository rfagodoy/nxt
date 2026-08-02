import { describe, it, expect } from 'vitest'
import { contarAtividades, checarReducao } from './processes.service'

/* Estes testes existem por causa de um incidente real (01/08/2026): um editor com o
   estado vazio gravou 2 nós por cima de 7 e apagou o desenho do cliente. Nada comparava
   o antes com o depois. A regra abaixo é a que impede a repetição. */

describe('contarAtividades', () => {
  it('conta só ATIVIDADES — gateway e evento não entram', () => {
    const fs = {
      steps: [],
      graph: {
        nodes: [
          { id: 's', type: 'start', name: 'Início' },
          { id: 'a', type: 'userTask', name: 'Preencher' },
          { id: 'b', type: 'serviceTask', name: 'Criar' },
          { id: 'g', type: 'exclusiveGateway', name: 'Aprova?' },
          { id: 'e', type: 'end', name: 'Fim' },
        ],
        edges: [],
      },
    }
    expect(contarAtividades(fs)).toBe(2)
  })

  it('usa a MAIOR contagem entre steps e grafo (rascunho pode ter um deles atrasado)', () => {
    const soSteps = { steps: [{ stepId: 'a' }, { stepId: 'b' }, { stepId: 'c' }], graph: { nodes: [], edges: [] } }
    expect(contarAtividades(soSteps)).toBe(3)
    const soGrafo = { steps: [], graph: { nodes: [{ id: 'a', type: 'userTask' }], edges: [] } }
    expect(contarAtividades(soGrafo)).toBe(1)
  })

  it('formSchema ausente ou vazio conta zero, sem quebrar', () => {
    expect(contarAtividades(null)).toBe(0)
    expect(contarAtividades(undefined)).toBe(0)
    expect(contarAtividades({})).toBe(0)
  })
})

describe('checarReducao', () => {
  it('ZERAR as atividades sempre pede confirmação — foi exatamente o incidente', () => {
    expect(checarReducao(4, 0)).toEqual({ removidas: 4, restantes: 0 })
    expect(checarReducao(1, 0)).toEqual({ removidas: 1, restantes: 0 })
  })

  it('remover METADE ou mais pede confirmação', () => {
    expect(checarReducao(4, 1)).toEqual({ removidas: 3, restantes: 1 })
    expect(checarReducao(10, 2)).toEqual({ removidas: 8, restantes: 2 })
  })

  it('remover MENOS da metade passa direto — editar não pode virar interrogatório', () => {
    expect(checarReducao(4, 3)).toBeNull()
    expect(checarReducao(4, 2)).toBeNull() // exatamente metade ainda passa
    expect(checarReducao(10, 6)).toBeNull()
  })

  it('crescer ou ficar igual nunca pede nada', () => {
    expect(checarReducao(3, 3)).toBeNull()
    expect(checarReducao(3, 9)).toBeNull()
    expect(checarReducao(0, 5)).toBeNull()
  })

  it('fluxo que já estava vazio não dispara nada (workflow recém-criado)', () => {
    expect(checarReducao(0, 0)).toBeNull()
  })

  it('fluxo de UMA atividade só: apagá-la pede confirmação, mas nada além disso', () => {
    expect(checarReducao(1, 0)).not.toBeNull() // zerou → confirma
    expect(checarReducao(1, 1)).toBeNull()
  })
})
