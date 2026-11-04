'use client'

/* ─── Gavetas novas do desenho (editor estilo Bizagi, spec §3) ─────────────────
   Raia, fase, piscina principal, piscina externa, fluxo de mensagem e as formas que não são
   etapa nem escolha (início e fim de toda variante, intermediários, subprocesso, envio e
   recebimento, baseado em evento, ao mesmo tempo solto). Mesma regra da gaveta da etapa:
   o que se muda aqui vale AO VIVO no desenho; Cancelar, o X e o Esc voltam ao estado da
   abertura (a página guarda o retrato); Aplicar — ou clicar noutra coisa, Salvar, Ativar —
   mantém. Os campos de cada variante são os do mockup aprovado e ficam em `forma.config`. */
import type { JSX, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRightLeft, Info } from 'lucide-react'
import type { FaseDesenho, FluxoMensagem, FormaDesenho, PiscinaExterna, QuemInicia, SetaDesenho, StepFormSchema } from '@nxt/types'
import { executaHoje, varianteDe } from '@nxt/workflow-core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, type EntityKind } from '@/components/ui/entity-select'
import { ORIGEM, REFERENCIA, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { ROTULO_ETIQUETA } from '@/lib/editor-bizagi/catalogo'
import {
  ENVIO_PADRAO, INICIO_AGENDADO_PADRAO, INICIO_EVENTO_PADRAO, RECEBIMENTO_PADRAO, camposDoTexto, configFim, configLivre,
  configSubprocesso, configTemporizador, nomeDoElemento, type WorkflowDaLista,
} from '@/lib/editor-bizagi/gavetas'
import type { Orientacao } from '@/lib/editor-bizagi/geometria'
import { cn } from '@/lib/utils'
import { ExecutorDaVariavel } from '../executor-da-variavel'
import { CAMPO, Opcao, Pergunta } from '../perguntas-da-etapa'
import { QuemIniciaPill } from '../quem-inicia'
import { entityKindLabel, type Papeis } from '../editor-comum'
import { GavetaLateral, ehEscDaGaveta } from './gaveta'
import { CHIP } from './paleta'

type Executor = NonNullable<StepFormSchema['executor']>

/** O que toda gaveta nova recebe da página: fechar desfazendo, fechar mantendo e o foco. */
interface Moldura {
  onCancelar: () => void
  onAplicar: () => void
  /** false = abre sem tirar o foco da forma (aberta pelo duplo clique/Enter no desenho) */
  focarAoAbrir?: boolean
}

/** "Só documenta": fase, piscina externa e fluxo de mensagem não mudam a execução. */
type Etiqueta = 'hoje' | 'proxima' | 'documenta'
const ROTULO: Record<Etiqueta, string> = { ...ROTULO_ETIQUETA, documenta: 'Só documenta' }
const COR: Record<Etiqueta, string> = { ...CHIP, documenta: CHIP.proxima }

export const AVISO_AINDA_NAO_EXECUTA = 'Ainda não executa: dá para desenhar e salvar; para ativar, troque por outro elemento.'

function MolduraDaGaveta({ rotulo, titulo, etiqueta, onCancelar, onAplicar, focarAoAbrir, children }: Moldura & {
  rotulo: string; titulo: string; etiqueta: Etiqueta; children: ReactNode
}): JSX.Element {
  /* Esc DENTRO da gaveta (sem lista/balão aberto por cima) cancela, como na etapa */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (ehEscDaGaveta(e)) { e.stopPropagation(); onCancelar() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancelar])
  const rodape = (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        As alterações já aparecem no desenho e entram no workflow ao <span className="font-medium">Salvar rascunho</span> ou <span className="font-medium">Ativar</span>.
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" onClick={onAplicar}>Aplicar</Button>
      </div>
    </div>
  )
  return (
    <GavetaLateral rotulo={rotulo} titulo={titulo} rotuloFechar="Fechar sem aplicar" onFechar={onCancelar} rodape={rodape} focarAoAbrir={focarAoAbrir}
      selo={<span className={cn('whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.01em]', COR[etiqueta])}>{ROTULO[etiqueta]}</span>}>
      <div className="flex flex-col gap-7 px-4 py-4">{children}</div>
    </GavetaLateral>
  )
}

/* ─── peças ─────────────────────────────────────────────────────────────────── */

function Nota({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{children}</span>
    </p>
  )
}

function AvisoAindaNaoExecuta(): JSX.Element {
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{AVISO_AINDA_NAO_EXECUTA}</span>
    </p>
  )
}

/** Texto com estado próprio: a página pode recusar o que chega (nome em branco, espaços nas
 *  pontas) sem o campo "engolir" a digitação. A gaveta remonta a cada alvo (key). */
