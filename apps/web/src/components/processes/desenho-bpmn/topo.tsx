'use client'

/* ─── Peças do topo do editor (desenho BPMN) ───────────────────────────────────
   O topo é UMA linha (spec "Topo"): voltar · nome · Sobre · Quem inicia · saúde ·
   desfazer/refazer · Organizar · ⋯ · Salvar rascunho · Ativar. O nome, o tipo e a
   descrição que moravam no cabeçalho do documento (WorkflowIdentity) vieram para cá —
   o desenho ganhou a altura inteira.
   ⚠️ O nome continua sendo o que mais pede atenção: sem ele a API recusa salvar e ativar.
   Vazio, o campo mostra a ordem ("Dê um nome…") e fundo âmbar tracejado. */
import { useEffect, useRef, useState, type JSX } from 'react'
import { ChevronDown, Download, FileImage, FileText, History, Loader2, MoreHorizontal, Rows3 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { FloatingMenu } from '@/components/ui/floating-menu'
import type { FlowExportFormat } from '@/lib/flow-export'
import { cn } from '@/lib/utils'
import { WorkflowKindIcon } from '../workflow-kind-icon'

export interface TipoDeWorkflow { value: string; label: string }

/** Nome do workflow, editável no próprio topo. A largura acompanha o texto (com teto). */
export function NomeNoTopo({ nome, onNome, autoFocus }: { nome: string; onNome: (v: string) => void; autoFocus?: boolean }): JSX.Element {
  const vazio = !nome.trim()
  return (
    // eslint-disable-next-line jsx-a11y/no-autofocus -- workflow novo: dar o nome é a primeira coisa a fazer
    <input value={nome} onChange={(e) => onNome(e.target.value)} autoFocus={autoFocus}
      aria-label="Nome do workflow" placeholder="Dê um nome a este workflow" title={nome.trim() || undefined}
      size={Math.min(48, Math.max(18, nome.length + 2))}
      /* o nome é o que mais importa no topo: nunca fica abaixo de 200px (os chips encolhem antes) */
      className={cn('h-8 min-w-[200px] shrink text-ellipsis rounded-md border bg-transparent px-2 text-[15px] font-extrabold tracking-tight outline-none transition-colors',
        'placeholder:font-bold placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40',
        vazio ? 'border-dashed border-amber-400/70 bg-amber-500/5' : 'border-transparent')} />
  )
}

/** "Sobre": tipo, descrição e o tamanho do fluxo, num balão ancorado no botão. */
export function SobreDoWorkflow({ descricao, onDescricao, tipo, onTipo, tipos, resumo }: {
  descricao: string; onDescricao: (v: string) => void
  tipo: string; onTipo: (v: string) => void
  tipos: readonly TipoDeWorkflow[]
  /** "14 atividades · 3 escolhas" */
  resumo: string
}): JSX.Element {
  const botao = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const rotuloTipo = tipos.find((k) => k.value === tipo)?.label
  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="dialog" aria-expanded={aberto}
        title={`Tipo e descrição do workflow${rotuloTipo ? ` · tipo: ${rotuloTipo}` : ' · sem tipo'}`}
        className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors',
          /* sem tipo, PEDE (tracejado âmbar); com tipo, AFIRMA (sólido, com o glifo) */
          tipo ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
            : 'border-dashed border-amber-400/70 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400')}>
        <WorkflowKindIcon kind={tipo || undefined} className="h-3.5 w-3.5" />
        Sobre<span className="max-[1439px]:hidden">{rotuloTipo ? ` · ${rotuloTipo}` : ' · sem tipo'}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} role="dialog" aria-label="Sobre este workflow"
          className="w-[380px] max-w-[calc(100vw-32px)] space-y-3 rounded-xl border bg-card p-3 text-card-foreground shadow-xl">
          <div>
            <p className="mb-1 text-xs font-semibold">Tipo</p>
            <Select value={tipo || 'none'} onValueChange={(v) => onTipo(v === 'none' ? '' : v)}>
              <SelectTrigger aria-label="Tipo do workflow" className="h-8 text-xs">
                <span className="flex items-center gap-2">
                  <WorkflowKindIcon kind={tipo || undefined} className="h-4 w-4" />
                  {rotuloTipo ?? '— sem tipo (só no Dashboard)'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-2 text-muted-foreground"><WorkflowKindIcon className="h-4 w-4" />— sem tipo (só no Dashboard)</span>
                </SelectItem>
                {tipos.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    <span className="flex items-center gap-2"><WorkflowKindIcon kind={k.value} className="h-4 w-4" />{k.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">O tipo determina onde ele aparece em “Novo processo”.</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Descrição</p>
            <textarea value={descricao} onChange={(e) => onDescricao(e.target.value)} rows={3} aria-label="Descrição do workflow"
              placeholder="Descreva o objetivo — para quem for gerenciá-lo depois."
              className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
          </div>
          <p className="border-t pt-2 text-[11px] text-muted-foreground">{resumo}</p>
        </FloatingMenu>
      )}
    </>
  )
}

/** ⋯ do topo: Histórico, Exportar (JPG/PDF) e "Ver por raia". */
export function MenuMais({ onHistorico, onExportar, exportando, exportarDesabilitado, onVerPorRaia, verPorRaiaDesabilitado }: {
  /** ausente em workflow novo (ainda sem histórico) */
  onHistorico?: () => void
  onExportar: (f: FlowExportFormat) => void
  exportando: FlowExportFormat | null
  exportarDesabilitado?: boolean
  onVerPorRaia: () => void
  verPorRaiaDesabilitado?: boolean
}): JSX.Element {
  const botao = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  // exportando: o menu some (a captura não pode pegar o balão)
  useEffect(() => { if (exportando) setAberto(false) }, [exportando])
  const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40'
  const escolher = (fn: () => void) => () => { setAberto(false); fn() }
  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="menu" aria-expanded={aberto}
        aria-label="Mais ações" title="Mais ações: histórico, exportar, ver por raia"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
        {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} align="end" role="menu" aria-label="Mais ações"
          className="w-56 rounded-xl border bg-card p-1 text-card-foreground shadow-xl">
          {onHistorico && (
            <button type="button" role="menuitem" className={item} onClick={escolher(onHistorico)} data-autofocus>
              <History className="h-4 w-4 text-muted-foreground" />Histórico
            </button>
          )}
          <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Download className="h-3 w-3" />Exportar
          </p>
          <button type="button" role="menuitem" className={item} disabled={exportarDesabilitado} onClick={escolher(() => onExportar('jpg'))}
            {...(onHistorico ? {} : { 'data-autofocus': true })}>
            <FileImage className="h-4 w-4 text-sky-600 dark:text-sky-400" />Imagem (JPG)
          </button>
          <button type="button" role="menuitem" className={item} disabled={exportarDesabilitado} onClick={escolher(() => onExportar('pdf'))}>
            <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />Documento (PDF)
          </button>
          <span aria-hidden className="mx-1 my-1 block h-px bg-border" />
          <button type="button" role="menuitem" className={item} disabled={verPorRaiaDesabilitado} onClick={escolher(onVerPorRaia)}>
            <Rows3 className="h-4 w-4 text-muted-foreground" />Ver por raia
          </button>
        </FloatingMenu>
      )}
    </>
  )
}
