import { describe, it, expect } from 'vitest'
import { assuntoDoProcesso, comQuem, relativoA, pontualidadeDoProcesso, buildHistory, taskExecutor, pontualidadeLabel, taskPunctuality, type Inst, type TaskRow, type ReturnRow, type EventRow } from './processos-ui'

const task = (over: Partial<TaskRow> & { id: string }): TaskRow => ({
  nodeId: `n-${over.id}`, status: 'DONE', createdAt: '2026-07-26T10:00:00Z', ...over,
})

const ev = (over: Partial<EventRow> & { id: string; event: string }): EventRow => ({
  instanceId: 'i1', reason: 'motivo', user: 'Rafael', createdAt: '2026-07-26T12:00:00Z', ...over,
})

const inst = (over: Partial<Inst>): Inst => ({
  id: 'i1', numero: 1, processName: 'P', version: 1, status: 'RUNNING',
  error: null, stepName: null, startedBy: null, startedAt: '2026-07-26T10:00:00Z',
  completedAt: null, updatedAt: '2026-07-26T10:00:00Z',
  currentStep: null, currentDueAt: null, currentOverdue: false,
  totalSteps: 1, doneSteps: 0, hasSla: true, onTime: true, durationMs: null,
  processDueAt: '2026-07-28T18:00:00Z', processOverdue: false, processOnTime: true,
  returnCount: 0, ...over,
})

/* "sem prazo" precisa significar UMA coisa só: workflow sem SLA. Enquanto cobria
   também cancelado, a linha exibia "Data prevista" preenchida ao lado de "sem prazo". */
describe('pontualidadeLabel', () => {
  it('processo cancelado tem rótulo próprio, mesmo tendo prazo', () => {
    expect(pontualidadeLabel(inst({ status: 'CANCELLED', processOnTime: null }))).toBe('cancelado')
  })
  it('cancelado NÃO é julgado pelo prazo (nem no prazo, nem atrasado)', () => {
    expect(pontualidadeLabel(inst({ status: 'CANCELLED', processOnTime: false }))).toBe('cancelado')
    expect(pontualidadeLabel(inst({ status: 'CANCELLED', processOnTime: true }))).toBe('cancelado')
  })
  it('"sem prazo" fica só para workflow sem SLA', () => {
    expect(pontualidadeLabel(inst({ status: 'RUNNING', processOnTime: null }))).toBe('sem prazo')
  })
  it('em andamento e concluído seguem avaliados', () => {
    expect(pontualidadeLabel(inst({ processOnTime: true }))).toBe('no prazo')
    expect(pontualidadeLabel(inst({ processOnTime: false }))).toBe('atrasado')
    expect(pontualidadeLabel(inst({ status: 'COMPLETED', processOnTime: false }))).toBe('atrasado')
  })
})

describe('taskPunctuality', () => {
  it('tarefa cancelada não é cobrada de pontualidade', () => {
    const t: TaskRow = { id: 't', nodeId: 'n', status: 'CANCELED', createdAt: '2026-07-20T10:00:00Z', dueAt: '2026-07-21T10:00:00Z' }
    expect(taskPunctuality(t).label).toBe('cancelada')
  })
  it('tarefa pendente vencida continua atrasada', () => {
    const t: TaskRow = { id: 't', nodeId: 'n', status: 'PENDING', createdAt: '2026-07-20T10:00:00Z', dueAt: '2020-01-01T10:00:00Z' }
    expect(taskPunctuality(t).label).toBe('atrasada')
  })
})

/* O histórico do processo é a única tela onde a troca de responsável e o
   cancelamento aparecem — se um evento sumir daqui, a linha do tempo mente. */
