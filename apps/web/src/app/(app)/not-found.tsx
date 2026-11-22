import Link from 'next/link'
import { SearchX } from 'lucide-react'

/* Página não encontrada (auditoria de UX, 22/11/2026). Antes um endereço errado abria a
   página padrão do framework, preta e em inglês, sem caminho de volta. */
export default function NaoEncontrada() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <section className="vidro flex max-w-md flex-col items-center gap-2.5 rounded-2xl bg-[var(--vidro-cartao)] px-8 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10" aria-hidden>
          <SearchX className="h-6 w-6 text-primary" />
        </span>
        <h1 className="text-lg font-bold tracking-tight">Não achamos esta página</h1>
        <p className="text-sm text-muted-foreground">O endereço pode ter mudado, ou o registro foi removido. O menu ao lado continua funcionando.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">Ir para o Dashboard</Link>
          <Link href="/modules/contratos" className="inline-flex h-9 items-center rounded-md border px-4 text-xs font-medium hover:bg-muted transition-colors">Abrir Contratos</Link>
        </div>
      </section>
    </div>
  )
}
