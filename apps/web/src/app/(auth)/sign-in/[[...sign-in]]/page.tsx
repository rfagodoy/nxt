'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GitBranch, Package, FileText, LogIn, Loader2, AlertCircle } from 'lucide-react'
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
    'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50'

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-medium text-foreground">E-mail</label>
        <input
          id="email" type="email" autoComplete="username" required autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading}
          placeholder="voce@empresa.com" className={field}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-foreground">Senha</label>
        <input
          id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
          placeholder="••••••••" className={field}
        />
      </div>

      <button
        type="submit" disabled={loading || !email || !password}
        className="inline-flex w-full items-center justify-center gap-2 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}

export default function SignInPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Painel esquerdo — branding */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary to-[hsl(258_70%_50%)] text-white p-12">
        <div className="flex items-center gap-2">
          <Logo variant="mark" />
          <span className="text-xl font-bold tracking-tight text-white">Nxt</span>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight leading-tight">
              Seus processos.<br />Seus módulos.<br />Seu controle.
            </h1>
            <p className="text-white/70 text-lg leading-relaxed">
              Desenhe fluxos BPMN e o Nxt gera automaticamente os módulos de gestão que seu time precisa.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: GitBranch, title: 'Designer BPMN integrado',     desc: 'Modele processos sem sair da plataforma' },
              { icon: Package,   title: 'Módulos gerados automaticamente', desc: 'Cada processo vira um módulo de gestão completo' },
              { icon: FileText,  title: 'Gestão de contratos',          desc: 'Controle vencimentos, valores e responsáveis' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-white/10 mt-0.5 shrink-0">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-white/70 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/70 text-sm">© 2026 Nxt. Todos os direitos reservados.</p>
      </div>

      {/* Painel direito — login */}
      <div className="flex flex-col items-center justify-center p-8 bg-background">
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <Logo variant="mark" />
          <span className="text-xl font-bold tracking-tight text-foreground">Nxt</span>
        </div>

        <div className="w-full max-w-sm space-y-2 mb-6 text-center lg:text-left">
          <h2 className="text-2xl font-semibold tracking-tight">Entrar na sua conta</h2>
          <p className="text-muted-foreground text-sm">
            Acesse com seu e-mail e senha.
          </p>
        </div>

        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
