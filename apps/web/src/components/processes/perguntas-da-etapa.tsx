'use client'

import { Fragment, useState, useMemo, useRef, useEffect } from 'react'
import { Zap, Trash2, User, CircleDot, Loader2, UserSquare, AlertTriangle, ChevronUp, Plus, ChevronDown, Check, Info, Lock, Link2 } from 'lucide-react'
import type { StepFormSchema } from '@nxt/types'
import { CONNECTORS, findConnector, isRetiredConnector, isCompensable } from '@nxt/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, type EntityKind } from '@/components/ui/entity-select'
import type { ScreenSubject } from '@/lib/screen-types'
import { fieldValueKey } from '@/lib/screen-types'
import { REFERENCIA, ORIGEM, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { apiFetch } from '@/lib/http'
import { ExecutorDaVariavel } from './executor-da-variavel'
import { EXECUTOR_CONTRATO_DO_PROCESSO, EXECUTOR_QUEM_INICIOU } from '@nxt/types'
import { ATRIBUTO_GAVETA, GavetaLateral, ehEscDaGaveta } from './desenho-bpmn/gaveta'
import { cn } from '@/lib/utils'
import { STEP_TONE, dueText, entityKindLabel, type EEdge, type ENode, type Papeis, type Screens } from './editor-comum'


/** Ids de todos os nós que chegam a `alvo` andando o grafo para trás (predecessoras
 *  transitivas). Guarda de visitados porque o grafo pode ter ciclo. */
function predecessorasDe(edges: EEdge[], alvo: string): Set<string> {
  const preds = new Set<string>()
  const seen = new Set<string>()
  let frontier = edges.filter((e) => e.to === alvo).map((e) => e.from)
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id); preds.add(id)
      for (const e of edges.filter((x) => x.to === id)) next.push(e.from)
    }
    frontier = next
  }
  return preds
}

/**
 * Configuração da atividade: PERGUNTAS numa GAVETA lateral de 440 px (desenho BPMN,
 * 27/10/2026). Antes era um modal amplo por cima do editor; agora o desenho fica visível
 * ao lado enquanto se configura. Coluna única: o "Em resumo" no alto e as perguntas
 * embaixo, na ordem em que a pessoa pensa a etapa (o índice lateral saiu — não cabia;
 * a contagem do que falta segue no rodapé).
 *
 * Cancelar RESTAURA o estado de quando a gaveta abriu (snapshot em `original`): o editor
 * aplica cada mudança ao vivo no grafo, então sem isso "Cancelar" seria só um "Fechar"
 * mentiroso. Fechar pelo X e o Esc também cancelam; só "Aplicar" mantém.
 */
