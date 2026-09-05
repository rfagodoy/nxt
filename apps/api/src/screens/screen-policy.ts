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

/**
 * Nome da tela duplicada. "Cópia de X"; repetindo, "Cópia de X (2)", "(3)"…
 * Duplicar uma cópia não empilha prefixo ("Cópia de Cópia de X") nem número.
 */
export function nomeDaCopia(base: string, existentes: readonly string[]): string {
  const limpo = base.replace(/^Cópia de /, '').replace(/ \((\d+)\)$/, '').trim() || base
  const usados = new Set(existentes)
  const primeiro = `Cópia de ${limpo}`
  if (!usados.has(primeiro)) return primeiro
  for (let i = 2; i <= 99; i++) {
    const n = `Cópia de ${limpo} (${i})`
    if (!usados.has(n)) return n
  }
  return `Cópia de ${limpo} (${Date.now()})`
}
