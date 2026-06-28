'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { pushSetting, hydrateSetting } from '@/lib/settings-store'

export interface CustomSection {
  id: string
  label: string
  name: string
}

const STORAGE_KEY  = 'nxt:sections:contratos'
const ORDER_KEY    = 'nxt:sections:contratos:order'
const CHANGE_EVENT = 'nxt:sections:contratos:change'

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

export function useContractSections() {
  const ref      = useRef<CustomSection[]>([])
  const orderRef = useRef<string[]>([])
  const [sections,     setSectionsState] = useState<CustomSection[]>([])
  const [sectionOrder, setSectionOrder]  = useState<string[]>([])

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
    const initial      = readStorage()
    const initialOrder = readOrder()
    ref.current      = initial
    orderRef.current = initialOrder
    setSectionsState(initial)
    setSectionOrder(initialOrder)
    void hydrateSetting(STORAGE_KEY, CHANGE_EVENT)
    void hydrateSetting(ORDER_KEY, CHANGE_EVENT)

    const handler = () => {
      const fresh      = readStorage()
      const freshOrder = readOrder()
      ref.current      = fresh
      orderRef.current = freshOrder
      setSectionsState(fresh)
      setSectionOrder(freshOrder)
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

  return { sections, sectionOrder, addSection, removeSection, updateSection, reorderSections }
}