describe('buildHistory', () => {
  it('mantém o comportamento antigo quando não há eventos', () => {
    const t = task({ id: 't1', completedAt: '2026-07-26T11:00:00Z' })
    const h = buildHistory([t], [])
    expect(h).toHaveLength(1)
    expect(h[0].kind).toBe('done')
  })

  it('inclui delegação carregando a tarefa correspondente', () => {
    const t = task({ id: 't1', name: 'Conferir documentos', status: 'PENDING', completedAt: null })
    const e = ev({ id: 'e1', event: 'DELEGADO', taskId: 't1', fromUser: 'Ana', toUser: 'Bruno', reason: 'férias' })
    const h = buildHistory([t], [], [e])
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ kind: 'delegate', from: 'Ana', to: 'Bruno', reason: 'férias', by: 'Rafael' })
    expect(h[0].task?.name).toBe('Conferir documentos')
  })

  it('inclui cancelamento SEM tarefa (é evento da instância)', () => {
    const h = buildHistory([], [], [ev({ id: 'e2', event: 'CANCELADO', detail: 'Solicitação de contrato', reason: 'duplicado' })])
    expect(h).toHaveLength(1)
    expect(h[0].task).toBeUndefined()
    expect(h[0]).toMatchObject({ kind: 'cancel', label: 'Solicitação de contrato', reason: 'duplicado' })
  })

  it('ordena tudo junto, do mais recente para o mais antigo', () => {
    const tasks: TaskRow[] = [
      task({ id: 't1', completedAt: '2026-07-26T09:00:00Z' }),
      task({ id: 't2', status: 'RETURNED', completedAt: '2026-07-26T10:30:00Z', nodeId: 'n2' }),
    ]
    const returns: ReturnRow[] = [
      { id: 'r1', fromNodeId: 'n2', toName: 'Análise', reason: 'faltou anexo', user: 'Ana', createdAt: '2026-07-26T10:30:00Z' },
    ]
    const events = [ev({ id: 'e1', event: 'DELEGADO', taskId: 't1', createdAt: '2026-07-26T13:00:00Z' })]
    expect(buildHistory(tasks, returns, events).map((e) => e.kind)).toEqual(['delegate', 'return', 'done'])
  })

  it('nunca mostra id cru na coluna Executor', () => {
    // a delegação grava o ID do usuário em `assignee`; o rótulo vem resolvido ao vivo
    const delegada = task({ id: 't1', status: 'PENDING', assignee: 'cms21qa9c0003pouwhd59uoh7', assigneeNames: ['Bruno Teste'] })
    expect(taskExecutor(delegada)).toBe('Bruno Teste')

    const concluida = task({ id: 't2', completedBy: 'Ana', assignee: 'cms2xyz', assigneeNames: ['Bruno Teste'] })
    expect(taskExecutor(concluida)).toBe('Ana')

    // sem nome resolvido, cai no papel — nunca no id
    const semNome = task({ id: 't3', status: 'PENDING', assignee: 'cms2xyz', role: 'Financeiro' })
    expect(taskExecutor(semNome)).toBe('Financeiro')
    expect(taskExecutor(task({ id: 't4', status: 'PENDING', assignee: 'cms2xyz' }))).toBe('—')
  })

  it('delegação de tarefa que já não existe na lista não quebra a trilha', () => {
    const h = buildHistory([], [], [ev({ id: 'e1', event: 'DELEGADO', taskId: 'sumiu', toUser: 'Bruno' })])
    expect(h).toHaveLength(1)
    expect(h[0].task).toBeUndefined()
  })
})

/* Reabertura: o evento precisa aparecer na MESMA trilha do cancelamento, senão o
   histórico conta que o processo foi cancelado e nunca explica por que voltou. */
describe('buildHistory — reabertura', () => {
  it('inclui a reabertura como evento próprio', () => {
    const h = buildHistory([], [], [ev({ id: 'e3', event: 'REATIVADO', detail: 'Solicitação de contrato', reason: 'cancelado por engano' })])
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ kind: 'reopen', reason: 'cancelado por engano', by: 'Rafael' })
  })

  it('cancelamento e reabertura convivem, do mais recente para o mais antigo', () => {
    const eventos = [
      ev({ id: 'c1', event: 'CANCELADO', reason: 'duplicado', createdAt: '2026-07-26T12:00:00Z' }),
      ev({ id: 'u1', event: 'REATIVADO', reason: 'engano', createdAt: '2026-07-26T15:00:00Z' }),
    ]
    expect(buildHistory([], [], eventos).map((e) => e.kind)).toEqual(['reopen', 'cancel'])
  })
})

