/* Quem pode agir sobre uma INSTÂNCIA (o `task-access.ts` cuida da tarefa).
   Pura e testável, separada do service. */

export interface InstanceOwnership {
  status: string
  /** id de quem iniciou o processo (nulo em instâncias antigas) */
  startedById?: string | null
}

/** Status em que a instância ainda pode ser cancelada. ERRO entra: antes dele, uma
 *  instância travada num conector ficava presa para sempre. */
export function isCancelable(status: string): boolean {
  return status === 'RUNNING' || status === 'ERROR'
}

/**
 * Pode cancelar quem é ADMIN ou quem INICIOU o processo. Instância antiga sem
 * `startedById` fica com o admin — sem dono registrado, não há a quem atribuir a
 * decisão, e deixar qualquer um cancelar seria pior do que exigir administrador.
 */
export function canCancelInstance(
  instance: InstanceOwnership,
  userId: string,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true
  if (!instance.startedById) return false
  return instance.startedById === userId
}
