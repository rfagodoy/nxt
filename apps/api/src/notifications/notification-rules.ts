/* Regras PURAS dos avisos de workflow — quem recebe e sob que chave. Ficam fora do
   serviço porque são o que precisa estar certo mesmo sem banco, sem SMTP e sem
   ninguém rodando o sistema à mão: são elas que decidem se um aviso chega à pessoa
   errada, ou se o mesmo fato vira dois avisos. */

/** Tipos emitidos pelo workflow (os de contrato têm ciclo de vida próprio). */
export const WORKFLOW_TIPOS = [
  'TAREFA_ATRIBUIDA',
  'TAREFA_A_VENCER',
  'TAREFA_VENCIDA',
  'PROCESSO_DEVOLVIDO',
  'PROCESSO_CANCELADO',
] as const

export type WorkflowTipo = (typeof WORKFLOW_TIPOS)[number]

/** Uma tarefa, do ponto de vista de "quem deve ser avisado". */
export interface TaskRecipients {
  /** pool resolvido do executor (papel + entidade); é a fonte da verdade quando existe */
  assignees?: string[] | string | null
  /** responsável direto (modelo antigo) */
  assignee?: string | null
}

/** Quem responde pela tarefa hoje: o pool do executor ou, na falta dele, o
 *  responsável direto. Lista vazia = tarefa ABERTA (ninguém foi designado). */
export function recipientsOf(task: TaskRecipients): string[] {
  const pool = Array.isArray(task.assignees) ? task.assignees.filter((id) => !!id) : []
  if (pool.length > 0) return pool
  return task.assignee ? [task.assignee] : []
}

/** Para quem o aviso é criado. Tarefa sem responsável gera UM aviso sem dono
 *  (`null` = a organização inteira vê) — que é justamente o sinal de que ninguém
 *  foi designado. Nunca devolve lista vazia: um fato sem aviso é um fato perdido. */
export function fanOutTargets(recipients: string[]): Array<string | null> {
  return recipients.length > 0 ? [...new Set(recipients)] : [null]
}

/** Chave de deduplicação. É ela que impede a varredura (a cada 5 minutos) de
 *  transformar um prazo em dezenas de avisos iguais. `dia` só entra no REAVISO:
 *  ali a repetição é deliberada, e sem a data o lembrete atualizaria a linha já
 *  lida em vez de nascer como um aviso novo. */
export function dedupKeyFor(
  kind: 'tarefa' | 'vence' | 'vencida' | 'cancelado',
  targetId: string,
  userId: string | null,
  dia?: string,
): string {
  const dono = userId ?? 'org'
  const base = `wf-${kind}:${targetId}:${dono}`
  return dia ? `${base}:${dia}` : base
}

/** O aviso sai por e-mail? Só o que é PESSOAL: aviso sem dono iria para a
 *  organização inteira sobre algo que não é responsabilidade de ninguém. */
export function shouldEmail(tipo: string, userId: string | null): boolean {
  return userId !== null && (WORKFLOW_TIPOS as readonly string[]).includes(tipo)
}
