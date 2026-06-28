'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { pushSetting, hydrateSetting } from '@/lib/settings-store'

export interface CustomSection {
  id: string
  label: string
  name: string
}

const STORAGE_KEY      = 'nxt:sections:parceiros'
const ORDER_KEY        = 'nxt:sections:parceiros:order'
const DEFAULT_OPEN_KEY = 'nxt:sections:parceiros:defaultOpen'
const CHANGE_EVENT     = 'nxt:sections:parceiros:change'

function readStorage(): CustomSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CustomSection[]) : []
  } catch { return [] }
}

function writeStorage(sections: CustomSection[]) {
  pushSetting(STORAGE_KEY, sections)
}

function readOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function writeOrder(order: string[]) {
  pushSetting(ORDER_KEY, order)
}

function readDefaultOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(DEFAULT_OPEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch { return {} }
}

function writeDefaultOpen(map: Record<string, boolean>) {
  pushSetting(DEFAULT_OPEN_KEY, map)
}

export function usePartnerSections() {
  const ref      = useRef<CustomSection[]>([])
  const orderRef = useRef<string[]>([])
  const [sections,           setSectionsState]          = useState<CustomSection[]>([])
  const [sectionOrder,       setSectionOrder]           = useState<string[]>([])
  const [sectionDefaultOpen, setSectionDefaultOpenState] = useState<Record<string, boolean>>({})
  const [loaded,             setLoaded]                 = useState(false)

  const commit = useCallback((next: CustomSection[]) => {
    ref.current = next
    writeStorage(next)
    setSectionsState(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const commitOrder = useCallback((next: string[]) => {
    orderRef.current = next
    writeOrder(next)
    setSectionOrder(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  useEffect(() => {
    const initial        = readStorage()
    const initialOrder   = readOrder()
    const initialDefOpen = readDefaultOpen()
    ref.current      = initial
    orderRef.current = initialOrder
    setSectionsState(initial)
    setSectionOrder(initialOrder)
    setSectionDefaultOpenState(initialDefOpen)
    setLoaded(true)
    void hydrateSetting(STORAGE_KEY, CHANGE_EVENT)
    void hydrateSetting(ORDER_KEY, CHANGE_EVENT)
    void hydrateSetting(DEFAULT_OPEN_KEY, CHANGE_EVENT)

    const handler = () => {
      const fresh        = readStorage()
      const freshOrder   = readOrder()
      const freshDefOpen = readDefaultOpen()
      ref.current      = fresh
      orderRef.current = freshOrder
      setSectionsState(fresh)
      setSectionOrder(freshOrder)
      setSectionDefaultOpenState(freshDefOpen)
    }
    window.addEventListener(CHANGE_EVENT, handler)
    return () => window.removeEventListener(CHANGE_EVENT, handler)
  }, [])

  const addSection = useCallback((s: CustomSection) => {
    commit([...ref.current, s])
    commitOrder([...orderRef.current, s.id])
  }, [commit, commitOrder])

  const removeSection = useCallback((id: string) => {
    commit(ref.current.filter(s => s.id !== id))
    commitOrder(orderRef.current.filter(oid => oid !== id))
  }, [commit, commitOrder])

  const updateSection = useCallback((id: string, updated: CustomSection) =>
    commit(ref.current.map(s => s.id === id ? updated : s)), [commit])

  const reorderSections = useCallback((order: string[]) => {
    commitOrder(order)
  }, [commitOrder])

  const setSectionDefaultOpen = useCallback((id: string, isOpen: boolean) => {
    const next = { ...readDefaultOpen(), [id]: isOpen }
    writeDefaultOpen(next)
    setSectionDefaultOpenState(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return {
    sections, sectionOrder, sectionDefaultOpen, loaded,
    addSection, removeSection, updateSection, reorderSections, setSectionDefaultOpen,
  }
}
