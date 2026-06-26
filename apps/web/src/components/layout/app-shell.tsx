'use client'

import { SidebarProvider } from '@/contexts/sidebar-context'
import { Sidebar } from './sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <main className="flex-1 overflow-y-auto bg-muted/10">
            <div className="mx-auto w-full max-w-[1400px] p-6">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
