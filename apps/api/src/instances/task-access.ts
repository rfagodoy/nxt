/* Regra de quem pode ATUAR numa tarefa (concluir) e de "minhas tarefas".
   Pura e testável, separada do service. */

export interface TaskAssignment {
  role?: string | null
  assignee?: string | null
}

/**
 * Um usuário pode atuar numa tarefa se:
 *  - é admin (vê/faz tudo), OU
 *  - a tarefa é atribuída a ELE diretamente (assignee == userId), OU
 *  - a tarefa é de um PAPEL de que ele participa (role ∈ roleKeys), OU
 *  - a tarefa é ABERTA (sem papel e sem responsável) — qualquer usuário da org.
 * `roleKeys` casa por id E por nome do papel (a atividade pode referenciar por
 * qualquer um: raia dá nome, nxt:role pode dar id).
 */
export function canActOnTask(
  task: TaskAssignment,
  userId: string,
  roleKeys: Set<string>,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true
  if (task.assignee) return task.assignee === userId
  if (task.role) return roleKeys.has(task.role)
  return true
}
