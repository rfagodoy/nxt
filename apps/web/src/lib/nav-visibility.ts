/**
 * Visibilidade do menu por papel. Itens/seções marcados com `adminOnly` só aparecem
 * para administradores — esconder aqui é UX (não mostrar o que renderia 403); a
 * BARREIRA de verdade é o RolesGuard na API, que vale mesmo para quem digita a URL.
 * Enquanto a sessão carrega (`role` indefinido) vale a visão de usuário comum: para
 * o admin isso é um piscar de itens chegando; o contrário mostraria menu de admin a
 * quem não é.
 */
export interface NavVisibilityItem { adminOnly?: boolean }
export interface NavVisibilitySection { adminOnly?: boolean; items: NavVisibilityItem[] }

export function filtrarSecoesPorPapel<I extends NavVisibilityItem, S extends NavVisibilitySection & { items: I[] }>(
  sections: S[],
  role: string | undefined,
): S[] {
  if (role === 'admin') return sections
  return sections
    .filter((s) => !s.adminOnly)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly) }))
    .filter((s) => s.items.length > 0)
}
