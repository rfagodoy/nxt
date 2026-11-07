'use client'

/* ─── Gavetas novas do desenho (editor estilo Bizagi, spec §3) ─────────────────
   Raia, fase, piscina principal, piscina externa, fluxo de mensagem e as formas que não são
   etapa nem escolha (início, fim, ao mesmo tempo solto — e o que sobrou de desenhos gravados com
   itens que o motor não executa: só o nome, mais o aviso). Mesma regra da gaveta da etapa:
   o que se muda aqui vale AO VIVO no desenho; Cancelar, o X e o Esc voltam ao estado da
   abertura (a página guarda o retrato); Aplicar — ou clicar noutra coisa, Salvar, Ativar —
   mantém. O que um item removido tinha gravado em `forma.config` fica como está: a gaveta não o
   edita nem o apaga. Todas no padrão das seções (gaveta-padrao): chip colorido do tipo, o resumo no
   cabeçalho quando há o que resumir, seções em sanfona e o rodapé dizendo o que falta. O elemento que o motor
   não executa mostra a nota fixa `AVISO_NAO_EXECUTA`. */
import type { JSX, ReactNode } from 'react'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, Clock, Columns3, Compass, Info, Mail, PanelLeft, PlayCircle, Radio, Rows3, SquareDashed, Tag, User, Users } from 'lucide-react'
import type { FaseDesenho, FluxoMensagem, FormaDesenho, PiscinaExterna, QuemInicia, SetaDesenho, StepFormSchema } from '@nxt/types'
import { executaHoje, varianteDe } from '@nxt/workflow-core'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, type EntityKind } from '@/components/ui/entity-select'
import { ORIGEM, REFERENCIA, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { itemDaForma, nomeDoElemento } from '@/lib/editor-bizagi/gavetas'
import {
  resumoDaFase, resumoDaMensagem, resumoDaPiscinaExterna, resumoDaRaia, resumoDaSeta, resumoDoFim, resumoDoInicio, resumoDoParaleloSolto, type Trecho,
} from '@/lib/editor-bizagi/resumos'
import type { Orientacao } from '@/lib/editor-bizagi/geometria'
import { cn } from '@/lib/utils'
import { ExecutorDaVariavel } from '../executor-da-variavel'
import { QuemIniciaPill } from '../quem-inicia'
import { entityKindLabel, type Papeis } from '../editor-comum'
import { GavetaLateral } from './gaveta'
import { CaminhoAutomatico } from './painel-da-seta'
import {
  CAMPO, CampoEscolha, CORPO_DA_GAVETA, FraseDoResumo, Pergunta, ROTULO, RodapePadrao, TOM_DO_TIPO, contadorDePendencias, useEscCancela,
  type TomDoTipo,
} from './gaveta-padrao'
import { IconeDoItem } from './paleta'

type Executor = NonNullable<StepFormSchema['executor']>

/** O que toda gaveta nova recebe da página: fechar desfazendo, fechar mantendo e o foco. */
interface Moldura {
  onCancelar: () => void
  onAplicar: () => void
  /** false = abre sem tirar o foco da forma (aberta pelo duplo clique/Enter no desenho) */
  focarAoAbrir?: boolean
}

export const AVISO_NAO_EXECUTA = 'Este elemento não executa. Para ativar o workflow, troque-o por outro ou remova-o.'

function MolduraDaGaveta({ rotulo, titulo, tom, icone, resumo, pendentes, faltam, onCancelar, onAplicar, focarAoAbrir, remover, children }: Moldura & {
  rotulo: string; titulo: string; children: ReactNode
  /** cor e ícone do chip do tipo, no cabeçalho */
  tom: TomDoTipo; icone: ReactNode
  /** a frase do resumo, no cabeçalho */
  resumo?: Trecho[]
  /** seções incompletas (a linha do rodapé) */
  pendentes: number
  /** como o rodapé nomeia o que falta ("nome") */
  faltam?: string[]
  /** botão de remover no rodapé, à esquerda (como o "Remover" da etapa) */
  remover?: { nomeAcessivel: string; aoRemover: () => void }
}): JSX.Element {
  useEscCancela(onCancelar)
  return (
    <GavetaLateral rotulo={rotulo} rotuloTom={TOM_DO_TIPO[tom]} rotuloIcone={icone} titulo={titulo} rotuloFechar="Fechar sem aplicar" onFechar={onCancelar}
      focarAoAbrir={focarAoAbrir} resumo={resumo && <FraseDoResumo trechos={resumo} />}
      rodape={<RodapePadrao pendentes={pendentes} faltam={faltam ?? ['nome']} onCancelar={onCancelar} onAplicar={onAplicar}
        remover={remover && { rotulo: 'Remover', nomeAcessivel: remover.nomeAcessivel, aoRemover: remover.aoRemover }} />}>
      <div className={CORPO_DA_GAVETA}>
        {children}
      </div>
    </GavetaLateral>
  )
}

const ICONE = 'h-3 w-3'

/* ─── peças ─────────────────────────────────────────────────────────────────── */

function Nota({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{children}</span>
    </p>
  )
}

function AvisoNaoExecuta(): JSX.Element {
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{AVISO_NAO_EXECUTA}</span>
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
    ? <Textarea id={id} aria-label={rotulo} className="min-h-[80px] text-[length:var(--campo-fonte)]" value={texto} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />
    : <Input id={id} aria-label={rotulo} className={CAMPO} value={texto} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />
}

/** Rótulo em cima do campo (padrão dos cadastros) e, embaixo, uma linha de ajuda. */
function Rotulado({ rotulo, id, ajuda, children }: { rotulo: string; id: string; ajuda?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={ROTULO}>{rotulo}</label>
      {children}
      {ajuda && <p className="text-[11px] leading-snug text-muted-foreground">{ajuda}</p>}
    </div>
  )
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
      <div className="flex flex-col gap-1">
        <label htmlFor="raia-papel" className={ROTULO}>Papel</label>
        <Select value={executor?.papelId ?? SEM_PADRAO} onValueChange={escolher}>
          <SelectTrigger id="raia-papel" className={CAMPO}><SelectValue placeholder="Escolha o papel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_PADRAO}>— sem executor padrão —</SelectItem>
            {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {papeisPessoa.length === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).</p>
      )}
      {executor && origem && origem !== ORIGEM.ORG && (<>
        <CampoEscolha rotulo={`${papelSel?.label ?? 'O papel'} de qual ${tipo}`} valor={executor.mode} onMudar={(mode) => setExec({ mode })} opcoes={[
          { v: 'FIXA', titulo: `Sempre ${masc ? 'o mesmo' : 'a mesma'}`, descricao: `Você escolhe agora qual ${tipo}.` },
          { v: 'VARIAVEL', titulo: origem === ORIGEM.PARCEIRO ? 'Depende do processo' : 'A do contrato do processo',
            descricao: 'Muda conforme o contrato que passa pelo processo.' },
        ]} />
        <div>
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
  const papel = raia.executor?.papelId ? papeis.entries.find((p) => p.id === raia.executor?.papelId)?.label : undefined
  return (
    <MolduraDaGaveta rotulo="Raia" titulo={raia.nome || 'Raia sem nome'} tom="estrutura" icone={<Rows3 className={ICONE} />}
      resumo={resumoDaRaia({ papel, total, usamOPadrao })} pendentes={raia.nome.trim() ? 0 : 1} {...moldura}>
      <Pergunta id="raia-nome" titulo="Identificação" ok={!!raia.nome.trim()} icone={<Tag />} valor={raia.nome}>
        <Rotulado rotulo="Nome da raia" id="raia-nome-campo"><CampoTexto id="raia-nome-campo" rotulo="Nome da raia" valor={raia.nome} onMudar={(v) => onPatch({ nome: v })} /></Rotulado>
      </Pergunta>
      <Pergunta id="raia-executor" titulo="Quem faz as tarefas" ok icone={<User />} valor={papel ?? 'Sem executor padrão'}
        ajuda="É o padrão. Cada tarefa pode escolher outro executor no “Quem faz” dela.">
        <ExecutorDaRaia executor={raia.executor} papeis={papeis} onMudar={(e) => onPatch({ executor: e })} />
      </Pergunta>
    </MolduraDaGaveta>
  )
}

/* ─── Fase ──────────────────────────────────────────────────────────────────── */

export function GavetaFase({ fase, formasNaFase, onPatch, onRemover, ...moldura }: Moldura & {
  fase: FaseDesenho
  formasNaFase: number
  /** `prazoDiasUteis: undefined` (com a chave) tira o prazo */
  onPatch: (p: { nome?: string; prazoDiasUteis?: number | undefined }) => void
  /** tira a fase do desenho (as formas ficam onde estão) e fecha a gaveta */
  onRemover: () => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Fase" titulo={fase.nome || 'Fase sem nome'} tom="estrutura" icone={<Columns3 className={ICONE} />}
      resumo={resumoDaFase({ formas: formasNaFase, prazoDiasUteis: fase.prazoDiasUteis })} pendentes={fase.nome.trim() ? 0 : 1}
      remover={{ nomeAcessivel: 'Remover fase', aoRemover: onRemover }} {...moldura}>
      <Pergunta id="fase-nome" titulo="Identificação" ok={!!fase.nome.trim()} icone={<Tag />} valor={fase.nome}>
        <Rotulado rotulo="Nome da fase" id="fase-nome-campo"><CampoTexto id="fase-nome-campo" rotulo="Nome da fase" valor={fase.nome} onMudar={(v) => onPatch({ nome: v })} /></Rotulado>
      </Pergunta>
      <Pergunta id="fase-prazo" titulo="Prazo (opcional)" ok icone={<Clock />} valor={fase.prazoDiasUteis ? `${fase.prazoDiasUteis} dias úteis` : 'Sem prazo'}
        ajuda="Por enquanto é só informativo.">
        <div className="flex items-center gap-2">
          <CampoNumero rotulo="Prazo da fase em dias úteis" min={1} valor={fase.prazoDiasUteis} onMudar={(n) => onPatch({ prazoDiasUteis: n })} />
          <span className="text-xs text-muted-foreground">dias úteis</span>
        </div>
      </Pergunta>
    </MolduraDaGaveta>
  )
}

/* ─── Piscina principal (o workflow) ────────────────────────────────────────── */

export function GavetaPiscinaPrincipal({ nome, descricao, quemInicia, papeis, kind, tipos, orientacao, onNome, onKind, onDescricao, onQuemInicia, onOrientacao, ...moldura }: Moldura & {
  nome: string; descricao: string; quemInicia: QuemInicia | undefined; papeis: Papeis; kind: string; orientacao: Orientacao
  /** os tipos aceitos (Contrato, Aditivo, Encerramento): é aqui que o tipo se escolhe desde que
   *  o topo ficou mínimo (opção C, PO 07/11/2026) */
  tipos: ReadonlyArray<{ value: string; label: string }>
  onNome: (v: string) => void; onKind: (v: string) => void; onDescricao: (v: string) => void; onQuemInicia: (v: QuemInicia | undefined) => void; onOrientacao: (o: Orientacao) => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Piscina principal · o workflow" titulo={nome.trim() || 'Workflow sem nome'} tom="estrutura" icone={<PanelLeft className={ICONE} />}
      pendentes={nome.trim() ? 0 : 1} {...moldura}>
      <Pergunta id="wf-nome" titulo="Identificação" ok={!!nome.trim()} icone={<Tag />} valor={nome}>
        <Rotulado rotulo="Nome do workflow" id="wf-nome-campo"><CampoTexto id="wf-nome-campo" rotulo="Nome do workflow" valor={nome} placeholder="Dê um nome a este workflow" onMudar={onNome} /></Rotulado>
        <CampoEscolha rotulo="Tipo" valor={kind} onMudar={onKind} ajuda="Define onde o workflow aparece em “Novo processo”."
          opcoes={tipos.map((t) => ({ v: t.value, titulo: t.label }))} />
        <Rotulado rotulo="Descrição" id="wf-descricao-campo" ajuda="O objetivo do workflow, para quem for gerenciá-lo depois.">
          <CampoTexto id="wf-descricao-campo" rotulo="Descrição do workflow" multilinha valor={descricao} onMudar={onDescricao} />
        </Rotulado>
      </Pergunta>
      <Pergunta id="wf-quem-inicia" titulo="Quem pode iniciar" ok icone={<Users />} ajuda="Quem vê este workflow em “+ Novo processo”. Administrador sempre pode.">
        <div><QuemIniciaPill value={quemInicia} onChange={onQuemInicia} papeis={papeis.entries} kind={kind} /></div>
      </Pergunta>
      <Pergunta id="wf-orientacao" titulo="Desenho" ok icone={<Compass />} valor={orientacao === 'vertical' ? 'Vertical' : 'Horizontal'}>
        <CampoEscolha rotulo="Orientação" valor={orientacao} onMudar={onOrientacao} opcoes={[
          { v: 'horizontal', titulo: 'Horizontal', descricao: 'Raias deitadas, o fluxo anda para a direita.' },
          { v: 'vertical', titulo: 'Vertical', descricao: 'Raias em pé, o fluxo desce.' },
        ]} />
      </Pergunta>
    </MolduraDaGaveta>
  )
}

/* ─── Piscina externa ───────────────────────────────────────────────────────── */

export function GavetaPiscinaExterna({ piscina, onPatch, onRemover, ...moldura }: Moldura & {
  piscina: PiscinaExterna
  onPatch: (p: Partial<Omit<PiscinaExterna, 'id'>>) => void
  /** tira a piscina e os fluxos de mensagem dela e fecha a gaveta */
  onRemover: () => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Piscina de participante externo" titulo={piscina.nome || 'Participante sem nome'} tom="estrutura" icone={<SquareDashed className={ICONE} />}
      resumo={resumoDaPiscinaExterna(piscina)} pendentes={piscina.nome.trim() ? 0 : 1}
      remover={{ nomeAcessivel: 'Remover piscina', aoRemover: onRemover }} {...moldura}>
      <Pergunta id="ext-nome" titulo="Participante" ok={!!piscina.nome.trim()} icone={<User />} valor={piscina.nome}>
        <Rotulado rotulo="Nome" id="ext-nome-campo"><CampoTexto id="ext-nome-campo" rotulo="Nome do participante externo" valor={piscina.nome} onMudar={(v) => onPatch({ nome: v })} /></Rotulado>
        <CampoEscolha rotulo="Quem é" valor={piscina.quem} onMudar={(quem) => onPatch({ quem })} opcoes={[
          { v: 'contratada', titulo: 'A contratada do contrato do processo', descricao: 'Muda a cada processo, conforme o contrato.' },
          { v: 'fixo', titulo: 'Um fornecedor fixo' },
          { v: 'orgao', titulo: 'Um órgão ou sistema externo' },
        ]} />
      </Pergunta>
      <Pergunta id="ext-canal" titulo="Como interage" ok icone={<Radio />} valor={piscina.canal === 'email' ? 'E-mail com link seguro' : 'Portal do fornecedor'}>
        <CampoEscolha rotulo="Canal" valor={piscina.canal} onMudar={(canal) => onPatch({ canal })} opcoes={[
          { v: 'portal', titulo: 'Portal do fornecedor' },
          { v: 'email', titulo: 'E-mail com link seguro' },
        ]} />
      </Pergunta>
      <Nota>Caixa-preta: o Nxt não desenha nem controla as etapas dele, só as mensagens que vão e voltam.</Nota>
    </MolduraDaGaveta>
  )
}

/* ─── Fluxo de mensagem ─────────────────────────────────────────────────────── */

export function GavetaMensagem({ fluxo, de, para, onPatch, onRemover, onCaminhoAutomatico, ...moldura }: Moldura & {
  fluxo: FluxoMensagem
  /** nomes das pontas (forma ou piscina) */
  de: string; para: string
  onPatch: (p: { rotulo: string }) => void
  /** tira as pontas livres (volta ao traçado automático) */
  onCaminhoAutomatico?: () => void
  /** apaga o fluxo de mensagem e fecha a gaveta */
  onRemover: () => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Fluxo de mensagem" titulo={fluxo.rotulo || `${de} → ${para}`} tom="ligacao" icone={<Mail className={ICONE} />}
      resumo={resumoDaMensagem({ rotulo: fluxo.rotulo, de, para })} pendentes={fluxo.rotulo ? 0 : 1} faltam={['o que é enviado']}
      remover={{ nomeAcessivel: 'Remover fluxo de mensagem', aoRemover: onRemover }} {...moldura}>
      <Pergunta id="msg-rotulo" titulo="Mensagem" ok={!!fluxo.rotulo} icone={<Mail />} valor={fluxo.rotulo}>
        <Rotulado rotulo="O que é enviado" id="msg-rotulo-campo"><CampoTexto id="msg-rotulo-campo" rotulo="O que é enviado" valor={fluxo.rotulo ?? ''} placeholder="Ex.: Minuta para assinatura" onMudar={(v) => onPatch({ rotulo: v })} /></Rotulado>
      </Pergunta>
      <Nota>O canal e os anexos ficam na forma que envia ou recebe.</Nota>
      {onCaminhoAutomatico && <CaminhoAutomatico ajustado={!!(fluxo.saida || fluxo.entrada)} onRestaurar={onCaminhoAutomatico} />}
    </MolduraDaGaveta>
  )
}

/* ─── Seta de sequência (fora de Escolha) ───────────────────────────────────── */

export function GavetaSeta({ seta, de, para, onPatch, onCaminhoAutomatico, ...moldura }: Moldura & {
  seta: SetaDesenho
  /** nomes das formas nas pontas */
  de: string; para: string
  onPatch: (p: { rotulo: string }) => void
  /** tira as pontas livres (volta ao traçado automático) */
  onCaminhoAutomatico?: () => void
}): JSX.Element {
  return (
    <MolduraDaGaveta rotulo="Seta de sequência" titulo={seta.rotulo || `${de} → ${para}`} tom="ligacao" icone={<ArrowRight className={ICONE} />}
      resumo={resumoDaSeta({ de, para })} pendentes={0} {...moldura}>
      <Pergunta id="seta-rotulo" titulo="Rótulo (opcional)" ok icone={<Tag />} valor={seta.rotulo || 'Sem rótulo'}>
        <Rotulado rotulo="Rótulo na seta" id="seta-rotulo-campo" ajuda="Aparece ao lado da seta, no desenho.">
          <CampoTexto id="seta-rotulo-campo" rotulo="Rótulo na seta" valor={seta.rotulo ?? ''} onMudar={(v) => onPatch({ rotulo: v })} />
        </Rotulado>
      </Pergunta>
      {onCaminhoAutomatico && <CaminhoAutomatico ajustado={!!(seta.saida || seta.entrada)} onRestaurar={onCaminhoAutomatico} />}
    </MolduraDaGaveta>
  )
}

/* ─── Formas novas (início, fim, intermediários, subprocesso…) ──────────────── */

/** A gaveta só muda o nome; a configuração gravada na forma não passa por ela. */
export interface PatchDaForma { nome?: string }

/** Cor do chip da forma: eventos verdes, fins "fortes" rosa, subprocesso e envio/recebimento
 *  azuis, losangos como na paleta. */
function tomDaForma(f: FormaDesenho): TomDoTipo {
  switch (f.tipo) {
    case 'start': case 'intermediateEvent': return 'evento'
    case 'end': return (varianteDe(f) ?? 'simples') === 'simples' ? 'evento' : 'fimForte'
    case 'subProcess': case 'userTask': case 'serviceTask': return 'subprocesso'
    case 'eventGateway': case 'exclusiveGateway': return 'escolha'
    case 'parallelGateway': return 'paralelo'
    default: return 'ligacao'
  }
}

export function GavetaFormaNova({ forma, nome, nomeDaPiscina, onPatch, onRemover, ...moldura }: Moldura & {
  forma: FormaDesenho
  /** o nome mostrado (na tarefa de envio/recebimento é o da etapa) */
  nome: string
  /** nome da piscina principal (o início simples manda configurar "quem inicia" nela) */
  nomeDaPiscina: string
  onPatch: (p: PatchDaForma) => void
  /** tira a forma do desenho; ausente quando ela não pode sair (o único Início, o último Fim) */
  onRemover?: () => void
}): JSX.Element {
  const elemento = nomeDoElemento(forma)
  const item = itemDaForma(forma)
  const pend = contadorDePendencias()
  let resumo: Trecho[] | undefined
  const chave = `${forma.tipo}:${varianteDe(forma) ?? ''}`

  const campoNome = (titulo = 'Nome') => (
    <Pergunta id="forma-nome" titulo="Identificação" ok={pend.ok(!!nome.trim() || titulo === 'Nome (opcional)')} icone={<PlayCircle />} valor={nome}>
      <Rotulado rotulo={titulo} id="forma-nome-campo"><CampoTexto id="forma-nome-campo" rotulo={`Nome: ${elemento}`} valor={nome} onMudar={(v) => onPatch({ nome: v })} /></Rotulado>
    </Pergunta>
  )
  let corpo: ReactNode
  switch (chave) {
    case 'start:simples':
      resumo = resumoDoInicio()
      corpo = <>{campoNome()}<Nota>Quem pode iniciar fica na <b className="font-semibold text-foreground">piscina</b>: dê duplo clique na faixa “{nomeDaPiscina || 'do workflow'}”.</Nota></>
      break
    case 'parallelGateway:':
      resumo = resumoDoParaleloSolto()
      corpo = <>{campoNome('Nome (opcional)')}<Nota>O losango <b className="font-semibold text-foreground">+</b> que junta espera todos os caminhos chegarem.</Nota></>
      break
    case 'end:simples':
      resumo = resumoDoFim()
      corpo = campoNome()
      break
    default:
      corpo = campoNome()
  }

  return (
    <MolduraDaGaveta rotulo={elemento} titulo={nome.trim() || elemento} tom={tomDaForma(forma)}
      icone={item ? <IconeDoItem item={item} tamanho={14} /> : undefined} resumo={resumo} pendentes={pend.total()}
      remover={onRemover && { nomeAcessivel: `Remover ${elemento.toLowerCase()}`, aoRemover: onRemover }} {...moldura}>
      {!executaHoje(forma) && <AvisoNaoExecuta />}
      {corpo}
    </MolduraDaGaveta>
  )
}
