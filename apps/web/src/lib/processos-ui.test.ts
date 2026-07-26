import { describe, it, expect } from 'vitest'
import { buildHistory, taskExecutor, type TaskRow, type ReturnRow, type EventRow } from './processos-ui'

const task = (over: Partial<TaskRow> & { id: string }): TaskRow => ({
  nodeId: `n-${over.id}`, status: 'DONE', createdAt: '2026-07-26T10:00:00Z', ...over,
})

const ev = (over: Partial<EventRow> & { id: string; event: string }): EventRow => ({
  instanceId: 'i1', reason: 'motivo', user: 'Rafael', createdAt: '2026-07-26T12:00:00Z', ...over,
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
