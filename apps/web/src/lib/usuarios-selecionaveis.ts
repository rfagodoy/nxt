/* Seletor de pessoas com busca no servidor (PO, 07/11/2026: centenas de usuários).
 *
 * Antes a tela baixava a lista inteira de usuários uma vez por sessão e guardava; um
 * usuário cadastrado depois não aparecia até recarregar a página. Agora a LISTA vem da
 * API a cada busca, e o que se guarda é só o NOME de quem já apareceu — para exibir o
 * valor de um campo sem perguntar de novo. */

export interface SelectableUser { id: string; name: string; email: string }

/** Quantos usuários a lista mostra por busca. Mais que isso, a pessoa refina digitando. */
export const LIMITE_DA_BUSCA = 20

export const urlDeBusca = (termo: string) =>
  `/api/users/selectable?q=${encodeURIComponent(termo)}&limit=${LIMITE_DA_BUSCA}`

export const urlPorIds = (ids: string[]) =>
  `/api/users/selectable?ids=${ids.map(encodeURIComponent).join(',')}`

/** Nomes já conhecidos + busca, numa chamada só, dos ids que faltam. Um id que a API não
 *  devolve (inativo ou removido) fica marcado como ausente e não é pedido de novo. */
export function criarCatalogoDeUsuarios(buscarPorIds: (ids: string[]) => Promise<SelectableUser[]>) {
  const porId = new Map<string, SelectableUser>()
  const ausentes = new Set<string>()
  const emVoo = new Map<string, Promise<void>>()

  const lembrar = (lista: SelectableUser[]) => { for (const u of lista) { porId.set(u.id, u); ausentes.delete(u.id) } }

  async function resolver(ids: Array<string | undefined>): Promise<void> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    const pendentes = unicos.filter((id) => emVoo.has(id)).map((id) => emVoo.get(id)!)
    const faltam = unicos.filter((id) => !porId.has(id) && !ausentes.has(id) && !emVoo.has(id))
    if (faltam.length) {
      const voo = buscarPorIds(faltam).then((lista) => {
        lembrar(lista)
        for (const id of faltam) if (!porId.has(id)) ausentes.add(id)
      }).finally(() => { for (const id of faltam) emVoo.delete(id) })
      for (const id of faltam) emVoo.set(id, voo)
      pendentes.push(voo)
    }
    await Promise.all(pendentes)
  }

  return {
    lembrar,
    resolver,
    nome: (id?: string) => (id ? porId.get(id)?.name : undefined),
    usuario: (id?: string) => (id ? porId.get(id) : undefined),
    ausente: (id?: string) => !!id && ausentes.has(id),
  }
}
