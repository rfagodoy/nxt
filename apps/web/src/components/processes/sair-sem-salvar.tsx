'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/ui/confirm-dialog'

/** Sair do editor de um workflow ATIVO com alterações não salvas: ele não grava sozinho
 *  (ver `aoSairDoEditor`), então a pessoa escolhe. Salvar devolve o workflow a rascunho —
 *  o texto diz isso antes, para a escolha ser consciente. */
export function SairSemSalvarDialog({ open, voltaARascunho = true, onSalvar, onDescartar, onContinuar }: {
  open: boolean
  /** a alteração mexe na lógica do fluxo (salvar devolve a rascunho); só desenho, não */
  voltaARascunho?: boolean
  /** grava e segue; se lançar, o dialog fecha e quem chamou mostra o motivo */
  onSalvar: () => Promise<void>
  onDescartar: () => void
  onContinuar: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (open) setSalvando(false) }, [open])
  if (!open) return null

  const salvar = async () => {
    setSalvando(true)
    try { await onSalvar() } finally { setSalvando(false) }
  }

  return (
    <Shell onScrim={() => !salvando && onContinuar()}>
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Sair sem salvar?</h2>
        </div>
        <button onClick={() => !salvando && onContinuar()} className="text-muted-foreground hover:text-foreground transition-colors" title="Continuar editando">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-4 text-xs text-muted-foreground [&_b]:text-foreground space-y-2">
        <p>Este workflow está <b>ativo</b> e tem alterações que ainda não foram salvas.</p>
        {voltaARascunho
          ? <p><b>Salvar rascunho</b> grava as alterações e o workflow volta a rascunho: ele deixa de iniciar novos processos até ser ativado de novo. <b>Descartar</b> sai e mantém o workflow como está.</p>
          : <p>As alterações são só no desenho. <b>Salvar</b> grava e o workflow continua ativo. <b>Descartar</b> sai e mantém o desenho como estava.</p>}
      </div>
      <div className="shrink-0 flex flex-wrap justify-end gap-2 px-4 pb-4">
        <Button variant="ghost" size="sm" disabled={salvando} onClick={onDescartar} className="text-destructive hover:text-destructive">Descartar</Button>
        <Button variant="outline" size="sm" disabled={salvando} onClick={onContinuar}>Continuar editando</Button>
        <Button size="sm" disabled={salvando} onClick={() => void salvar()}>
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}{voltaARascunho ? 'Salvar rascunho' : 'Salvar'}
        </Button>
      </div>
    </Shell>
  )
}
