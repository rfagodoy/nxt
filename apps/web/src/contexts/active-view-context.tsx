'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface ActiveViewCtx {
  activeViewId: string | null
  setActiveViewId: (id: string | null) => void
}

const ActiveViewContext = createContext<ActiveViewCtx>({
  activeViewId: null,
  setActiveViewId: () => {},
})

export function ActiveViewProvider({ children }: { children: ReactNode }) {
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  return (
    <ActiveViewContext.Provider value={{ activeViewId, setActiveViewId }}>
      {children}
    </ActiveViewContext.Provider>
  )
}

export const useActiveView = () => useContext(ActiveViewContext)
