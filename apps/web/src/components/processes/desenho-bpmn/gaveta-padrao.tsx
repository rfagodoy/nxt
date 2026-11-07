'use client'

/* ─── Peças da gaveta PADRÃO do editor ─────────────────────────────────────────
   Padrão dos cadastros do sistema (PO 07/11/2026, opção A dos mockups — substitui o padrão
   de perguntas numeradas e cartão escuro "Em resumo" de 27/10): cabeçalho com o chip colorido
   do tipo, o nome e o RESUMO numa linha discreta (GavetaLateral `resumo`); o corpo em SEÇÕES
   em sanfona (`Pergunta`) com ícone, título curto e, à direita, o valor atual ou "Falta";
   campos com o rótulo em cima, escolhas em LISTA (`CampoEscolha`) e o rodapé dizendo o que
   falta, com Remover à esquerda e Cancelar / Aplicar à direita.
   Toda gaveta do desenho monta com estas peças — a etapa, a escolha, o "ao mesmo tempo",
   a raia, a fase, as piscinas, a mensagem, a seta e as formas novas. */
import type { JSX, ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Trecho } from '@/lib/editor-bizagi/resumos'
import { cn } from '@/lib/utils'
import { ehEscDaGaveta } from './gaveta'

/** Altura e letra dos campos seguem a DENSIDADE escolhida pelo usuário (lib/densidade). */
export const CAMPO = 'h-[var(--campo-altura)] text-[length:var(--campo-fonte)]'

/** Rótulo de campo, em cima dele (o mesmo dos formulários do sistema). */
export const ROTULO = 'text-[length:var(--rotulo-fonte)] font-medium text-muted-foreground'

/** O corpo da gaveta: as seções numa coluna. */
export const CORPO_DA_GAVETA = 'flex flex-col gap-2.5 px-4 py-4'

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

/* ── Resumo (linha do cabeçalho) ── */

export function ResumoForte({ children }: { children: ReactNode }): JSX.Element {
  return <b className="font-semibold text-foreground">{children}</b>
}
/** O que ainda falta, dito DENTRO da frase: quem lê o resumo vê o buraco no lugar dele. */
export function ResumoFalta({ children }: { children: ReactNode }): JSX.Element {
  return <span className="font-semibold text-amber-800 dark:text-amber-300">{children}</span>
}

/** A frase pronta (`lib/editor-bizagi/resumos`), trecho a trecho. */
export function FraseDoResumo({ trechos }: { trechos: ReadonlyArray<Trecho> }): JSX.Element {
  return (
    <>
      {trechos.map((r, i) => (r.falta ? <ResumoFalta key={i}>{r.t}</ResumoFalta> : r.forte ? <ResumoForte key={i}>{r.t}</ResumoForte> : <span key={i}>{r.t}</span>))}
    </>
  )
}

/* ── Seções ── */

/** Selo "Falta" do cabeçalho de uma seção incompleta. */
export function SeloFalta(): JSX.Element {
  return <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">Falta</span>
}

/** Uma SEÇÃO em sanfona (o nome `Pergunta` ficou do padrão anterior): ícone, título curto e,
 *  à direita, o valor atual (fechada) e ✓ ou "Falta". `ajuda` é a primeira linha do conteúdo.
 *  O id `pergunta-<id>` continua sendo o alvo de "abrir a gaveta já nesta seção". */
