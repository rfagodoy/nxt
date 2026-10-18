'use client'

import { SessionProvider } from '@/lib/session-context'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { DensidadeProvider } from '@/lib/densidade'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DensidadeProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
      </DensidadeProvider>
    </SessionProvider>
  )
}
