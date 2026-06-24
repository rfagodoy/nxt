'use client'

import { useState, useEffect, useCallback } from 'react'
import { pushSetting, pullSetting } from '@/lib/settings-store'

export interface SavedView {
  id: string
  name: string
  sort: { col: string; dir: 'asc' | 'desc' } | null
  filters: { id: string; col: string; op: string; value: string }[]
  logic: 'AND' | 'OR'
  createdAt: number
}

export type ViewState = Pick<SavedView, 'sort' | 'filters' | 'logic'>

const VIEWS_EVENT = 'primeapps:views-update'

export function useViews(moduleSlug: string) {
  const key = `primeapps:views:${moduleSlug}`
  const [views, setViews] = useState<SavedView[]>([])

  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(key)
      setViews(raw ? JSON.parse(raw) : [])
    } catch {}
  }, [key])

  useEffect(() => {
    load()
    void pullSetting<SavedView[]>(key).then(remote => { if (remote) load() })
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.key === key) load()
    }
    window.addEventListener(VIEWS_EVENT, handler)
    return () => window.removeEventListener(VIEWS_EVENT, handler)
  }, [key, load])

  const persist = useCallback((next: SavedView[]) => {
    pushSetting(key, next)               // cache local + backend
    setViews(next)
    window.dispatchEvent(new CustomEvent(VIEWS_EVENT, { detail: { key } }))
  }, [key])

  const saveView = useCallback((name: string, state: ViewState): SavedView => {
    const view: SavedView = { id: `v${Date.now()}`, name, ...state, createdAt: Date.now() }
    persist([...views, view])
    return view
  }, [views, persist])

  const deleteView = useCallback((id: string) => {
    persist(views.filter(v => v.id !== id))
  }, [views, persist])

  return { views, saveView, deleteView }
}