export function PerguntasDaEtapa({ node, nodes, edges, screens, papeis, resolveEntidade, onPatchStep, onChangeType, onRemove, onClose, secaoInicial, vinculo, somenteLeitura, focarAoAbrir, moldura = 'gaveta' }: {
  node: ENode; nodes: ENode[]; edges: EEdge[]; screens: Screens; papeis: Papeis
  /** nome da entidade fixa do executor, para a frase do "Em resumo" */
  resolveEntidade: (kind: string | undefined, id: string | undefined) => string | undefined
  /** a mesma configuração vale em vários lugares do fluxo (atividade vinculada) */
  vinculo?: { lugares: number; ehCopia: boolean; desvincular: () => void }
  onPatchStep: (patch: Partial<StepFormSchema>) => void; onChangeType: (t: 'userTask' | 'serviceTask') => void; onRemove: () => void
  onClose: () => void
  /** Pergunta em que a gaveta abre (ex.: 'formulario', vindo do aviso da escolha). */
  secaoInicial?: string
  /** Workflow antigo aberto só para leitura: só o "Em resumo" e as respostas, sem campos. */
  somenteLeitura?: boolean
  /** false = a gaveta abre sem tirar o foco da forma (ver GavetaLateral) */
  focarAoAbrir?: boolean
  /** 'gaveta' = painel lateral (Desenho); 'embutida' = dentro da lista do Roteiro, sem gaveta */
  moldura?: 'gaveta' | 'embutida'
}) {
  const step = node.step!
  const type = node.type as 'userTask' | 'serviceTask'
  const meta = type === 'serviceTask' ? { label: 'Ação automática', tone: STEP_TONE.serviceTask, Icon: Zap } : { label: 'Tarefa do usuário', tone: STEP_TONE.userTask, Icon: UserSquare }
  const entityWord = SUBJECT_ENTITY[step.screenSubject ?? ''] ?? 'entidade'

  // variáveis de etapas ANTERIORES (predecessoras topológicas simples)
  const availableVars = useMemo(() => {
    const preds = predecessorasDe(edges, node.id)
    const out: Array<{ name: string; label: string }> = []
    const s = new Set<string>()
    const add = (n: string, l: string) => { if (n && !s.has(n)) { s.add(n); out.push({ name: n, label: l }) } }
    for (const p of nodes.filter((n) => preds.has(n.id) && n.step)) {
      const st = p.step!
      const m = findConnector(st.connector)
      if (m) for (const o of m.outputs) add(o, `${o} · saída de ${m.label}`)
      if (st.screenRef && st.entityMode === 'CREATE' && st.screenSubject) add(st.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId', `criado em ${st.stepName || 'etapa'}`)
    }
    return out
  }, [edges, nodes, node.id])

  /* Destinos possíveis de DEVOLUÇÃO: predecessoras que são tarefa de usuário. Só elas —
     devolver para uma ação automática a reexecutaria, e o motor recusa. Note que aqui
     a lista é a do DESENHO; em execução o motor ainda pode bloquear um destino que
     esteja atrás de uma ação automática já rodada. A tela avisa isso abaixo. */
  const destinosDevolucao = useMemo(() => {
    const preds = predecessorasDe(edges, node.id)
    return nodes
      .filter((n) => preds.has(n.id) && n.type === 'userTask')
      .map((n) => ({ id: n.id, nome: n.step?.stepName || 'Etapa sem nome' }))
  }, [edges, nodes, node.id])

  const retorno = step.returnPolicy ?? { mode: 'ANY' as const }
  const setRetornoMode = (mode: 'ANY' | 'SELECTED' | 'NONE') =>
    onPatchStep({ returnPolicy: mode === 'ANY' ? undefined : { mode, nodeIds: mode === 'SELECTED' ? (retorno.nodeIds ?? []) : undefined } })
  const toggleDestino = (id: string) => {
    const atuais = new Set(retorno.nodeIds ?? [])
    if (atuais.has(id)) atuais.delete(id); else atuais.add(id)
    onPatchStep({ returnPolicy: { mode: 'SELECTED', nodeIds: [...atuais] } })
  }

  const entityScreens = screens.filter((s) => s.subjectType === 'CONTRATO' || s.subjectType === 'FORNECEDOR')
  const papeisPessoa = papeis.active.filter((p) => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
  const executor = step.executor
  const papelSel = executor?.papelId ? papeis.entries.find((p) => p.id === executor.papelId) : undefined
  const execOrigem = papelSel?.origem
  /** executor "Quem iniciou o processo" (PO, 04/10/2026) */
  const porIniciador = executor?.papelId === EXECUTOR_QUEM_INICIOU
  const pickPapel = (papelId: string) => {
    if (!papelId) return
    const p = papeis.entries.find((pp) => pp.id === papelId)
    onPatchStep({ executor: { papelId, entityType: p?.origem ?? 'CONTRATO', mode: 'FIXA', entityId: undefined, entityVar: undefined } })
  }
  const setExec = (patch: Partial<NonNullable<StepFormSchema['executor']>>) => executor && onPatchStep({ executor: { ...executor, ...patch } })
  /* Tela escolhida na atividade — a origem dos campos que esta etapa pode travar. */
  const telaSel = step.screenRef ? entityScreens.find((s) => s.id === step.screenRef) : undefined
  const travados = step.lockedFields ?? []
  /* Guarda a CHAVE do campo (fieldKey), não o id da linha: a chave é a mesma em todas as
     telas do tipo, então a etapa continua valendo se a tela for trocada por outra do mesmo
     subject — e o que já estava gravado bate, porque a chave nasceu igual ao id antigo. */
  const toggleTravado = (chave: string) =>
    onPatchStep({ lockedFields: travados.includes(chave) ? travados.filter((x) => x !== chave) : [...travados, chave] })

  const pickScreen = (id: string) => {
    if (!id || id === 'none') { onPatchStep({ screenRef: undefined, screenSubject: undefined, entityMode: undefined, entityVar: undefined, lockedFields: undefined, extraScreens: undefined }); return }
    const sc = entityScreens.find((s) => s.id === id)
    /* Trocar de tela DENTRO do mesmo tipo preserva os travados e as abas adicionais: eles
       valem para o tipo, não para aquela tela. Só mudar de subject invalida as listas. */
    const mesmoTipo = sc?.subjectType && telaSel?.subjectType && sc.subjectType === telaSel.subjectType
    const extrasMantidas = (step.extraScreens ?? []).filter((e) => e.screenRef !== id)
    onPatchStep({
      screenRef: id, screenSubject: sc?.subjectType as ScreenSubject as 'CONTRATO' | 'FORNECEDOR' | undefined, entityMode: step.entityMode ?? 'CREATE',
      lockedFields: mesmoTipo ? step.lockedFields : undefined,
      extraScreens: mesmoTipo && extrasMantidas.length ? extrasMantidas : undefined,
    })
  }

  /* Telas ADICIONAIS: o mesmo registro em outras abas na execução. Só telas do mesmo tipo
     da principal; tela somente consulta nasce (e fica) como "Consultar". */
  type ExtraScreen = NonNullable<StepFormSchema['extraScreens']>[number]
  const extras = step.extraScreens ?? []
  const telasDoTipo = telaSel ? entityScreens.filter((s) => s.subjectType === telaSel.subjectType && s.id !== telaSel.id) : []
  const usadas = new Set(extras.map((e) => e.screenRef))
  const livres = telasDoTipo.filter((s) => !usadas.has(s.id))
  const atividadeSoConsulta = (step.entityMode ?? 'CREATE') === 'VIEW'
  const gravarExtras = (lista: ExtraScreen[]) => onPatchStep({ extraScreens: lista.length ? lista : undefined })
  const addExtra = () => { const t = livres[0]; if (t) gravarExtras([...extras, { screenRef: t.id, mode: t.readOnly ? 'VIEW' : 'EDIT' }]) }
  const setExtra = (i: number, patch: Partial<ExtraScreen>) => gravarExtras(extras.map((e, j) => {
    if (j !== i) return e
    const novo = { ...e, ...patch }
    return entityScreens.find((s) => s.id === novo.screenRef)?.readOnly ? { ...novo, mode: 'VIEW' as const } : novo
  }))
  const moverExtra = (i: number, d: -1 | 1) => { const l = [...extras]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); gravarExtras(l) }
  const removerExtra = (i: number) => gravarExtras(extras.filter((_, j) => j !== i))

  /* Campos que a atividade pode travar: os de TODAS as telas que editam (principal +
     abas "Editar"), cada campo listado uma vez — a trava é por chave do tipo. */
  const telasQueEditam = [telaSel, ...extras.filter((e) => e.mode === 'EDIT').map((e) => entityScreens.find((s) => s.id === e.screenRef))]
    .filter((t): t is NonNullable<typeof telaSel> => !!t && !t.readOnly)
  const chavesListadas = new Set<string>()
  const camposPorTela = telasQueEditam.map((tela) => ({
    tela,
    secoes: [...tela.sections].sort((a, b) => a.order - b.order).map((sec2) => {
      const fs = tela.fields
        .filter((f) => f.sectionId === sec2.id && f.visible !== false && !chavesListadas.has(fieldValueKey(f)))
        .sort((a, b) => a.order - b.order)
      fs.forEach((f) => chavesListadas.add(fieldValueKey(f)))
      return { sec2, fs }
    }).filter((x) => x.fs.length > 0),
  })).filter((x) => x.secoes.length > 0)

  // Prazo ÚNICO + unidade (dias/horas/minutos úteis): guarda em apenas UM dos três
  // campos slaBusiness* (os outros ficam undefined) — "de acordo com a unidade, um só campo".
  const slaUnit: 'DAYS' | 'HOURS' | 'MINUTES' = step.slaBusinessDays != null ? 'DAYS' : step.slaBusinessHours != null ? 'HOURS' : step.slaBusinessMinutes != null ? 'MINUTES' : 'DAYS'
  const slaValue = step.slaBusinessDays ?? step.slaBusinessHours ?? step.slaBusinessMinutes ?? ''
  const setSla = (unit: 'DAYS' | 'HOURS' | 'MINUTES', value: string | number) => {
    const v = value === '' ? undefined : Math.max(0, Number(value))
    onPatchStep({
      slaBusinessDays: unit === 'DAYS' ? v : undefined,
      slaBusinessHours: unit === 'HOURS' ? v : undefined,
      slaBusinessMinutes: unit === 'MINUTES' ? v : undefined,
    })
  }

  /* ── Snapshot para o Cancelar ──────────────────────────────────────────────
     Guardado uma única vez, na abertura. Restaurar precisa da UNIÃO das chaves:
     um campo criado durante a edição (entityVar, por exemplo) não existe no
     snapshot, e um merge simples o deixaria para trás. */
  const original = useRef<{ step: StepFormSchema; type: 'userTask' | 'serviceTask' }>({ step: { ...step }, type })
  const corpoRef = useRef<HTMLDivElement>(null)

  const cancelar = () => {
    const antes = original.current
    const restauro: Record<string, unknown> = {}
    for (const k of new Set([...Object.keys(antes.step), ...Object.keys(step)])) {
      restauro[k] = (antes.step as unknown as Record<string, unknown>)[k]
    }
    if (antes.type !== node.type) onChangeType(antes.type)
    onPatchStep(restauro as Partial<StepFormSchema>)
    onClose()
  }

  /* Esc fecha cancelando — mas só o Esc DENTRO da gaveta e sem uma camada (lista, balão,
     diálogo) aberta por cima: essa fecha sozinha. Fora disso, nem para a propagação. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (ehEscDaGaveta(e)) { e.stopPropagation(); cancelar() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /* ── Perguntas ─────────────────────────────────────────────────────────────
     A configuração deixou de ser um formulário em seções (Identificação, Quem executa…)
     e virou PERGUNTAS em português, numa coluna só, na ordem em que a pessoa pensa a
     etapa (mockup "Configurar a etapa por perguntas", PO 27/10/2026). No alto, o
     "Em resumo" escreve a etapa numa frase — quem configura confere o que entendeu
     sem precisar ler campo por campo. */
  const faltaNome = !step.stepName?.trim()
  const faltaQuem = type === 'userTask' && !porIniciador && (
    !executor?.papelId
    || (!!execOrigem && execOrigem !== ORIGEM.ORG && (executor.mode === 'FIXA' ? !executor.entityId : !(executor.stakeholder || executor.entityVar)))
  )
  const faltaPrazo = type === 'userTask' && !dueText(step)
  const faltaDevolucao = type === 'userTask' && retorno.mode === 'SELECTED' && !(retorno.nodeIds ?? []).length
  const perguntas = type === 'userTask'
    ? [
        { id: 'identificacao', titulo: 'O que precisa ser feito?',          ok: !faltaNome },
        { id: 'executor',      titulo: 'Quem faz?',                         ok: !faltaQuem },
        { id: 'formulario',    titulo: 'O que a pessoa vê e preenche?',     ok: true },
        { id: 'prazo',         titulo: 'Em quanto tempo?',                  ok: !faltaPrazo },
        { id: 'devolucao',     titulo: 'Se precisar, pode devolver para…',  ok: !faltaDevolucao },
      ]
    : [
        { id: 'identificacao', titulo: 'O que precisa ser feito?', ok: !faltaNome },
        { id: 'acao',          titulo: 'O que o sistema faz?',     ok: !!step.connector },
      ]
  const pendentes = perguntas.filter((p) => !p.ok).length
  const nPergunta = (id: string) => perguntas.findIndex((p) => p.id === id) + 1

  const [mostrarInstrucoes, setMostrarInstrucoes] = useState(!!step.instructions?.trim())
  const [maisDaTela, setMaisDaTela] = useState(extras.length > 0 || travados.length > 0)

  /* "Quem recebe hoje": só quando a resposta não depende do processo (papel global ou
     entidade fixa). undefined = procurando; null = depende do processo / não se aplica. */
  const [pessoasHoje, setPessoasHoje] = useState<string[] | null | undefined>(null)
  const exPapel = executor?.papelId, exTipo = executor?.entityType, exModo = executor?.mode, exEntidade = executor?.entityId
  useEffect(() => {
    if (type !== 'userTask' || !exPapel || exPapel === EXECUTOR_QUEM_INICIOU || exModo === 'VARIAVEL' || (exTipo !== ORIGEM.ORG && !exEntidade)) {
      setPessoasHoje(null); return
    }
    let vivo = true
    setPessoasHoje(undefined)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/instances/executor-pessoas', {
          method: 'POST', body: JSON.stringify({ executor: { papelId: exPapel, entityType: exTipo, mode: exModo, entityId: exEntidade } }),
        })
        const corpo = res.ok ? await res.json() as { pessoas: string[] | null } : null
        if (vivo) setPessoasHoje(corpo?.pessoas ?? null)
      } catch { if (vivo) setPessoasHoje(null) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [type, exPapel, exTipo, exModo, exEntidade])

  /* No Roteiro não há título de gaveta para receber o foco: vai para o primeiro campo. */
  useEffect(() => {
    if (moldura !== 'embutida' || focarAoAbrir === false) return
    corpoRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- só na abertura

  /* Abre já na pergunta pedida (ex.: 'formulario', vindo do aviso da escolha). Rola SÓ o
     corpo da gaveta: `scrollIntoView` rolaria também os contêineres `overflow-hidden` do
     editor e deslocaria o desenho. */
  useEffect(() => {
    if (!secaoInicial) return
    const alvo = document.getElementById(`pergunta-${secaoInicial}`)
    // na gaveta rola o corpo dela; no Roteiro, a coluna da lista
    const caixa = moldura === 'embutida' ? corpoRef.current?.closest<HTMLElement>('[data-rolagem-roteiro]') : corpoRef.current?.parentElement
    if (!alvo || !caixa) return
    caixa.scrollTop += alvo.getBoundingClientRect().top - caixa.getBoundingClientRect().top - 12
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── A frase do "Em resumo" ── */
  const quem = porIniciador ? 'Quem iniciou o processo' : papelSel ? (() => {
    if (!executor || !execOrigem || execOrigem === ORIGEM.ORG) return papelSel.label
    if (executor.mode === 'FIXA') {
      const nome = resolveEntidade(executor.entityType, executor.entityId)
      return nome ? `${papelSel.label} de ${nome}` : papelSel.label
    }
    if (executor.stakeholder === EXECUTOR_CONTRATO_DO_PROCESSO) return `${papelSel.label} do contrato do processo`
    if (executor.stakeholder) {
      const parte = papeis.entries.find((p) => p.id === executor.stakeholder)?.label
      return `${papelSel.label} da parte “${parte ?? 'escolhida'}” do contrato`
    }
    return papelSel.label
  })() : null
  const due = dueText(step)
  const nomesDevolucao = (retorno.nodeIds ?? []).map((id) => destinosDevolucao.find((d) => d.id === id)?.nome).filter((x): x is string => !!x)
  const frase = type === 'userTask' ? (
    <>
      {quem ? <ResumoForte>{quem}</ResumoForte> : <ResumoFalta>alguém (falta escolher quem)</ResumoFalta>}
      {' recebe “'}<ResumoForte>{step.stepName?.trim() || 'esta tarefa'}</ResumoForte>{'”'}
      {telaSel
        ? <>, {VERBO_DO_MODO[step.entityMode ?? 'CREATE']} o {entityWord} na tela <ResumoForte>{telaSel.name}</ResumoForte></>
        : ', sem tela: só conclui ou devolve'}
      {due ? <> e tem <ResumoForte>{due}</ResumoForte> para concluir.</> : <> e <ResumoFalta>ainda não tem prazo</ResumoFalta>.</>}
      {' '}
      {retorno.mode === 'NONE' ? 'Não pode devolver o processo.'
        : retorno.mode === 'SELECTED'
          ? (nomesDevolucao.length
              ? <>Se precisar, pode devolver para <ResumoForte>{listaPt(nomesDevolucao)}</ResumoForte>.</>
              : <ResumoFalta>Falta marcar para onde pode devolver.</ResumoFalta>)
          : 'Se precisar, pode devolver para qualquer etapa anterior.'}
    </>
  ) : (
    <>
      {'O sistema faz sozinho: '}
      {step.connector
        ? <ResumoForte>{findConnector(step.connector)?.label ?? step.connector}</ResumoForte>
        : <ResumoFalta>falta escolher a ação</ResumoFalta>}.
      {step.connector && <> {FRASE_RETORNO[step.onReturn ?? 'BLOCK']}</>}
    </>
  )

  if (somenteLeitura) {
    const respostas: Array<{ rotulo: string; valor: string }> = type === 'userTask'
      ? [
          { rotulo: 'Quem faz', valor: quem ?? '— sem executor' },
          { rotulo: 'Tela', valor: telaSel ? `${ENTITY_MODE_LABEL[step.entityMode ?? 'CREATE']} ${entityWord} · ${telaSel.name}` : '— sem tela' },
          { rotulo: 'Prazo', valor: due ?? '— sem prazo' },
          { rotulo: 'Devolução', valor: retorno.mode === 'NONE' ? 'Não devolve'
            : retorno.mode === 'SELECTED' ? (nomesDevolucao.length ? listaPt(nomesDevolucao) : '— nenhuma etapa marcada')
              : 'Qualquer etapa anterior' },
        ]
      : [
          { rotulo: 'Ação', valor: findConnector(step.connector)?.label ?? step.connector ?? '— nenhuma' },
          { rotulo: 'Se devolvido', valor: FRASE_RETORNO[step.onReturn ?? 'BLOCK'] },
        ]
    return (
      <GavetaLateral rotulo={`${meta.label} · só leitura`} rotuloTom={meta.tone} rotuloIcone={<meta.Icon className="h-3 w-3" />}
        titulo={step.stepName?.trim() || 'Etapa sem nome'} onFechar={onClose}>
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="rounded-xl bg-[#0C1410] p-4 text-[#C9D6CE] shadow-[0_18px_40px_-24px_rgba(12,20,16,0.7)] ring-1 ring-white/5">
            <span className="inline-block rounded bg-[#C6F24E] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-[#0C1410]">EM RESUMO</span>
            <p className="mt-2 text-[13px] leading-relaxed">{frase}</p>
          </div>
          <dl className="divide-y rounded-lg border bg-muted/20">
            {respostas.map((r) => (
              <div key={r.rotulo} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-xs text-muted-foreground">{r.rotulo}</dt>
                <dd className="min-w-0 text-right text-xs font-medium">{r.valor}</dd>
              </div>
            ))}
          </dl>
          {step.instructions?.trim() && (
            <div>
              <p className="text-xs font-semibold">Instruções para quem executa</p>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{step.instructions}</p>
            </div>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">Workflow do editor antigo: aberto só para leitura.</p>
        </div>
      </GavetaLateral>
    )
  }

  const rodape = (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {pendentes > 0
          ? <span className="font-semibold text-amber-800 dark:text-amber-300">Falta responder {pendentes} pergunta{pendentes > 1 ? 's' : ''}</span>
          : <span className="inline-flex items-center gap-1 font-semibold text-primary"><Check className="h-3.5 w-3.5" />Tudo respondido</span>}
        {' · '}As alterações entram no workflow ao <span className="font-medium">Salvar rascunho</span> ou <span className="font-medium">Ativar</span>.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remover atividade"
          className="mr-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />Remover
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelar}>Cancelar</Button>
        <Button size="sm" onClick={onClose}>Aplicar</Button>
      </div>
    </div>
  )

  const corpo = (
      <div ref={corpoRef} className="flex flex-col">
        {vinculo && (
          <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              Configuração <span className="font-semibold">compartilhada em {vinculo.lugares} lugares</span> do fluxo — o que você mudar aqui vale para todos.
            </span>
            {vinculo.ehCopia && (
              <button type="button" onClick={vinculo.desvincular}
                className="shrink-0 rounded-md border bg-card px-2 py-1 text-[11.5px] font-semibold hover:bg-muted">Tornar independente</button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-7 px-4 py-4">
          <div className="rounded-xl bg-[#0C1410] p-4 text-[#C9D6CE] shadow-[0_18px_40px_-24px_rgba(12,20,16,0.7)] ring-1 ring-white/5">
            <span className="inline-block rounded bg-[#C6F24E] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-[#0C1410]">EM RESUMO</span>
            <p className="mt-2 text-[13px] leading-relaxed" aria-live="polite">{frase}</p>
          </div>

          <Pergunta id="identificacao" n={nPergunta('identificacao')} titulo="O que precisa ser feito?" ok={!faltaNome}
            ajuda="É o nome que aparece no fluxo e na caixa de tarefas de quem executa.">
            <Input className={cn(CAMPO, 'max-w-lg')} aria-label="Nome da etapa" value={step.stepName}
              placeholder={type === 'serviceTask' ? 'Ex.: Cadastrar o contrato' : 'Ex.: Analisar os dados cadastrais'}
              onChange={(e) => onPatchStep({ stepName: e.target.value })} />
            <div role="radiogroup" aria-label="Quem realiza esta etapa" className="grid gap-2 sm:grid-cols-2">
              <Opcao ativo={type === 'userTask'} onClick={() => onChangeType('userTask')} icone={<UserSquare className="h-4 w-4" />}
                titulo="Uma pessoa" descricao="A tarefa cai na caixa de alguém, que preenche, analisa ou aprova." />
              <Opcao ativo={type === 'serviceTask'} onClick={() => onChangeType('serviceTask')} icone={<Zap className="h-4 w-4" />}
                titulo="O sistema, sozinho" descricao="Uma ação automática, sem ninguém precisar clicar." />
            </div>
            {type === 'userTask' && (mostrarInstrucoes ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="cfg-instrucoes" className="text-[length:var(--rotulo-fonte)] font-medium text-muted-foreground">Instruções para quem executa</label>
                <Textarea id="cfg-instrucoes" className="min-h-[80px] text-[length:var(--campo-fonte)]"
                  placeholder="Ex.: confira se as certidões estão em dia antes de aprovar."
                  value={step.instructions ?? ''} onChange={(e) => onPatchStep({ instructions: e.target.value })} />
              </div>
            ) : (
              <button type="button" onClick={() => setMostrarInstrucoes(true)}
                className="inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline">
                <Plus className="h-3 w-3" />Escrever instruções para quem executa
              </button>
            ))}
          </Pergunta>

          {type === 'userTask' && (
            <Pergunta id="executor" n={nPergunta('executor')} titulo="Quem faz?" ok={!faltaQuem}
              ajuda="A tarefa vai para quem ocupar o papel na hora em que ela nascer.">
              <div role="radiogroup" aria-label="Quem recebe a tarefa" className="grid gap-2 sm:grid-cols-2">
                <Opcao ativo={!porIniciador} onClick={() => { if (porIniciador) onPatchStep({ executor: undefined }) }}
                  icone={<User className="h-4 w-4" />} titulo="Quem ocupa um papel" descricao="Ex.: o Analista da Central de Contratos." />
                <Opcao ativo={porIniciador} onClick={() => onPatchStep({ executor: { papelId: EXECUTOR_QUEM_INICIOU, entityType: 'ORG', mode: 'FIXA' } })}
                  icone={<CircleDot className="h-4 w-4" />} titulo="Quem iniciou o processo" descricao="A pessoa que clicou em “+ Novo processo”." />
              </div>
              {porIniciador ? (
                <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                  Na primeira etapa, a tarefa abre na hora, como aba; mais adiante, cai na caixa de tarefas dessa pessoa.
                  Se ela estiver inativa quando a tarefa nascer, vai para os administradores, com aviso.
                </p>
              ) : (<>
                <div className="flex max-w-sm flex-col gap-1">
                  <label htmlFor="cfg-papel" className="text-[length:var(--rotulo-fonte)] font-medium text-muted-foreground">Papel</label>
                  <Select value={executor?.papelId ?? ''} onValueChange={pickPapel}>
                    <SelectTrigger id="cfg-papel" className={CAMPO}><SelectValue placeholder="Escolha o papel" /></SelectTrigger>
                    <SelectContent>
                      {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {papeisPessoa.length === 0 && (
                    <p className="text-[11px] leading-snug text-muted-foreground">Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).</p>
                  )}
                </div>
                {executor && execOrigem && execOrigem !== ORIGEM.ORG && (() => {
                  const tipo = entityKindLabel(execOrigem)
                  const masc = execOrigem === ORIGEM.PARCEIRO || execOrigem === 'CONTRATO'
                  return (<>
                    <p className="text-[13px] font-semibold">{papelSel?.label ?? 'O papel'} de qual {tipo}?</p>
                    <div role="radiogroup" aria-label={`De qual ${tipo}`} className="grid gap-2 sm:grid-cols-2">
                      <Opcao ativo={executor.mode === 'FIXA'} onClick={() => setExec({ mode: 'FIXA' })}
                        titulo={`Sempre ${masc ? 'o mesmo' : 'a mesma'}`} descricao={`Você escolhe agora qual ${tipo}.`} />
                      <Opcao ativo={executor.mode === 'VARIAVEL'} onClick={() => setExec({ mode: 'VARIAVEL' })}
                        titulo={execOrigem === ORIGEM.PARCEIRO ? 'Depende do processo' : 'A do contrato do processo'}
                        descricao="Muda conforme o contrato que passa pelo processo." />
                    </div>
                    <div className="max-w-lg">
                      {executor.mode === 'FIXA' ? (
                        <EntitySelect entityType={execOrigem as EntityKind} value={executor.entityId}
                          onChange={(id) => setExec({ entityId: id, entityVar: undefined, stakeholder: undefined })}
                          placeholder={`Escolha ${masc ? 'o' : 'a'} ${tipo}…`} />
                      ) : (
                        <ExecutorDaVariavel executor={executor} papelLabel={papelSel?.label ?? 'o papel'} papeis={papeis.entries}
                          variaveisTecnicas={availableVars} onChange={setExec} />
                      )}
                    </div>
                  </>)
                })()}
                <PessoasHoje pessoas={pessoasHoje} />
              </>)}
            </Pergunta>
          )}

          {type === 'userTask' && (
            <Pergunta id="formulario" n={nPergunta('formulario')} titulo="O que a pessoa vê e preenche?" ok
              ajuda="Opcional. Sem tela, a pessoa só conclui ou devolve — bom para aprovações e ciência.">
              <Select value={step.screenRef || 'none'} onValueChange={pickScreen}>
                <SelectTrigger aria-label="Tela" className={cn(CAMPO, 'max-w-lg')}><SelectValue placeholder="Sem tela" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem tela — só concluir ou devolver</SelectItem>
                  {entityScreens.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{SUBJECT_LABEL[s.subjectType] ?? s.subjectType} · {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {step.screenRef && (<>
                <p className="text-[13px] font-semibold">E o que faz com o {entityWord}?</p>
                <div role="radiogroup" aria-label={`O que a atividade faz com o ${entityWord}`} className="grid gap-2">
                  {(['CREATE', 'EDIT', 'VIEW'] as const).map((m) => (
                    <Opcao key={m} ativo={(step.entityMode ?? 'CREATE') === m}
                      onClick={() => onPatchStep({ entityMode: m, entityVar: undefined, ...(m === 'CREATE' ? { lockedFields: undefined } : {}) })}
                      titulo={`${ENTITY_MODE_LABEL[m]} ${entityWord}`} descricao={ENTITY_MODE_CURTO[m]} />
                  ))}
                </div>
              </>)}
              {telaSel && (
                <div className="rounded-lg border bg-muted/20">
                  <button type="button" aria-expanded={maisDaTela} onClick={() => setMaisDaTela((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-muted/40">
                    <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !maisDaTela && '-rotate-90')} />
                    Mais opções da tela
                    <span className="truncate font-normal text-muted-foreground">
                      · {extras.length ? `${extras.length} aba${extras.length > 1 ? 's' : ''} a mais` : 'outras abas'}
                      {step.entityMode === 'EDIT' ? `, ${travados.length} campo${travados.length === 1 ? '' : 's'} travado${travados.length === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                  {maisDaTela && (
                    <div className="flex flex-col gap-4 border-t px-3 py-3">
                      <GField label={`Telas adicionais (o mesmo ${entityWord})`} wide
                        hint={`Na execução, cada tela vira uma aba depois da principal, mostrando o mesmo ${entityWord}. Serve para separar o que esta etapa altera do que ela só consulta.${(step.entityMode ?? 'CREATE') === 'CREATE' ? ` As abas adicionais liberam depois que o ${entityWord} for salvo na principal.` : ''}${atividadeSoConsulta ? ' Nesta atividade de consulta, todas abrem em leitura.' : ''}`}>
                        <div className="space-y-1.5">
                          {extras.map((e, i) => {
                            const opcoes = telasDoTipo.filter((s) => s.id === e.screenRef || !usadas.has(s.id))
                            const telaDaAba = entityScreens.find((s) => s.id === e.screenRef)
                            const modoEfetivo = atividadeSoConsulta || telaDaAba?.readOnly ? 'VIEW' : e.mode
                            return (
                              <div key={`${e.screenRef}-${i}`} className="flex items-center gap-1.5">
                                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 2}.</span>
                                <Select value={e.screenRef} onValueChange={(v) => setExtra(i, { screenRef: v })}>
                                  <SelectTrigger className={cn(CAMPO, 'min-w-0 flex-1')}><SelectValue placeholder="Tela removida" /></SelectTrigger>
                                  <SelectContent>
                                    {opcoes.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}{s.readOnly ? ' · somente consulta' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <div className="flex shrink-0 overflow-hidden rounded-md border text-xs" role="group" aria-label="O que esta aba faz">
                                  {(['EDIT', 'VIEW'] as const).map((m) => (
                                    <button key={m} type="button" aria-pressed={modoEfetivo === m}
                                      disabled={atividadeSoConsulta || (m === 'EDIT' && !!telaDaAba?.readOnly)}
                                      title={m === 'EDIT' && telaDaAba?.readOnly ? 'Esta tela é somente consulta' : undefined}
                                      onClick={() => setExtra(i, { mode: m })}
                                      className={cn('px-2 py-1.5 transition-colors disabled:cursor-not-allowed',
                                        modoEfetivo === m ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent')}>
                                      {m === 'EDIT' ? 'Editar' : 'Consultar'}
                                    </button>
                                  ))}
                                </div>
                                <button type="button" title="Mostrar esta aba antes" aria-label="Subir aba" disabled={i === 0} onClick={() => moverExtra(i, -1)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="Mostrar esta aba depois" aria-label="Descer aba" disabled={i === extras.length - 1} onClick={() => moverExtra(i, 1)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="Remover esta tela" aria-label="Remover tela adicional" onClick={() => removerExtra(i)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )
                          })}
                          <button type="button" disabled={livres.length === 0} onClick={addExtra}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                            <Plus className="h-3 w-3" />{livres.length === 0 ? `Não há outra tela de ${entityWord} para adicionar` : 'Adicionar tela'}
                          </button>
                        </div>
                      </GField>

                      {/* A atividade APERTA a trava da tela — só na etapa que EDITA. Ao CRIAR
                          vale a configuração da própria tela; na CONSULTA tudo já está travado. */}
                      {step.entityMode === 'EDIT' && (
                        <GField label="Campos travados nesta etapa" wide
                          hint={camposPorTela.length === 0
                            ? 'As telas que esta atividade edita são SOMENTE CONSULTA: todos os campos já estão travados nelas.'
                            : `A trava da tela vale sempre; aqui você aperta mais. O que marcar não poderá ser alterado NESTA etapa — em outras, continua editável.${camposPorTela.length > 1 ? ' Vale para todas as abas desta atividade.' : ''}`}>
                          {camposPorTela.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Nada a marcar: a tela <b className="font-semibold text-foreground">{telaSel.name}</b> está em somente consulta.
                            </p>
                          ) : (
                            <div className="max-h-64 divide-y overflow-y-auto rounded-md border bg-card">
                              {camposPorTela.map(({ tela, secoes }) => (
                                <Fragment key={tela.id}>
                                  {camposPorTela.length > 1 && <p className="bg-muted/40 px-2.5 py-1 text-[11px] font-semibold">{tela.name}</p>}
                                  {secoes.map(({ sec2, fs }) => (
                                    <div key={sec2.id} className="p-1.5">
                                      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        {sec2.label}{sec2.locked && <span className="ml-1.5 normal-case tracking-normal text-amber-600 dark:text-amber-400">· somente consulta</span>}
                                      </p>
                                      <div className="grid grid-cols-2 gap-x-2">
                                        {fs.map((f) => {
                                          // já travado pela TELA (campo ou seção inteira): a atividade não afrouxa
                                          const naTela = !!f.locked || !!sec2.locked
                                          const marcado = naTela || travados.includes(fieldValueKey(f))
                                          return (
                                            <label key={f.id} title={naTela ? 'Travado na tela — a atividade não pode liberar' : undefined}
                                              className={cn('flex items-center gap-1.5 rounded px-1 py-0.5 text-xs',
                                                naTela ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer hover:bg-muted')}>
                                              <input type="checkbox" checked={marcado} disabled={naTela}
                                                onChange={() => toggleTravado(fieldValueKey(f))}
                                                className="h-3.5 w-3.5 shrink-0 accent-primary disabled:opacity-60" />
                                              <span className="truncate">{f.label}</span>
                                              {naTela && <Lock className="h-2.5 w-2.5 shrink-0" />}
                                            </label>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </Fragment>
                              ))}
                            </div>
                          )}
                        </GField>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Pergunta>
          )}

          {type === 'userTask' && (
            <Pergunta id="prazo" n={nPergunta('prazo')} titulo="Em quanto tempo?" ok={!faltaPrazo}
              ajuda="Conta só o expediente: pula fins de semana e feriados.">
              <div className="flex flex-wrap items-center gap-2">
                <Input className={cn(CAMPO, 'w-20 text-center font-mono')} type="number" min={0} placeholder="0" aria-label="Prazo"
                  value={slaValue} onChange={(e) => setSla(slaUnit, e.target.value)} />
                <Select value={slaUnit} onValueChange={(u) => setSla(u as 'DAYS' | 'HOURS' | 'MINUTES', slaValue)}>
                  <SelectTrigger aria-label="Unidade do prazo" className={cn(CAMPO, 'w-40')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAYS">dias úteis</SelectItem>
                    <SelectItem value="HOURS">horas úteis</SelectItem>
                    <SelectItem value="MINUTES">minutos úteis</SelectItem>
                  </SelectContent>
                </Select>
                <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
                {ATALHOS_PRAZO.map((a) => {
                  const on = slaUnit === a.unidade && Number(slaValue) === a.valor
                  return (
                    <button key={a.rotulo} type="button" aria-pressed={on} onClick={() => setSla(a.unidade, a.valor)}
                      className={cn('h-[var(--campo-altura)] rounded-full border px-3 text-xs font-semibold transition-colors',
                        on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      {a.rotulo}
                    </button>
                  )
                })}
              </div>
            </Pergunta>
          )}

          {type === 'userTask' && (
            <Pergunta id="devolucao" n={nPergunta('devolucao')} titulo="Se precisar, pode devolver para…" ok={!faltaDevolucao}
              ajuda="Para onde quem executa pode mandar o processo de volta, com o botão Retroceder.">
              <div role="radiogroup" aria-label="Para onde pode devolver" className="grid gap-2">
                <Opcao ativo={retorno.mode === 'ANY'} onClick={() => setRetornoMode('ANY')}
                  titulo="Qualquer etapa anterior" descricao="O padrão: a pessoa escolhe para onde." />
                <Opcao ativo={retorno.mode === 'SELECTED'} onClick={() => setRetornoMode('SELECTED')}
                  titulo="Só para algumas" descricao="Você marca as etapas permitidas." />
                <Opcao ativo={retorno.mode === 'NONE'} onClick={() => setRetornoMode('NONE')}
                  titulo="Não pode devolver" descricao="O botão Retroceder não aparece." />
              </div>
              {retorno.mode === 'SELECTED' && (destinosDevolucao.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-[11.5px] text-muted-foreground">
                  Nada a marcar: não há tarefa de pessoa antes desta no fluxo.
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {destinosDevolucao.map((d) => {
                    const marcado = (retorno.nodeIds ?? []).includes(d.id)
                    return (
                      <button key={d.id} type="button" role="checkbox" aria-checked={marcado} onClick={() => toggleDestino(d.id)}
                        className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors',
                          marcado ? 'border-primary bg-primary/5 font-medium' : 'text-muted-foreground hover:bg-muted')}>
                        <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border', marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {marcado && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate">{d.nome}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {/* Dizer isto AQUI evita a conclusão errada de que a marcação garante o
                  destino — o bloqueio por ação automática continua valendo por cima. */}
              {retorno.mode !== 'NONE' && (
                <p className="flex gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  Uma etapa permitida ainda pode ficar bloqueada se estiver antes de uma ação automática já executada — quem decide o que é seguro refazer é o sistema.
                </p>
              )}
            </Pergunta>
          )}

          {type === 'serviceTask' && (
            <Pergunta id="acao" n={nPergunta('acao')} titulo="O que o sistema faz?" ok={!!step.connector}
              ajuda="O sistema executa esta ação sozinho e grava o registro de verdade.">
              <Select value={step.connector || 'none'} onValueChange={(v) => onPatchStep({ connector: v && v !== 'none' ? v : undefined })}>
                <SelectTrigger aria-label="Ação automática" className={cn(CAMPO, 'max-w-lg')}><SelectValue placeholder="Escolha a ação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (só passa)</SelectItem>
                  {CONNECTORS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  {/* Conector aposentado só aparece quando ESTE passo já o usa: some da
                      vitrine para desenhos novos sem sumir da tela de quem já o escolheu. */}
                  {isRetiredConnector(step.connector) && (
                    <SelectItem value={step.connector as string}>{findConnector(step.connector)?.label}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {isRetiredConnector(step.connector) && (
                <p className="max-w-xl text-[11.5px] leading-snug text-amber-700 dark:text-amber-400">
                  Esta ação foi aposentada: criar {step.connector === 'contracts.create' ? 'contrato' : 'parceiro'} agora
                  se faz por uma <span className="font-medium">tela</span> numa tarefa de pessoa, que valida e mostra o
                  cadastro inteiro. O processo continua funcionando; troque quando for revisá-lo.
                </p>
              )}
              {step.connector && (() => {
                const compensable = isCompensable(step.connector)
                return (<>
                  <p className="text-[13px] font-semibold">E se alguém devolver o processo para antes daqui?</p>
                  <div role="radiogroup" aria-label="Se o processo for devolvido para trás daqui" className={cn('grid gap-2', compensable ? 'grid-cols-1' : 'sm:grid-cols-2')}>
                    <Opcao ativo={(step.onReturn ?? 'BLOCK') === 'BLOCK'} onClick={() => onPatchStep({ onReturn: 'BLOCK' })}
                      titulo="Não deixar devolver" descricao={compensable ? 'O padrão, e o mais seguro.' : 'Esta ação não tem como ser desfeita.'} />
                    <Opcao ativo={step.onReturn === 'IDEMPOTENT'} onClick={() => onPatchStep({ onReturn: 'IDEMPOTENT' })}
                      titulo="Deixar e refazer" descricao="Refazer a ação não causa dano." />
                    {compensable && (
                      <Opcao ativo={step.onReturn === 'COMPENSATE'} onClick={() => onPatchStep({ onReturn: 'COMPENSATE' })}
                        titulo="Deixar e desfazer" descricao="Ao voltar, a ação é desfeita." />
                    )}
                  </div>
                </>)
              })()}
            </Pergunta>
          )}
        </div>
      </div>
  )

  /* Dentro da lista do Roteiro: sem gaveta (a linha já mostra o nome e o tipo). O atributo
     da gaveta mantém o Esc (cancela) e faz o editor ignorar atalhos vindos daqui. */
  if (moldura === 'embutida') {
    return (
      <div {...{ [ATRIBUTO_GAVETA]: '' }} tabIndex={-1} className="flex flex-col outline-none">
        {corpo}
        <div className="border-t bg-muted/20 px-4 py-3">{rodape}</div>
      </div>
    )
  }

  return (
    <GavetaLateral rotulo={meta.label} rotuloTom={meta.tone} rotuloIcone={<meta.Icon className="h-3 w-3" />} rotuloFechar="Fechar sem aplicar"
      titulo={step.stepName?.trim() || 'Etapa sem nome'} onFechar={cancelar} rodape={rodape} focarAoAbrir={focarAoAbrir}>
      {corpo}
    </GavetaLateral>
  )
}

/* ─── Peças das perguntas da etapa ────────────────────────────────────────── */

/** Altura e letra dos campos seguem a DENSIDADE escolhida pelo usuário (lib/densidade). */
const CAMPO = 'h-[var(--campo-altura)] text-[length:var(--campo-fonte)]'

const VERBO_DO_MODO: Record<string, string> = { CREATE: 'cadastra', EDIT: 'altera', VIEW: 'consulta' }
const ENTITY_MODE_CURTO: Record<string, string> = {
  CREATE: 'Cadastra um novo, do zero.',
  EDIT: 'Altera o que uma etapa anterior criou.',
  VIEW: 'Só lê, sem alterar nada. Para análise e ciência.',
}
const FRASE_RETORNO: Record<string, string> = {
  BLOCK: 'Se alguém devolver o processo para antes daqui, a devolução fica bloqueada.',
  IDEMPOTENT: 'Se alguém devolver o processo para antes daqui, ela é refeita.',
  COMPENSATE: 'Se alguém devolver o processo para antes daqui, ela é desfeita.',
}
const ATALHOS_PRAZO: Array<{ rotulo: string; unidade: 'DAYS' | 'HOURS'; valor: number }> = [
  { rotulo: '4 horas', unidade: 'HOURS', valor: 4 },
  { rotulo: '1 dia', unidade: 'DAYS', valor: 1 },
  { rotulo: '2 dias', unidade: 'DAYS', valor: 2 },
  { rotulo: '5 dias', unidade: 'DAYS', valor: 5 },
]
const listaPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

function ResumoForte({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-white">{children}</b>
}
/** O que ainda falta, dito DENTRO da frase: quem lê o resumo vê o buraco no lugar dele. */
function ResumoFalta({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[#F5B971] underline decoration-dotted underline-offset-2">{children}</span>
}

function NumeroPergunta({ n, ok, pequeno }: { n: number; ok: boolean; pequeno?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-mono font-bold',
      pequeno ? 'h-5 w-5 text-[10.5px]' : 'h-6 w-6 text-[11px]',
      ok ? 'bg-primary text-primary-foreground' : 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/50 dark:text-amber-300')}
      aria-label={ok ? `Pergunta ${n}, respondida` : `Pergunta ${n}, falta responder`}>
      {ok ? <Check className={pequeno ? 'h-3 w-3' : 'h-3.5 w-3.5'} /> : n}
    </span>
  )
}

/** Uma pergunta do modal: número (vira ✓ quando respondida), a pergunta, uma linha de ajuda. */
function Pergunta({ id, n, titulo, ajuda, ok, children }: {
  id: string; n: number; titulo: string; ajuda?: string; ok: boolean; children: React.ReactNode
}) {
  return (
    <section id={`pergunta-${id}`} aria-labelledby={`pergunta-${id}-titulo`} className="flex scroll-mt-4 flex-col gap-[var(--form-gap)]">
      <div className="flex items-start gap-3">
        <NumeroPergunta n={n} ok={ok} />
        <div className="min-w-0">
          <h3 id={`pergunta-${id}-titulo`} className="text-[15px] font-bold leading-snug">{titulo}</h3>
          {ajuda && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{ajuda}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-[var(--form-gap)] pl-9">{children}</div>
    </section>
  )
}

/** Resposta em CARTÃO (rádio): título + uma linha que explica a consequência. */
function Opcao({ ativo, onClick, titulo, descricao, icone, disabled }: {
  ativo: boolean; onClick: () => void; titulo: string; descricao?: string; icone?: React.ReactNode; disabled?: boolean
}) {
  return (
    <button type="button" role="radio" aria-checked={ativo} disabled={disabled} onClick={onClick}
      className={cn('flex min-w-0 items-start gap-2.5 rounded-lg border bg-card px-3 py-[var(--secao-pad)] text-left transition-colors',
        ativo ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-foreground/25 hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-50')}>
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        ativo ? 'border-primary bg-primary' : 'border-muted-foreground/50')} aria-hidden>
        {ativo && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[length:var(--campo-fonte)] font-semibold">
          {icone && <span className={cn('shrink-0', ativo ? 'text-primary' : 'text-muted-foreground')}>{icone}</span>}{titulo}
        </span>
        {descricao && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{descricao}</span>}
      </span>
    </button>
  )
}

/** "Quem recebe hoje": a consequência do papel escolhido, em nomes de gente. */
function PessoasHoje({ pessoas }: { pessoas: string[] | null | undefined }) {
  if (pessoas === null) return null
  if (pessoas === undefined) return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Vendo quem recebe esta tarefa hoje…</p>
  )
  if (pessoas.length === 0) return (
    <p className="flex max-w-xl items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs leading-snug text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      Hoje ninguém ocupa este papel. Atribua alguém em Estrutura organizacional antes de ativar.
    </p>
  )
  const mostra = pessoas.slice(0, 4)
  const resto = pessoas.length - mostra.length
  return (
    <p className="flex max-w-xl items-start gap-1.5 rounded-md bg-primary/[0.07] px-2.5 py-2 text-xs leading-snug">
      <User className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
      <span>
        Hoje {pessoas.length === 1 ? 'recebe' : 'recebem'} esta tarefa: <b className="font-semibold">{listaPt(resto > 0 ? [...mostra, `mais ${resto}`] : mostra)}</b>.
      </span>
    </p>
  )
}

/** Rótulos e explicações do que a atividade faz com a entidade. VIEW é a etapa de
 *  análise: mostra o cadastro inteiro, não deixa alterar nada. */
const ENTITY_MODE_LABEL: Record<string, string> = { CREATE: 'Criar', EDIT: 'Editar', VIEW: 'Consultar' }

const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }

/** Campo em GRID: `wide` ocupa a linha inteira (título, texto longo, seletor comprido);
 *  os curtos ficam pareados. Mesma hierarquia dos formulários do sistema. */
function GField({ label, required, hint, wide, children }: { label: string; required?: boolean; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <label className="text-xs font-medium mb-1.5 flex items-center gap-1">{label}{required && <span className="text-destructive">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  )
}
