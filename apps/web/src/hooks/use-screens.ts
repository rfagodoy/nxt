'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiJson } from '@/lib/http'
import type { Screen, ScreenSubject } from '@/lib/screen-types'

/** Payload de gravação (o backend faz upsert por id de seção/campo). */
export interface SaveScreenPayload {
  name: string
  description?: string | null
  subjectType: ScreenSubject
  status?: string
  isDefault?: boolean
  isSystem?: boolean
  readOnly?: boolean
  sections: Screen['sections']
  fields: Screen['fields']
  /** Chaves de campos personalizados que o usuário mandou excluir do TIPO (via diálogo).
   *  Só isto exclui: sumir do `fields` significa "esta tela não mandou", não "apague". */
  removedFieldKeys?: string[]
}

/** Lista de Telas do catálogo (opcionalmente por subject). */
export function useScreens(subjectType?: ScreenSubject) {
  const [screens, setScreens] = useState<Screen[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const qs = subjectType ? `?subjectType=${subjectType}` : ''
    const data = await apiJson<Screen[]>(`/api/screens${qs}`)
    setScreens(data ?? [])
    setLoading(false)
  }, [subjectType])

  useEffect(() => { void reload() }, [reload])

  return { screens, loading, reload }
}

export async function getScreen(id: string): Promise<Screen | null> {
  return apiJson<Screen>(`/api/screens/${id}`)
}

export async function saveScreen(id: string | null, payload: SaveScreenPayload): Promise<Screen | null> {
  const r = await gravarTela(id, payload)
  return 'tela' in r ? r.tela : null
}

/** Grava e devolve a recusa da API pelo texto dela (ex.: nome repetido no tipo). */
export async function gravarTela(id: string | null, payload: SaveScreenPayload): Promise<{ tela: Screen } | { erro: string }> {
  const res = await apiFetch(id ? `/api/screens/${id}` : '/api/screens', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  })
  if (res.ok) return { tela: (await res.json()) as Screen }
  const corpo = (await res.json().catch(() => null)) as { message?: string | string[] } | null
  const msg = Array.isArray(corpo?.message) ? corpo?.message[0] : corpo?.message
  return { erro: res.status === 409 && msg ? msg : 'Falha ao salvar. Tente novamente.' }
}

/** Onde cada tela é usada (PO, 23/11/2026): workflows e atividades, por id da tela. */
export interface UsoDaTela { workflowId: string; workflow: string; status: string; atividades: string[] }

export function useUsoDasTelas() {
  const [uso, setUso] = useState<Record<string, UsoDaTela[]> | null>(null)
  useEffect(() => {
    let vivo = true
    void apiJson<Record<string, UsoDaTela[]>>('/api/screens/uso').then((d) => { if (vivo) setUso(d ?? {}) })
    return () => { vivo = false }
  }, [])
  return uso
}

/** "Solicitação de contratos: Preencher, Analisar" — uma linha por workflow. */
export function dicaDoUso(lista: readonly UsoDaTela[]): string {
  return lista.map((u) => `${u.workflow}${u.status === 'ARCHIVED' ? ' (inativo)' : u.status === 'DRAFT' ? ' (rascunho)' : ''}: ${u.atividades.join(', ')}`).join('\n')
}

/** Duplica a tela. A cópia nasce RASCUNHO e referencia os mesmos campos do tipo — o
 *  dado já preenchido aparece nela; nada é recriado nem copiado. */
export async function duplicateScreen(id: string): Promise<Screen | null> {
  const res = await apiFetch(`/api/screens/${id}/duplicate`, { method: 'POST', body: JSON.stringify({}) })
  if (!res.ok) return null
  return res.json() as Promise<Screen>
}

export async function deleteScreen(id: string): Promise<boolean> {
  const res = await apiFetch(`/api/screens/${id}`, { method: 'DELETE' })
  return res.ok
}

/* ─── valores preenchidos (usado no Marco 3, já disponível) ─── */

export interface ScreenValue { fieldId: string; value: string }

export async function getScreenValues(subjectType: string, subjectId: string): Promise<ScreenValue[]> {
  return (await apiJson<ScreenValue[]>(`/api/screen-values?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`)) ?? []
}

/* Gravar: os valores vão JUNTO com o registro (`valoresPersonalizados` no POST/PATCH de
   parceiro e contrato) — a API confere travas e obrigatórios do conjunto antes de gravar.
   O antigo putScreenValues engolia a falha (devolvia [] e ninguém olhava). */

/** Valor preenchido em lote (vários subjects) — para colunas custom na listagem/exportação. */
export interface ScreenValueRow { subjectId: string; fieldId: string; value: string }

export async function getScreenValuesBatch(subjectType: string, subjectIds: string[]): Promise<ScreenValueRow[]> {
  if (!subjectIds.length) return []
  const res = await apiFetch('/api/screen-values/batch', {
    method: 'POST',
    body: JSON.stringify({ subjectType, subjectIds }),
  })
  if (!res.ok) return []
  return res.json() as Promise<ScreenValueRow[]>
}
