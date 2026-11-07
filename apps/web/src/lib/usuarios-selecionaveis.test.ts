import { describe, it, expect, vi } from 'vitest'
import { criarCatalogoDeUsuarios, urlDeBusca, LIMITE_DA_BUSCA, type SelectableUser } from './usuarios-selecionaveis'

const ana: SelectableUser = { id: 'u1', name: 'Ana', email: 'ana@x.com' }
const bia: SelectableUser = { id: 'u2', name: 'Bia', email: 'bia@x.com' }

describe('urlDeBusca', () => {
  it('codifica o termo e manda o limite', () => {
    expect(urlDeBusca('ana maria&co')).toBe(`/api/users/selectable?q=ana%20maria%26co&limit=${LIMITE_DA_BUSCA}`)
    expect(urlDeBusca('')).toBe(`/api/users/selectable?q=&limit=${LIMITE_DA_BUSCA}`)
  })
})

describe('catálogo de usuários (nomes de quem já está escolhido)', () => {
  it('busca só os ids que ainda não conhece, numa chamada', async () => {
    const buscar = vi.fn(async (ids: string[]) => [ana, bia].filter((u) => ids.includes(u.id)))
    const cat = criarCatalogoDeUsuarios(buscar)
    await cat.resolver(['u1', 'u2'])
    await cat.resolver(['u1', 'u2'])
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar).toHaveBeenCalledWith(['u1', 'u2'])
    expect(cat.nome('u1')).toBe('Ana')
  })

  it('quem a busca já trouxe não é pedido de novo', async () => {
    const buscar = vi.fn(async () => [] as SelectableUser[])
    const cat = criarCatalogoDeUsuarios(buscar)
    cat.lembrar([ana])
    await cat.resolver(['u1'])
    expect(buscar).not.toHaveBeenCalled()
  })

  it('id que a API não devolve (inativo ou removido) fica marcado e não é pedido de novo', async () => {
    const buscar = vi.fn(async () => [] as SelectableUser[])
    const cat = criarCatalogoDeUsuarios(buscar)
    await cat.resolver(['sumiu'])
    await cat.resolver(['sumiu'])
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(cat.nome('sumiu')).toBeUndefined()
    expect(cat.ausente('sumiu')).toBe(true)
  })

  it('pedidos simultâneos do mesmo id não duplicam a chamada', async () => {
    const buscar = vi.fn(async (ids: string[]) => [ana].filter((u) => ids.includes(u.id)))
    const cat = criarCatalogoDeUsuarios(buscar)
    await Promise.all([cat.resolver(['u1']), cat.resolver(['u1'])])
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('ignora ids vazios', async () => {
    const buscar = vi.fn(async () => [] as SelectableUser[])
    const cat = criarCatalogoDeUsuarios(buscar)
    await cat.resolver(['', undefined])
    expect(buscar).not.toHaveBeenCalled()
  })
})
