'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/* ─── Cabeçalho da atividade ──────────────────────────────────────────────────
   O padrão ÚNICO de identidade de uma tarefa em execução, dentro do `TaskDocView` —
   hoje o único executor de atividade. Nasceu quando havia dois (a caixa de Tarefas e o
   runner do "Novo processo"), cada um com sua própria versão deste bloco e nenhuma
   igual à outra. O runner foi aposentado; o componente fica, porque a identidade da
   atividade continua sendo uma decisão só.

   A separação das camadas é por TIPOGRAFIA, não por caixas coloridas (decisão do PO,
   01/09/2026 — "opção 1"):

     1. o PROCESSO   sobrelinha pequena, em versalete, com o nome do workflow
     2. a ATIVIDADE  o título, o maior peso do bloco
     3. o COMO FAZER texto corrido logo abaixo, sem moldura e sem ícone
     4. os CAMPOS    começam depois da borda, já fora deste cabeçalho

   ⚠️ A instrucao NAO usa mais caixa colorida. Antes ela era um retangulo verde com
   icone, visualmente identico ao aviso de bloqueio logo abaixo — duas coisas de
   naturezas opostas (uma orienta, a outra impede) com o mesmo peso. Agora a COR
   nesta tela significa uma coisa so: alguma coisa te impede de concluir. Nao voltar
   a colorir a instrucao. */

/** Acima de ~2 linhas o texto vira "ver mais". Estimado por comprimento, sem medir o
 *  DOM — determinístico e testável, no mesmo espírito do auto-layout do editor. */
const LIMITE_CURTO = 150

export function ActivityHeader({
  icone, processo, processoHref, numero, papel, titulo, instrucoes, direita, className,
}: {
  /** Marca visual da atividade (ícone já estilizado pelo chamador). */
  icone?: React.ReactNode
  /** Nome do workflow — a camada 1. */
  processo?: string | null
  /** Link para o processo; sem ele o nome vira texto simples. */
  processoHref?: string
  /** Nº do processo (protocolo), quando existe. */
  numero?: number | null
  /** Papel de quem executa, quando o desenho define um. Vive na sobrelinha porque é
   *  contexto ("quem faz"), não instrução — e assim não disputa espaço com o título. */
  papel?: string | null
  /** Nome da atividade — a camada 2. */
  titulo: string
  /** Orientação de quem desenhou o workflow — a camada 3. */
  instrucoes?: string | null
  /** Canto direito do cabeçalho (prazo, normalmente). */
  direita?: React.ReactNode
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const texto = instrucoes?.trim() || ''
  const longo = texto.length > LIMITE_CURTO

  return (
    <div className={cn('flex items-start gap-3 px-1 py-3 border-b shrink-0', className)}>
      {icone}
      <div className="flex-1 min-w-0">
        {(processo || numero != null || papel) && (
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-primary/90 mb-1">
            {processo && (
              processoHref
                ? <Link href={processoHref} className="truncate hover:underline underline-offset-2">{processo}</Link>
                : <span className="truncate">{processo}</span>
            )}
            {processo && numero != null && <span aria-hidden className="text-primary/40">·</span>}
            {numero != null && <span className="font-mono shrink-0">#{numero}</span>}
            {papel && <span aria-hidden className="text-primary/40">·</span>}
            {papel && <span className="truncate font-normal text-muted-foreground normal-case tracking-normal">{papel}</span>}
          </p>
        )}

        <h2 className="text-base font-semibold tracking-tight leading-snug">{titulo}</h2>

        {texto && (
          <div className="mt-1.5">
            <p className={cn(
              'text-xs leading-relaxed text-muted-foreground whitespace-pre-line',
              longo && !aberto && 'line-clamp-2',
            )}>
              {texto}
            </p>
            {/* Instrução longa não pode empurrar os campos para fora da tela: o texto
                nasce cortado em duas linhas e a pessoa decide se quer o resto. */}
            {longo && (
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
                className="mt-0.5 text-[11px] font-medium text-primary hover:underline underline-offset-2"
              >
                {aberto ? 'ver menos' : 'ver mais'}
              </button>
            )}
          </div>
        )}
      </div>
      {direita}
    </div>
  )
}
