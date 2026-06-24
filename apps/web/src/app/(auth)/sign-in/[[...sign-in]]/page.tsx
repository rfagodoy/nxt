import { SignIn } from '@clerk/nextjs'
import { Zap, GitBranch, Package, FileText } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Painel esquerdo — branding */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-900 text-white p-12">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-white/10">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">primeApps</span>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold leading-tight">
              Seus processos.<br />Seus módulos.<br />Seu controle.
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Desenhe fluxos BPMN e o primeApps gera automaticamente os módulos de gestão que seu time precisa.
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
                  <p className="text-zinc-400 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-zinc-500 text-sm">© 2026 primeApps. Todos os direitos reservados.</p>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-col items-center justify-center p-8 bg-background">
        {/* Logo mobile */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="p-1.5 rounded-md bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">primeApps</span>
        </div>

        <div className="w-full max-w-sm space-y-2 mb-6 text-center lg:text-left">
          <h2 className="text-2xl font-bold">Entrar na sua conta</h2>
          <p className="text-muted-foreground text-sm">Bem-vindo de volta ao primeApps</p>
        </div>

        <SignIn
          appearance={{
            elements: {
              rootBox: 'w-full max-w-sm',
              card: 'shadow-none border rounded-lg p-6 bg-card w-full',
              headerTitle: 'hidden',
              headerSubtitle: 'hidden',
              socialButtonsBlockButton:
                'border border-input bg-background hover:bg-muted text-foreground font-medium rounded-md h-9 text-sm transition-colors',
              dividerLine: 'bg-border',
              dividerText: 'text-muted-foreground text-xs',
              formFieldLabel: 'text-sm font-medium text-foreground',
              formFieldInput:
                'h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-1 focus-visible:ring-ring',
              formButtonPrimary:
                'bg-primary hover:bg-primary/90 text-primary-foreground rounded-md h-9 text-sm font-medium transition-colors',
              footerActionLink: 'text-primary hover:text-primary/80 font-medium',
              identityPreviewText: 'text-sm text-foreground',
              formResendCodeLink: 'text-primary text-sm',
              otpCodeFieldInput:
                'h-10 w-10 rounded-md border border-input bg-background text-sm text-center focus-visible:ring-1 focus-visible:ring-ring',
              alertText: 'text-sm',
            },
          }}
        />
      </div>
    </div>
  )
}
