import { describe, it, expect } from 'vitest'
import { canActOnTask } from './task-access'

const keys = (...k: string[]) => new Set(k)

describe('canActOnTask', () => {
  it('admin pode tudo', () => {
    expect(canActOnTask({ role: 'Diretor' }, 'u1', keys(), true)).toBe(true)
    expect(canActOnTask({ assignee: 'outro' }, 'u1', keys(), true)).toBe(true)
  })

  it('tarefa atribuída direto: só o responsável', () => {
    expect(canActOnTask({ assignee: 'u1' }, 'u1', keys(), false)).toBe(true)
    expect(canActOnTask({ assignee: 'u2' }, 'u1', keys(), false)).toBe(false)
  })

  it('tarefa por papel: só quem participa', () => {
    expect(canActOnTask({ role: 'Gestor' }, 'u1', keys('Gestor'), false)).toBe(true)
    expect(canActOnTask({ role: 'Gestor' }, 'u1', keys('Diretor'), false)).toBe(false)
  })

  it('casa papel por id ou por nome', () => {
    expect(canActOnTask({ role: 'role_123' }, 'u1', keys('role_123', 'Gestor'), false)).toBe(true)
    expect(canActOnTask({ role: 'Gestor' }, 'u1', keys('role_123', 'Gestor'), false)).toBe(true)
  })

  it('tarefa aberta (sem papel/responsável): qualquer um', () => {
    expect(canActOnTask({}, 'qualquer', keys(), false)).toBe(true)
    expect(canActOnTask({ role: null, assignee: null }, 'x', keys(), false)).toBe(true)
  })

  it('assignee tem precedência sobre papel', () => {
    // atribuída a u2 → u1 (mesmo no papel) NÃO pode
    expect(canActOnTask({ assignee: 'u2', role: 'Gestor' }, 'u1', keys('Gestor'), false)).toBe(false)
  })
})
