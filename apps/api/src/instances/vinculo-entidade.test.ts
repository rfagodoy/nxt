import { describe, expect, it } from 'vitest'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { InstancesService } from './instances.service'

/* Vínculo da entidade gravada pela Tela ANTES de concluir (11/10/2026): sem ele, fechar a
   aba ou ter a conclusão recusada e reabrir mostrava o formulário vazio — e o novo
   "Salvar" criava um contrato duplicado. */

const STEP_TELA = { stepId: 'N1', stepName: 'Preencher', fields: [], screenRef: 's1', screenSubject: 'CONTRATO', entityMode: 'CREATE' }

function montar(over: { task?: Record<string, unknown>; contrato?: unknown; steps?: unknown[] } = {}) {
  const gravado: { data?: unknown; where?: unknown }[] = []
  const task = {
    id: 't1', nodeId: 'N1', status: 'PENDING', data: {}, assignees: ['u1'], assignee: null, role: null,
    instance: { definitionVersion: null, processDefinition: { id: 'p1', formSchema: { steps: over.steps ?? [STEP_TELA] } } },
    ...over.task,
  }
  const prisma = {
    workflowTask: {
      findFirst: async () => task,
      updateMany: async (a: { where: unknown; data: { data: unknown } }) => { gravado.push({ where: a.where, data: a.data.data }); return { count: 1 } },
    },
    contract: { findFirst: async () => ('contrato' in over ? over.contrato : { id: 'c1' }) },
    partner: { findFirst: async () => null },
  }
  const roles = { roleKeysForUser: async () => new Set<string>() }
  const svc = new InstancesService(prisma as never, roles as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  return { svc, gravado }
}
const executor = { sub: 'u1', name: 'Ana', roles: ['user'] } as never

describe('linkTaskEntity', () => {
  it('grava o id do contrato em task.data, preservando o que já havia', async () => {
    const { svc, gravado } = montar({ task: { data: { outra: 1 } } })
    await expect(svc.linkTaskEntity('t1', 'c1', 'org', executor)).resolves.toEqual({ ok: true, contratoId: 'c1' })
    expect(gravado).toEqual([{ where: { id: 't1', status: 'PENDING' }, data: { outra: 1, contratoId: 'c1' } }])
  })
  it('aceita task.data ainda em texto (coluna JSON do SQL Server)', async () => {
    const { svc, gravado } = montar({ task: { data: '{"outra":2}' } })
    await svc.linkTaskEntity('t1', 'c1', 'org', executor)
    expect(gravado[0].data).toEqual({ outra: 2, contratoId: 'c1' })
  })
  it('quem não é executor não vincula', async () => {
    const { svc, gravado } = montar()
    await expect(svc.linkTaskEntity('t1', 'c1', 'org', { sub: 'u9', name: 'X', roles: ['user'] } as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(gravado).toEqual([])
  })
  it('contrato de outra organização (ou inexistente) é recusado', async () => {
    const { svc, gravado } = montar({ contrato: null })
    await expect(svc.linkTaskEntity('t1', 'cX', 'org', executor)).rejects.toBeInstanceOf(NotFoundException)
    expect(gravado).toEqual([])
  })
  it('tarefa concluída ou atividade sem Tela → recusa', async () => {
    await expect(montar({ task: { status: 'DONE' } }).svc.linkTaskEntity('t1', 'c1', 'org', executor)).rejects.toBeInstanceOf(BadRequestException)
    await expect(montar({ steps: [{ stepId: 'N1', stepName: 'X', fields: [] }] }).svc.linkTaskEntity('t1', 'c1', 'org', executor)).rejects.toBeInstanceOf(BadRequestException)
  })
})
