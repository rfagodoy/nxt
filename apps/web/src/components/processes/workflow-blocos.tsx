'use client'

/* ─── Blocos do fluxo: criação e configuração ──────────────────────────────────
 *
 * O fluxo em blocos (@nxt/workflow-core/blocos) é a fonte da autoria: o desenho BPMN é
 * uma projeção dele. Aqui ficam a criação de itens novos (`novoItem`), os nomes das
 * atividades para gravar (`comNomes`) e a configuração de uma escolha / "ao mesmo tempo"
 * que a gaveta lateral do desenho mostra (`ConfiguracaoDoBloco`). O trilho "Montar"
 * que morava aqui saiu com o desenho BPMN (27/10/2026).
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CornerDownRight, Info, Play, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import {
  acharItem, adicionarCaminho, atualizarCaminho, atualizarItem, destinosDeVolta, modoDaEscolha, moverCaminho, removerCaminho, senaoParaCaminho, temSenaoAntigo,
  type BlocoEscolha, type ModoEscolha, type BlocoParalelo, type CaminhoCondicional, type FimCaminho, type FluxoBlocos,
  type ItemAtividade, type ItemFluxo, type ProblemaAtivacao,
} from '@nxt/workflow-core'
import type { EdgeConditionSpec, StepFormSchema } from '@nxt/types'
import { camposDasTelasDasAtividades, decidirSaidas, montarVarsSimulacao, type CampoDisponivel } from '@/lib/flow-conditions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { useScreens } from '@/hooks/use-screens'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { CondBuilder } from './condition-builder'
import { GatewayGlyph } from './flow-shared'
import { cn } from '@/lib/utils'

/* ─── modelo ─────────────────────────────────────────────────────────────────── */

const novoId = (prefixo: string) => `${prefixo}_${Math.random().toString(36).slice(2, 9)}`
/** Id de um caminho novo de escolha ("+ outra condição"). */
export const novoIdDeCaminho = () => novoId('Caminho')

export type NovoItem = 'userTask' | 'serviceTask' | 'escolha' | 'paralelo'

/** Item recém-criado. A escolha nasce com um caminho condicional + o caso contrário; o
 *  "ao mesmo tempo", com dois caminhos — um bloco com menos não faria sentido. */
export function novoItem(tipo: NovoItem): ItemFluxo {
  if (tipo === 'escolha') {
    /* nasce "todos os que servirem" e sem Senão (vazio = segue adiante) — PO, 04/10/2026 */
    return {
      kind: 'escolha', id: novoId('Escolha'), pergunta: '', modo: 'todos',
      caminhos: [{ id: novoId('Caminho'), itens: [], fim: { tipo: 'segue' } }],
      casoContrario: { id: novoId('Caminho'), itens: [], fim: { tipo: 'segue' } },
    }
  }
  if (tipo === 'paralelo') {
    return { kind: 'paralelo', id: novoId('Paralelo'), nome: '', caminhos: [{ id: novoId('Caminho'), itens: [] }, { id: novoId('Caminho'), itens: [] }] }
  }
  return { kind: 'atividade', id: novoId('Node'), tipo }
}

/** Cópia do fluxo com o nome de cada atividade tirado do passo, onde a pessoa o edita. */
export function comNomes(f: FluxoBlocos, steps: Record<string, StepFormSchema>): FluxoBlocos {
  const mapa = (itens: ItemFluxo[]): ItemFluxo[] => itens.map((it) => {
    if (it.kind === 'atividade') return { ...it, nome: steps[it.id]?.stepName || undefined }
    if (it.kind === 'escolha') {
      return { ...it, caminhos: it.caminhos.map((c) => ({ ...c, itens: mapa(c.itens) })), casoContrario: { ...it.casoContrario, itens: mapa(it.casoContrario.itens) } }
    }
    return { ...it, caminhos: it.caminhos.map((c) => ({ ...c, itens: mapa(c.itens) })) }
  })
  return { ...f, itens: mapa(f.itens) }
}