function CampoTexto({ valor, onMudar, rotulo, placeholder, multilinha, id }: {
  valor: string; onMudar: (v: string) => void; rotulo: string; placeholder?: string; multilinha?: boolean; id?: string
}): JSX.Element {
  const [texto, setTexto] = useState(valor)
  const mudar = (v: string) => { setTexto(v); onMudar(v) }
  return multilinha
    ? <Textarea id={id} aria-label={rotulo} className="min-h-[80px] max-w-lg text-[length:var(--campo-fonte)]" value={texto} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />
    : <Input id={id} aria-label={rotulo} className={cn(CAMPO, 'max-w-lg')} value={texto} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />
}

/** Número inteiro ≥ `min`; vazio = `undefined` (quem chama decide o que é "sem valor"). */
function CampoNumero({ valor, onMudar, rotulo, min = 0 }: {
  valor: number | undefined; onMudar: (v: number | undefined) => void; rotulo: string; min?: number
}): JSX.Element {
  const [texto, setTexto] = useState(valor === undefined ? '' : String(valor))
  return (
    <Input type="number" inputMode="numeric" min={min} aria-label={rotulo} className={cn(CAMPO, 'w-24')} value={texto}
      onChange={(e) => {
        setTexto(e.target.value)
        const n = Number.parseInt(e.target.value, 10)
        onMudar(Number.isFinite(n) && n >= min ? n : undefined)
      }} />
  )
}

function Escolher<T extends string>({ valor, opcoes, onMudar, rotulo, placeholder, className }: {
  valor: T | ''; opcoes: ReadonlyArray<readonly [T, string]>; onMudar: (v: T) => void; rotulo: string; placeholder?: string; className?: string
}): JSX.Element {
  return (
    <Select value={valor} onValueChange={(v) => onMudar(v as T)}>
      <SelectTrigger aria-label={rotulo} className={cn(CAMPO, className ?? 'max-w-sm')}><SelectValue placeholder={placeholder ?? 'Escolha…'} /></SelectTrigger>
      <SelectContent>{opcoes.map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function Marcar({ marcado, onMudar, children }: { marcado: boolean; onMudar: (v: boolean) => void; children: ReactNode }): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-[length:var(--campo-fonte)]">
      <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={marcado} onChange={(e) => onMudar(e.target.checked)} />
      {children}
    </label>
  )
}

/** Rádios em cartão (o `Opcao` das perguntas da etapa), um por linha. */
function Opcoes<T extends string>({ valor, opcoes, onMudar, rotulo, colunas }: {
  valor: T; opcoes: ReadonlyArray<{ v: T; titulo: string; descricao?: string; disabled?: boolean }>; onMudar: (v: T) => void; rotulo: string; colunas?: boolean
}): JSX.Element {
  return (
    <div role="radiogroup" aria-label={rotulo} className={cn('grid gap-2', colunas && 'sm:grid-cols-2')}>
      {opcoes.map((o) => <Opcao key={o.v} ativo={valor === o.v} disabled={o.disabled} onClick={() => onMudar(o.v)} titulo={o.titulo} descricao={o.descricao} />)}
    </div>
  )
}

/* ─── Raia ──────────────────────────────────────────────────────────────────── */

/** O executor padrão da raia: papel de pessoa e, se o papel mora numa entidade, qual — o mesmo
 *  formato do "Quem faz?" da etapa (a tarefa herda o objeto inteiro). */
function ExecutorDaRaia({ executor, papeis, onMudar }: {
  executor: Executor | undefined; papeis: Papeis; onMudar: (e: Executor | undefined) => void
}): JSX.Element {
  const papeisPessoa = papeis.active.filter((p) => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
  const papelSel = executor?.papelId ? papeis.entries.find((p) => p.id === executor.papelId) : undefined
  const origem = papelSel?.origem
  const escolher = (papelId: string) => {
    if (papelId === SEM_PADRAO) { onMudar(undefined); return }
    const p = papeis.entries.find((pp) => pp.id === papelId)
    onMudar({ papelId, entityType: p?.origem ?? 'CONTRATO', mode: 'FIXA' })
  }
  const setExec = (patch: Partial<Executor>) => executor && onMudar({ ...executor, ...patch })
  const tipo = origem ? entityKindLabel(origem) : ''
  const masc = origem === ORIGEM.PARCEIRO || origem === 'CONTRATO'
  return (
    <>
      <Select value={executor?.papelId ?? SEM_PADRAO} onValueChange={escolher}>
        <SelectTrigger aria-label="Papel de quem faz as tarefas desta raia" className={cn(CAMPO, 'max-w-sm')}><SelectValue placeholder="Escolha o papel" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_PADRAO}>— sem executor padrão —</SelectItem>
          {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {papeisPessoa.length === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).</p>
      )}
      {executor && origem && origem !== ORIGEM.ORG && (<>
        <p className="text-[13px] font-semibold">{papelSel?.label ?? 'O papel'} de qual {tipo}?</p>
        <div role="radiogroup" aria-label={`De qual ${tipo}`} className="grid gap-2 sm:grid-cols-2">
          <Opcao ativo={executor.mode === 'FIXA'} onClick={() => setExec({ mode: 'FIXA' })}
            titulo={`Sempre ${masc ? 'o mesmo' : 'a mesma'}`} descricao={`Você escolhe agora qual ${tipo}.`} />
          <Opcao ativo={executor.mode === 'VARIAVEL'} onClick={() => setExec({ mode: 'VARIAVEL' })}
            titulo={origem === ORIGEM.PARCEIRO ? 'Depende do processo' : 'A do contrato do processo'}
            descricao="Muda conforme o contrato que passa pelo processo." />
        </div>
        <div className="max-w-lg">
          {executor.mode === 'FIXA' ? (
            <EntitySelect entityType={origem as EntityKind} value={executor.entityId}
              onChange={(id) => setExec({ entityId: id, entityVar: undefined, stakeholder: undefined })}
              placeholder={`Escolha ${masc ? 'o' : 'a'} ${tipo}…`} />
          ) : (
            <ExecutorDaVariavel executor={executor} papelLabel={papelSel?.label ?? 'o papel'} papeis={papeis.entries}
              variaveisTecnicas={[]} onChange={setExec} />
          )}
        </div>
      </>)}
    </>
  )
}
const SEM_PADRAO = '__sem-padrao__'

