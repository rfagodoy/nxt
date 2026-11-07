'use client'

/* ─── Peças do topo do editor (desenho BPMN) ───────────────────────────────────
   O topo é UMA linha (spec "Topo"): voltar · nome · Sobre · Quem inicia · saúde ·
   desfazer/refazer · controles do desenho · Organizar · ⋯ · Salvar rascunho · Ativar. O nome, o tipo e a
   descrição que moravam no cabeçalho do documento (WorkflowIdentity) vieram para cá —
   o desenho ganhou a altura inteira.
   ⚠️ O nome continua sendo o que mais pede atenção: sem ele a API recusa salvar e ativar.
   Vazio, o campo mostra a ordem ("Dê um nome…") e fundo âmbar tracejado. */
import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical,
  AlignVerticalDistributeCenter, ChevronDown, Columns3, Download, FileImage, FileText, Grid3x3, History, Loader2,
  MoreHorizontal, Rows3,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { FloatingMenu } from '@/components/ui/floating-menu'
import type { FlowExportFormat } from '@/lib/flow-export'
import { cn } from '@/lib/utils'
import type { ModoAlinhar, Orientacao } from '@/lib/editor-bizagi/geometria'
import { WorkflowKindIcon } from '../workflow-kind-icon'

export interface TipoDeWorkflow { value: string; label: string }

/* ─── Prioridade pela largura DISPONÍVEL ──────────────────────────────────────
   O topo nunca transborda nem quebra linha: quando o que está nele não cabe na largura
   do próprio topo (que muda com a barra lateral do app, não só com a janela), ele sobe um
   NÍVEL de compactação e mede de novo, até caber. A ordem é a do PO: o que mais importa
   (voltar, nome, Ativar, Salvar, ⋯, desfazer) é o último a encolher.
     1 Organizar só com o ícone      5 "Salvar rascunho" vira "Salvar"; "Não salvo" só o ponto
     2 Quem inicia só com o ícone    6 Organizar e Quem inicia vão para o ⋯
     3 saúde só com ícone + número   7 "Ativar workflow" vira "Ativar" e o nome encolhe (até 200px)
     4 Sobre só com o ícone
   Mudou a largura ou a `chave`? Recomeça do nível 0 e sobe de novo — tudo em layout
   effect, antes de pintar, então não pisca. Com um balão do topo aberto, o nível congela. */
export const NIVEL_MAXIMO_DO_TOPO = 7

/** Nível de compactação do topo. Itens que ocupam o espaço que sobra levam `data-topo-espaco`
 *  (não contam na medida). Os demais não podem encolher (`shrink-0`) — senão a medida mente. */
