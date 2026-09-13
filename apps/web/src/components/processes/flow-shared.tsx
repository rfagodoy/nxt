'use client'

/* Peças usadas pelas DUAS vistas do workflow — montar em blocos e ver por raia. */

import { AlertTriangle, Info, Maximize2, Minus, Plus } from 'lucide-react'
import { bloqueantes, avisos as avisosDe, type ProblemaAtivacao } from '@nxt/workflow-core'
import { cn } from '@/lib/utils'

/* Zoom. O teto acima de 100% existe para LER: com o desenho grande, é o que permite
   conferir prazo e executor sem abrir a atividade. Abaixo do piso o texto vira borrão. */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2
const ZOOM_PASSOS = [0.25, 0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2]

/** Controle de zoom, flutuante sobre o desenho. "Ajustar" enquadra tudo na área visível. */
export function ZoomBar({ scale, autoFit, onZoom, onFit }: {
  scale: number; autoFit: boolean; onZoom: (s: number) => void; onFit: () => void
}) {
  // vai para o degrau seguinte/anterior da escala — o zoom da roda cai entre eles
  const passo = (dir: 1 | -1) => {
    const alvo = dir > 0
      ? ZOOM_PASSOS.find((s) => s > scale + 0.001)
      : [...ZOOM_PASSOS].reverse().find((s) => s < scale - 0.001)
    onZoom(alvo ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN))
  }
  const btn = 'h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <div className="glass absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-xl p-1 shadow-sm">
      <button type="button" onClick={() => passo(-1)} disabled={scale <= ZOOM_MIN + 0.001} className={btn} title="Afastar (Ctrl + roda do mouse)"><Minus className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => onZoom(1)} className="h-7 min-w-[3.25rem] px-1 rounded-md text-[11px] font-semibold tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Voltar para 100%">
        {Math.round(scale * 100)}%
      </button>
      <button type="button" onClick={() => passo(1)} disabled={scale >= ZOOM_MAX - 0.001} className={btn} title="Aproximar (Ctrl + roda do mouse)"><Plus className="h-3.5 w-3.5" /></button>
      <span className="w-px h-4 bg-border mx-0.5" />
      <button type="button" onClick={onFit} className={cn(btn, autoFit && 'text-primary')} title="Ajustar à tela"><Maximize2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}

/** Losango do gateway em miniatura, para selos e cabeçalhos. */
export function GatewayGlyph({ kind, className }: { kind: 'exclusive' | 'parallel'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
      {kind === 'exclusive'
        ? <><path d="m8.9 8.9 6.2 6.2" /><path d="m15.1 8.9-6.2 6.2" /></>
        : <><path d="M12 7.7v8.6" /><path d="M7.7 12h8.6" /></>}
    </svg>
  )
}

/** Pendências de ativação: pílula + painel clicável. DUAS classes, e a diferença é dita
 *  na tela — o que IMPEDE a ativação (triângulo) e o AVISO (i), que é desenho válido.
 *  A forma do ícone carrega a diferença; a cor só reforça. */
export function PendenciasPill({ pendencias, aberto, onToggle, onItem, style }: {
  pendencias: ProblemaAtivacao[]
  aberto: boolean
  onToggle: () => void
  onItem: (p: ProblemaAtivacao) => void
  style?: React.CSSProperties
}) {
  if (!pendencias.length) return null
  const erros = bloqueantes(pendencias)
  const infos = avisosDe(pendencias)
  const item = (p: ProblemaAtivacao, i: number, erro: boolean) => (
    <li key={`${p.tipo}-${p.nodeId ?? i}-${i}`}>
      <button type="button" onClick={() => onItem(p)}
        className="w-full text-left rounded-lg px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex gap-2">
        {erro
          ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          : <Info className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" />}
        <span>{p.mensagem}</span>
      </button>
    </li>
  )
  return (
    <div className="absolute bottom-3 z-20" style={style}>
      {aberto && (
        <div className="mb-2 w-[400px] max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto rounded-xl border bg-card shadow-lg">
          <div className="sticky top-0 px-3 py-2 border-b bg-card/95 backdrop-blur-sm">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              {erros.length
                ? <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Ainda não dá para ativar</>
                : <><Info className="h-3.5 w-3.5 text-sky-500" />Dá para ativar — com avisos</>}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Clique num item para ir até ele no desenho.</p>
          </div>
          {erros.length > 0 && <ul className="p-1.5">{erros.map((p, i) => item(p, i, true))}</ul>}
          {infos.length > 0 && (
            <>
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border-t">
                Avisos · não impedem a ativação
              </p>
              <ul className="p-1.5 pt-0">{infos.map((p, i) => item(p, i, false))}</ul>
            </>
          )}
        </div>
      )}
      <button type="button" onClick={onToggle}
        title={aberto ? 'Recolher' : erros.length ? 'Ver o que falta para ativar' : 'Ver os avisos do desenho'}
        className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors',
          erros.length
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            : 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20')}>
        {erros.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
        {erros.length
          ? `${erros.length} ${erros.length === 1 ? 'pendência' : 'pendências'} para ativar`
          : `${infos.length} ${infos.length === 1 ? 'aviso' : 'avisos'} no desenho`}
      </button>
    </div>
  )
}