/** Escolhas que moram dentro de um "ao mesmo tempo": ali todo caminho só pode seguir. */
export function escolhasEmParalelo(f: FluxoBlocos): Set<string> {
  const out = new Set<string>()
  const visitar = (itens: ItemFluxo[], dentro: boolean) => {
    for (const it of itens) {
      if (it.kind === 'escolha') {
        if (dentro) out.add(it.id)
        for (const c of [...it.caminhos, it.casoContrario]) visitar(c.itens, dentro)
      } else if (it.kind === 'paralelo') {
        for (const c of it.caminhos) visitar(c.itens, true)
      }
    }
  }
  visitar(f.itens, false)
  return out
}

/** Atividades de uma lista de itens, inclusive as de blocos aninhados nela. */
function atividadesDentro(itens: ItemFluxo[]): ItemAtividade[] {
  return itens.flatMap((it) => (it.kind === 'atividade' ? [it]
    : it.kind === 'escolha' ? [...it.caminhos, it.casoContrario].flatMap((c) => atividadesDentro(c.itens))
      : it.caminhos.flatMap((c) => atividadesDentro(c.itens))))
}

function resumoItens(itens: ItemFluxo[], nomeDe: (id: string) => string): string {
  if (!itens.length) return 'nenhuma atividade'
  return itens.map((it) => (it.kind === 'atividade' ? nomeDe(it.id)
    : it.kind === 'escolha' ? `escolha “${it.pergunta?.trim() || 'sem pergunta'}”`
      : `ao mesmo tempo “${it.nome?.trim() || 'sem nome'}”`)).join(' → ')
}
function textoFim(fim: FimCaminho, nomeDe: (id: string) => string): string {
  if (fim.tipo === 'encerra') return 'encerra o processo'
  if (fim.tipo === 'volta') return `volta para ${nomeDe(fim.alvoId)}`
  return 'segue'
}

/* ─── contexto da configuração do bloco ─────────────────────────────────────── */

export type MetaAtividade = { kind: 'exec' | 'entidade' | 'prazo'; text: string }
/** "Testar": quais caminhos da escolha serviriam com os valores de exemplo (vários no "todos"). */
export type Simulacao = { blocoId: string; caminhoIds: string[] }
type Screens = ReturnType<typeof useScreens>['screens']

interface BlocoProps {
  fluxo: FluxoBlocos
  steps: Record<string, StepFormSchema>
  simulacao: Simulacao | null
  onRemover: (id: string) => void
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
  /** telas — de onde saem os campos que o filtro de cada caminho pode usar */
  screens: Screens
  onSimulacao: (s: Simulacao | null) => void
  /** abre a configuração de uma atividade (o conserto de "caminho sem campos") */
  onConfigurarAtividade?: (atividadeId: string) => void
  /** pendências de ativação por nó (as mesmas da pílula de saúde) — a marca no cabeçalho */
  problemas?: Map<string, ProblemaAtivacao[]>
}
interface BlocoCtx extends BlocoProps {
  problemas: Map<string, ProblemaAtivacao[]>
  emParalelo: Set<string>
  nomeDe: (id: string) => string
}
const Ctx = createContext<BlocoCtx | null>(null)
function useTrilho(): BlocoCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTrilho fora da ConfiguracaoDoBloco')
  return c
}

/** Marca de pendência no próprio item. A FORMA diz a gravidade (triângulo impede a
 *  ativação, "i" só informa) — a cor apenas reforça. */
function MarcaProblema({ id }: { id: string }) {
  const ps = useTrilho().problemas.get(id)
  if (!ps?.length) return null
  const texto = ps.map((p) => p.mensagem).join('\n')
  return ps.some((p) => p.severidade !== 'aviso')
    ? <span title={texto} aria-label={texto} className="shrink-0 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /></span>
    : <span title={texto} aria-label={texto} className="shrink-0 text-sky-500"><Info className="h-3.5 w-3.5" /></span>
}

