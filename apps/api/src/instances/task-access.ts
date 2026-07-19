/* Regra de quem pode ATUAR numa tarefa (concluir) e de "minhas tarefas".
   Pura e testável, separada do service. */

export interface TaskAssignment {
  role?: string | null
  assignee?: string | null
  /** Pool de usuários resolvido do executor papel+entidade (Papéis/Responsáveis).
   *  Quando presente e não-vazio, é a fonte da verdade de quem pode atuar. Aceita
   *  `string` (o campo JSON cru do Prisma) — coagido para array na leitura. */
  assignees?: string[] | string | null
}

/**
 * Um usuário pode atuar numa tarefa se:
 *  - é admin (vê/faz tudo), OU
 *  - a tarefa tem POOL de responsáveis (executor papel+entidade resolvido) e ele
 *    está no pool, OU
 *  - a tarefa é atribuída a ELE diretamente (assignee == userId), OU
 *  - a tarefa é de um PAPEL de que ele participa (role ∈ roleKeys), OU
 *  - a tarefa é ABERTA (sem pool, sem papel e sem responsável) — qualquer usuário.
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
  // O middleware do Prisma desserializa `assignees` para array na leitura; coage
  // defensivamente (string crua vira pool vazio → cai na lógica legada).
  const pool = Array.isArray(task.assignees) ? task.assignees : []
  if (pool.length) return pool.includes(userId)
  if (task.assignee) return task.assignee === userId
  if (task.role) return roleKeys.has(task.role)
  return true
}