export function GavetaRaia({ raia, tarefasNaRaia, papeis, onPatch, ...moldura }: Moldura & {
  raia: { id: string; nome: string; executor?: Executor }
  tarefasNaRaia: { total: number; usamOPadrao: number }
  papeis: Papeis
  /** `executor: undefined` (com a chave) tira o executor padrão */
  onPatch: (p: { nome?: string; executor?: Executor | undefined }) => void
}): JSX.Element {
  const { total, usamOPadrao } = tarefasNaRaia
  return (
    <MolduraDaGaveta rotulo="Raia" titulo={raia.nome || 'Raia sem nome'} etiqueta="hoje" {...moldura}>
      <Pergunta id="raia-nome" n={1} titulo="Nome da raia" ok={!!raia.nome.trim()}>
        <CampoTexto rotulo="Nome da raia" valor={raia.nome} onMudar={(v) => onPatch({ nome: v })} />
      </Pergunta>
      <Pergunta id="raia-executor" n={2} titulo="Quem faz as tarefas desta raia?" ok
        ajuda="É o padrão. Cada tarefa pode escolher outro executor no “Quem faz?” dela.">
        <ExecutorDaRaia executor={raia.executor} papeis={papeis} onMudar={(e) => onPatch({ executor: e })} />
      </Pergunta>
      <Nota>
        <b className="font-semibold text-foreground">{total}</b> {total === 1 ? 'tarefa de usuário' : 'tarefas de usuário'} nesta raia
        {total > 0 && <>; {usamOPadrao === total ? (total === 1 ? 'ela usa' : 'todas usam') : `${usamOPadrao} ${usamOPadrao === 1 ? 'usa' : 'usam'}`} o padrão da raia</>}.
      </Nota>
    </MolduraDaGaveta>
  )
}

/* ─── Fase ──────────────────────────────────────────────────────────────────── */

export function GavetaFase({ fase, formasNaFase, onPatch, ...moldura }: Moldura & {
  fase: FaseDesenho
  formasNaFase: number
  /** `prazoDiasUteis: undefined` (com a chave) tira o prazo */
  onPatch: (p: { nome?: string; prazoDiasUteis?: number | undefined }) => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Fase" titulo={fase.nome || 'Fase sem nome'} etiqueta="documenta" {...moldura}>
      <Pergunta id="fase-nome" n={1} titulo="Nome da fase" ok={!!fase.nome.trim()}>
        <CampoTexto rotulo="Nome da fase" valor={fase.nome} onMudar={(v) => onPatch({ nome: v })} />
      </Pergunta>
      <Pergunta id="fase-prazo" n={2} titulo="Prazo da fase (opcional)" ok ajuda="Por enquanto é só informativo.">
        <div className="flex items-center gap-2">
          <CampoNumero rotulo="Prazo da fase em dias úteis" min={1} valor={fase.prazoDiasUteis} onMudar={(n) => onPatch({ prazoDiasUteis: n })} />
          <span className="text-sm text-muted-foreground">dias úteis</span>
        </div>
      </Pergunta>
      <Nota><b className="font-semibold text-foreground">{formasNaFase}</b> {formasNaFase === 1 ? 'forma' : 'formas'} nesta fase.</Nota>
    </MolduraDaGaveta>
  )
}

/* ─── Piscina principal (o workflow) ────────────────────────────────────────── */

