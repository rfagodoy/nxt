'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/components/layout/theme-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
    </SessionProvider>
  )
}
