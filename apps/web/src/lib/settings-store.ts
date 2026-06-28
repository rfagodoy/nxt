'use client'

/**
 * Camada de persistência das configurações da aplicação.
 *
 * Backend (`/api/settings`) é a fonte da verdade; o localStorage é usado como
 * **cache síncrono de renderização** (instantâneo + resiliência offline). Os hooks
 * continuam lendo/escrevendo o localStorage como antes; aqui só adicionamos o
 * espelhamento para o backend (`pushSetting`) e a hidratação no mount (`pullSetting`).
 *
 * `userId === ''` = nível organização (compartilhado). Quando houver login, as
 * configurações pessoais passarão a usar o id do usuário em `currentUserId()`.
 */

import { apiFetch } from './http'

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL ?? ''

/* Migração única (cliente): chaves legadas 'primeapps:' → 'nxt:' no cache local.
   O backend é migrado por SQL; isto só evita o flash de "seed" na 1ª carga por navegador. */
if (typeof window !== 'undefined') {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('primeapps:')) {
        const nk = 'nxt:' + k.slice(10)
        if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k) as string)
      }
    }
  } catch { /* quota/SSR */ }
}

/** Vazio por enquanto (sem login). No futuro, retorna o id do usuário logado. */
export function currentUserId(): string {
  return ''
}

/** Leitura síncrona do cache local. */
export function cacheRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Escrita síncrona no cache local. */
export function cacheWrite(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota/SSR */ }
}

/** Grava no cache local e espelha no backend (fire-and-forget). */
export function pushSetting(key: string, value: unknown): void {
  cacheWrite(key, value)
  if (!apiUrl()) return
  void apiFetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body:   JSON.stringify({ userId: currentUserId(), value }),
  }).catch(() => { /* offline: o cache já guardou */ })
}

/**
 * Busca o valor no backend. Se existir, atualiza o cache local e retorna o valor;
 * se não existir (null) ou falhar, retorna null (mantém o cache atual).
 */
export async function pullSetting<T = unknown>(key: string): Promise<T | null> {
  if (!apiUrl()) return null
  try {
    const res = await apiFetch(
      `/api/settings/${encodeURIComponent(key)}?userId=${encodeURIComponent(currentUserId())}`,
    )
    if (!res.ok) return null
    const data = await res.json() as { value: T | null }
    if (data.value !== null && data.value !== undefined) {
      cacheWrite(key, data.value)
      return data.value
    }
    return null
  } catch {
    return null
  }
}

/**
 * Hidrata um store no mount: busca o backend; se houver valor, dispara o evento
 * de mudança (os hooks re-leem o cache já atualizado). Se `seedIfEmpty` for
 * fornecido e o backend estiver vazio, semeia o default no backend.
 */
export async function hydrateSetting(
  key: string,
  changeEvent: string,
  seedIfEmpty?: () => unknown,
): Promise<void> {
  const remote = await pullSetting(key)
  if (remote !== null) {
    try { window.dispatchEvent(new Event(changeEvent)) } catch { /* SSR */ }
  } else if (seedIfEmpty) {
    pushSetting(key, seedIfEmpty())
  }
}
