import { describe, expect, it } from 'vitest'
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common'
import { buildNativeSeed } from '@nxt/screens-core'
import { ConferenciaTelaService } from './conferencia-tela.service'
import type { PrismaService } from '../prisma.service'
import type { WorkflowRolesService } from '../workflow-roles/workflow-roles.service'
import type { CurrentUserData } from '../auth/current-user.decorator'

/* Telas como o banco devolve: a PADRÃO (valor total travado) e a da ETAPA (nada travado). */
function telaDb(id: string, opts: { isDefault: boolean; travar?: string[]; readOnly?: boolean }) {
  const seed = buildNativeSeed('CONTRATO')
  return {
    id, organizationId: 'org', name: id, subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: opts.isDefault,
    isSystem: false, readOnly: opts.readOnly ?? false, sections: seed.sections,
    fields: seed.fields.map(f => ({ ...f, locked: opts.travar?.includes(f.nativeKey!) ?? false })),
  }
}
const PADRAO = telaDb('tela-padrao', { isDefault: true, travar: ['valor_total'] })
const ETAPA  = telaDb('tela-etapa', { isDefault: false })

const step = {
  stepId: 'n1', stepName: 'Revisar', fields: [], screenRef: 'tela-etapa', screenSubject: 'CONTRATO',
  entityMode: 'EDIT', lockedFields: [] as string[],
}
function tarefa(over: Record<string, unknown> = {}) {
  return {
    id: 't1', nodeId: 'n1', status: 'PENDING', role: null, assignee: 'u1', assignees: [],
    instance: {
      status: 'RUNNING', definitionVersion: 2, state: { variables: { contratoId: 'c1' } },
      processDefinition: { id: 'p1', formSchema: { steps: [{ ...step, screenRef: 'OUTRA' }] } }, // viva: diferente!
    },
    ...over,
  }
}

function servico(o: { task?: unknown; retrato?: unknown; valores?: { fieldId: string; value: string }[] } = {}) {
  const prisma = {
    screen: {
      findMany: async () => [PADRAO],
      findFirst: async ({ where }: { where: { id: string } }) => [PADRAO, ETAPA].find(t => t.id === where.id) ?? null,
    },
    workflowTask: { findFirst: async () => (o.task === undefined ? tarefa() : o.task) },
    processDefinitionVersion: { findFirst: async () => (o.retrato === undefined ? { formSchema: { steps: [step] } } : o.retrato) },
    screenFieldValue: { findMany: async () => o.valores ?? [] },
    appSetting: { findUnique: async () => null },
  } as unknown as PrismaService
  const roles = { roleKeysForUser: async () => new Set<string>() } as unknown as WorkflowRolesService
  return new ConferenciaTelaService(prisma, roles, { papelLabels: async () => new Map() } as never)
}

const ana: CurrentUserData = { sub: 'u1', name: 'Ana', roles: [] }
const bia: CurrentUserData = { sub: 'u2', name: 'Bia', roles: [] }
const base = { organizationId: 'org', subject: 'CONTRATO' as const, entidadeId: 'c1' }
const comTarefa = { tarefaId: 't1', telaId: 'tela-etapa' }

describe('qual tela vale', () => {
  it('sem cabeçalho: a padrão do tipo', async () => {
    const r = await servico().telaQueVale({ ...base, actor: ana, origem: {} })
    expect([r.origem, r.screen?.id]).toEqual(['padrao', 'tela-padrao'])
  })
  it('tarefa válida: a tela da aba, lida da versão CONGELADA (não da definição viva)', async () => {
    const r = await servico().telaQueVale({ ...base, actor: ana, origem: comTarefa })
    expect([r.origem, r.screen?.id]).toEqual(['tarefa', 'tela-etapa'])
  })
  it.each([
    ['quem não pode agir na tarefa', { actor: bia }],
    ['outro registro que não o do processo', { entidadeId: 'c2' }],
    ['tela que não é aba da etapa', { origem: { tarefaId: 't1', telaId: 'tela-padrao' } }],
  ])('%s → cai na tela padrão', async (_n, over) => {
    const r = await servico().telaQueVale({ ...base, actor: ana, origem: comTarefa, ...over })
    expect(r.origem).toBe('padrao')
  })
  it('tarefa já concluída → tela padrão', async () => {
    const r = await servico({ task: tarefa({ status: 'DONE' }) }).telaQueVale({ ...base, actor: ana, origem: comTarefa })
    expect(r.origem).toBe('padrao')
  })
  it('etapa de CONSULTA força a tela inteira em consulta', async () => {
    const r = await servico({ retrato: { formSchema: { steps: [{ ...step, entityMode: 'VIEW' }] } } })
      .telaQueVale({ ...base, actor: ana, origem: comTarefa })
    expect(r.lock.screenReadOnly).toBe(true)
  })
})

describe('conferir', () => {
  const antes = { numero: 'C-1', titulo: 'T', situacao: 'VIGENTE', valorTotal: 100, partes: [] }

  it('valor travado na tela padrão: recusa com 403 CAMPO_TRAVADO e a frase', async () => {
    const err = await servico().conferir({ ...base, actor: ana, origem: {}, antes, depois: { valorTotal: 999 } }).catch(e => e)
    expect(err).toBeInstanceOf(ForbiddenException)
    expect(err.getResponse()).toMatchObject({ code: 'CAMPO_TRAVADO', message: '“Valor total do contrato” está travado nesta tela e não pode ser alterado.' })
  })
  it('a mesma alteração pela aba da tarefa (que não trava) passa', async () => {
    await expect(servico().conferir({ ...base, actor: ana, origem: comTarefa, antes, depois: { valorTotal: 999 } })).resolves.toBeUndefined()
  })
  it('cabeçalho forjado (outro usuário) não destrava: vale a padrão e recusa', async () => {
    const err = await servico().conferir({ ...base, actor: bia, origem: comTarefa, antes, depois: { valorTotal: 999 } }).catch(e => e)
    expect(err).toBeInstanceOf(ForbiddenException)
  })
  it('ativar sem o que o contrato precisa: 422 CAMPOS_OBRIGATORIOS', async () => {
    const err = await servico().conferir({
      ...base, actor: ana, origem: {}, antes: { ...antes, situacao: 'EM_CADASTRO' }, depois: { situacao: 'VIGENTE' },
    }).catch(e => e)
    expect(err).toBeInstanceOf(UnprocessableEntityException)
    expect(err.getResponse()).toMatchObject({ code: 'CAMPOS_OBRIGATORIOS' })
    expect(err.getResponse().message).toMatch(/^Para ativar, preencha: “Tipo de contrato”/)
  })
})