describe('assuntoDoProcesso', () => {
  it('separa número e título do contrato e leva a contraparte', () => {
    expect(assuntoDoProcesso({ assunto: { tipo: 'CONTRATO', titulo: 'CCT_1 — Serviços de limpeza', contraparte: 'GOLDNET' } }))
      .toEqual({ titulo: 'Serviços de limpeza', numero: 'CCT_1', contraparte: 'GOLDNET' })
  })
  it('parceiro fica só com o nome; sem assunto, nulo', () => {
    expect(assuntoDoProcesso({ assunto: { tipo: 'PARCEIRO', titulo: 'ACME' } })).toEqual({ titulo: 'ACME', numero: '', contraparte: '' })
    expect(assuntoDoProcesso({ assunto: null })).toBeNull()
  })
})

describe('comQuem', () => {
  it('um, dois ou mais nomes', () => {
    expect(comQuem([])).toBe('')
    expect(comQuem(['Ana'])).toBe('com Ana')
    expect(comQuem(['Ana', 'Bruno'])).toBe('com Ana e Bruno')
    expect(comQuem(['Ana', 'Bruno', 'Caio'])).toBe('com Ana e mais 2')
  })
})

describe('relativoA', () => {
  const base = { processName: 'Solicitação de contratos', startedBy: 'Laryssa', startedAt: '2026-11-22T12:00:00' }
  it('tipo do workflow e o contrato', () => {
    expect(relativoA({ ...base, kind: 'DISTRATO', assunto: { tipo: 'CONTRATO', titulo: 'CCT_1 — Limpeza', contraparte: 'GOLDNET' } }))
      .toEqual({ tipo: 'Encerramento', titulo: 'Limpeza', detalhe: 'CCT_1 · GOLDNET', semContrato: false })
    expect(relativoA({ ...base, kind: 'ADITIVO', assunto: { tipo: 'CONTRATO', titulo: 'CCT_1 — Limpeza' } }).tipo).toBe('Aditivo')
  })
  it('sem contrato ainda: diz isso, com o workflow e quem iniciou', () => {
    const r = relativoA({ ...base, kind: 'CONTRATO', assunto: null })
    expect(r.semContrato).toBe(true)
    expect(r.titulo).toBe('Contrato ainda não cadastrado')
    expect(r.detalhe).toBe('Solicitação de contratos · iniciado por Laryssa em 22/11/2026')
  })
})

describe('pontualidadeDoProcesso', () => {
  const agora = new Date(2026, 10, 22, 14, 0)
  const em = (dias: number, h = 18) => new Date(2026, 10, 22 + dias, h, 0).toISOString()
  const run = (o: object) => ({ status: 'RUNNING' as const, processDueAt: null, processOverdue: false, processOnTime: true, ...o })
  it('em andamento: no prazo, vence amanhã, vence hoje e atrasado N dias', () => {
    expect(pontualidadeDoProcesso(run({ processDueAt: em(10) }), agora)).toEqual({ texto: 'no prazo', tom: 'ok' })
    expect(pontualidadeDoProcesso(run({ processDueAt: em(1) }), agora).texto).toBe('vence amanhã')
    expect(pontualidadeDoProcesso(run({ processDueAt: em(0) }), agora).texto).toBe('vence hoje')
    expect(pontualidadeDoProcesso(run({ processDueAt: em(-3), processOverdue: true }), agora)).toEqual({ texto: 'atrasado 3 dias', tom: 'atraso' })
    expect(pontualidadeDoProcesso(run({ processDueAt: em(0, 9), processOverdue: true }), agora).texto).toBe('atrasado 1 dia')
  })
  it('sem prazo, concluído, cancelado e sem conclusão', () => {
    expect(pontualidadeDoProcesso(run({}), agora).texto).toBe('sem prazo')
    expect(pontualidadeDoProcesso({ status: 'COMPLETED', processDueAt: em(-5), processOverdue: false, processOnTime: false }, agora).texto).toBe('concluído com atraso')
    expect(pontualidadeDoProcesso({ status: 'CANCELLED', processDueAt: null, processOverdue: false, processOnTime: null }, agora).texto).toBe('cancelado')
    expect(pontualidadeDoProcesso({ status: 'ENDED_INCOMPLETE', processDueAt: null, processOverdue: false, processOnTime: null }, agora).texto).toBe('sem conclusão')
  })
})
