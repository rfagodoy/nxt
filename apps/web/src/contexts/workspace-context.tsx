'use client'

/**
 * Área de trabalho global (MDI): abas de documentos de QUALQUER módulo
 * (contrato, parceiro — detalhe ou novo) que sobrevivem à navegação entre módulos.
 * As listas continuam sendo páginas roteadas; os documentos vivem aqui, no shell,
 * acima do roteamento, então trocar de módulo não fecha as abas abertas.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const STORAGE_KEY = 'nxt:workspace:tabs'

export type WorkspaceKind = 'contract' | 'partner' | 'unit'

export interface WorkspaceTab {
  id:        string            // único: `${kind}:${recordId}` ou `${kind}:new`
  kind:      WorkspaceKind
  mode:      'detail' | 'new'
  label:     string
  data?:     unknown           // Row (contrato) | PartnerAPI (parceiro) | undefined (novo)
}

interface WorkspaceCtx {
  tabs:        WorkspaceTab[]
  activeId:    string | null   // null = mostrar a lista roteada (children)
  dirty:       Record<string, boolean>  // abas com edição não salva
  open:        (tab: WorkspaceTab) => void
  close:       (id: string) => void
  closeOthers: (id: string) => void
  closeAll:    () => void
  setActive:   (id: string | null) => void
  setDirty:    (id: string, dirty: boolean) => void
  reorder:     (from: number, to: number) => void
  rename:      (id: string, label: string) => void
  replace:     (id: string, tab: WorkspaceTab) => void  // "novo" → "detalhe" após salvar
}

const Ctx = createContext<WorkspaceCtx | null>(null)

export function useWorkspace(): WorkspaceCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useWorkspace deve ser usado dentro de <WorkspaceProvider>')
  return c
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [tabs,     setTabs]     = useState<WorkspaceTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dirty,    setDirtyMap] = useState<Record<string, boolean>>({})
  const hydrated = useRef(false)

  /* restaura as abas abertas na carga (sessionStorage) — sem ativar nenhuma (mostra a lista) */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as WorkspaceTab[]
        if (Array.isArray(saved) && saved.length) setTabs(saved)
      }
    } catch { /* ignore */ }
    hydrated.current = true
  }, [])

  /* persiste a cada mudança (só depois de hidratar, para não apagar o salvo) */
  useEffect(() => {
    if (!hydrated.current) return
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)) } catch { /* quota */ }
  }, [tabs])

  /* aviso do navegador ao recarregar/fechar a página com alterações não salvas em qualquer aba */
  useEffect(() => {
    if (!Object.values(dirty).some(Boolean)) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const open = useCallback((tab: WorkspaceTab) => {
    setTabs(prev => (prev.some(t => t.id === tab.id) ? prev.map(t => t.id === tab.id ? { ...t, ...tab } : t) : [...prev, tab]))
    setActiveId(tab.id)
  }, [])

  const close = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.id !== id))
    setActiveId(cur => (cur === id ? null : cur))
    setDirtyMap(prev => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n })
  }, [])

  const closeOthers = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.id === id))
    setActiveId(id)
    setDirtyMap(prev => (id in prev ? { [id]: prev[id] } : {}))
  }, [])

  const closeAll = useCallback(() => { setTabs([]); setActiveId(null); setDirtyMap({}) }, [])

  const setActive = useCallback((id: string | null) => setActiveId(id), [])

  const setDirty = useCallback((id: string, d: boolean) =>
    setDirtyMap(prev => (prev[id] === d ? prev : { ...prev, [id]: d })), [])

  const reorder = useCallback((from: number, to: number) => setTabs(prev => {
    if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
    const next = [...prev]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next
  }), [])

  const rename = useCallback((id: string, label: string) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label } : t)), [])

  const replace = useCallback((id: string, tab: WorkspaceTab) => {
    setTabs(prev => prev.map(t => t.id === id ? tab : t))
    setActiveId(tab.id)
  }, [])

  return <Ctx.Provider value={{ tabs, activeId, dirty, open, close, closeOthers, closeAll, setActive, setDirty, reorder, rename, replace }}>{children}</Ctx.Provider>
}
