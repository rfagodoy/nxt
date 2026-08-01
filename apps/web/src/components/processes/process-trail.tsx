'use client'

/* "Onde você está": a trilha do processo dentro do documento de execução da tarefa.
   Era uma lista VERTICAL de todas as tarefas já criadas, fora da área de rolagem — cada
   etapa nova roubava altura do formulário em definitivo, e como a fonte são TAREFAS (não
   etapas do desenho), toda devolução repetia a mesma atividade mais uma vez. Um processo
   devolvido duas vezes mostrava a mesma etapa três vezes.

   Agora: uma linha de altura FIXA (recolhida por padrão) com um ponto por ETAPA — as
   passagens repetidas colapsam numa entrada só, marcada com "2ª vez". O detalhe continua
   a um clique, e a altura não cresce mais com o processo. */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { agruparPassos, type SituacaoPasso, type TimelineTask } from '@/lib/tasks-ui'

const PONTO: Record<SituacaoPasso, string> = {
  done: 'bg-primary',
  current: 'bg-primary ring-4 ring-primary/20',
  pending: 'bg-muted-foreground/30',
}

export function ProcessTrail({ timeline, currentTaskId }: {
  timeline: TimelineTask[]
  currentTaskId: string
}) {
  const [aberto, setAberto] = useState(false)
  const passos = agruparPassos(timeline, currentTaskId)
  if (passos.length < 2) return null

  const atual = passos.find((p) => p.situacao === 'current')
  const indice = passos.findIndex((p) => p.situacao === 'current')

  return (
    <div className="px-1 py-2 border-b">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2.5 text-left group"
        title={aberto ? 'Recolher a trilha do processo' : 'Ver a trilha completa do processo'}
      >
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold shrink-0">Onde você está</span>

        {/* pontos: um por etapa, ligados por um traço. Altura fixa — não cresce com o processo. */}
        <span className="flex items-center gap-0 min-w-0 shrink">
          {passos.map((p, i) => (
            <span key={p.nodeId} className="flex items-center shrink-0" title={`${p.name}${p.completedBy ? ` · ${p.completedBy}` : ''}${p.passagens > 1 ? ` · ${p.passagens}ª vez` : ''}`}>
              {i > 0 && <span className={cn('h-px w-3', p.situacao === 'pending' ? 'bg-muted-foreground/25' : 'bg-primary/40')} />}
              <span className={cn('h-2 w-2 rounded-full', PONTO[p.situacao])} />
            </span>
          ))}
        </span>

        {atual && (
          <span className="text-[11.5px] text-muted-foreground truncate">
            etapa {indice + 1} de {passos.length}
            {atual.passagens > 1 && <span className="text-amber-700 dark:text-amber-400 font-medium"> · {atual.passagens}ª vez</span>}
          </span>
        )}

        <ChevronDown className={cn('h-3.5 w-3.5 ml-auto shrink-0 text-muted-foreground transition-transform group-hover:text-foreground', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="flex flex-col gap-1.5 mt-2.5">
          {passos.map((p) => (
            <div key={p.nodeId} className="flex items-center gap-2.5">
              <span className={cn('h-2 w-2 rounded-full shrink-0', PONTO[p.situacao])} />
              <span className={cn('text-[12.5px]', p.situacao === 'current' ? 'font-semibold' : 'text-muted-foreground', p.situacao === 'pending' && 'text-muted-foreground/70')}>{p.name}</span>
              {p.situacao === 'done' && p.completedBy && <span className="text-[11px] text-muted-foreground/70">· {p.completedBy}</span>}
              {/* devolução: dizer que a etapa já passou por aqui antes evita refazer no automático */}
              {p.passagens > 1 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {p.passagens}ª vez
                </span>
              )}
              {p.situacao === 'current' && <span className="ml-auto text-[10px] uppercase tracking-wide text-primary font-semibold">sua vez</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