export function GavetaPiscinaPrincipal({ nome, descricao, quemInicia, papeis, kind, orientacao, onNome, onDescricao, onQuemInicia, onOrientacao, ...moldura }: Moldura & {
  nome: string; descricao: string; quemInicia: QuemInicia | undefined; papeis: Papeis; kind: string; orientacao: Orientacao
  onNome: (v: string) => void; onDescricao: (v: string) => void; onQuemInicia: (v: QuemInicia | undefined) => void; onOrientacao: (o: Orientacao) => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Piscina principal · o workflow" titulo={nome.trim() || 'Workflow sem nome'} etiqueta="hoje" {...moldura}>
      <Pergunta id="wf-nome" n={1} titulo="Nome do workflow" ok={!!nome.trim()}>
        <CampoTexto rotulo="Nome do workflow" valor={nome} placeholder="Dê um nome a este workflow" onMudar={onNome} />
      </Pergunta>
      <Pergunta id="wf-descricao" n={2} titulo="Descrição" ok ajuda="O objetivo do workflow, para quem for gerenciá-lo depois.">
        <CampoTexto rotulo="Descrição do workflow" multilinha valor={descricao} onMudar={onDescricao} />
      </Pergunta>
      <Pergunta id="wf-quem-inicia" n={3} titulo="Quem pode iniciar?" ok ajuda="Quem vê este workflow em “+ Novo processo”. Administrador sempre pode.">
        <div><QuemIniciaPill value={quemInicia} onChange={onQuemInicia} papeis={papeis.entries} kind={kind} /></div>
      </Pergunta>
      <Pergunta id="wf-orientacao" n={4} titulo="Orientação do desenho" ok>
        <Opcoes rotulo="Orientação do desenho" valor={orientacao} onMudar={onOrientacao} colunas opcoes={[
          { v: 'horizontal', titulo: 'Horizontal', descricao: 'Raias deitadas, o fluxo anda para a direita.' },
          { v: 'vertical', titulo: 'Vertical', descricao: 'Raias em pé, o fluxo desce.' },
        ]} />
      </Pergunta>
    </MolduraDaGaveta>
  )
}

/* ─── Piscina externa ───────────────────────────────────────────────────────── */

export function GavetaPiscinaExterna({ piscina, onPatch, ...moldura }: Moldura & {
  piscina: PiscinaExterna
  onPatch: (p: Partial<Omit<PiscinaExterna, 'id'>>) => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Piscina de participante externo" titulo={piscina.nome || 'Participante sem nome'} etiqueta="documenta" {...moldura}>
      <Pergunta id="ext-nome" n={1} titulo="Nome" ok={!!piscina.nome.trim()}>
        <CampoTexto rotulo="Nome do participante externo" valor={piscina.nome} onMudar={(v) => onPatch({ nome: v })} />
      </Pergunta>
      <Pergunta id="ext-quem" n={2} titulo="Quem é?" ok>
        <Opcoes rotulo="Quem é o participante" valor={piscina.quem} onMudar={(quem) => onPatch({ quem })} opcoes={[
          { v: 'contratada', titulo: 'A contratada do contrato do processo', descricao: 'Muda a cada processo, conforme o contrato.' },
          { v: 'fixo', titulo: 'Um fornecedor fixo' },
          { v: 'orgao', titulo: 'Um órgão ou sistema externo' },
        ]} />
      </Pergunta>
      <Pergunta id="ext-canal" n={3} titulo="Como ele interage?" ok>
        <Opcoes rotulo="Como o participante interage" valor={piscina.canal} onMudar={(canal) => onPatch({ canal })} colunas opcoes={[
          { v: 'portal', titulo: 'Portal do fornecedor' },
          { v: 'email', titulo: 'E-mail com link seguro' },
        ]} />
      </Pergunta>
      <Nota>Caixa-preta: o Nxt não desenha nem controla as etapas dele, só as mensagens que vão e voltam.</Nota>
    </MolduraDaGaveta>
  )
}

/* ─── Fluxo de mensagem ─────────────────────────────────────────────────────── */

export function GavetaMensagem({ fluxo, de, para, onPatch, ...moldura }: Moldura & {
  fluxo: FluxoMensagem
  /** nomes das pontas (forma ou piscina) */
  de: string; para: string
  onPatch: (p: { rotulo: string }) => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Fluxo de mensagem" titulo={fluxo.rotulo || `${de} → ${para}`} etiqueta="documenta" {...moldura}>
      <Pergunta id="msg-rotulo" n={1} titulo="O que é enviado?" ok={!!fluxo.rotulo}>
        <CampoTexto rotulo="O que é enviado" valor={fluxo.rotulo ?? ''} placeholder="Ex.: Minuta para assinatura" onMudar={(v) => onPatch({ rotulo: v })} />
      </Pergunta>
      <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>De <b className="font-semibold text-foreground">{de}</b> para <b className="font-semibold text-foreground">{para}</b>. O canal e os anexos ficam na forma que envia ou recebe.</span>
      </p>
    </MolduraDaGaveta>
  )
}

