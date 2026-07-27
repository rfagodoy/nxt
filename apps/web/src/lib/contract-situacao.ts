/* Como cada situação de contrato APARECE: rótulo em português e cores da etiqueta.
 *
 * Ficava dentro de contract-detail-view.tsx, e a listagem importava do componente de
 * detalhe só para escrever "Vigente" numa célula. Além do acoplamento estranho, isso
 * impedia testar a cobertura das situações sem arrastar React para o teste — e foi
 * justamente uma situação faltando (CANCELADO) que motivou o teste.
 *
 * A lista canônica de situações vive no core (@nxt/contracts-core); aqui só se decide
 * como cada uma se apresenta. contract-options.test.ts falha se alguma ficar sem
 * rótulo ou sem cor.
 */

export const SIT_CLS: Record<string, string> = {
  EM_CADASTRO: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  VIGENTE:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  VENCIDO:     'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ENCERRADO:   'bg-muted text-muted-foreground',
  RESCINDIDO:  'bg-red-500/10 text-red-600 dark:text-red-400',
  // cancelado: contrato que nunca chegou a valer (o processo que o criou foi
  // cancelado). Cinza de propósito — não é falha nem ato entre as partes.
  CANCELADO:   'bg-muted text-muted-foreground',
}

export const SIT_LABEL: Record<string, string> = {
  EM_CADASTRO: 'Em cadastro/revisão', VIGENTE: 'Vigente', VENCIDO: 'Vencido',
  ENCERRADO: 'Encerrado', RESCINDIDO: 'Rescindido', CANCELADO: 'Cancelado',
}

export const SIT_DOT_CLS: Record<string, string> = {
  EM_CADASTRO: 'bg-blue-500 animate-pulse',
  VIGENTE:     'bg-emerald-500',
  VENCIDO:     'bg-amber-500',
  ENCERRADO:   'bg-muted-foreground/50',
  RESCINDIDO:  'bg-red-500',
  CANCELADO:   'bg-muted-foreground/40',
}