export function useNivelDoTopo(topo: RefObject<HTMLElement | null>, chave: string, congelado = false): number {
  const [largura, setLargura] = useState(0)
  const [nivel, setNivel] = useState(0)
  const visto = useRef<string | null>(null)
  useEffect(() => {
    const el = topo.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setLargura(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [topo])
  const atual = `${largura}|${chave}`
  /* Roda a cada render (sem lista de dependências) de propósito: o conteúdo pode crescer sem
     mudar a chave (o texto de "Quem inicia", a lista de papéis que chega) e aí só SOBE de
     nível. Descer (recomeçar do 0) só quando a largura ou a chave mudam. Com um balão do topo
     aberto (Quem inicia, Sobre, ⋯) nada muda: mexer no nível desmontaria/realocaria o balão. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sem lista de propósito (ver acima); só sobe até NIVEL_MAXIMO_DO_TOPO
  useLayoutEffect(() => {
    const el = topo.current
    if (!el || congelado) return
    if (visto.current !== atual) {
      visto.current = atual
      if (nivel !== 0) { setNivel(0); return }
    }
    if (nivel >= NIVEL_MAXIMO_DO_TOPO) return
    const estilo = getComputedStyle(el)
    const vao = parseFloat(estilo.columnGap) || 0
    const filhos = Array.from(el.children) as HTMLElement[]
    const visiveis = filhos.filter((f) => f.offsetWidth > 0 || f.hasAttribute('data-topo-espaco'))
    const ocupado = visiveis.filter((f) => !f.hasAttribute('data-topo-espaco')).reduce((s, f) => s + f.offsetWidth, 0)
      + vao * Math.max(0, visiveis.length - 1)
    const disponivel = el.clientWidth - (parseFloat(estilo.paddingLeft) || 0) - (parseFloat(estilo.paddingRight) || 0)
    if (ocupado > disponivel + 0.5) setNivel(nivel + 1)
  })
  return nivel
}

/** Largura do campo do nome em caracteres, de 4 em 4: o topo só se remede quando ela muda
 *  (a chave de `useNivelDoTopo` usa o mesmo valor), não a cada letra digitada. */
export const tamanhoDoNome = (nome: string) => Math.min(48, Math.max(18, Math.ceil((nome.length + 2) / 4) * 4))

/** Nome do workflow, editável no próprio topo. A largura acompanha o texto (com teto). */
export function NomeNoTopo({ nome, onNome, autoFocus, podeEncolher }: {
  nome: string; onNome: (v: string) => void; autoFocus?: boolean
  /** Último recurso do topo: o nome encolhe até 200px, com reticências. Antes disso, não. */
  podeEncolher?: boolean
}): JSX.Element {
  const vazio = !nome.trim()
  return (
    // eslint-disable-next-line jsx-a11y/no-autofocus -- workflow novo: dar o nome é a primeira coisa a fazer
    <input value={nome} onChange={(e) => onNome(e.target.value)} autoFocus={autoFocus}
      aria-label="Nome do workflow" placeholder="Dê um nome a este workflow" title={nome.trim() || undefined}
      size={tamanhoDoNome(nome)}
      /* o nome é o que mais importa no topo: nunca fica abaixo de 200px (os chips encolhem antes) */
      className={cn('h-8 min-w-[200px] text-ellipsis rounded-md', podeEncolher ? 'shrink' : 'shrink-0', ' border bg-transparent px-2 text-[15px] font-extrabold tracking-tight outline-none transition-colors',
        'placeholder:font-bold placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40',
        vazio ? 'border-dashed border-amber-400/70 bg-amber-500/5' : 'border-transparent')} />
  )
}

/** "Sobre": tipo, descrição e o tamanho do fluxo, num balão ancorado no botão. */
export function SobreDoWorkflow({ descricao, onDescricao, tipo, onTipo, tipos, resumo, soIcone, aberto: abertoProp, onAberto }: {
  descricao: string; onDescricao: (v: string) => void
  tipo: string; onTipo: (v: string) => void
  tipos: readonly TipoDeWorkflow[]
  /** "14 atividades · 3 escolhas" */
  resumo: string
  /** Topo apertado: só o glifo do tipo (o resto vai no title e no nome acessível). */
  soIcone?: boolean
  /** Controlado pela página (o topo congela a compactação enquanto o balão está aberto). */
  aberto?: boolean
  onAberto?: (v: boolean) => void
}): JSX.Element {
  const botao = useRef<HTMLButtonElement>(null)
  const [abertoLocal, setAbertoLocal] = useState(false)
  const aberto = abertoProp ?? abertoLocal
  const setAberto = (v: boolean | ((x: boolean) => boolean)) => {
    const novo = typeof v === 'function' ? v(aberto) : v
    if (abertoProp !== undefined) onAberto?.(novo); else setAbertoLocal(novo)
  }
  /* Todo workflow tem tipo (PO, 07/11/2026): não existe mais o estado "sem tipo". */
  const rotuloTipo = tipos.find((k) => k.value === tipo)?.label ?? tipos[0]?.label
  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="dialog" aria-expanded={aberto}
        title={`Sobre: tipo e descrição do workflow · tipo: ${rotuloTipo}`}
        aria-label={soIcone ? `Sobre o workflow · ${rotuloTipo}` : undefined}
        className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border text-xs', soIcone ? 'px-2' : 'px-3', ' font-semibold transition-colors',
          'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15')}>
        <WorkflowKindIcon kind={tipo || undefined} className="h-3.5 w-3.5" />
        {!soIcone && <>Sobre · {rotuloTipo}<ChevronDown className="h-3 w-3 opacity-60" /></>}
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} role="dialog" aria-label="Sobre este workflow"
          className="w-[380px] max-w-[calc(100vw-32px)] space-y-3 rounded-xl border bg-card p-3 text-card-foreground shadow-xl">
          <div>
            <p className="mb-1 text-xs font-semibold">Tipo</p>
            <Select value={tipo} onValueChange={onTipo}>
              <SelectTrigger aria-label="Tipo do workflow" className="h-8 text-xs">
                <span className="flex items-center gap-2">
                  <WorkflowKindIcon kind={tipo || undefined} className="h-4 w-4" />
                  {rotuloTipo}
                </span>
              </SelectTrigger>
              <SelectContent>
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

/** ⋯ do topo: Histórico e Exportar (JPG/PDF do desenho). */
export function MenuMais({ onHistorico, onExportar, exportando, exportarDesabilitado, extras, botaoRef, aberto: abertoProp, onAberto, antesDeAlternar }: {
  /** ausente em workflow novo (ainda sem histórico) */
  onHistorico?: () => void
  onExportar: (f: FlowExportFormat) => void
  exportando: FlowExportFormat | null
  exportarDesabilitado?: boolean
  /** Ações que saíram do topo por falta de espaço (Organizar, Quem inicia): no alto do menu. */
  extras?: Array<{ rotulo: string; icone: ReactNode; onClick: () => void; disabled?: boolean }>
  /** O botão ⋯ — quem abre um balão a partir de um item do menu ancora nele. */
  botaoRef?: RefObject<HTMLButtonElement | null>
  /** Controlado pela página (o topo congela a compactação enquanto o menu está aberto). */
  aberto?: boolean
  onAberto?: (v: boolean) => void
  /** Clique no ⋯: devolve true para ficar só nisso (ex.: fechar o balão ancorado no ⋯). */
  antesDeAlternar?: () => boolean
}): JSX.Element {
  const proprio = useRef<HTMLButtonElement>(null)
  const botao = botaoRef ?? proprio
  const [abertoLocal, setAbertoLocal] = useState(false)
  const aberto = abertoProp ?? abertoLocal
  const setAberto = (v: boolean | ((x: boolean) => boolean)) => {
    const novo = typeof v === 'function' ? v(aberto) : v
    if (abertoProp !== undefined) onAberto?.(novo); else setAbertoLocal(novo)
  }
  // exportando: o menu some (a captura não pode pegar o balão)
  useEffect(() => { if (exportando) setAberto(false) }, [exportando]) // eslint-disable-line react-hooks/exhaustive-deps -- só a mudança de `exportando` fecha
  const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40'
  const escolher = (fn: () => void) => () => { setAberto(false); fn() }
  return (
    <>
      <button ref={botao} type="button" onClick={() => { if (antesDeAlternar?.()) return; setAberto((v) => !v) }} aria-haspopup="menu" aria-expanded={aberto}
        aria-label="Mais ações" title="Mais ações: histórico, exportar"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
        {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} align="end" role="menu" aria-label="Mais ações"
          className="w-56 rounded-xl border bg-card p-1 text-card-foreground shadow-xl">
          {extras?.map((x, i) => (
            <button key={x.rotulo} type="button" role="menuitem" className={item} disabled={x.disabled} onClick={escolher(x.onClick)}
              {...(i === 0 ? { 'data-autofocus': true } : {})}>
              {x.icone}{x.rotulo}
            </button>
          ))}
          {!!extras?.length && <span aria-hidden className="mx-1 my-1 block h-px bg-border" />}
          {onHistorico && (
            <button type="button" role="menuitem" className={item} onClick={escolher(onHistorico)} {...(extras?.length ? {} : { 'data-autofocus': true })}>
              <History className="h-4 w-4 text-muted-foreground" />Histórico
            </button>
          )}
          <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Download className="h-3 w-3" />Exportar
          </p>
          <button type="button" role="menuitem" className={item} disabled={exportarDesabilitado} onClick={escolher(() => onExportar('jpg'))}
            {...(onHistorico || extras?.length ? {} : { 'data-autofocus': true })}>
            <FileImage className="h-4 w-4 text-sky-600 dark:text-sky-400" />Imagem (JPG)
          </button>
          <button type="button" role="menuitem" className={item} disabled={exportarDesabilitado} onClick={escolher(() => onExportar('pdf'))}>
            <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />Documento (PDF)
          </button>
        </FloatingMenu>
      )}
    </>
  )
}

