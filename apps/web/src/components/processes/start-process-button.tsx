'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, X, Workflow, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/http'
import { useIniciarProcesso, type DesfechoInicio } from '@/lib/iniciar-processo'
import { useSession } from '@/lib/session-context'
import { EmptyState } from '@/components/ui/empty-state'
import { WorkflowKindIcon } from './workflow-kind-icon'

interface ProcRow {
  id: string
  name: string
  description?: string | null
  status: string
  kind?: string | null
}

/** Botão "+ Novo processo" (iniciar uma execução). Abre uma tela ÚNICA com os
 *  workflows ativos; a LINHA INTEIRA é o botão. Clicar INICIA o processo e abre a
 *  primeira atividade como ABA na área de trabalho — exatamente o que acontece ao
 *  clicar numa tarefa na caixa de Tarefas. Reutilizável no Dashboard e em Contratos.
 *  `variant='hero'` casa com o card escuro do topo. `kinds` filtra por tipo:
 *  Contratos passa ['CONTRATO','ADITIVO','DISTRATO']; sem `kinds` (Dashboard)
 *  mostra TODOS. Workflows sem tipo só aparecem no Dashboard.
 *
 *  A tarefa aqui é escolher um nome e começar — então a tela não carrega mais
 *  nada além disso. Houve uma versão com etapa de conferência (onde você entra,
 *  prazo, tamanho do fluxo): virou pedágio numa ação que devia ser um clique, e
 *  foi retirada. O que resolve a ambiguidade do ícone antigo (um ▷ que parecia
 *  ser o botão, quando a linha inteira já iniciava) não é um botão por linha, é o
 *  realce: a linha acende, o ícone se preenche e a seta anda. Um alvo só. */
export function StartProcessButton({ variant = 'outline', className, kinds }: {
  variant?: 'hero' | 'outline'
  className?: string
  kinds?: string[]
}) {
  const router = useRouter()
  // O CTA "Criar workflow" leva a uma tela de admin — usuário comum vê só a explicação.
  const isAdmin = useSession().data?.user.role === 'admin'
  const iniciarProcesso = useIniciarProcesso()
  const [open, setOpen] = useState(false)
  const [procs, setProcs] = useState<ProcRow[] | null>(null)
  /** id do workflow sendo iniciado — a linha clicada mostra o giro. */
  const [iniciando, setIniciando] = useState<string | null>(null)
  /** Desfecho que NÃO abre aba (processo terminou sozinho, ou falhou). */
  const [aviso, setAviso] = useState<DesfechoInicio>(null)

  const openModal = async () => {
    setOpen(true)
    if (procs === null) {
      const all = await apiJson<ProcRow[]>('/api/processes')
      setProcs((all ?? []).filter((p) =>
        p.status === 'ACTIVE' && (!kinds || (!!p.kind && kinds.includes(p.kind))),
      ))
    }
  }
  const fechar = () => { setOpen(false); setAviso(null); setIniciando(null) }

  /* Iniciar de verdade mora em `useIniciarProcesso` — o MESMO caminho que o botão
     "Iniciar" da tela do workflow usa. Aqui só cuidamos do giro na linha e do que
     dizer quando não houve aba para abrir. */
  const start = async (proc: ProcRow) => {
    setIniciando(proc.id)
    setAviso(null)
    const desfecho = await iniciarProcesso(proc)
    setIniciando(null)
    if (desfecho) setAviso(desfecho)
    else fechar()
  }

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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
          {/* text-foreground: o botão pode viver no hero (text-white); sem isto o
              cabeçalho e o nome herdariam branco e sumiriam no card claro. */}
          <div className="glass w-full max-w-md rounded-2xl text-foreground overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Fio que nasce e morre transparente: separa sem cortar a superfície. */}
            <div className="relative flex items-center justify-between gap-3 px-5 py-4">
              <h2 className="text-[15px] font-bold tracking-tight">Iniciar um processo</h2>
              <button onClick={fechar} title="Fechar"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
              <span aria-hidden className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

            {/* Desfecho sem aba: o processo terminou sozinho, ou falhou. Fica no modal
                porque é ali que a pessoa está olhando — um toast no canto some antes
                de ser lido por quem acabou de clicar. */}
            {aviso && (
              <div className={cn('mx-3 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px] leading-snug',
                aviso.tom === 'erro'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-primary/25 bg-primary/5 text-foreground')}>
                {aviso.tom === 'erro'
                  ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px text-primary" />}
                <span>{aviso.msg}</span>
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto rolagem-visivel p-2">
              {procs === null ? (
                <Esqueleto />
              ) : procs.length === 0 ? (
                <EmptyState icon={Workflow} size="sm" title="Nenhum processo ativo"
                  description={isAdmin
                    ? 'Crie e ative um workflow em Configurações › Workflows.'
                    : 'Peça a um administrador para criar e ativar um workflow.'}
                  action={isAdmin ? (
                    <button onClick={() => { fechar(); router.push('/workflows/new') }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Criar workflow
                    </button>
                  ) : undefined} />
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {procs.map((p, i) => (
                    <li key={p.id}>
                      <button
                        onClick={() => void start(p)}
                        disabled={iniciando !== null}
                        /* `.surge` (globals.css) monta a lista em vez de despejá-la
                           pronta; o atraso por índice tem teto para o oitavo item
                           não esperar meio segundo. A própria classe se anula sob
                           "reduzir movimento". */
                        style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                        className="surge group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left
                                   hover:bg-primary/[0.07] focus-visible:bg-primary/[0.07]
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary
                                   transition-colors">
                        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-muted text-primary
                                         ring-1 ring-inset ring-border transition-all duration-200
                                         group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-transparent
                                         group-hover:shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.45)]
                                         group-focus-visible:bg-primary group-focus-visible:text-primary-foreground">
                          {iniciando === p.id
                            ? <Loader2 className="h-[17px] w-[17px] animate-spin" />
                            : <WorkflowKindIcon kind={p.kind} className="h-[17px] w-[17px]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold tracking-tight">{p.name}</span>
                          {p.description && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{p.description}</span>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-border transition-all duration-200
                                                 group-hover:translate-x-1 group-hover:text-primary
                                                 group-focus-visible:translate-x-1 group-focus-visible:text-primary" />
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

/** Esqueleto no formato exato da linha: a lista não muda de altura quando os dados
 *  chegam. Um spinner centralizado faria a caixa saltar de tamanho. */
function Esqueleto() {
  return (
    <ul className="flex flex-col gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <span className="h-[38px] w-[38px] shrink-0 animate-pulse rounded-xl bg-muted" />
          <span className="min-w-0 flex-1">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
            <span className="mt-1.5 block h-2.5 w-4/5 animate-pulse rounded bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  )
}
