'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, GitBranch, Loader2, X, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/http'
import { EmptyState } from '@/components/ui/empty-state'

interface ProcRow {
  id: string
  name: string
  description?: string | null
  status: string
  kind?: string | null
}

/** Botão "+ Novo processo" (iniciar uma execução). Abre um modal com os workflows
 *  ATIVOS; escolher um leva ao runner (`/processes/[id]?iniciar=1`). Reutilizável no
 *  Dashboard, Contratos e Parceiros. `variant='hero'` casa com o card escuro do topo.
 *  `kinds` filtra por tipo de workflow: Contratos passa ['CONTRATO','ADITIVO'], Parceiros
 *  ['PARCEIRO']; sem `kinds` (Dashboard) mostra TODOS. Workflows sem tipo só no Dashboard. */
export function StartProcessButton({ variant = 'outline', className, kinds }: {
  variant?: 'hero' | 'outline'
  className?: string
  kinds?: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [procs, setProcs] = useState<ProcRow[] | null>(null)

  const openModal = async () => {
    setOpen(true)
    if (procs === null) {
      const all = await apiJson<ProcRow[]>('/api/processes')
      setProcs((all ?? []).filter((p) =>
        p.status === 'ACTIVE' && (!kinds || (!!p.kind && kinds.includes(p.kind))),
      ))
    }
  }
  const start = (id: string) => { setOpen(false); router.push(`/processes/${id}?iniciar=1`) }

  const triggerCls = variant === 'hero'
    ? 'inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/25 hover:bg-white/25 transition-colors'
    : 'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors'

  return (
    <>
      <button type="button" onClick={openModal} className={cn(triggerCls, className)}>
        <Plus className="h-3.5 w-3.5" />
        Novo processo
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          {/* text-foreground: o botão pode viver no hero (text-white); sem isto o
              cabeçalho e o nome herdariam branco e sumiriam no card claro. */}
          <div className="glass w-full max-w-md rounded-2xl text-foreground overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Iniciar um processo</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors" title="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {procs === null ? (
                <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
                </div>
              ) : procs.length === 0 ? (
                <EmptyState icon={GitBranch} size="sm" title="Nenhum processo ativo" description="Crie e ative um workflow em Configurações › Workflows."
                  action={
                    <button onClick={() => { setOpen(false); router.push('/processes/new') }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Criar workflow
                    </button>
                  } />
              ) : (
                <ul className="divide-y">
                  {procs.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => start(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          <GitBranch className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          {p.description && <p className="text-[11px] text-muted-foreground truncate">{p.description}</p>}
                        </div>
                        <Play className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
