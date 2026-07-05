'use client'

import { useState, useEffect, useRef } from 'react'
import { X, FileText, Users, Eraser, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/workspace-context'

/* Barra de abas GLOBAL do shell — documentos de qualquer módulo (contrato + parceiro + unidade) juntos.
   Recursos: ícone por tipo, indicador de não-salvo, aba ativa estilo navegador (cartão elevado),
   arrastar para reordenar, fechar (clique-do-meio / menu de contexto), limpar tudo,
   setas de rolagem + auto-scroll da aba ativa quando há muitas abas. */
export function WorkspaceBar() {
  const { tabs, activeId, dirty, setActive, close, closeOthers, closeAll, reorder } = useWorkspace()
  const [drag,    setDrag]    = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [menu,    setMenu]    = useState<{ id: string; x: number; y: number } | null>(null)
  const [clearAt, setClearAt] = useState<{ x: number; y: number } | null>(null)
  const [closeAsk, setCloseAsk] = useState<{ id: string; x: number; y: number } | null>(null)

  /* fechar aba com alterações não salvas pede confirmação; sem alterações, fecha direto */
  const askClose = (id: string, x: number, y: number) => { dirty[id] ? setCloseAsk({ id, x, y }) : close(id) }

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)

  /* fecha menu de contexto / confirmações ao clicar fora ou rolar */
  useEffect(() => {
    if (!menu && !clearAt && !closeAsk) return
    const h = () => { setMenu(null); setClearAt(null); setCloseAsk(null) }
    window.addEventListener('mousedown', h)
    window.addEventListener('scroll', h, true)
    return () => { window.removeEventListener('mousedown', h); window.removeEventListener('scroll', h, true) }
  }, [menu, clearAt, closeAsk])

  /* afordância de rolagem (setas) conforme overflow das abas */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setCanL(el.scrollLeft > 1)
      setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    check()
    el.addEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [tabs.length])

  /* a aba ativa (ex.: recém-aberta) sempre rola para a área visível */
  useEffect(() => {
    if (activeId == null) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  const scrollBy = (dir: 'left' | 'right') => scrollRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' })

  if (tabs.length === 0) return null

  const dirtyCount = tabs.filter(t => dirty[t.id]).length
  const tabBase   = 'group relative flex items-center gap-1.5 h-9 px-3 rounded-t-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors select-none'
  const activeCls = 'bg-card text-foreground border-x border-t border-border -mb-px shadow-sm'
  const arrowCls  = 'self-center shrink-0 flex h-7 w-5 items-center justify-center rounded text-muted-foreground transition-all'

  return (
    <div className="flex items-stretch h-14 shrink-0 border-b bg-muted/60">

      {/* pseudo-aba Lista (fixa) → volta para a página roteada */}
      <div className="flex items-end pl-2 shrink-0">
        <button type="button" onClick={() => setActive(null)}
          className={cn(tabBase, 'font-medium',
            activeId === null ? 'bg-card text-primary border-x border-t border-border -mb-px shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-card/70')}>
          <span className="text-xs">Lista</span>
        </button>
      </div>

      {/* seta esquerda */}
      <button type="button" onClick={() => scrollBy('left')}
        className={cn(arrowCls, canL ? 'hover:bg-card hover:text-foreground' : 'opacity-0 pointer-events-none')}>
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* abas de documento (rolam) */}
      <div ref={scrollRef} className="flex items-end flex-1 min-w-0 gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
        {tabs.map((t, i) => {
          const Icon    = t.kind === 'contract' ? FileText : Users
          const active  = activeId === t.id
          const isDirty = !!dirty[t.id]
          return (
            <div
              key={t.id}
              data-tab-id={t.id}
              draggable
              onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={e => { e.preventDefault(); if (overIdx !== i) setOverIdx(i) }}
              onDrop={() => { if (drag !== null) reorder(drag, i); setDrag(null); setOverIdx(null) }}
              onDragEnd={() => { setDrag(null); setOverIdx(null) }}
              onClick={() => setActive(t.id)}
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); askClose(t.id, e.clientX, e.clientY) } }}
              onContextMenu={e => { e.preventDefault(); setActive(t.id); setMenu({ id: t.id, x: e.clientX, y: e.clientY }) }}
              title={t.label}
              className={cn(tabBase,
                active ? activeCls : 'text-muted-foreground hover:text-foreground hover:bg-card/70',
                overIdx === i && drag !== null && drag !== i && 'ring-1 ring-primary/40')}>
              <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? (t.kind === 'contract' ? 'text-primary' : 'text-emerald-500') : '')} />
              <span className="text-xs font-medium max-w-[160px] truncate">{t.label}</span>
              <span className="relative ml-0.5 flex h-4 w-4 items-center justify-center shrink-0">
                {isDirty && <span className="absolute h-1.5 w-1.5 rounded-full bg-amber-500 group-hover:opacity-0 transition-opacity" title="Alterações não salvas" />}
                <button type="button" onClick={e => { e.stopPropagation(); askClose(t.id, e.clientX, e.clientY) }}
                  className="flex h-4 w-4 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all hover:text-foreground">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {/* seta direita */}
      <button type="button" onClick={() => scrollBy('right')}
        className={cn(arrowCls, canR ? 'hover:bg-card hover:text-foreground' : 'opacity-0 pointer-events-none')}>
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* limpar área de trabalho (fixo à direita) */}
      <div className="flex items-center shrink-0 border-l border-border/60 px-2">
        <button type="button" title="Fechar todas as abas"
          onClick={e => setClearAt({ x: e.clientX, y: e.clientY })}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card hover:border-foreground/25 transition-colors">
          <Eraser className="h-3.5 w-3.5" />Limpar
        </button>
      </div>

      {/* menu de contexto (botão direito) */}
      {menu && (
        <div className="fixed z-50 min-w-[160px] rounded-md border bg-card p-1 shadow-md text-xs"
          style={{ top: menu.y, left: menu.x }} onMouseDown={e => e.stopPropagation()}>
          <button type="button" onClick={() => { const m = menu; setMenu(null); askClose(m.id, m.x, m.y) }}
            className="flex w-full items-center rounded px-2 py-1.5 hover:bg-muted text-left">Fechar</button>
          <button type="button" onClick={() => { closeOthers(menu.id); setMenu(null) }}
            className="flex w-full items-center rounded px-2 py-1.5 hover:bg-muted text-left disabled:opacity-40"
            disabled={tabs.length <= 1}>Fechar outras</button>
          <button type="button" onClick={() => { closeAll(); setMenu(null) }}
            className="flex w-full items-center rounded px-2 py-1.5 hover:bg-muted text-left text-destructive">Fechar todas</button>
        </div>
      )}

      {/* confirmação de limpar área de trabalho */}
      {clearAt && (
        <div className="fixed z-50 w-60 rounded-md border bg-card p-3 shadow-md text-xs"
          style={{ top: clearAt.y + 8, left: Math.max(8, clearAt.x - 220) }} onMouseDown={e => e.stopPropagation()}>
          <p className="font-medium mb-0.5">Limpar área de trabalho?</p>
          <p className="text-muted-foreground">Fecha as {tabs.length} aba{tabs.length !== 1 ? 's' : ''} aberta{tabs.length !== 1 ? 's' : ''}.</p>
          {dirtyCount > 0 && <p className="mt-1.5 text-amber-600 dark:text-amber-400">{dirtyCount} com alterações não salvas serão descartadas.</p>}
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setClearAt(null)} className="text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={() => { closeAll(); setClearAt(null) }}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Fechar todas</button>
          </div>
        </div>
      )}

      {/* confirmação de fechar aba com alterações não salvas */}
      {closeAsk && (
        <div className="fixed z-50 w-60 rounded-md border bg-card p-3 shadow-md text-xs"
          style={{ top: closeAsk.y + 8, left: Math.max(8, closeAsk.x - 220) }} onMouseDown={e => e.stopPropagation()}>
          <p className="font-medium mb-0.5">Fechar sem salvar?</p>
          <p className="text-amber-600 dark:text-amber-400">Esta aba tem alterações não salvas que serão descartadas.</p>
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setCloseAsk(null)} className="text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={() => { close(closeAsk.id); setCloseAsk(null) }}
              className="inline-flex items-center h-7 rounded-md bg-destructive px-3 font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">Descartar e fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
