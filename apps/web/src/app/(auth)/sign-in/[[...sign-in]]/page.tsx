'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { GitBranch, Package, FileText, LogIn } from 'lucide-react'
import { Logo } from '@/components/layout/logo'

function SignInButton() {
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/dashboard'
  const [loading, setLoading] = useState(false)

  return (
    <button
      onClick={() => { setLoading(true); void signIn('keycloak', { callbackUrl }) }}
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-2 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
    >
      <LogIn className="h-4 w-4" />
      {loading ? 'Redirecionando...' : 'Entrar com SSO'}
    </button>
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

      {/* Painel direito — login SSO */}
      <div className="flex flex-col items-center justify-center p-8 bg-background">
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <Logo variant="mark" />
          <span className="text-xl font-bold tracking-tight text-foreground">Nxt</span>
        </div>

        <div className="w-full max-w-sm space-y-2 mb-6 text-center lg:text-left">
          <h2 className="text-2xl font-semibold tracking-tight">Entrar na sua conta</h2>
          <p className="text-muted-foreground text-sm">
            Você será redirecionado para o login seguro da sua organização.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <Suspense fallback={null}>
            <SignInButton />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
