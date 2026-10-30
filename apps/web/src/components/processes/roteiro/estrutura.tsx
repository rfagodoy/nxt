'use client'

/* ─── Roteiro: mexer na estrutura pela lista (spec §3) ────────────────────────
   O "+" que inclui itens e o menu ⋯ de cada linha. Quem muda o fluxo é o editor, pelas
   MESMAS funções do desenho (`EstruturaDoRoteiro`); aqui só se pede. */
import { useRef, useState, type JSX } from 'react'
import { ArrowDown, ArrowUp, Link2, MoreHorizontal, Plus, Trash2, Unlink, UserSquare, Zap } from 'lucide-react'
import type { FluxoBlocos } from '@nxt/workflow-core'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { cn } from '@/lib/utils'
import { GatewayGlyph } from '../flow-shared'
import type { NovoItem } from '../workflow-blocos'

export interface EstruturaDoRoteiro {
  inserir: (ref: string, indice: number, tipo: NovoItem) => void
  remover: (id: string) => void
  mudarFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
  vinculaveis: Array<{ id: string; nome: string }>
  inserirVinculada: (ref: string, indice: number, origemId: string) => void
  desvincular: (id: string) => void
  /** o motor aceita o item neste lugar? (`podeSoltar`) */
  avaliar: (id: string, destino: { ref: string; indice: number }) => { ok: true } | { ok: false; motivo: string }
  /** move de fato (só chamado depois de `avaliar` aceitar) */
  mover: (id: string, destino: { ref: string; indice: number }) => void
}

const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-40 disabled:hover:bg-transparent'

/** "+": entre dois itens (aparece ao passar o mouse) ou fixo no fim de uma lista. */
export function Inserir({ estrutura, refLista, indice, rotulo }: {
  estrutura: EstruturaDoRoteiro; refLista: string; indice: number
  /** com rótulo: sempre visível ("+ etapa neste caminho"); sem: só no hover, entre itens */
  rotulo?: string
}): JSX.Element {
  const botao = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const escolher = (fn: () => void) => () => { setAberto(false); fn() }
  return (
    <div className={cn('group relative', rotulo ? 'pt-0.5' : 'h-1.5')}>
      <button ref={botao} type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        aria-label={rotulo ?? 'Incluir aqui'} title={rotulo ?? 'Incluir aqui'}
        className={rotulo
          ? 'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[12px] font-bold text-primary outline-none hover:bg-primary/10 focus-visible:bg-primary/10'
          : cn('absolute -left-[22px] top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow outline-none transition-opacity',
            aberto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}>
        <Plus className={rotulo ? 'h-3.5 w-3.5' : 'h-3 w-3'} />{rotulo}
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} role="menu" aria-label="Incluir"
          className="w-[240px] rounded-xl border bg-card p-1 text-card-foreground shadow-2xl">
          <button type="button" role="menuitem" className={item} onClick={escolher(() => estrutura.inserir(refLista, indice, 'userTask'))}>
            <UserSquare className="h-4 w-4 text-sky-600" />Etapa
          </button>
          <button type="button" role="menuitem" className={item} onClick={escolher(() => estrutura.inserir(refLista, indice, 'serviceTask'))}>
            <Zap className="h-4 w-4 text-amber-600" />Etapa automática
          </button>
          <button type="button" role="menuitem" className={item} onClick={escolher(() => estrutura.inserir(refLista, indice, 'escolha'))}>
            <GatewayGlyph kind="exclusive" className="h-4 w-4 text-violet-600" />Escolha
          </button>
          <button type="button" role="menuitem" className={item} onClick={escolher(() => estrutura.inserir(refLista, indice, 'paralelo'))}>
            <GatewayGlyph kind="parallel" className="h-4 w-4 text-rose-600" />Ao mesmo tempo
          </button>
          {estrutura.vinculaveis.length > 0 && (
            <>
              <p className="mt-1 border-t px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Mesma configuração de…</p>
              <div className="max-h-48 overflow-y-auto">
                {estrutura.vinculaveis.map((v) => (
                  <button key={v.id} type="button" role="menuitem" className={item} onClick={escolher(() => estrutura.inserirVinculada(refLista, indice, v.id))}>
                    <Link2 className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{v.nome}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </FloatingMenu>
      )}
    </div>
  )
}

/** Menu ⋯ de uma linha: mover, desvincular, remover. */
export function MenuDaLinha({ rotulo, onRemover, onCima, onBaixo, onDesvincular }: {
  rotulo: string
  onRemover: () => void
  onCima?: () => void
  onBaixo?: () => void
  onDesvincular?: () => void
}): JSX.Element {
  const botao = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const escolher = (fn?: () => void) => () => { setAberto(false); fn?.() }
  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label={`Mais ações: ${rotulo}`} title="Mais ações"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} align="end" onClose={() => setAberto(false)} role="menu" aria-label={`Ações: ${rotulo}`}
          className="w-[210px] rounded-xl border bg-card p-1 text-card-foreground shadow-2xl">
          <button type="button" role="menuitem" className={item} disabled={!onCima} onClick={escolher(onCima)}><ArrowUp className="h-4 w-4 text-muted-foreground" />Mover para cima</button>
          <button type="button" role="menuitem" className={item} disabled={!onBaixo} onClick={escolher(onBaixo)}><ArrowDown className="h-4 w-4 text-muted-foreground" />Mover para baixo</button>
          {onDesvincular && (
            <button type="button" role="menuitem" className={item} onClick={escolher(onDesvincular)}><Unlink className="h-4 w-4 text-muted-foreground" />Tornar independente</button>
          )}
          <button type="button" role="menuitem" className={cn(item, 'text-destructive')} onClick={escolher(onRemover)}><Trash2 className="h-4 w-4" />Remover</button>
        </FloatingMenu>
      )}
    </>
  )
}
