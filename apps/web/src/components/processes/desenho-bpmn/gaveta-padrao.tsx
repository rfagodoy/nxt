'use client'

/* ─── Peças da gaveta PADRÃO do editor ─────────────────────────────────────────
   O padrão é o das perguntas da etapa (PO 27/10/2026): cabeçalho com o chip colorido do tipo
   (GavetaLateral + `TOM_DO_TIPO`), o cartão escuro "EM RESUMO" com a frase do elemento,
   PERGUNTAS numeradas (o número vira ✓ quando respondida), respostas em CARTÃO (`Opcao`) e o
   rodapé com a linha de status, Remover à esquerda e Cancelar / Aplicar à direita.
   Toda gaveta do desenho monta com estas peças — a etapa, a escolha, o "ao mesmo tempo",
   a raia, a fase, as piscinas, a mensagem, a seta e as formas novas. */
import type { JSX, ReactNode } from 'react'
import { useEffect } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Trecho } from '@/lib/editor-bizagi/resumos'
import { cn } from '@/lib/utils'
import { ehEscDaGaveta } from './gaveta'

/** Altura e letra dos campos seguem a DENSIDADE escolhida pelo usuário (lib/densidade). */
export const CAMPO = 'h-[var(--campo-altura)] text-[length:var(--campo-fonte)]'

/** O corpo da gaveta: as perguntas numa coluna, com o respiro do padrão. */
export const CORPO_DA_GAVETA = 'flex flex-col gap-7 px-4 py-4'

/** Cor do chip do cabeçalho, por tipo de elemento (claro e escuro). */
export const TOM_DO_TIPO = {
  /** escolha, inclusivo, baseado em evento */
  escolha: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400',
  /** "ao mesmo tempo" */
  paralelo: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-400',
  /** raia, fase, piscinas */
  estrutura: 'bg-slate-500/10 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300',
  /** fluxo de mensagem, seta de sequência */
  ligacao: 'bg-zinc-500/10 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-400',
  /** início, intermediários, Fim (simples) */
  evento: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400',
  /** subprocesso, tarefas de envio e recebimento */
  subprocesso: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400',
  /** fim com erro, com cancelamento, terminar tudo */
  fimForte: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300',
} as const
export type TomDoTipo = keyof typeof TOM_DO_TIPO

/** O chip "Próxima rodada" — só os elementos que o motor ainda não executa o mostram. */
export function SeloProximaRodada(): JSX.Element {
  return (
    <span className="whitespace-nowrap rounded bg-[#EEF0EE] px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.01em] text-[var(--e-5B6B63)] dark:bg-white/[0.06] dark:text-[var(--e-9DB0A5)]">
      Próxima rodada
    </span>
  )
}

/* ── Em resumo ── */

export function ResumoForte({ children }: { children: ReactNode }): JSX.Element {
  return <b className="font-semibold text-white">{children}</b>
}
/** O que ainda falta, dito DENTRO da frase: quem lê o resumo vê o buraco no lugar dele. */
export function ResumoFalta({ children }: { children: ReactNode }): JSX.Element {
  return <span className="font-semibold text-[#F5B971] underline decoration-dotted underline-offset-2">{children}</span>
}

/** A frase pronta (`lib/editor-bizagi/resumos`), trecho a trecho. */
export function FraseDoResumo({ trechos }: { trechos: ReadonlyArray<Trecho> }): JSX.Element {
  return (
    <>
      {trechos.map((r, i) => (r.falta ? <ResumoFalta key={i}>{r.t}</ResumoFalta> : r.forte ? <ResumoForte key={i}>{r.t}</ResumoForte> : <span key={i}>{r.t}</span>))}
    </>
  )
}

/** O cartão escuro do alto: o elemento inteiro numa frase. `vivo` = anuncia as mudanças. */
export function EmResumo({ children, vivo = true }: { children: ReactNode; vivo?: boolean }): JSX.Element {
  return (
    <div className="rounded-xl bg-forest p-4 text-white/80 shadow-[0_18px_40px_-24px_rgba(12,20,16,0.7)] ring-1 ring-white/5">
      <span className="inline-block rounded bg-spark px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-forest">EM RESUMO</span>
      <p className="mt-2 text-[13px] leading-relaxed" aria-live={vivo ? 'polite' : undefined}>{children}</p>
    </div>
  )
}

/* ── Perguntas ── */

export function NumeroPergunta({ n, ok, pequeno }: { n: number; ok: boolean; pequeno?: boolean }): JSX.Element {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-mono font-bold',
      pequeno ? 'h-5 w-5 text-[10.5px]' : 'h-6 w-6 text-[11px]',
      ok ? 'bg-primary text-primary-foreground' : 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/50 dark:text-amber-300')}
      aria-label={ok ? `Pergunta ${n}, respondida` : `Pergunta ${n}, falta responder`}>
      {ok ? <Check className={pequeno ? 'h-3 w-3' : 'h-3.5 w-3.5'} /> : n}
    </span>
  )
}

