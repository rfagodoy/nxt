import { describe, expect, it } from 'vitest'
import { UnprocessableEntityException } from '@nestjs/common'
import { buildNativeSeed } from '@nxt/screens-core'
import { InstancesService } from './instances.service'

/* "Concluir tarefa" cobra os obrigatórios da tela da atividade (PO, 09/11/2026). Antes, o
   obrigatório só valia ao ATIVAR o contrato: numa atividade, salvar rascunho e concluir
   deixava a escolha seguinte decidir o caminho com o campo em branco. */

const STEP = { stepId: 'N1', stepName: 'Preencher', fields: [], screenRef: 's1', screenSubject: 'CONTRATO', entityMode: 'EDIT' }

function telaDb() {
  const seed = buildNativeSeed('CONTRATO')
  return {
    id: 's1', organizationId: 'org', name: 'T', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: false, isSystem: false, readOnly: false,
    sections: seed.sections,
    fields: seed.fields.map(f => ({ ...f, required: f.nativeKey === 'mao_de_obra' })),
  }
}

function montar(over: { contrato?: Record<string, unknown>; steps?: unknown[] } = {}) {
  const gravado: unknown[] = []
  const task = {
    id: 't1', nodeId: 'N1', tokenId: 'k1', status: 'PENDING', data: {}, assignees: ['u1'], assignee: null, role: null, instanceId: 'i1',
    instance: {
      id: 'i1', status: 'RUNNING', revision: 0, definitionVersion: null,
      graphSnapshot: { nodes: {} },
      state: { status: 'running', tokens: [], joinCounts: {}, variables: { contratoId: 'c1' } },
      processDefinition: { id: 'p1', kind: 'CONTRATO', formSchema: { steps: over.steps ?? [STEP] } },
    },
  }
  const prisma = {
    workflowTask: {
      findFirst: async () => task,
      updateMany: async (a: { data: Record<string, unknown> }) => { gravado.push(a.data); return { count: 1 } },
    },
    contract: { findFirst: async () => ({ id: 'c1', numero: 'C-1', titulo: 'T', situacao: 'EM_CADASTRO', partes: [], maoDeObra: null, ...over.contrato }) },
    screen: { findMany: async () => [telaDb()] },
    screenFieldValue: { findMany: async () => [] },
  }
  const roles = { roleKeysForUser: async () => new Set<string>() }
  const svc = new InstancesService(prisma as never, roles as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  return { svc, gravado }
}
const executor = { sub: 'u1', name: 'Ana', roles: ['user'] } as never

describe('completeTask cobra os obrigatórios da tela', () => {
  it('recusa com 422, o código e os campos pelo nome', async () => {
    const { svc } = montar()
    const erro = await svc.completeTask('t1', { data: { contratoId: 'c1' } } as never, 'org', executor).catch(e => e)
    expect(erro).toBeInstanceOf(UnprocessableEntityException)
    expect(erro.getResponse()).toMatchObject({
      code: 'CAMPOS_OBRIGATORIOS',
      message: 'Para concluir, preencha “Mão de obra alocada”.',
      campos: [{ campo: 'Mão de obra alocada' }],
    })
  })

  it('a recusa guarda o vínculo do contrato e não encerra a tarefa', async () => {
    const { svc, gravado } = montar()
    await svc.completeTask('t1', { data: { contratoId: 'c1' } } as never, 'org', executor).catch(() => null)
    expect(gravado).toEqual([{ data: { contratoId: 'c1' } }])
  })

  it('preenchido, a conferência deixa passar', async () => {
    const { svc } = montar({ contrato: { maoDeObra: false } })
    const erro = await svc.completeTask('t1', { data: { contratoId: 'c1' } } as never, 'org', executor).catch(e => e)
    expect(erro?.getResponse?.()?.code).not.toBe('CAMPOS_OBRIGATORIOS')
  })

  it('atividade sem Tela não é conferida', async () => {
    const { svc } = montar({ steps: [{ stepId: 'N1', stepName: 'X', fields: [] }] })
    const erro = await svc.completeTask('t1', { data: {} } as never, 'org', executor).catch(e => e)
    expect(erro?.getResponse?.()?.code).not.toBe('CAMPOS_OBRIGATORIOS')
  })
})
