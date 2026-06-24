'use client'

import { SidebarProvider } from '@/contexts/sidebar-context'
import { Sidebar } from './sidebar'
import { Header } from './header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 bg-muted/10">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}
