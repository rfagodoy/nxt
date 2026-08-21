'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Falha de CARREGAMENTO ≠ lista vazia. Mostrar "Nenhum contrato cadastrado" quando a
 * API caiu faz o sistema mentir — num sistema de registro, "0" é uma afirmação forte.
 * (Achado da auditoria de 2026-08-21: toda listagem fazia `catch {} → []`.)
 */

const MSG = 'Não foi possível carregar os dados.'

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 dark:border-red-900 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-500/10 transition-colors">
      <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
    </button>
  )
}

/** Linha de erro para TABELAS (ocupa o lugar do "Nenhum registro"). */
export function LoadErrorRow({ colSpan, onRetry }: { colSpan: number; onRetry: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {MSG}
          </span>
          <Retry onRetry={onRetry} />
        </div>
      </td>
    </tr>
  )
}

/** Bloco de erro para telas de CARTÕES (Tarefas) — no lugar do empty state. */
export function LoadErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500/70" />
      <div>
        <p className="text-sm font-semibold">{MSG}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Suas tarefas continuam lá — é a consulta que falhou.</p>
      </div>
      <Retry onRetry={onRetry} />
    </div>
  )
}
