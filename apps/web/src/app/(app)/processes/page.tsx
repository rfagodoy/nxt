import Link from 'next/link'
import { Plus, GitBranch } from 'lucide-react'

export default function ProcessesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Processos</h1>
          <p className="text-[11px] text-muted-foreground">Gerencie seus fluxos BPMN</p>
        </div>
        <Link
          href="/processes/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo processo
        </Link>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-semibold">Nenhum processo criado</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Crie seu primeiro processo BPMN para começar
          </p>
          <Link
            href="/processes/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar processo
          </Link>
        </div>
      </div>
    </div>
  )
}
