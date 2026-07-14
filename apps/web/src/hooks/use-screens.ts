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
  sections: Screen['sections']
  fields: Screen['fields']
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
  const res = await apiFetch(id ? `/api/screens/${id}` : '/api/screens', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  })
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

export async function putScreenValues(subjectType: string, subjectId: string, values: ScreenValue[]): Promise<ScreenValue[]> {
  const res = await apiFetch('/api/screen-values', {
    method: 'PUT',
    body: JSON.stringify({ subjectType, subjectId, values }),
  })
  if (!res.ok) return []
  return res.json() as Promise<ScreenValue[]>
}
