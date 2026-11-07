'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiJson } from '@/lib/http'
import {
  criarCatalogoDeUsuarios, urlDeBusca, urlPorIds, LIMITE_DA_BUSCA, type SelectableUser,
} from '@/lib/usuarios-selecionaveis'

export type { SelectableUser }
export { LIMITE_DA_BUSCA }

/* Catálogo da sessão: só NOMES de quem já apareceu (ver lib/usuarios-selecionaveis). A
   lista do seletor NÃO vem daqui — vem da API a cada busca (useBuscaDeUsuarios). */
const catalogo = criarCatalogoDeUsuarios(async (ids) => (await apiJson<SelectableUser[]>(urlPorIds(ids))) ?? [])

/** Espera entre teclas antes de perguntar à API. */
const ESPERA_MS = 250

/** Busca no servidor (nome ou e-mail), com espera entre teclas. `ativo` liga a busca
 *  (ex.: só com a lista aberta). Usuários ATIVOS da organização, até LIMITE_DA_BUSCA. */
export function useBuscaDeUsuarios(termo: string, ativo = true) {
  const [users, setUsers] = useState<SelectableUser[]>([])
  const [loading, setLoading] = useState(false)
  const ultima = useRef(0)

  useEffect(() => {
    if (!ativo) return
    const n = ++ultima.current
    setLoading(true)
    const t = setTimeout(() => {
      void apiJson<SelectableUser[]>(urlDeBusca(termo.trim())).then((lista) => {
        if (n !== ultima.current) return // chegou depois de uma busca mais nova
        catalogo.lembrar(lista ?? [])
        setUsers(lista ?? [])
        setLoading(false)
      })
    }, termo.trim() ? ESPERA_MS : 0)
    return () => clearTimeout(t)
  }, [termo, ativo])

  return { users, loading, talvezMais: users.length >= LIMITE_DA_BUSCA }
}

/** Nomes de quem JÁ está escolhido (valor de campos, listas de destinatários). Pergunta à
 *  API só pelos ids que ainda não conhece. `nomeDe(id)` devolve undefined enquanto carrega
 *  ou se o usuário não está mais ativo — use `ausente(id)` para distinguir. */
export function useUserNames(ids: Array<string | undefined>) {
  const chave = useMemo(() => [...new Set(ids.filter(Boolean))].sort().join(','), [ids])
  const [, setVersao] = useState(0)

  useEffect(() => {
    if (!chave) return
    let vivo = true
    void catalogo.resolver(chave.split(',')).then(() => { if (vivo) setVersao((v) => v + 1) })
    return () => { vivo = false }
  }, [chave])

  return { nomeDe: catalogo.nome, usuario: catalogo.usuario, ausente: catalogo.ausente }
}

/** Resolve o nome de um usuário pelo id (para leitura). */
export function useUserName(userId?: string): string {
  const { nomeDe } = useUserNames([userId])
  return nomeDe(userId) ?? ''
}