/* ─── Seta de sequência (fora de Escolha) ───────────────────────────────────── */

export function GavetaSeta({ seta, de, para, onPatch, ...moldura }: Moldura & {
  seta: SetaDesenho
  /** nomes das formas nas pontas */
  de: string; para: string
  onPatch: (p: { rotulo: string }) => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Seta de sequência" titulo={seta.rotulo || `${de} → ${para}`} etiqueta="hoje" {...moldura}>
      <Pergunta id="seta-rotulo" n={1} titulo="Rótulo na seta (opcional)" ok>
        <CampoTexto rotulo="Rótulo na seta" valor={seta.rotulo ?? ''} onMudar={(v) => onPatch({ rotulo: v })} />
      </Pergunta>
      <Nota>Seta de sequência: leva de <b className="font-semibold text-foreground">{de}</b> para <b className="font-semibold text-foreground">{para}</b>. Não tem mais nada para configurar.</Nota>
    </MolduraDaGaveta>
  )
}

/* ─── Formas novas (início, fim, intermediários, subprocesso…) ──────────────── */

export interface PatchDaForma { nome?: string; config?: Record<string, unknown> }

export function GavetaFormaNova({ forma, nome, workflowsAtivos, piscinasExternas, saidas, nomeDaPiscina, papeis, onPatch, onAbrirForma, ...moldura }: Moldura & {
  forma: FormaDesenho
  /** o nome mostrado (na tarefa de envio/recebimento é o da etapa) */
  nome: string
  /** workflows que o subprocesso pode chamar (ativos, sem este); null = carregando */
  workflowsAtivos: Array<WorkflowDaLista & { version?: number }> | null
  piscinasExternas: PiscinaExterna[]
  /** formas onde chegam as setas que saem (o "baseado em evento" lista os eventos) */
  saidas: Array<{ id: string; nome: string; tipo: string }>
  /** nome da piscina principal (o início simples manda configurar "quem inicia" nela) */
  nomeDaPiscina: string
  papeis: Papeis
  onPatch: (p: PatchDaForma) => void
  onAbrirForma: (id: string) => void
}): JSX.Element {
  const elemento = nomeDoElemento(forma)
  const chave = `${forma.tipo}:${varianteDe(forma) ?? ''}`
  const hoje = executaHoje(forma)
  const cfg = (patch: Record<string, unknown>) => onPatch({ config: patch })
  let n = 1
  const q = () => n++

  const campoNome = (titulo = 'Nome') => (
    <Pergunta id="forma-nome" n={q()} titulo={titulo} ok={!!nome.trim() || titulo === 'Nome (opcional)'}>
      <CampoTexto rotulo={`Nome: ${elemento}`} valor={nome} onMudar={(v) => onPatch({ nome: v })} />
    </Pergunta>
  )
  const opcoesPiscinas = piscinasExternas.map((p) => [p.id, `${p.nome || 'Participante sem nome'} (piscina)`] as const)
  const semPiscinas = <Nota>Ainda não há piscina de participante externo. Acrescente uma pela paleta (Piscina) para escolher aqui.</Nota>

  let corpo: ReactNode
  switch (chave) {
    case 'start:simples':
      corpo = <>{campoNome()}<Nota>Quem pode iniciar fica na <b className="font-semibold text-foreground">piscina</b>: dê duplo clique na faixa “{nomeDaPiscina || 'do workflow'}”.</Nota></>
      break
    case 'start:agendado': {
      const c = configLivre(forma.config, INICIO_AGENDADO_PADRAO)
      const papeisPessoa = papeis.active.filter((p) => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
      corpo = <>
        {campoNome()}
        <Pergunta id="ini-quando" n={q()} titulo="Iniciar automaticamente quando?" ok>
          <Opcoes rotulo="Quando iniciar" valor={c.quando as 'contrato' | 'mes' | 'uma'} onMudar={(quando) => cfg({ quando })} opcoes={[
            { v: 'contrato', titulo: 'Para cada contrato, perto de uma data', descricao: 'Ex.: 60 dias antes do vencimento abre um processo de renovação.' },
            { v: 'mes', titulo: 'Todo mês, num dia fixo' },
            { v: 'uma', titulo: 'Uma vez, numa data' },
          ]} />
        </Pergunta>
        <Pergunta id="ini-quem" n={q()} titulo="Quem fica como “quem iniciou”?" ok>
          <Escolher rotulo="Quem fica como quem iniciou" valor={papeisPessoa.some((p) => p.id === c.quemIniciou) ? c.quemIniciou : ''} placeholder="Escolha o papel"
            opcoes={papeisPessoa.map((p) => [p.id, p.label] as const)} onMudar={(quemIniciou) => cfg({ quemIniciou })} />
        </Pergunta>
      </>
      break
    }
    case 'start:evento': {
      const c = configLivre(forma.config, INICIO_EVENTO_PADRAO)
      corpo = <>
        {campoNome()}
        <Pergunta id="ini-evento" n={q()} titulo="Inicia quando…" ok>
          <Opcoes rotulo="Evento que inicia" valor={c.evento as 'criado' | 'situacao' | 'api'} onMudar={(evento) => cfg({ evento })} opcoes={[
            { v: 'criado', titulo: 'Um contrato é criado' },
            { v: 'situacao', titulo: 'Um contrato muda de situação' },
            { v: 'api', titulo: 'Um sistema externo chama a API' },
          ]} />
        </Pergunta>
      </>
      break
    }
    case 'userTask:envio': case 'intermediateEvent:envia': {
      const c = configLivre(forma.config, ENVIO_PADRAO)
      corpo = <>
        {campoNome('O que precisa ser feito?')}
        <Pergunta id="envio-para" n={q()} titulo="Para quem vai?" ok ajuda="O fluxo de mensagem tracejado aponta para essa piscina.">
          {opcoesPiscinas.length
            ? <Escolher rotulo="Para quem vai" valor={piscinasExternas.some((p) => p.id === c.para) ? c.para : ''} placeholder="Escolha a piscina" opcoes={opcoesPiscinas} onMudar={(para) => cfg({ para })} />
            : semPiscinas}
        </Pergunta>
        <Pergunta id="envio-canal" n={q()} titulo="Por onde?" ok>
          <Opcoes rotulo="Por onde enviar" valor={c.canal as 'portal' | 'email'} onMudar={(canal) => cfg({ canal })} opcoes={[
            { v: 'portal', titulo: 'Portal do fornecedor', descricao: 'Ele entra com o próprio acesso e responde por lá.' },
            { v: 'email', titulo: 'E-mail com link seguro', descricao: 'Sem login; o link vale por 7 dias.' },
          ]} />
        </Pergunta>
        <Pergunta id="envio-anexos" n={q()} titulo="O que vai junto?" ok>
          <div className="flex flex-col gap-2">
            <Marcar marcado={c.levaMinuta} onMudar={(levaMinuta) => cfg({ levaMinuta })}>Minuta do contrato (PDF)</Marcar>
            <Marcar marcado={c.levaMensagem} onMudar={(levaMensagem) => cfg({ levaMensagem })}>Mensagem padrão “Minuta para assinatura”</Marcar>
            <Marcar marcado={c.levaAnexos} onMudar={(levaAnexos) => cfg({ levaAnexos })}>Anexos da solicitação</Marcar>
          </div>
        </Pergunta>
      </>
      break
    }
    case 'userTask:recebimento': case 'intermediateEvent:recebe': {
      const c = configLivre(forma.config, RECEBIMENTO_PADRAO)
      corpo = <>
        {campoNome('O que precisa ser feito?')}
        <Pergunta id="receb-de" n={q()} titulo="De quem vem?" ok>
          {opcoesPiscinas.length
            ? <Escolher rotulo="De quem vem" valor={piscinasExternas.some((p) => p.id === c.de) ? c.de : ''} placeholder="Escolha a piscina" opcoes={opcoesPiscinas} onMudar={(de) => cfg({ de })} />
            : semPiscinas}
        </Pergunta>
        <Pergunta id="receb-quando" n={q()} titulo="O que conta como recebido?" ok>
          <Opcoes rotulo="O que conta como recebido" valor={c.recebido as 'assinatura' | 'portal' | 'email'} onMudar={(recebido) => cfg({ recebido })} opcoes={[
            { v: 'assinatura', titulo: 'Assinatura concluída no provedor', descricao: 'O provedor de assinatura avisa o Nxt.' },
            { v: 'portal', titulo: 'Resposta no portal', descricao: 'O fornecedor clica em “Responder” e anexa o documento.' },
            { v: 'email', titulo: 'Resposta ao e-mail com anexo' },
          ]} />
        </Pergunta>
        <Nota>Para dar um <b className="font-semibold text-foreground">prazo máximo</b>, coloque um losango <b className="font-semibold text-foreground">baseado em evento</b> antes: este recebimento de um lado, um temporizador do outro. O primeiro que acontecer vence.</Nota>
      </>
      break
    }
    case 'subProcess:chamada': {
      const c = configSubprocesso(forma.config)
      const escolhido = workflowsAtivos?.find((w) => w.id === c.processId)
      const opcoes = (workflowsAtivos ?? []).map((w) => [w.id, w.name] as const)
      corpo = <>
        {campoNome()}
        <Pergunta id="sub-wf" n={q()} titulo="Qual workflow chamar?" ok={!!c.processId} ajuda="Só aparecem workflows ativos.">
          {workflowsAtivos === null
            ? <p className="text-xs text-muted-foreground">Carregando os workflows ativos…</p>
            : opcoes.length
              ? <Escolher rotulo="Workflow chamado" valor={c.processId && escolhido ? c.processId : ''} placeholder="Escolha o workflow" opcoes={opcoes}
                  onMudar={(processId) => {
                    const w = workflowsAtivos.find((x) => x.id === processId)
                    cfg({ processId, ...(c.versao === 'fixa' ? { versaoFixa: w?.version } : {}) })
                  }} />
              : <Nota>Nenhum outro workflow ativo para chamar.</Nota>}
          {c.processId && !escolhido && workflowsAtivos !== null && (
            <p className="text-[11.5px] text-amber-800 dark:text-amber-300">O workflow escolhido antes não está mais ativo. Escolha outro.</p>
          )}
        </Pergunta>
        <Pergunta id="sub-versao" n={q()} titulo="Qual versão?" ok>
          <Opcoes rotulo="Qual versão" valor={c.versao} onMudar={(versao) => cfg({ versao, versaoFixa: versao === 'fixa' ? escolhido?.version : undefined })} opcoes={[
            { v: 'ativa', titulo: 'Sempre a versão ativa', descricao: 'Se publicarem uma versão nova, os próximos processos já usam.' },
            { v: 'fixa', titulo: `Fixar a versão atual${escolhido?.version ? ` (v${escolhido.version})` : ''}`, descricao: 'Muda só quando você trocar aqui.', disabled: !escolhido },
          ]} />
        </Pergunta>
        <Pergunta id="sub-junto" n={q()} titulo="O que vai junto?" ok ajuda="O subprocesso abre com esses dados preenchidos.">
          <Marcar marcado={c.levarContrato} onMudar={(levarContrato) => cfg({ levarContrato })}>O contrato do processo</Marcar>
          <div className="flex max-w-lg flex-col gap-1">
            <label htmlFor={`sub-campos-${forma.id}`} className="text-[length:var(--rotulo-fonte)] font-medium text-muted-foreground">Campos da solicitação (separe por vírgula)</label>
            <CampoTexto id={`sub-campos-${forma.id}`} rotulo="Campos que vão junto" valor={c.campos.join(', ')} placeholder="Ex.: Objeto, Valor estimado"
              onMudar={(v) => cfg({ campos: camposDoTexto(v) })} />
          </div>
        </Pergunta>
        <Pergunta id="sub-espera" n={q()} titulo="O processo espera o subprocesso terminar?" ok>
          <Opcoes rotulo="Esperar o subprocesso" valor={c.esperar ? 'sim' : 'nao'} onMudar={(v) => cfg({ esperar: v === 'sim' })} opcoes={[
            { v: 'sim', titulo: 'Sim, segue quando ele terminar', descricao: 'O normal: o resultado volta antes do próximo passo.' },
            { v: 'nao', titulo: 'Não, segue na hora', descricao: 'Os dois andam em paralelo.' },
          ]} />
        </Pergunta>
        <Nota>Se o subprocesso terminar com erro, este processo também encerra com erro, com o motivo que o subprocesso deu.</Nota>
      </>
      break
    }
    case 'subProcess:embutido':
      corpo = <>{campoNome()}<Nota>As etapas ficam <b className="font-semibold text-foreground">dentro</b> desta forma, no mesmo workflow.</Nota></>
      break
    case 'intermediateEvent:temporizador': {
      const c = configTemporizador(forma.config)
      corpo = <>
        {campoNome()}
        <Pergunta id="tempo-espera" n={q()} titulo="Esperar até quando?" ok>
          <Opcoes rotulo="Esperar até quando" valor={c.espera} onMudar={(espera) => cfg(espera === 'data'
            ? { espera, n: 30, campoData: 'vencimento', sentido: 'antes' }
            : { espera, n: 1, campoData: undefined, sentido: undefined })} opcoes={[
            { v: 'prazo', titulo: 'Um prazo a partir de agora' },
            { v: 'data', titulo: 'Uma data do contrato', descricao: 'Ex.: 30 dias antes do vencimento.' },
          ]} />
          {/* key: trocar a espera recomeça o número com o padrão dela */}
          <div key={c.espera} className="flex flex-wrap items-center gap-2">
            <CampoNumero rotulo={c.espera === 'prazo' ? 'Quanto esperar' : 'Quantos dias'} min={c.espera === 'prazo' ? 1 : 0} valor={c.n}
              onMudar={(v) => { if (v !== undefined) cfg({ n: v }) }} />
            {c.espera === 'prazo'
              ? <Escolher rotulo="Unidade do prazo" className="w-40" valor={c.unidade} onMudar={(unidade) => cfg({ unidade })}
                  opcoes={[['diasUteis', 'dias úteis'], ['diasCorridos', 'dias corridos'], ['horasUteis', 'horas úteis']]} />
              : <>
                  <Escolher rotulo="Antes ou depois" className="w-40" valor={c.sentido ?? 'antes'} onMudar={(sentido) => cfg({ sentido })}
                    opcoes={[['antes', 'dias antes de'], ['depois', 'dias depois de']]} />
                  <Escolher rotulo="Data do contrato" className="w-48" valor={c.campoData ?? 'vencimento'} onMudar={(campoData) => cfg({ campoData })}
                    opcoes={[['vencimento', 'Data de vencimento'], ['assinatura', 'Data de assinatura'], ['inicioVigencia', 'Início da vigência']]} />
                </>}
          </div>
        </Pergunta>
        <Pergunta id="tempo-calendario" n={q()} titulo="Qual calendário?" ok>
          <Nota>Calendário da organização: dias úteis e feriados.</Nota>
        </Pergunta>
      </>
      break
    }
    case 'eventGateway:':
      corpo = <>
        {campoNome()}
        <Pergunta id="evento-saidas" n={q()} titulo="O primeiro que acontecer vence" ok ajuda="Cada saída precisa levar a um evento: temporizador ou recebimento.">
          {saidas.length ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {saidas.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1"><b className="block truncate text-sm font-semibold">{s.nome}</b><small className="text-[11.5px] text-muted-foreground">{s.tipo}</small></span>
                  <Button variant="ghost" size="sm" onClick={() => onAbrirForma(s.id)}>Abrir</Button>
                </li>
              ))}
            </ul>
          ) : <Nota>Nenhuma seta sai daqui ainda. Arraste a bolinha até o próximo evento.</Nota>}
        </Pergunta>
      </>
      break
    case 'parallelGateway:':
      corpo = <>{campoNome('Nome (opcional)')}<Nota>Abre <b className="font-semibold text-foreground">todos</b> os caminhos ao mesmo tempo. Para juntar, use outro losango <b className="font-semibold text-foreground">+</b>: ele espera todos chegarem.</Nota></>
      break
    case 'end:simples':
      corpo = <>{campoNome()}<Nota>Encerra este caminho. Quando todos os caminhos terminam, o processo fica <b className="font-semibold text-foreground">Concluído</b>.</Nota></>
      break
    case 'end:erro': {
      const c = configFim(forma.config)
      corpo = <>
        {campoNome()}
        <Pergunta id="fim-motivo" n={q()} titulo="Motivo que aparece para as pessoas" ok={!!c.motivo?.trim()}>
          <CampoTexto rotulo="Motivo do erro" valor={c.motivo ?? ''} placeholder="Ex.: Documentação recusada pelo Jurídico" onMudar={(motivo) => cfg({ motivo })} />
        </Pergunta>
        <Pergunta id="fim-codigo" n={q()} titulo="Código (para relatórios e para o processo pai)" ok={!!c.codigo?.trim()}>
          <CampoTexto rotulo="Código do erro" valor={c.codigo ?? ''} placeholder="Ex.: DOC_RECUSADA" onMudar={(codigo) => cfg({ codigo })} />
        </Pergunta>
        <Nota>O processo fica <b className="font-semibold text-foreground">Encerrado com erro</b>. Se ele for subprocesso de outro, o pai também encerra com erro.</Nota>
      </>
      break
    }
    case 'end:cancela': {
      const c = configFim(forma.config)
      corpo = <>
        {campoNome()}
        <Pergunta id="fim-motivo" n={q()} titulo="Motivo do cancelamento" ok={!!c.motivo?.trim()}>
          <CampoTexto rotulo="Motivo do cancelamento" valor={c.motivo ?? ''} placeholder="Ex.: Fornecedor não respondeu no prazo" onMudar={(motivo) => cfg({ motivo })} />
          <Marcar marcado={c.avisarQuemIniciou ?? true} onMudar={(avisarQuemIniciou) => cfg({ avisarQuemIniciou })}>Avisar quem iniciou o processo</Marcar>
        </Pergunta>
        <Nota>O processo fica <b className="font-semibold text-foreground">Cancelado</b>, igual ao cancelamento manual de hoje, com este motivo no histórico.</Nota>
      </>
      break
    }
    case 'end:terminar':
      corpo = <>{campoNome()}<Nota>Encerra o processo <b className="font-semibold text-foreground">inteiro</b> na hora, mesmo com outros caminhos ainda abertos.</Nota></>
      break
    default:
      corpo = campoNome()
  }

  return (
    <MolduraDaGaveta rotulo={elemento} titulo={nome.trim() || elemento} etiqueta={hoje ? 'hoje' : 'proxima'} {...moldura}>
      {!hoje && <AvisoAindaNaoExecuta />}
      {corpo}
    </MolduraDaGaveta>
  )
}
