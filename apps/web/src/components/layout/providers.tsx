'use client'

import { SessionProvider } from '@/lib/session-context'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { DensidadeProvider } from '@/lib/densidade'
import { TemaProvider } from '@/lib/temas-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DensidadeProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TemaProvider>{children}</TemaProvider>
      </ThemeProvider>
      </DensidadeProvider>
    </SessionProvider>
  )
}
