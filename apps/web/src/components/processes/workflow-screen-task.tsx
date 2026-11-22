'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle, Check, ChevronDown, Eye, Pencil } from 'lucide-react'
import { getScreen } from '@/hooks/use-screens'
import { apiJson } from '@/lib/http'
import { telasDaTarefa } from '@nxt/screens-core'
import { cn } from '@/lib/utils'
import type { Screen } from '@/lib/screen-types'
import type { StepFormSchema } from '@nxt/types'
import type { CampoFaltante } from '@/lib/campos-obrigatorios'
import { destinosDoCampo, type GrafoDaInstancia } from '@/lib/destino-do-campo'
import { DestinosDosCamposProvider } from '@/components/screens/screen-renderer'
import ContractNewForm from '@/components/contracts/contract-new-form'
import PartnerNewForm from '@/components/partners/partner-new-form'
import { ContractDetailView, SIT_CLS, SIT_LABEL, SIT_DOT_CLS, type ContratoNaTarefa, type EstadoDaGravacao } from '@/components/contracts/contract-detail-view'
import { PartnerDetailView } from '@/components/partners/partner-detail-view'
import { effectiveSituacao } from '@/lib/contract-options'

type ContractRow = Parameters<typeof ContractDetailView>[0]['row']
type PartnerRow = Parameters<typeof PartnerDetailView>[0]['partner']

/** Grava tudo o que estiver pendente nas telas; `true` = nada ficou para trás. */
export type GravarTelas = () => Promise<boolean>

/**
 * Runtime de uma atividade cujo formulário são TELAS (Personalização de Telas), sobre o
 * Contrato/Parceiro REAL do processo — reportando o id ao pai via `onEntity`.
 *
 * TELAS EMPILHADAS (PO, 22/11/2026): as telas da atividade aparecem uma embaixo da outra, na
 * ordem configurada no editor, cada uma aberta ou fechada; as de consulta têm aparência de
 * leitura. Não há abas, nem Salvar/Ativar/Fechar: o contrato grava sozinho, e cada tela grava
 * só o que mudou nela. Quem avança o workflow continua sendo o "Concluir tarefa" (TaskDocView),
 * que antes chama `registrarGravacao` para não deixar nada para trás.
 *
 * Tela fechada continua montada (escondida): é assim que ela sabe o que falta e mostra
 * "falta N" no título. Quando o Concluir esbarra em obrigatório (`revelar` muda), as telas
 * com pendência abrem e a primeira rola para a vista.
 */
