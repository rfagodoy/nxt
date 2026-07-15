/**
 * Política PURA das telas do sistema (sem I/O — testável isoladamente).
 * - Tela base do sistema (`isSystem`): SEMPRE ativa e SEMPRE padrão (imutável).
 * - Tela não-sistema: só pode ser padrão se ainda NÃO existe uma tela do sistema
 *   para o tipo (a padrão de um tipo com base do sistema é a própria base).
 */
export function screenBaseFlags(opts: {
  isSystem: boolean
  systemExistsForType: boolean
  reqStatus: string
  reqDefault: boolean
}): { status: string; isDefault: boolean } {
  if (opts.isSystem) return { status: 'ACTIVE', isDefault: true }
  return { status: opts.reqStatus, isDefault: opts.reqDefault && !opts.systemExistsForType }
}
