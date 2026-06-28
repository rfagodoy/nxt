'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LogIn, Loader2, AlertCircle } from 'lucide-react'
import { Logo } from '@/components/layout/logo'

function SignInForm() {
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Não foi possível entrar.')
        setLoading(false)
        return
      }
      // Cookie de sessão já definido pelo handler. Navegação COMPLETA (não
      // client-side) para o SessionProvider remontar e ler a sessão fresca.
      window.location.href = callbackUrl
    } catch {
      setError('Serviço indisponível. Tente novamente.')
      setLoading(false)
    }
  }

  const field =
    'h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50'

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-medium text-white/80">E-mail</label>
        <input
          id="email" type="email" autoComplete="username" required autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading}
          placeholder="voce@empresa.com" className={field}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-white/80">Senha</label>
        <input
          id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
          placeholder="••••••••" className={field}
        />
      </div>

      <button
        type="submit" disabled={loading || !email || !password}
        className="inline-flex w-full items-center justify-center gap-2 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-forest hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}

export default function SignInPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-forest text-white font-sans">
      {/* Painel esquerdo — marca (Forest Ink) */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12
                      bg-gradient-to-br from-[hsl(156_40%_10%)] to-[hsl(150_46%_5%)]">
        {/* faíscas de luz da marca */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 right-24 h-40 w-40 rounded-full bg-spark/10 blur-3xl" />

        {/* topo: lockup da marca */}
        <div className="relative flex items-center gap-3">
          <Logo variant="mark" className="h-11 w-11" />
          <div className="leading-none">
            <span className="text-2xl font-bold tracking-tight text-white">
              N<span className="text-primary">x</span>t
            </span>
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">Solutions</span>
          </div>
        </div>

        {/* centro: tagline (foco único) */}
        <h1 className="relative text-4xl font-semibold tracking-tight leading-tight xl:text-5xl">
          Soluções inteligentes<br />que <span className="text-primary">evoluem</span> com você.
        </h1>

        {/* rodapé */}
        <p className="relative font-mono text-xs text-white/40">© 2026 Nxt · Evoluir com você</p>
      </div>

      {/* Painel direito — login */}
      <div className="flex flex-col items-center justify-center p-8">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <Logo variant="mark" className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight">
            N<span className="text-primary">x</span>t
          </span>
        </div>

        <div className="mb-6 w-full max-w-sm space-y-2 text-center lg:text-left">
          <h2 className="text-2xl font-semibold tracking-tight">Entrar na sua conta</h2>
          <p className="text-sm text-white/55">Acesse com seu e-mail e senha.</p>
        </div>

        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
