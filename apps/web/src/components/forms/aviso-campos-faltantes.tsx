'use client'

import { AlertCircle } from 'lucide-react'
import { agruparPorSecao, type AcaoSalvar, type CampoFaltante } from '@/lib/campos-obrigatorios'

/** Aviso ÚNICO de "o que falta preencher", usado por todo formulário que salva/ativa.
 *  Diz QUAIS campos, agrupados pela seção onde moram; o nome da seção leva até ela.
 *  Não depende de cor: tem ícone, o verbo da ação e a lista escrita. */
export function AvisoCamposFaltantes({ itens, acao, rotuloSecao, onIrParaSecao }: {
  itens: CampoFaltante[]
  acao: AcaoSalvar
  rotuloSecao: (key: string) => string
  onIrParaSecao?: (key: string) => void
}) {
  if (itens.length === 0) return null
  const grupos = agruparPorSecao(itens, rotuloSecao)
  const total  = grupos.reduce((n, g) => n + g.campos.length, 0)
  const verbo  = acao === 'ativar' ? 'ativar' : 'salvar o rascunho'
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Para {verbo}, falta preencher {total === 1 ? '1 campo obrigatório' : `${total} campos obrigatórios`}:
      </p>
      <ul className="mt-1 space-y-0.5 pl-5">
        {grupos.map(g => (
          <li key={g.secao} className="list-disc">
            {onIrParaSecao
              ? <button type="button" onClick={() => onIrParaSecao(g.secao)} className="font-semibold underline underline-offset-2 hover:no-underline">{g.rotulo}</button>
              : <span className="font-semibold">{g.rotulo}</span>}
            : {g.campos.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
