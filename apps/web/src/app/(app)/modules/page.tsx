import { Package } from 'lucide-react'

export default function ModulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Módulos</h1>
        <p className="text-[11px] text-muted-foreground">Módulos de gestão gerados pelos seus processos</p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-semibold">Nenhum módulo disponível</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Os módulos são gerados automaticamente quando você ativa um processo BPMN
          </p>
        </div>
      </div>
    </div>
  )
}