function BotaoIcone({ title, onClick, perigo, disabled, children }: { title: string; onClick: () => void; perigo?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={cn('h-6 w-6 rounded flex items-center justify-center text-muted-foreground transition-colors disabled:pointer-events-none disabled:opacity-30',
        perigo ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground')}>
      {children}
    </button>
  )
}

/* ─── Escolha em FRASES (opção A do PO, 04/10/2026) ─────────────────────────────
   Sem modal: a escolha se configura no próprio trilho e lê como português —
   "Se [condição] então [atividades] e depois [segue]". A condição abre num balão
   ancorado nela mesma; a pergunta, o modo e o "se nenhum servir" estão no bloco. */

/** Campos que o filtro de um caminho pode usar: os da TELA das atividades dele. Caminho
 *  SEM atividade ("nenhum parecer → segue", PO 11/10/2026) testa o mesmo que os irmãos —
 *  é o "nenhum dos outros" —, então usa as telas das atividades dos outros caminhos. */
function useCamposDoCaminho() {
  const t = useTrilho()
  return (c: { id?: string; itens: ItemFluxo[] }, bloco?: BlocoEscolha) => {
    const proprias = atividadesDentro(c.itens)
    const fonte = proprias.length || !bloco ? proprias
      : bloco.caminhos.filter((x) => x.id !== c.id).flatMap((x) => atividadesDentro(x.itens))
    return camposDasTelasDasAtividades(fonte.map((a) => t.steps[a.id]).filter((s): s is StepFormSchema => !!s), t.screens)
  }
}

/** Por que ESTE caminho não tem campo para filtrar — e o conserto a um clique. */
function SemCampos({ caminho }: { caminho: CaminhoCondicional }) {
  const t = useTrilho()
  const tarefas = atividadesDentro(caminho.itens).filter((a) => a.tipo === 'userTask')
  const semTela = tarefas.filter((a) => !t.steps[a.id]?.screenRef)
  return (
    <div role="status" className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {tarefas.length === 0
            ? <>Este caminho não tem atividade, então o filtro usa os campos das telas dos <span className="font-semibold">outros caminhos</span> desta escolha — e nenhum deles tem tela de contrato. Insira uma atividade com tela de contrato, pelo <span className="font-semibold">+</span>.</>
            : semTela.length > 0
              ? <>O filtro usa os campos da <span className="font-semibold">tela da atividade deste caminho</span>, e {semTela.length === 1 ? 'ela está' : 'elas estão'} <span className="font-semibold">sem tela</span>.</>
              : <>As atividades deste caminho não usam tela de <span className="font-semibold">contrato</span> — o filtro só testa campos do contrato.</>}
        </span>
      </p>
      {semTela.length > 0 && t.onConfigurarAtividade && (
        <div className="flex flex-wrap gap-1.5 pl-5">
          {semTela.map((a) => (
            <button key={a.id} type="button" onClick={() => t.onConfigurarAtividade?.(a.id)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/70 bg-card px-2 py-1 text-[11.5px] font-semibold text-foreground hover:bg-muted">
              <SlidersHorizontal className="h-3 w-3" />Escolher a tela de “{t.nomeDe(a.id)}”
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A condição de um caminho, como pedaço da frase. Clicou, abre o construtor ancorado. */
function CondicaoNaFrase({ bloco, caminho, indice }: { bloco: BlocoEscolha; caminho: CaminhoCondicional; indice: number }) {
  const t = useTrilho()
  const camposDe = useCamposDoCaminho()
  const ancora = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const temCond = !!caminho.condition?.trim()
  const ordemConta = modoDaEscolha(bloco) === 'primeiro' && bloco.caminhos.length > 1
  return (
    <>
      <button ref={ancora} type="button" onClick={(e) => { e.stopPropagation(); setAberto((v) => !v) }}
        title="Configurar a condição deste caminho" aria-expanded={aberto}
        className={cn('line-clamp-2 max-w-[280px] shrink-0 rounded px-1 py-0.5 text-left text-[11.5px] font-semibold leading-snug underline decoration-dotted decoration-violet-500/70 underline-offset-4 hover:bg-violet-500/10',
          !temCond && 'text-amber-700 dark:text-amber-400')}>
        {temCond ? (caminho.rotulo?.trim() || caminho.condition)
          : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />escolher a condição</span>}
      </button>
      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => setAberto(false)} data-trilho-menu role="dialog" aria-label={`Condição do ${indice + 1}º caminho`}
          className="w-[min(640px,94vw)] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3 border-b bg-violet-500/[0.06] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Condição do {indice + 1}º caminho</p>
              <p className="mt-0.5 truncate text-sm font-semibold">Quando seguir para: {resumoItens(caminho.itens, t.nomeDe)}</p>
            </div>
            {ordemConta && (
              /* no "primeiro que servir" a ORDEM decide: vence o primeiro verdadeiro */
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5" title="Ordem de teste: vence o primeiro caminho verdadeiro">
                <button type="button" aria-label="Testar este caminho antes do anterior" title="Testar antes do anterior" disabled={indice === 0}
                  onClick={() => t.onFluxo((f) => moverCaminho(f, bloco.id, caminho.id, -1))}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Testar este caminho depois do seguinte" title="Testar depois do seguinte" disabled={indice === bloco.caminhos.length - 1}
                  onClick={() => t.onFluxo((f) => moverCaminho(f, bloco.id, caminho.id, 1))}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" title="Fechar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <CondBuilder edge={{ condition: caminho.condition, conditionSpec: caminho.conditionSpec as EdgeConditionSpec | undefined, label: caminho.rotulo }}
              campos={camposDe(caminho, bloco)} semCampos={<SemCampos caminho={caminho} />}
              onSet={(p) => t.onFluxo((f) => atualizarCaminho(f, caminho.id, {
                ...('condition' in p ? { condition: p.condition } : {}),
                ...('conditionSpec' in p ? { conditionSpec: p.conditionSpec } : {}),
                ...('label' in p ? { rotulo: p.label } : {}),
              }))} />
            <div className="space-y-1 border-t pt-3">
              <label htmlFor={`rotulo-${caminho.id}`} className="block text-xs font-medium">Como este caminho aparece no desenho</label>
              <Input id={`rotulo-${caminho.id}`} className="h-9 text-sm" value={caminho.rotulo ?? ''} placeholder="Ex.: Precisa do Patrimônio"
                onChange={(e) => { const rotulo = e.target.value; t.onFluxo((f) => atualizarCaminho(f, caminho.id, { rotulo })) }} />
              <p className="text-[11px] text-muted-foreground">Preenchido sozinho a partir das regras. Troque por um nome curto, se preferir.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-4 py-2.5">
            <Button size="sm" onClick={() => setAberto(false)}>Pronto</Button>
          </div>
        </FloatingMenu>
      )}
    </>
  )
}

/** "Testar com valores": os caminhos que serviriam acendem no próprio trilho. */
function TestarEscolha({ bloco }: { bloco: BlocoEscolha }) {
  const t = useTrilho()
  const camposDe = useCamposDoCaminho()
  const ancora = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>({})
  const campos = useMemo(() => {
    const usados = new Set(bloco.caminhos.flatMap((c) => (c.conditionSpec?.rules ?? []).map((r) => r.campo).filter(Boolean)))
    const m = new Map<string, CampoDisponivel>()
    for (const c of bloco.caminhos) for (const cp of camposDe(c, bloco)) if (usados.has(cp.key) && !m.has(cp.key)) m.set(cp.key, cp)
    return [...m.values()]
  }, [bloco]) // eslint-disable-line react-hooks/exhaustive-deps
  const todos = modoDaEscolha(bloco) === 'todos'
  const vencedores = useMemo(() => {
    if (!aberto) return null
    const saidas = [...bloco.caminhos.map((c) => ({ id: c.id, condition: c.condition })), ...(temSenaoAntigo(bloco) ? [{ id: bloco.casoContrario.id, isDefault: true }] : [])]
    return decidirSaidas(saidas, montarVarsSimulacao(valores, (k) => campos.find((c) => c.key === k)?.tipo ?? 'texto'), todos)
  }, [aberto, valores, bloco, campos, todos])
  useEffect(() => { t.onSimulacao(aberto && vencedores && campos.length ? { blocoId: bloco.id, caminhoIds: vencedores } : null) }, [aberto, vencedores]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => t.onSimulacao(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const frase = !vencedores ? '' : vencedores.length === 0 || vencedores.includes(bloco.casoContrario.id)
    ? 'nenhum filtro serviu → o processo PARA e avisa quem está executando'
    : `segue por: ${vencedores.map((id) => `${bloco.caminhos.findIndex((c) => c.id === id) + 1}º`).join(' e ')} caminho${vencedores.length > 1 ? 's, ao mesmo tempo' : ''}`
  return (
    <>
      <button ref={ancora} type="button" onClick={(e) => { e.stopPropagation(); setAberto((v) => !v) }} title="Testar com valores de exemplo" aria-label="Testar com valores"
        className={cn('flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-semibold transition-colors hover:bg-muted', aberto ? 'text-primary' : 'text-muted-foreground')}>
        <Play className="h-3 w-3" />Testar
      </button>
      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => setAberto(false)} align="end" data-trilho-menu
          className="w-[360px] space-y-2.5 rounded-xl border bg-card p-4 text-card-foreground shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-semibold">Testar com valores <span className="font-normal text-muted-foreground">— o caminho acende no desenho</span></p>
          {campos.length === 0 ? (
            <p className="text-[11px] leading-snug text-muted-foreground">Monte ao menos uma condição — os campos usados aparecem aqui.</p>
          ) : campos.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={c.label}>{c.label}</span>
              {c.tipo === 'selecao' && c.options?.length ? (
                <Select value={valores[c.key] || undefined} onValueChange={(v) => setValores((sv) => ({ ...sv, [c.key]: v }))}>
                  <SelectTrigger className="h-7 w-[150px] shrink-0 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{c.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : c.tipo === 'booleano' ? (
                <Select value={valores[c.key] || undefined} onValueChange={(v) => setValores((sv) => ({ ...sv, [c.key]: v }))}>
                  <SelectTrigger className="h-7 w-[150px] shrink-0 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="true" className="text-xs">Sim</SelectItem><SelectItem value="false" className="text-xs">Não</SelectItem></SelectContent>
                </Select>
              ) : (
                <Input className="h-7 w-[150px] shrink-0 text-xs" type={c.tipo === 'data' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                  value={valores[c.key] ?? ''} onChange={(ev) => setValores((sv) => ({ ...sv, [c.key]: ev.target.value }))} />
              )}
            </div>
          ))}
          {campos.length > 0 && frase && <p className="text-xs font-semibold text-primary">→ {frase}</p>}
        </FloatingMenu>
      )}
    </>
  )
}

function BlocoEscolhaView({ bloco }: { bloco: BlocoEscolha }) {
  const t = useTrilho()
  const dentroParalelo = t.emParalelo.has(bloco.id)
  const todos = modoDaEscolha(bloco) === 'todos'
  const ordemConta = !todos && bloco.caminhos.length > 1
  const sim = t.simulacao?.blocoId === bloco.id ? t.simulacao : null
  const luz = (id: string) => ({ acesa: !!sim && sim.caminhoIds.includes(id), apagada: !!sim && !sim.caminhoIds.includes(id) })
  const senao = bloco.casoContrario
  const senaoAntigo = temSenaoAntigo(bloco)
  return (
    <section aria-label="Escolher um caminho" className="flex w-full flex-col rounded-2xl border-[1.5px] border-violet-500/55 bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-t-2xl border-b bg-violet-500/[0.07] px-2 py-1.5">
        <GatewayGlyph kind="exclusive" className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0 flex-1">
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">{todos ? 'Escolher caminhos' : 'Escolher um caminho'}</span>
          <input value={bloco.pergunta ?? ''} placeholder="Qual é a pergunta?" aria-label="Pergunta da escolha"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const pergunta = e.target.value; t.onFluxo((f) => atualizarItem(f, bloco.id, { pergunta })) }}
            className={cn('block bg-transparent text-[12.5px] font-semibold leading-tight outline-none placeholder:font-normal placeholder:italic placeholder:text-muted-foreground focus:underline focus:decoration-dotted w-full')} />
        </div>
        <div className="order-last flex basis-full items-center gap-1.5 pl-6 text-[11px] text-muted-foreground">
          <span>Se mais de um servir:</span>
          <Select value={todos ? 'todos' : 'primeiro'} onValueChange={(v) => t.onFluxo((f) => atualizarItem(f, bloco.id, { modo: v as ModoEscolha }))}>
            <SelectTrigger className="h-6 w-[175px] whitespace-nowrap text-[11px]" aria-label="Quando mais de um filtro servir"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos" className="text-xs">todos, ao mesmo tempo</SelectItem>
              <SelectItem value="primeiro" className="text-xs">só o primeiro (de cima)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto flex items-center gap-0.5 pl-3">
          <MarcaProblema id={bloco.id} />
          <TestarEscolha bloco={bloco} />
          <BotaoIcone title="Remover a escolha e o que há dentro dela" perigo onClick={() => t.onRemover(bloco.id)}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-2">
        {bloco.caminhos.map((c, i) => {
          const { acesa, apagada } = luz(c.id)
          return (
            <div key={c.id} className={cn('flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/45 px-2 py-1.5 transition-opacity', acesa && 'bg-primary/5 ring-2 ring-primary', apagada && 'opacity-40')}>
              <span className="shrink-0 text-[11.5px] font-bold text-violet-700 dark:text-violet-300">Se</span>
              <CondicaoNaFrase bloco={bloco} caminho={c} indice={i} />
              <span className="shrink-0 text-[11.5px] font-semibold">então</span>
              {acesa && <span className="shrink-0 text-[10.5px] font-bold text-primary">✓ por aqui</span>}
              {/* as etapas do caminho estão no desenho: aqui só o resumo delas */}
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={resumoItens(c.itens, t.nomeDe)}>{resumoItens(c.itens, t.nomeDe)}</span>
              <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
                <span className="text-[11px] text-muted-foreground">e depois</span>
                {todos || dentroParalelo
                  /* em "todos" (e dentro de um paralelo) um caminho com filtro só segue */
                  ? (c.fim.tipo === 'segue'
                      ? <span className="text-[11px] font-semibold">segue</span>
                      : <FimSelect fluxo={t.fluxo} escolhaId={bloco.id} caminhoId={c.id} fim={c.fim} nomeDe={t.nomeDe} onFluxo={t.onFluxo} soSegue />)
                  : <FimSelect fluxo={t.fluxo} escolhaId={bloco.id} caminhoId={c.id} fim={c.fim} nomeDe={t.nomeDe} onFluxo={t.onFluxo} />}
                {ordemConta && (<>
                  {/* no "primeiro que servir" a ORDEM decide: vence o primeiro verdadeiro */}
                  <BotaoIcone title="Testar este caminho antes do anterior" disabled={i === 0} onClick={() => t.onFluxo((f) => moverCaminho(f, bloco.id, c.id, -1))}><ArrowUp className="h-3.5 w-3.5" /></BotaoIcone>
                  <BotaoIcone title="Testar este caminho depois do seguinte" disabled={i === bloco.caminhos.length - 1} onClick={() => t.onFluxo((f) => moverCaminho(f, bloco.id, c.id, 1))}><ArrowDown className="h-3.5 w-3.5" /></BotaoIcone>
                </>)}
                {bloco.caminhos.length > 1 && (
                  <BotaoIcone title="Remover este caminho" perigo onClick={() => t.onFluxo((f) => removerCaminho(f, bloco.id, c.id))}><X className="h-3.5 w-3.5" /></BotaoIcone>
                )}
              </div>
            </div>
          )
        })}

        {senaoAntigo && (
          /* "Se nenhum servir" foi EXCLUÍDO (PO, 04/10/2026). Um Senão desenhado antes não
             some em silêncio: fica marcado, com o conserto a um clique, e a ativação recusa. */
          <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">“Senão” antigo (descontinuado)</span> — {resumoItens(senao.itens, t.nomeDe)} · {textoFim(senao.fim, t.nomeDe)}.
              Quando nenhum filtro servir, o processo agora para e avisa.
            </span>
            <button type="button" onClick={(e) => { e.stopPropagation(); const id = novoId('Caminho'); t.onFluxo((f) => senaoParaCaminho(f, bloco.id, id)) }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/70 bg-card px-2 py-1 font-semibold text-foreground hover:bg-muted">
              <CornerDownRight className="h-3 w-3" />Transformar em caminho com filtro
            </button>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 gap-y-1 border-t px-2.5 py-1.5">
        <button type="button" onClick={() => { const id = novoId('Caminho'); t.onFluxo((f) => adicionarCaminho(f, bloco.id, id)) }}
          className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
          <Plus className="h-3 w-3" />outra condição
        </button>
        <span className="text-[10.5px] text-muted-foreground">
          {todos ? 'Todos os que servirem acontecem juntos.' : 'Segue só o primeiro que servir, de cima para baixo.'}{' '}
          <span className="font-medium text-foreground">Se nenhum servir, o processo para e avisa.</span>
        </span>
      </footer>
    </section>
  )
}

function BlocoParaleloView({ bloco }: { bloco: BlocoParalelo }) {
  const t = useTrilho()
  return (
    <section aria-label="Fazer ao mesmo tempo" className="flex w-full flex-col rounded-2xl border-[1.5px] border-rose-500/55 bg-card shadow-sm">
      <header className="flex items-center gap-2 rounded-t-2xl border-b bg-rose-500/[0.07] px-2 py-1.5">
        <GatewayGlyph kind="parallel" className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="min-w-0 flex-1">
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Fazer ao mesmo tempo</span>
          <input value={bloco.nome ?? ''} placeholder="Dê um nome (ex.: Pareceres)" aria-label="Nome do bloco"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const nome = e.target.value; t.onFluxo((f) => atualizarItem(f, bloco.id, { nome })) }}
            className={cn('block bg-transparent text-[12.5px] font-semibold leading-tight outline-none placeholder:font-normal placeholder:italic placeholder:text-muted-foreground focus:underline focus:decoration-dotted w-full')} />
        </div>
        <span className="ml-auto flex items-center gap-0.5 pl-3">
          <MarcaProblema id={bloco.id} />
          <BotaoIcone title="Remover o bloco e o que há dentro dele" perigo onClick={() => t.onRemover(bloco.id)}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
        </span>
      </header>

      <div className="flex flex-col gap-1.5 p-2">
        <span className="px-1 text-[11.5px] font-semibold">Ao mesmo tempo:</span>
        {bloco.caminhos.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1.5 rounded-lg bg-muted/45 px-2 py-1">
            <span className="w-[64px] shrink-0 text-[11px] font-semibold text-muted-foreground">{i === 0 ? 'Frente 1' : `e frente ${i + 1}`}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={resumoItens(c.itens, t.nomeDe)}>{resumoItens(c.itens, t.nomeDe)}</span>
            {bloco.caminhos.length > 1 && (
              <BotaoIcone title="Remover esta frente" perigo onClick={() => t.onFluxo((f) => removerCaminho(f, bloco.id, c.id))}><X className="h-3.5 w-3.5" /></BotaoIcone>
            )}
          </div>
        ))}
      </div>

      <footer className="flex items-center gap-3 border-t px-2.5 py-1.5">
        <button type="button" onClick={() => { const id = novoId('Caminho'); t.onFluxo((f) => adicionarCaminho(f, bloco.id, id)) }}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-700 hover:underline dark:text-rose-300">
          <Plus className="h-3 w-3" />frente
        </button>
        <span className="text-[11px]"><span className="font-semibold">Segue quando</span> todas as frentes terminarem.</span>
      </footer>
    </section>
  )
}

/** Como um caminho da escolha termina. "Voltar" só lista atividades que vêm ANTES da
 *  escolha e fora de um "ao mesmo tempo" — as outras travariam o motor. */
export function FimSelect({ fluxo, escolhaId, caminhoId, fim, nomeDe, onFluxo, soSegue }: {
  fluxo: FluxoBlocos; escolhaId: string; caminhoId: string; fim: FimCaminho
  nomeDe: (id: string) => string
  onFluxo: (fn: (f: FluxoBlocos) => FluxoBlocos) => void
  /** só "segue" é válido aqui; o valor atual (inválido) aparece para poder ser trocado */
  soSegue?: boolean
}) {
  const destinos = useMemo(() => destinosDeVolta(fluxo, escolhaId), [fluxo, escolhaId])
  const valor = fim.tipo === 'volta' ? `volta:${fim.alvoId}` : fim.tipo
  const alvoInvalido = fim.tipo === 'volta' && !destinos.some((d) => d.id === fim.alvoId) ? fim.alvoId : null
  const mudar = (v: string) => {
    const novo: FimCaminho = v === 'segue' ? { tipo: 'segue' } : v === 'encerra' ? { tipo: 'encerra' } : { tipo: 'volta', alvoId: v.slice('volta:'.length) }
    onFluxo((f) => atualizarCaminho(f, caminhoId, { fim: novo }))
  }
  return (
    <Select value={valor} onValueChange={mudar}>
      <SelectTrigger className="h-7 w-[180px] text-[11px]" aria-label="Ao terminar este caminho" onClick={(e) => e.stopPropagation()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="segue" className="text-xs">Ao terminar: segue</SelectItem>
        <SelectItem value="encerra" disabled={soSegue} className="text-xs">Encerra o processo{soSegue ? ' (não vale aqui)' : ''}</SelectItem>
        {!soSegue && destinos.map((d) => <SelectItem key={d.id} value={`volta:${d.id}`} className="text-xs">Volta para: {nomeDe(d.id)}</SelectItem>)}
        {alvoInvalido && <SelectItem value={valor} className="text-xs">Volta para: {nomeDe(alvoInvalido)} (não vale mais)</SelectItem>}
      </SelectContent>
    </Select>
  )
}

/* ─── configuração do bloco na gaveta lateral (desenho BPMN) ─────────────────────
   O trilho "Montar" saiu (as etapas moram no desenho): as vistas de bloco ficaram só
   com a configuração, na largura da gaveta. Escolha: pergunta, modo "todos / só o primeiro",
   caminhos com condição, fim, Testar, adicionar/remover/mover caminho. Paralelo: nome
   e frentes. Renomear e remover o bloco moram no cabeçalho da própria vista. */

export function ConfiguracaoDoBloco({ blocoId, ...props }: BlocoProps & { blocoId: string }): JSX.Element {
  const emParalelo = useMemo(() => escolhasEmParalelo(props.fluxo), [props.fluxo])
  const vazio = useMemo(() => new Map<string, ProblemaAtivacao[]>(), [])
  const problemas = props.problemas ?? vazio
  const nomeDe = (id: string) => props.steps[id]?.stepName?.trim() || 'Atividade sem nome'
  const b = acharItem(props.fluxo, blocoId)
  if (!b || b.kind === 'atividade') {
    return <p className="p-4 text-xs text-muted-foreground">Este bloco não existe mais no fluxo.</p>
  }
  return (
    <Ctx.Provider value={{ ...props, problemas, emParalelo, nomeDe }}>
      <div className="flex flex-col gap-3 p-4">
        {b.kind === 'escolha' ? <BlocoEscolhaView bloco={b} /> : <BlocoParaleloView bloco={b} />}
        <p className="text-[11px] leading-snug text-muted-foreground">
          {b.kind === 'escolha'
            ? <>Clique na <span className="font-medium">condição</span> de um caminho para montar o filtro, e use <span className="font-medium">Testar</span> para ver por onde o processo seguiria. As etapas de cada caminho ficam no desenho.</>
            : b.caminhos.length === 1
              ? <>Só há uma frente: o processo segue quando ela terminar. As etapas da frente ficam no desenho.</>
              : <>As {b.caminhos.length} frentes começam juntas, e o processo só segue quando todas terminarem. As etapas de cada frente ficam no desenho.</>}
        </p>
      </div>
    </Ctx.Provider>
  )
}