export function WorkflowScreenTask({ taskId, step, entityId, onEntity, onEntityGone, onCancel, registrarGravacao, revelar = 0, grafo, nodeId }: {
  /** a tarefa em execução — vai junto em cada gravação para a API aplicar a tela DESTA etapa */
  taskId: string
  step: StepFormSchema
  /** id atual da entidade (null = ainda não criada, em modo CREATE) */
  entityId: string | null
  /** reporta o id ao salvar a entidade (o pai guarda para o "Concluir") */
  onEntity: (id: string) => void
  /** o id veio da variável do processo mas a entidade não existe mais (uma ação automática
   *  compensada pode tê-la removido). Em CREATE isso não é erro: a etapa volta a criar. */
  onEntityGone?: () => void
  onCancel?: () => void
  /** o pai recebe a função que grava o que estiver pendente (o Concluir chama antes) */
  registrarGravacao?: (gravar: GravarTelas) => void
  /** muda quando o Concluir esbarra em obrigatório: abre e mostra as telas com pendência */
  revelar?: number
  /** grafo congelado da instância e o nó desta tarefa — para dizer o destino de cada resposta */
  grafo?: GrafoDaInstancia | null
  nodeId?: string
}) {
  const telasCfg = useMemo(() => telasDaTarefa(step), [step])
  const refsChave = telasCfg.map((a) => a.screenRef).join('|')
  const [telas, setTelas] = useState<Record<string, Screen | null> | undefined>(undefined)
  const [entity, setEntity] = useState<ContractRow | PartnerRow | null | undefined>(entityId ? undefined : null)
  const [err, setErr] = useState<string | null>(null)
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(telasCfg.filter((t) => t.aberta).map((t) => t.screenRef)))
  const [faltantes, setFaltantes] = useState<Record<string, CampoFaltante[]>>({})
  const [estados, setEstados] = useState<Record<string, EstadoDaGravacao>>({})
  /* versão de cada tela: sobe quando OUTRA tela grava, para esta reler o contrato */
  const [versoes, setVersoes] = useState<Record<string, number>>({})
  const [ident, setIdent] = useState<{ titulo?: string; numero?: string; situacao?: string; terminoVigencia?: string } | null>(null)
  const gravacoes = useRef(new Map<string, () => Promise<boolean>>())

  const isContract = step.screenSubject === 'CONTRATO'
  const endpoint = isContract ? 'contracts' : 'partners'
  const entidade = isContract ? 'contrato' : 'parceiro'
  /* Trava da ATIVIDADE só na etapa que EDITA (ao criar vale a configuração da própria tela). */
  const travasDaAtividade = step.entityMode === 'EDIT' ? step.lockedFields : undefined

  // Carrega as telas uma vez.
  useEffect(() => {
    let cancel = false
    void (async () => {
      if (!step.screenRef) { setErr('Atividade sem tela configurada.'); return }
      const refs = refsChave.split('|')
      const lidas = await Promise.all(refs.map((r) => getScreen(r).catch(() => null)))
      if (cancel) return
      if (!lidas[refs.indexOf(step.screenRef)]) { setErr('Tela do formulário não encontrada.'); return }
      setTelas(Object.fromEntries(refs.map((r, i) => [r, lidas[i] ?? null])))
    })()
    return () => { cancel = true }
  }, [step.screenRef, refsChave])

  // Carrega a entidade quando há um id (EDIT/VIEW desde o início, ou depois do CREATE).
  useEffect(() => {
    if (!entityId) { setEntity(null); return }
    let cancel = false
    setEntity(undefined)
    void (async () => {
      const e = await apiJson<ContractRow | PartnerRow>(`/api/${endpoint}/${entityId}`).catch(() => null)
      if (cancel) return
      if (!e) {
        if ((step.entityMode ?? 'CREATE') === 'CREATE') { setEntity(null); onEntityGone?.(); return }
        setErr('Entidade-alvo não encontrada.'); return
      }
      setEntity(e)
      setIdent(e as never)
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onEntityGone é estável no uso (setState)
  }, [entityId, endpoint, step.entityMode])

  /* Uma tela gravou: as outras releem o contrato (as que não têm nada pendente), e a linha
     de identidade acompanha (o título pode ter mudado). */
  const aoGravar = useCallback((ref: string) => {
    if (entityId) onEntity(entityId)
    setVersoes((v) => {
      const n = { ...v }
      for (const t of telasCfg) if (t.screenRef !== ref && !estadosRef.current[t.screenRef]?.pendente) n[t.screenRef] = (n[t.screenRef] ?? 0) + 1
      return n
    })
    if (entityId) void apiJson<Record<string, string>>(`/api/${endpoint}/${entityId}`).then((e) => { if (e) setIdent(e) }).catch(() => null)
  }, [entityId, endpoint, onEntity, telasCfg])
  const estadosRef = useRef(estados)
  estadosRef.current = estados

  /* O Concluir grava tudo antes: uma função só para o pai, que chama a de cada tela. */
  useEffect(() => {
    registrarGravacao?.(async () => {
      for (const gravar of gravacoes.current.values()) if (!(await gravar())) return false
      return true
    })
  }, [registrarGravacao])

  /* Concluir esbarrou em obrigatório: abre as telas com pendência e mostra a primeira. */
  useEffect(() => {
    if (!revelar) return
    const comFalta = telasCfg.filter((t) => (faltantes[t.screenRef]?.length ?? 0) > 0).map((t) => t.screenRef)
    if (!comFalta.length) return
    setAbertas((a) => new Set([...a, ...comFalta]))
    requestAnimationFrame(() => document.getElementById(`tela-${comFalta[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [revelar]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Destino de cada resposta, para os campos de lista curta que decidem a escolha à frente. */
  const destinos = useCallback(
    (chave: string, valores: string[]) => (grafo && nodeId ? destinosDoCampo(grafo, nodeId, chave, valores) : null),
    [grafo, nodeId],
  )

  /* Callbacks estáveis por tela (o contrato registra/avisa por eles). */
  const porTela = useMemo(() => Object.fromEntries(telasCfg.map((t) => [t.screenRef, {
    onEstado: (e: EstadoDaGravacao) => setEstados((x) => ({ ...x, [t.screenRef]: e })),
    onFaltantes: (c: CampoFaltante[]) => setFaltantes((x) => ({ ...x, [t.screenRef]: c })),
    registrarGravacao: (g: () => Promise<boolean>) => { gravacoes.current.set(t.screenRef, g); return () => { gravacoes.current.delete(t.screenRef) } },
  } satisfies ContratoNaTarefa])), [telasCfg])

  const aviso = (texto: React.ReactNode) => (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="flex-1">{texto}</span>
      {onCancel && err && <button onClick={onCancel} className="shrink-0 text-xs underline">Fechar</button>}
    </div>
  )
  const carregando = (
    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando formulário…
    </div>
  )

  if (err) return aviso(err)
  if (telas === undefined || (entityId && entity === undefined)) return carregando

  if (step.entityMode === 'VIEW' && !entity) {
    /* VIEW sem entidade = nenhuma etapa anterior deste processo criou o registro. Dizer isso é
       melhor do que abrir um formulário de criação vazio, que gravaria um registro novo. */
    return aviso(<>Etapa de consulta sem {entidade} para mostrar: nenhuma etapa anterior deste processo criou o {entidade}. Avise quem desenhou o workflow.</>)
  }

  /* ── estado da gravação (uma frase para todas as telas) ── */
  const lista = Object.values(estados)
  const salvando = lista.some((e) => e.salvando)
  const erroGravacao = lista.find((e) => e.erro)?.erro ?? null
  const pendente = lista.some((e) => e.pendente)
  const ultimo = lista.reduce<Date | null>((m, e) => (e.salvoEm && (!m || e.salvoEm > m) ? e.salvoEm : m), null)
  const estadoGravacao = salvando ? { texto: 'Salvando…', tom: 'neutro' as const }
    : erroGravacao ? { texto: erroGravacao, tom: 'aviso' as const }
    : pendente ? { texto: 'Alterações a salvar…', tom: 'neutro' as const }
    : ultimo ? { texto: `Salvo às ${ultimo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, tom: 'ok' as const }
    : null

  const abrir = (ref: string) => {
    setAbertas((a) => new Set([...a, ref]))
    requestAnimationFrame(() => document.getElementById(`tela-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const alternar = (ref: string) => setAbertas((a) => { const n = new Set(a); if (n.has(ref)) n.delete(ref); else n.add(ref); return n })

  const sit = ident?.situacao ? effectiveSituacao(ident.situacao, ident.terminoVigencia ?? '') : null

  const corpoDaTela = (ref: string, editavel: boolean, principal: boolean) => {
    const screen = telas[ref] ?? null
    if (!screen) return aviso(<>Esta tela não existe mais (foi removida em Personalização de Telas). Avise quem desenhou o workflow.</>)
    const origem = { tarefaId: taskId, telaId: ref }
    if (!entityId || !entity) {
      // CREATE: o registro nasce pela tela principal; as outras esperam por ele.
      if (!principal) return <p className="text-[12px] text-muted-foreground">Esta tela fica disponível quando o {entidade} começar a ser salvo.</p>
      const onCreated = (r?: { id?: string }) => { if (r?.id) onEntity(r.id) }
      return isContract
        ? <ContractNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} origem={origem} naTarefa={porTela[ref]} />
        : <PartnerNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} origem={origem} />
    }
    const props = {
      screen, readOnly: !editavel, lockedFields: travasDaAtividade, onClose: onCancel ?? (() => {}), origem,
      onSaved: () => aoGravar(ref),
    }
    return isContract
      ? <ContractDetailView key={`${ref}-${versoes[ref] ?? 0}`} row={entity as ContractRow} {...props} naTarefa={{ ...porTela[ref], revelar }} />
      : <PartnerDetailView key={`${ref}-${versoes[ref] ?? 0}`} partner={entity as PartnerRow} {...props} />
  }

  return (
    <DestinosDosCamposProvider value={destinos}>
      <div className="space-y-3">
        {/* identidade do registro + atalho para as telas + estado da gravação */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {ident?.titulo && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px]">
              <span className="max-w-[420px] truncate font-semibold text-foreground">{ident.titulo}</span>
              {ident.numero && <span className="font-mono text-muted-foreground">{ident.numero}</span>}
              {sit && isContract && (
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', SIT_CLS[sit])}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', SIT_DOT_CLS[sit] ?? 'bg-muted-foreground/50')} />{SIT_LABEL[sit]}
                </span>
              )}
            </div>
          )}
          {estadoGravacao && (
            <span role="status" className={cn('ml-auto inline-flex items-center gap-1.5 text-[11.5px]',
              estadoGravacao.tom === 'aviso' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              {estadoGravacao.tom === 'ok' && <Check className="h-3.5 w-3.5 text-primary" />}
              {estadoGravacao.texto === 'Salvando…' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {estadoGravacao.texto}
            </span>
          )}
        </div>

        {telasCfg.length > 1 && (
          <nav aria-label="Telas desta tarefa" className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Ir para:</span>
            {telasCfg.map((t) => {
              const falta = faltantes[t.screenRef]?.length ?? 0
              return (
                <button key={t.screenRef} type="button" onClick={() => abrir(t.screenRef)}
                  className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] transition-colors',
                    t.editavel ? 'bg-primary/10 font-semibold text-primary hover:bg-primary/15' : 'bg-muted text-foreground hover:bg-muted/70')}>
                  {t.editavel ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  <span className="max-w-[220px] truncate">{telas[t.screenRef]?.name ?? 'Tela removida'}</span>
                  {falta > 0 && <span className="text-amber-800 dark:text-amber-300">· falta {falta}</span>}
                </button>
              )
            })}
          </nav>
        )}

        {telasCfg.map((t) => {
          const aberta = abertas.has(t.screenRef)
          const falta = faltantes[t.screenRef]?.length ?? 0
          const nome = telas[t.screenRef]?.name ?? 'Tela removida'
          return (
            <section key={t.screenRef} id={`tela-${t.screenRef}`} aria-label={`${t.editavel ? 'Preencher' : 'Para consulta'}: ${nome}`}
              className={cn('scroll-mt-2 rounded-xl border', t.editavel ? 'bg-card' : 'bg-muted/40', falta > 0 && 'border-amber-300 dark:border-amber-800')}>
              <button type="button" aria-expanded={aberta} onClick={() => alternar(t.screenRef)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-muted/30">
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !aberta && '-rotate-90')} />
                {t.editavel ? <Pencil className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className={cn('shrink-0 text-[10.5px] font-bold uppercase tracking-wider', t.editavel ? 'text-primary' : 'text-muted-foreground')}>
                  {t.editavel ? 'Preencher' : 'Para consulta'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{nome}</span>
                {falta > 0 && <span className="shrink-0 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300">falta {falta}</span>}
                {!t.editavel && <span className="shrink-0 text-[11px] text-muted-foreground">somente leitura</span>}
              </button>
              {/* fechada continua montada: é assim que ela sabe o que falta */}
              <div hidden={!aberta} className="border-t px-3 pb-3 pt-3">
                {corpoDaTela(t.screenRef, t.editavel, t.principal)}
              </div>
            </section>
          )
        })}
      </div>
    </DestinosDosCamposProvider>
  )
}
