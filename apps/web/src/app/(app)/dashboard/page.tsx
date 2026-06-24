import { LayoutDashboard, GitBranch, Package } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Dashboard</h1>
        <p className="text-[11px] text-muted-foreground">Bem-vindo ao primeApps</p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <StatCard icon={<GitBranch className="h-4 w-4 text-primary" />}     label="Processos ativos" value="—" />
        <StatCard icon={<Package className="h-4 w-4 text-primary" />}        label="Módulos gerados"  value="—" />
        <StatCard icon={<LayoutDashboard className="h-4 w-4 text-primary" />} label="Registros totais" value="—" />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-xs font-semibold mb-2">Primeiros passos</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
          <li>Acesse <strong>Processos</strong> e crie seu primeiro fluxo BPMN</li>
          <li>Configure os formulários de coleta de dados em cada etapa</li>
          <li>Ative o processo — o primeApps gera o módulo de gestão automaticamente</li>
          <li>Acesse <strong>Módulos</strong> para gerenciar seus registros</li>
        </ol>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 flex items-center gap-3">
      <div className="p-1.5 rounded-md bg-primary/10 shrink-0">{icon}</div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  )
}