export function Pergunta({ id, titulo, ajuda, ok, icone, valor, abertaInicial = true, children }: {
  id: string; titulo: string; ajuda?: string; ok: boolean; children: ReactNode
  icone?: ReactNode
  /** o que está escolhido, mostrado no cabeçalho com a seção fechada */
  valor?: ReactNode
  abertaInicial?: boolean
}): JSX.Element {
  const [aberta, setAberta] = useState(abertaInicial)
  const idConteudo = useId()
  return (
    <section id={`pergunta-${id}`} aria-labelledby={`pergunta-${id}-titulo`} className="shrink-0 scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
      <button type="button" aria-expanded={aberta} aria-controls={idConteudo} onClick={() => setAberta((v) => !v)}
        className={cn('flex w-full items-center gap-2 bg-muted/30 px-3.5 py-2 text-left transition-colors hover:bg-muted/50', aberta && 'border-b')}>
        {icone && <span className="flex shrink-0 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>{icone}</span>}
        <h3 id={`pergunta-${id}-titulo`} className="shrink-0 text-xs font-semibold">{titulo}</h3>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">{!aberta && ok ? valor : null}</span>
        {ok ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Preenchida" /> : <SeloFalta />}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200', aberta && 'rotate-180')} aria-hidden />
      </button>
      {aberta && (
        <div id={idConteudo} className="flex flex-col gap-[var(--form-gap)] p-[var(--secao-pad)]">
          {ajuda && <p className="text-[11.5px] leading-snug text-muted-foreground">{ajuda}</p>}
          {children}
        </div>
      )}
    </section>
  )
}

/** Escolha entre poucas opções, em LISTA (o padrão dos cadastros), com o rótulo em cima e,
 *  embaixo, a explicação da opção escolhida — a consequência continua à vista sem um
 *  cartão por opção. */
export function CampoEscolha<T extends string>({ rotulo, valor, opcoes, onMudar, ajuda, className, placeholder }: {
  rotulo: string; valor: T | undefined
  opcoes: ReadonlyArray<{ v: T; titulo: string; descricao?: string; disabled?: boolean }>
  onMudar: (v: T) => void
  /** ajuda fixa; sem ela, aparece a `descricao` da opção escolhida */
  ajuda?: ReactNode
  className?: string
  placeholder?: string
}): JSX.Element {
  const id = useId()
  const escolhida = opcoes.find((o) => o.v === valor)
  const linha = ajuda ?? escolhida?.descricao
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className={ROTULO}>{rotulo}</label>
      <Select value={valor ?? ''} onValueChange={(v) => onMudar(v as T)}>
        <SelectTrigger id={id} className={CAMPO}><SelectValue placeholder={placeholder ?? 'Escolha'} /></SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => <SelectItem key={o.v} value={o.v} disabled={o.disabled}>{o.titulo}</SelectItem>)}
        </SelectContent>
      </Select>
      {linha && <p className="text-[11px] leading-snug text-muted-foreground">{linha}</p>}
    </div>
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

/** "prazo", "prazo e devolução", "nome, prazo e devolução" */
const listaComE = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

/** O que falta + Remover (opcional, à esquerda) + Cancelar / Aplicar, numa linha. As mudanças
 *  valem no desenho na hora e vão para o workflow ao Salvar rascunho ou Ativar (o topo do
 *  editor mostra "Não salvo"). */
export function RodapePadrao({ pendentes, faltam, remover, onCancelar, onAplicar }: {
  /** seções incompletas (0 = nada falta) */
  pendentes: number
  /** o nome do que falta ("prazo"); sem ele, o rodapé diz só quantos itens faltam */
  faltam?: string[]
  remover?: { rotulo: string; aoRemover: () => void; nomeAcessivel?: string }
  onCancelar: () => void
  onAplicar: () => void
}): JSX.Element {
  const texto = pendentes <= 0 ? ''
    : faltam?.length ? `Falta: ${listaComE(faltam)}`
      : pendentes > 1 ? `Faltam ${pendentes} itens` : 'Falta 1 item'
  return (
    <div className="flex items-center gap-2">
      {remover && (
        <Button variant="ghost" size="sm" onClick={remover.aoRemover} aria-label={remover.nomeAcessivel ?? remover.rotulo}
          className="-ml-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />{remover.rotulo}
        </Button>
      )}
      <p className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-semibold leading-tight text-amber-800 dark:text-amber-300" aria-live="polite" title={texto || undefined}>
        {texto}
      </p>
      <Button variant="outline" size="sm" onClick={onCancelar}>Cancelar</Button>
      <Button size="sm" onClick={onAplicar}>Aplicar</Button>
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

/** Conta as seções incompletas enquanto a gaveta monta: `ok(false)` soma uma. */
export function contadorDePendencias(): { ok: (v: boolean) => boolean; total: () => number } {
  let faltam = 0
  return { ok: (v) => { if (!v) faltam++; return v }, total: () => faltam }
}
