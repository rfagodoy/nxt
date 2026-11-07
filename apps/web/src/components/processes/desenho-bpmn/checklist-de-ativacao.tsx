'use client'

/* ─── "Antes de ativar" (opção C, PO 07/11/2026) ──────────────────────────────
   O topo do editor ficou mínimo: as pendências saíram dele e aparecem aqui, quando importam
   — ao clicar em Ativar com algo faltando (ou no número ao lado do botão). Em vez de uma frase
   longa por problema, uma linha por ASSUNTO com a contagem (`lib/checklist-de-ativacao`);
   a linha abre os itens, e cada item leva até a forma no desenho. A configuração do workflow
   (tipo, quem pode iniciar) aparece no alto, com "Alterar" que abre a gaveta do workflow. */
import type { JSX, RefObject } from 'react'
import { useState } from 'react'
import { Check, ChevronDown, Info, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { montarChecklist, rotuloDoItem } from '@/lib/checklist-de-ativacao'
import { cn } from '@/lib/utils'
import type { Pendencia } from '../flow-shared'

function Marca({ ok, n }: { ok: boolean; n?: number }): JSX.Element {
  return ok
    ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-label="Pronto"><Check className="h-3 w-3" /></span>
    : <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10.5px] font-bold text-amber-800 dark:text-amber-300" aria-label={`Faltam ${n ?? 1}`}>{n ?? '!'}</span>
}

const TITULO_GRUPO = 'px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'
const LINHA = 'flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12.5px]'
const ACAO = 'shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'

export function ChecklistDeAtivacao({ ancora, pendencias, tipo, quemInicia, onFechar, onItem, onConfigurar, onAtivar, ativando }: {
  ancora: RefObject<HTMLElement | null>
  pendencias: Pendencia[]
  /** rótulo do tipo ("Contrato") e o resumo de quem pode iniciar */
  tipo: string; quemInicia: string
  onFechar: () => void
  /** ir até o item no desenho (fecha o checklist) */
  onItem: (p: Pendencia) => void
  /** abrir a gaveta do workflow (tipo, descrição, quem pode iniciar) */
  onConfigurar: () => void
  onAtivar: () => void
  ativando?: boolean
}): JSX.Element {
  const c = montarChecklist(pendencias)
  const [aberto, setAberto] = useState<string | null>(c.grupos.length === 1 ? c.grupos[0].chave : null)
  const pronto = c.faltam === 0

  return (
    <FloatingMenu anchor={ancora} onClose={onFechar} align="end" role="dialog" aria-label="Antes de ativar"
      className="w-[420px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-bold">Antes de ativar</p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground" aria-live="polite">
          {pronto ? 'Tudo pronto para ativar.' : `Falta${c.faltam > 1 ? 'm' : ''} ${c.faltam} ${c.faltam > 1 ? 'ajustes' : 'ajuste'}. Clique num item para ir até ele no desenho.`}
        </p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto pb-2">
        <p className={TITULO_GRUPO}>Configuração</p>
        <div className={LINHA}>
          <Marca ok />
          <span className="min-w-0 flex-1 truncate">Tipo: <b className="font-semibold">{tipo}</b></span>
          <button type="button" className={ACAO} onClick={onConfigurar}>Alterar</button>
        </div>
        <div className={LINHA}>
          <Marca ok={c.quemIniciaOk} n={c.quemInicia.length} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">Quem pode iniciar: <b className="font-semibold">{quemInicia}</b></span>
            {!c.quemIniciaOk && <span className="mt-0.5 block text-[11px] leading-snug text-amber-800 dark:text-amber-300">{c.quemInicia[0].mensagem}</span>}
          </span>
          <button type="button" className={ACAO} onClick={onConfigurar}>Alterar</button>
        </div>

        {c.grupos.length > 0 && <p className={TITULO_GRUPO}>Desenho</p>}
        {c.grupos.map((g) => {
          const exp = aberto === g.chave
          return (
            <div key={g.chave}>
              <button type="button" aria-expanded={exp} onClick={() => setAberto(exp ? null : g.chave)}
                className={cn(LINHA, 'hover:bg-muted/50')}>
                <Marca ok={false} n={g.itens.length} />
                <span className="min-w-0 flex-1 font-medium">{g.titulo}</span>
                <span className="text-xs font-semibold text-primary">{exp ? 'Ocultar' : 'Ver'}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', exp && 'rotate-180')} aria-hidden />
              </button>
              {exp && (
                <ul className="mx-4 mb-1 divide-y rounded-lg border bg-muted/20">
                  {g.itens.map((p, i) => (
                    <li key={`${p.tipo}-${p.nodeId ?? i}`}>
                      <button type="button" onClick={() => onItem(p)} title={p.mensagem}
                        className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-[11.5px] leading-snug hover:bg-muted">
                        <span className="min-w-0 flex-1">{rotuloDoItem(p)}</span>
                        {p.nodeId && <span className="shrink-0 font-semibold text-primary">Ir até</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        {c.avisos.length > 0 && (
          <>
            <p className={TITULO_GRUPO}>Para saber (não impede)</p>
            {c.avisos.map((p, i) => (
              <button key={`${p.tipo}-${p.nodeId ?? i}`} type="button" onClick={() => onItem(p)} title={p.mensagem}
                className={cn(LINHA, 'items-start text-[11.5px] text-muted-foreground hover:bg-muted/50')}>
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /><span className="min-w-0 flex-1 leading-snug">{rotuloDoItem(p)}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
        <Button size="sm" onClick={onAtivar} disabled={!pronto || ativando}
          title={pronto ? 'Ativar workflow' : 'Resolva os ajustes acima para ativar'}>
          {ativando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Ativar
        </Button>
      </div>
    </FloatingMenu>
  )
}