const BOTAO_DO_DESENHO = 'inline-flex h-7 items-center justify-center gap-1.5 rounded px-2 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

const ALINHAR: ReadonlyArray<{ modo: ModoAlinhar; rotulo: string; Icone: typeof AlignStartVertical }> = [
  { modo: 'esquerda', rotulo: 'Alinhar pela esquerda', Icone: AlignStartVertical },
  { modo: 'centroX', rotulo: 'Centralizar na vertical', Icone: AlignCenterVertical },
  { modo: 'topo', rotulo: 'Alinhar pelo topo', Icone: AlignStartHorizontal },
  { modo: 'centroY', rotulo: 'Centralizar na horizontal', Icone: AlignCenterHorizontal },
  { modo: 'distribuirX', rotulo: 'Distribuir na horizontal', Icone: AlignHorizontalDistributeCenter },
  { modo: 'distribuirY', rotulo: 'Distribuir na vertical', Icone: AlignVerticalDistributeCenter },
]

/** Controles do desenho no topo: orientação (Horizontal | Vertical), grade e — com 2+ formas
 *  no laço — os 6 botões de alinhar (como se vê na tela, nas duas orientações). */
export function ControlesDoDesenho({ orientacao, onOrientacao, grade, onGrade, selecionadas, onAlinhar, soIcone }: {
  orientacao: Orientacao; onOrientacao: (o: Orientacao) => void
  grade: boolean; onGrade: (v: boolean) => void
  /** Quantas formas estão selecionadas (o laço). */
  selecionadas: number
  onAlinhar: (m: ModoAlinhar) => void
  /** Topo apertado: só os ícones. */
  soIcone?: boolean
}): JSX.Element {
  const opcoes = [
    { o: 'horizontal' as const, rotulo: 'Horizontal', titulo: 'Raias na horizontal', Icone: Rows3 },
    { o: 'vertical' as const, rotulo: 'Vertical', titulo: 'Raias na vertical', Icone: Columns3 },
  ]
  return (
    <>
      <div role="radiogroup" aria-label="Orientação do desenho" className="flex shrink-0 items-center rounded-md border bg-muted/40 p-0.5">
        {opcoes.map(({ o, rotulo, titulo, Icone }) => {
          const ativo = orientacao === o
          return (
            <button key={o} type="button" role="radio" aria-checked={ativo} onClick={() => { if (!ativo) onOrientacao(o) }}
              title={titulo} aria-label={rotulo}
              className={cn(BOTAO_DO_DESENHO, ativo ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <Icone className="h-3.5 w-3.5" />{!soIcone && rotulo}
            </button>
          )
        })}
      </div>
      <button type="button" aria-pressed={grade} onClick={() => onGrade(!grade)} title="Mostrar a grade e encaixar nela" aria-label="Grade"
        className={cn(BOTAO_DO_DESENHO, 'h-8 shrink-0 rounded-md border shadow-sm', grade ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-muted-foreground hover:text-foreground')}>
        <Grid3x3 className="h-4 w-4" />{!soIcone && 'Grade'}
      </button>
      {selecionadas >= 2 && (
        <div role="group" aria-label={`Alinhar ${selecionadas} formas`} className="flex shrink-0 items-center rounded-md border bg-card p-0.5 shadow-sm">
          {ALINHAR.map(({ modo, rotulo, Icone }) => (
            <button key={modo} type="button" onClick={() => onAlinhar(modo)} title={rotulo} aria-label={rotulo}
              className={cn(BOTAO_DO_DESENHO, 'w-7 px-0 text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <Icone className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </>
  )
}
