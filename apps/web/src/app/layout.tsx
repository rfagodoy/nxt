import type { Metadata } from 'next'
import { Manrope, Space_Mono } from 'next/font/google'
import { Providers } from '@/components/layout/providers'
import './globals.css'

// Identidade Nxt: Manrope (marca, UI e títulos) + Space Mono (labels técnicos e dados).
const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nxt',
  description: 'Soluções inteligentes que evoluem com você',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* tema do usuário ANTES da primeira pintura (a base clara/escura é do next-themes) */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=JSON.parse(localStorage.getItem('nxt:me:tema'));if(typeof t==='string')document.documentElement.dataset.tema=t}catch(e){}" }} />
      </head>
      <body className={`${manrope.variable} ${spaceMono.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
