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
import { agruparEtapas, agruparPassos, type PassoTrilha, type SituacaoPasso, type TimelineTask } from '@/lib/tasks-ui'

/* FORMA, não cor. Antes a trilha era só uma fileira de bolinhas — concluído verde,
   pendente cinza — e esse é justamente o par que some para quem tem deuteranopia ou
   protanopia. Aqui não havia texto nenhum para compensar: só o `title` no hover.
   Agora o estado se lê pelo desenho: cheio = concluído, vazado = pendente, cheio com
   anel = onde você está. A cor segue junto, mas não carrega mais sozinha. */
const PONTO: Record<SituacaoPasso, string> = {
  done:    'bg-primary border-primary',
  current: 'bg-primary border-primary ring-4 ring-primary/20',
  pending: 'bg-transparent border-muted-foreground/55',
}
const PONTO_BASE = 'h-2.5 w-2.5 rounded-full border-[1.5px] box-border shrink-0'

/** O que o ponto quer dizer, para leitor de tela e para o `title` do hover. */
const SITUACAO_TEXTO: Record<SituacaoPasso, string> = {
  done: 'concluída', current: 'você está aqui', pending: 'ainda não chegou',
}

export function ProcessTrail({ timeline, currentTaskId, className }: {
  timeline: TimelineTask[]
  currentTaskId: string
  /** Respiro horizontal de quem hospeda a trilha (o cartão da atividade usa px-4). */
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const passos = agruparPassos(timeline, currentTaskId)
  if (passos.length < 2) return null

  /* Frentes em paralelo nascem juntas e contam como UMA etapa: os pontos delas ficam
     dentro de uma moldura (forma, não cor) e o texto diz quantas correm ao mesmo tempo. */
  const grupos = agruparEtapas(passos)
  const atual = passos.find((p) => p.situacao === 'current')
  const indice = grupos.findIndex((g) => g.some((p) => p.situacao === 'current'))
  const outras = indice >= 0 ? grupos[indice].length - 1 : 0
  const dica = (p: PassoTrilha) => `${p.name} · ${SITUACAO_TEXTO[p.situacao]}${p.completedBy ? ` · ${p.completedBy}` : ''}${p.passagens > 1 ? ` · ${p.passagens}ª vez` : ''}`

  return (
    <div className={cn('px-1 py-2 border-b', className)}>
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
          {grupos.map((g, i) => (
            <span key={g[0].nodeId} className="flex items-center shrink-0">
              {i > 0 && <span className={cn('h-px w-3', g.every((p) => p.situacao === 'pending') ? 'bg-muted-foreground/25' : 'bg-primary/40')} />}
              {g.length === 1 ? (
                <span title={dica(g[0])} className={cn(PONTO_BASE, PONTO[g[0].situacao])} />
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-muted-foreground/40 px-1 py-0.5"
                  title={`Ao mesmo tempo: ${g.map((p) => p.name).join(', ')}`}>
                  {g.map((p) => <span key={p.nodeId} title={dica(p)} className={cn(PONTO_BASE, PONTO[p.situacao])} />)}
                </span>
              )}
            </span>
          ))}
        </span>

        {atual && (
          <span className="text-[11.5px] text-muted-foreground truncate">
            {grupos.length > 1 && <>etapa {indice + 1} de {grupos.length}</>}
            {outras > 0 && <>{grupos.length > 1 && ' · '}junto com mais {outras} {outras === 1 ? 'etapa' : 'etapas'}</>}
            {atual.passagens > 1 && <span className="text-amber-700 dark:text-amber-400 font-medium"> · {atual.passagens}ª vez</span>}
          </span>
        )}

        <ChevronDown className={cn('h-3.5 w-3.5 ml-auto shrink-0 text-muted-foreground transition-transform group-hover:text-foreground', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="flex flex-col gap-1.5 mt-2.5">
          {grupos.map((g) => (
            <div key={g[0].nodeId} className={cn('flex flex-col gap-1.5', g.length > 1 && 'border-l-2 border-muted-foreground/30 pl-2.5')}>
              {g.length > 1 && <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">ao mesmo tempo</span>}
              {g.map((p) => (
              <div key={p.nodeId} className="flex items-center gap-2.5">
                <span className={cn(PONTO_BASE, PONTO[p.situacao])} />
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
          ))}
        </div>
      )}
    </div>
  )
}