/** Uma pergunta: número (vira ✓ quando respondida), a pergunta, uma linha de ajuda. */
export function Pergunta({ id, n, titulo, ajuda, ok, children }: {
  id: string; n: number; titulo: string; ajuda?: string; ok: boolean; children: ReactNode
}): JSX.Element {
  return (
    <section id={`pergunta-${id}`} aria-labelledby={`pergunta-${id}-titulo`} className="flex scroll-mt-4 flex-col gap-[var(--form-gap)]">
      <div className="flex items-start gap-3">
        <NumeroPergunta n={n} ok={ok} />
        <div className="min-w-0">
          <h3 id={`pergunta-${id}-titulo`} className="text-[15px] font-bold leading-snug">{titulo}</h3>
          {ajuda && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{ajuda}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-[var(--form-gap)] pl-9">{children}</div>
    </section>
  )
}

/** Resposta em CARTÃO (rádio): título + uma linha que explica a consequência. */
export function Opcao({ ativo, onClick, titulo, descricao, icone, disabled }: {
  ativo: boolean; onClick: () => void; titulo: string; descricao?: string; icone?: ReactNode; disabled?: boolean
}): JSX.Element {
  return (
    <button type="button" role="radio" aria-checked={ativo} disabled={disabled} onClick={onClick}
      className={cn('flex min-w-0 items-start gap-2.5 rounded-lg border bg-card px-3 py-[var(--secao-pad)] text-left transition-colors',
        ativo ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-foreground/25 hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-50')}>
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        ativo ? 'border-primary bg-primary' : 'border-muted-foreground/50')} aria-hidden>
        {ativo && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[length:var(--campo-fonte)] font-semibold">
          {icone && <span className={cn('shrink-0', ativo ? 'text-primary' : 'text-muted-foreground')}>{icone}</span>}{titulo}
        </span>
        {descricao && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{descricao}</span>}
      </span>
    </button>
  )
}

/** Ação de texto pequena num cartão (Editar, Remover). */
export function AcaoDoCartao({ onClick, perigo, children, rotulo, disabled }: {
  onClick: () => void; perigo?: boolean; children: ReactNode; rotulo?: string; disabled?: boolean
}): JSX.Element {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} title={rotulo} disabled={disabled}
      className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-30',
        perigo ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
      {children}
    </button>
  )
}

/** "+ Caminho", "+ Frente": acréscimo no pé de uma lista. */
export function BotaoAcrescentar({ onClick, children }: { onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 self-start rounded text-xs font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {children}
    </button>
  )
}

/* ── Rodapé ── */

/** Linha de status + Remover (opcional, à esquerda) + Cancelar / Aplicar. */
export function RodapePadrao({ pendentes, remover, onCancelar, onAplicar }: {
  /** perguntas que faltam responder (0 = "Tudo respondido") */
  pendentes: number
  remover?: { rotulo: string; aoRemover: () => void; nomeAcessivel?: string }
  onCancelar: () => void
  onAplicar: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {pendentes > 0
          ? <span className="font-semibold text-amber-800 dark:text-amber-300">Falta responder {pendentes} pergunta{pendentes > 1 ? 's' : ''}</span>
          : <span className="inline-flex items-center gap-1 font-semibold text-primary"><Check className="h-3.5 w-3.5" />Tudo respondido</span>}
        {' · '}As alterações entram no workflow ao <span className="font-medium">Salvar rascunho</span> ou <span className="font-medium">Ativar</span>.
      </p>
      <div className="flex items-center justify-end gap-2">
        {remover && (
          <Button variant="ghost" size="sm" onClick={remover.aoRemover} aria-label={remover.nomeAcessivel ?? remover.rotulo}
            className="mr-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />{remover.rotulo}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" onClick={onAplicar}>Aplicar</Button>
      </div>
    </div>
  )
}

/** Esc DENTRO da gaveta (sem lista/balão aberto por cima) cancela, como o X. */
export function useEscCancela(onCancelar: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (ehEscDaGaveta(e)) { e.stopPropagation(); onCancelar() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancelar])
}

/** Conta as perguntas sem resposta enquanto a gaveta monta: `ok(false)` soma uma. */
export function contadorDePendencias(): { ok: (v: boolean) => boolean; total: () => number } {
  let faltam = 0
  return { ok: (v) => { if (!v) faltam++; return v }, total: () => faltam }
}
