/* Consulta do seletor de pessoas (GET /api/users/selectable).
 *
 * A organização terá centenas de usuários (PO, 07/11/2026): o seletor busca no servidor
 * conforme a pessoa digita, em vez de baixar a lista inteira e guardá-la na sessão — o
 * que também fazia um usuário recém-cadastrado não aparecer até recarregar a página.
 *
 * Dois usos:
 *  - `q` (opcional): até `limit` usuários cujo nome OU e-mail contém o termo. Sem termo,
 *    os primeiros por nome — é o que aparece ao abrir a lista.
 *  - `ids`: os nomes de quem JÁ está escolhido (para exibir o valor do campo). Tem
 *    prioridade sobre `q`.
 * Sempre só ATIVOS da organização, como antes. A comparação de texto segue a collation
 * do banco (SQL Server, sem diferenciar maiúsculas). */

export const LIMITE_PADRAO = 20
export const LIMITE_MAXIMO = 100

export interface ParametrosSelecionaveis { q?: string; ids?: string; limit?: string }

export function consultaDeSelecionaveis(organizationId: string, p: ParametrosSelecionaveis) {
  const base = { organizationId, status: 'ATIVO' }
  const orderBy = { name: 'asc' as const }

  const ids = [...new Set((p.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, LIMITE_MAXIMO)
  if (ids.length) return { where: { ...base, id: { in: ids } }, orderBy, take: ids.length }

  const pedido = Number.parseInt(p.limit ?? '', 10)
  const take = Number.isFinite(pedido) && pedido >= 1 ? Math.min(pedido, LIMITE_MAXIMO) : LIMITE_PADRAO
  const termo = (p.q ?? '').trim()
  const where = termo
    ? { ...base, OR: [{ name: { contains: termo } }, { email: { contains: termo } }] }
    : base
  return { where, orderBy, take }
}
