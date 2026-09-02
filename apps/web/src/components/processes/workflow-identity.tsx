'use client'

import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { WorkflowKindIcon } from './workflow-kind-icon'

/* ─── Identidade do workflow ──────────────────────────────────────────────────
   Nome, descrição e tipo como o CABEÇALHO DO DOCUMENTO, no alto do desenho —
   não como três campos espremidos numa coluna de 320px (decisão do PO, 01/09/2026,
   depois de três rodadas de alternativas).

   O problema que isto corrige: o nome vivia na barra de ferramentas, declarado com
   `border-0 shadow-none px-0 bg-transparent` — estilizado de propósito para parecer
   um TÍTULO. Só que é obrigatório: sem ele a API recusa salvar e recusa ativar, e a
   pessoa só descobria por um diálogo depois de desenhar o fluxo inteiro. Descrição e
   tipo, por sua vez, moravam no painel da direita e SUMIAM ao clicar em qualquer
   quadro, porque aquele painel é compartilhado com a configuração do nó.

   A aposta aqui é que ninguém precisa aprender a nomear um documento. Por isso o
   nome é o maior texto da tela, com o cursor já nele ao abrir, e o texto de apoio é
   uma ORDEM ("Dê um nome…"), não um rótulo.

   ⚠️ Sem moldura NÃO pode significar sem affordance — foi esse o erro anterior. O
   fundo acende no hover e no foco, e o foco tem anel visível. Se algum dia alguém
   achar que "fica mais limpo sem o hover", o campo volta a ser um título morto. */

export interface WorkflowKindOption { value: string; label: string }

export function WorkflowIdentity({
  name, onName, description, onDescription, kind, onKind, kinds, autoFocus,
}: {
  name: string
  onName: (v: string) => void
  description: string
  onDescription: (v: string) => void
  kind: string
  onKind: (v: string) => void
  kinds: readonly WorkflowKindOption[]
  /** Workflow novo abre com o cursor no nome; ao editar um existente, não rouba o foco. */
  autoFocus?: boolean
}) {
  const descRef = useRef<HTMLTextAreaElement>(null)

  /* A descrição cresce com o texto em vez de rolar por dentro: ela é o subtítulo do
     documento, e subtítulo cortado no meio não se lê. Continua sendo textarea (e não
     input) para não perder a quebra de linha que o campo sempre aceitou. */
  useEffect(() => {
    const el = descRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [description])

  const campoCls =
    'w-full bg-transparent outline-none rounded-md px-2 -mx-2 transition-colors ' +
    'hover:bg-muted/50 focus:bg-muted/50 ' +
    'focus-visible:ring-2 focus-visible:ring-primary/40'

  return (
    <div className="shrink-0 relative px-8 pt-5 pb-4">
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- é a única coisa a fazer na tela ao criar */}
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        autoFocus={autoFocus}
        aria-label="Nome do workflow"
        placeholder="Dê um nome a este workflow"
        className={cn(campoCls, 'py-0.5 text-2xl font-extrabold tracking-tight leading-tight placeholder:font-bold placeholder:text-muted-foreground/45')}
      />

      <textarea
        ref={descRef}
        rows={1}
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        aria-label="Descrição do workflow"
        placeholder="Descreva o objetivo — para quem for gerenciá-lo depois."
        className={cn(campoCls, 'mt-1 py-0.5 resize-none overflow-hidden text-sm text-muted-foreground placeholder:text-muted-foreground/45')}
      />

      <div className="mt-3 flex items-center gap-2.5 flex-wrap">
        <Select value={kind || 'none'} onValueChange={(v) => onKind(v === 'none' ? '' : v)}>
          <SelectTrigger
            aria-label="Tipo do workflow"
            className={cn(
              'h-auto w-auto gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-none',
              /* Sem tipo, a pastilha PEDE — tracejada e âmbar. Escolhido, ela AFIRMA:
                 sólida, esmeralda, com o glifo do tipo. A forma diz o estado antes da
                 leitura. */
              kind
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-dashed border-amber-400/70 bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}
          >
            {kind ? (
              <span className="flex items-center gap-1.5">
                <WorkflowKindIcon kind={kind} className="h-3.5 w-3.5" />
                {kinds.find((k) => k.value === kind)?.label ?? kind}
              </span>
            ) : (
              <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Definir o tipo</span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="flex items-center gap-2 text-muted-foreground">
                <WorkflowKindIcon className="h-4 w-4" />— sem tipo (só no Dashboard)
              </span>
            </SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                <span className="flex items-center gap-2">
                  <WorkflowKindIcon kind={k.value} className="h-4 w-4" />{k.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-[11px] text-muted-foreground">
          Determina onde ele aparece em “Novo processo”.
        </span>
      </div>

      {/* Fio que nasce e morre transparente: separa a identidade do desenho sem
          cortar a superfície de ponta a ponta. */}
      <span aria-hidden className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  )
}
