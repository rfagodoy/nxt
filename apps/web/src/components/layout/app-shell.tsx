'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SidebarProvider } from '@/contexts/sidebar-context'
import { WorkspaceProvider, useWorkspace } from '@/contexts/workspace-context'
import { Sidebar } from './sidebar'
import { WorkspaceBar } from './workspace-bar'
import { WorkspaceHost } from './workspace-host'

/* Ao navegar entre módulos pelo menu, volta a mostrar a lista roteada
   (as abas de documento permanecem abertas na barra global). */
function DeactivateOnNav() {
  const pathname = usePathname()
  const { setActive } = useWorkspace()
  useEffect(() => { setActive(null) }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { activeId } = useWorkspace()
  return (
    <div className="flex h-screen overflow-hidden app-ambient bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <WorkspaceBar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto h-full w-full max-w-[1400px] p-6">
            {/* lista roteada: sempre montada (preserva estado), escondida quando um documento está ativo.
                `h-full` passa a altura adiante para telas que querem preencher (ex.: dashboard);
                telas de altura natural ignoram (renderizam no topo e rolam via <main>). */}
            <div className={activeId != null ? 'hidden' : 'h-full'}>{children}</div>
            {/* documentos da área de trabalho (mostra só o ativo) */}
            <WorkspaceHost />
          </div>
        </main>
      </div>
      <DeactivateOnNav />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <WorkspaceProvider>
        <ShellInner>{children}</ShellInner>
      </WorkspaceProvider>
    </SidebarProvider>
  )
}
