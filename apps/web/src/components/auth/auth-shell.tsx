import { Logo } from '@/components/layout/logo'

/* Moldura das telas de autenticação (login, esqueci a senha, redefinir).
   Existe porque a marca dessas telas estava escrita por extenso dentro do sign-in:
   qualquer tela nova nasceria parecida-mas-diferente, e é justo aqui — antes do
   login — que o produto causa a primeira impressão. */

export const campoEscuro =
  'h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50'

export function AuthShell({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-forest text-white font-sans">
      {/* Painel esquerdo — marca (Forest Ink) */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12
                      bg-gradient-to-br from-[hsl(156_40%_10%)] to-[hsl(150_46%_5%)]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 right-24 h-40 w-40 rounded-full bg-spark/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Logo variant="mark" className="h-11 w-11" />
          <div className="leading-none">
            <span className="text-2xl font-bold tracking-tight text-white">
              N<span className="text-primary">x</span>t
            </span>
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">Solutions</span>
          </div>
        </div>

        <h1 className="relative text-4xl font-semibold tracking-tight leading-tight xl:text-5xl">
          Soluções inteligentes<br />que <span className="text-primary">evoluem</span> com você.
        </h1>

        <p className="relative font-mono text-xs text-white/40">© 2026 Nxt · Evoluir com você</p>
      </div>

      {/* Painel direito — conteúdo */}
      <div className="flex flex-col items-center justify-center p-8">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <Logo variant="mark" className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight">
            N<span className="text-primary">x</span>t
          </span>
        </div>

        <div className="mb-6 w-full max-w-sm space-y-2 text-center lg:text-left">
          <h2 className="text-2xl font-semibold tracking-tight">{titulo}</h2>
          <p className="text-sm text-white/55">{subtitulo}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
