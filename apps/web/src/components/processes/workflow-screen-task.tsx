'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, Eye, Pencil } from 'lucide-react'
import { getScreen } from '@/hooks/use-screens'
import { apiJson } from '@/lib/http'
import { abasDaAtividade } from '@/lib/screen-task'
import { cn } from '@/lib/utils'
import type { Screen } from '@/lib/screen-types'
import type { StepFormSchema } from '@nxt/types'
import ContractNewForm from '@/components/contracts/contract-new-form'
import PartnerNewForm from '@/components/partners/partner-new-form'
import { ContractDetailView } from '@/components/contracts/contract-detail-view'
import { PartnerDetailView } from '@/components/partners/partner-detail-view'

type ContractRow = Parameters<typeof ContractDetailView>[0]['row']
type PartnerRow = Parameters<typeof PartnerDetailView>[0]['partner']

/**
 * Runtime de uma atividade cujo formulário é uma TELA (Personalização de Telas). Renderiza
 * o cadastro completo dirigido por essa tela e CRIA (novo), EDITA ou apenas CONSULTA (por
 * variável) o Contrato/Parceiro REAL — reportando o id ao pai via `onEntity`.
 *
 * ⚠️ Salvar a entidade NÃO conclui a tarefa (mudança pedida pelo PO): quem avança o
 * workflow é o botão "Concluir" no rodapé (ver TaskDocView). Após o CREATE, este
 * componente passa a mostrar a entidade em EDIÇÃO — evita criar um segundo registro se
 * a pessoa salvar de novo antes de concluir.
 *
 * VIEW é a etapa de análise/ciência: carrega a entidade como o EDIT, mas a tela abre
 * travada e sem nenhum botão que grave. A pessoa lê e conclui a tarefa.
 *
 * ABAS (telas adicionais): a atividade pode mostrar o MESMO registro por mais de uma tela,
 * cada uma editando ou só consultando. Duas regras protegem os dados:
 *  - com alteração não salva, a troca de aba é recusada (e explicada) — trocar perderia o
 *    que foi digitado;
 *  - toda troca RELÊ o registro: a aba anterior pode ter acabado de salvar, e a próxima
 *    não pode mostrar — nem regravar por cima — os valores de antes.
 */
export function WorkflowScreenTask({ step, entityId, onEntity, onEntityGone, onCancel }: {
  step: StepFormSchema
  /** id atual da entidade (null = ainda não criada, em modo CREATE) */
  entityId: string | null
  /** reporta o id ao salvar a entidade (o pai guarda para o "Concluir") */
  onEntity: (id: string) => void
  /** o id veio da variável do processo mas a entidade não existe mais (uma ação
   *  automática compensada pode tê-la removido). Em CREATE isso não é erro: a etapa
   *  volta a criar. O pai precisa saber para soltar o id velho do "Concluir". */
  onEntityGone?: () => void
  onCancel?: () => void
}) {
  const abas = abasDaAtividade(step)
  const refsChave = abas.map((a) => a.screenRef).join('|')
  const [telas, setTelas] = useState<Record<string, Screen | null> | undefined>(undefined)
  const [entity, setEntity] = useState<ContractRow | PartnerRow | null | undefined>(entityId ? undefined : null)
  const [err, setErr] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState(0)
  const [sujo, setSujo] = useState(false)
  const [avisoTroca, setAvisoTroca] = useState(false)
  const [recarga, setRecarga] = useState(0)
  /* A faixa só diz "salvo" quando algo foi de fato salvo NESTA tarefa. Antes ela dizia
     "Contrato salvo" em toda etapa de edição, inclusive quando ninguém tinha salvado nada. */
  const [salvoNestaTarefa, setSalvoNestaTarefa] = useState(false)

  const isContract = step.screenSubject === 'CONTRATO'
  const endpoint = isContract ? 'contracts' : 'partners'
  const entidade = isContract ? 'contrato' : 'parceiro'
  /* Trava da ATIVIDADE só na etapa que EDITA. Ao criar vale a configuração da própria tela
     (pedido do PO): uma trava que ficou gravada numa etapa de criação não pode continuar
     valendo escondida, depois que o editor deixou de mostrá-la. */
  const travasDaAtividade = step.entityMode === 'EDIT' ? step.lockedFields : undefined

  // Carrega as telas (principal + adicionais) uma vez.
  useEffect(() => {
    let cancel = false
    void (async () => {
      if (!step.screenRef) { setErr('Atividade sem tela configurada.'); return }
      const refs = refsChave.split('|')
      const lidas = await Promise.all(refs.map((r) => getScreen(r).catch(() => null)))
      if (cancel) return
      if (!lidas[0]) { setErr('Tela do formulário não encontrada.'); return }
      setTelas(Object.fromEntries(refs.map((r, i) => [r, lidas[i] ?? null])))
    })()
    return () => { cancel = true }
  }, [step.screenRef, refsChave])

  // Carrega a entidade sempre que há um id (EDIT desde o início, após o CREATE, ou ao trocar de aba).
  useEffect(() => {
    if (!entityId) { setEntity(null); return }
    let cancel = false
    setEntity(undefined)
    void (async () => {
      const e = await apiJson<ContractRow | PartnerRow>(`/api/${endpoint}/${entityId}`).catch(() => null)
      if (cancel) return
      if (!e) {
        // Em CREATE, sumiu = criar de novo (não é erro). Em EDIT/VIEW o desenho aponta
        // para uma entidade que deveria existir, então continua sendo erro.
        if ((step.entityMode ?? 'CREATE') === 'CREATE') { setEntity(null); onEntityGone?.(); return }
        setErr('Entidade-alvo não encontrada.'); return
      }
      setEntity(e)
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onEntityGone é estável no uso (setState); incluí-lo refaria o fetch a cada render do pai
  }, [entityId, endpoint, step.entityMode, recarga])

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
  if (telas === undefined) return carregando

  // Sem registro ainda (CREATE), só a aba principal existe de fato.
  const ativa = entityId ? Math.min(abaAtiva, abas.length - 1) : 0
  const aba = abas[ativa]
  const screen = telas[aba.screenRef] ?? null

  const trocarAba = (i: number) => {
    if (i === ativa) return
    if (sujo) { setAvisoTroca(true); return }
    if (!entityId && !abas[i].principal) return
    setAvisoTroca(false)
    setAbaAtiva(i)
    if (entityId) setRecarga((x) => x + 1)
  }

  /* Abas só quando há mais de uma tela. Estado dito em TEXTO e FORMA (lápis = edita,
     olho = consulta, negrito + borda = aba atual), nunca só em cor. */
  const barra = abas.length > 1 && (
    <>
      <div role="tablist" aria-label="Telas desta atividade" className="mb-3 flex flex-wrap items-end gap-1 border-b">
        {abas.map((a, i) => {
          const atual = i === ativa
          const bloqueada = !entityId && !a.principal
          const Icone = a.editavel ? Pencil : Eye
          return (
            <button key={a.screenRef} type="button" role="tab" aria-selected={atual} disabled={bloqueada}
              onClick={() => trocarAba(i)}
              title={bloqueada ? `Salve o ${entidade} na primeira aba para liberar esta` : undefined}
              className={cn('-mb-px inline-flex items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                atual ? 'border-border border-b-card bg-card font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icone className="h-3 w-3 shrink-0" />
              <span className="max-w-[220px] truncate">{telas[a.screenRef]?.name ?? 'Tela removida'}</span>
              <span className="text-[10.5px] font-normal text-muted-foreground">{bloqueada ? 'salve antes' : a.editavel ? 'editar' : 'consulta'}</span>
              {atual && sujo && <span className="text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">· não salvo</span>}
            </button>
          )
        })}
      </div>
      {avisoTroca && (
        <p role="alert" className="mb-3 text-[11.5px] leading-snug text-amber-700 dark:text-amber-400">
          Salve as alterações desta aba antes de trocar — as abas mostram o mesmo {entidade}, e trocar agora perderia o que foi digitado.
        </p>
      )}
    </>
  )

  let corpo: React.ReactNode
  if (entityId && entity === undefined) {
    corpo = carregando
  } else if (!screen) {
    corpo = aviso(<>Esta tela não existe mais (foi removida em Personalização de Telas). Avise quem desenhou o workflow.</>)
  } else if (entityId && entity) {
    // Já tem entidade (EDIT, VIEW ou pós-CREATE): mostra a tela da aba. Salvar reporta o id (estável).
    const props = {
      screen, readOnly: !aba.editavel, lockedFields: travasDaAtividade, onClose: onCancel ?? (() => {}),
      onSaved: () => { setSalvoNestaTarefa(true); onEntity(entityId) },
      onDirtyChange: setSujo,
    }
    const Entidade = isContract ? 'Contrato' : 'Parceiro'
    corpo = (
      <>
        {!aba.editavel ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-sky-300/60 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30 px-3 py-2 text-[12px] text-sky-800 dark:text-sky-200">
            <Eye className="h-4 w-4 shrink-0" />
            {step.entityMode === 'VIEW'
              ? <span>Esta etapa é de <span className="font-semibold">consulta</span>: o {entidade} abre em leitura. Confira e clique em <span className="font-semibold">Concluir</span> para seguir o processo.</span>
              : <span>Esta aba é só de <span className="font-semibold">consulta</span>: aqui o {entidade} abre em leitura. Para alterar, use uma aba marcada como <span className="font-semibold">editar</span>.</span>}
          </div>
        ) : sujo ? (
          /* Concluir NÃO salva: dizer isso enquanto há alteração pendente evita que ela se perca. */
          <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Há <span className="font-semibold">alterações não salvas</span> neste {entidade}. Salve antes de concluir — concluir a tarefa não grava o que foi digitado.</span>
          </div>
        ) : salvoNestaTarefa ? (
          <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{Entidade} salvo. Revise se quiser e clique em <span className="font-semibold">Concluir</span> para seguir o processo.</span>
          </div>
        ) : (
          <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
            <Pencil className="h-4 w-4 shrink-0" />
            <span>{Entidade} aberto para edição. Altere o que precisar e <span className="font-semibold text-foreground">salve</span>; quando terminar, clique em <span className="font-semibold text-foreground">Concluir</span> para seguir o processo.</span>
          </div>
        )}
        {/* `key` com a aba e a recarga: cada aba monta o formulário do zero, com o registro relido */}
        {isContract
          ? <ContractDetailView key={`${aba.screenRef}-${recarga}`} row={entity as ContractRow} {...props} />
          : <PartnerDetailView key={`${aba.screenRef}-${recarga}`} partner={entity as PartnerRow} {...props} />}
      </>
    )
  } else if (step.entityMode === 'VIEW') {
    /* VIEW sem entidade = nenhuma etapa anterior deste processo criou o registro (o editor
       avisa isso no desenho). Dizer isso é melhor do que abrir um formulário de criação
       vazio, que gravaria um registro novo sem ninguém pedir. */
    corpo = aviso(<>Etapa de consulta sem {entidade} para mostrar: nenhuma etapa anterior deste processo criou o {entidade}. Avise quem desenhou o workflow.</>)
  } else {
    // CREATE: cria a entidade (sempre pela tela principal) e reporta o id (sem avançar o workflow).
    const onCreated = (r?: { id?: string }) => { if (r?.id) { setSalvoNestaTarefa(true); onEntity(r.id) } }
    corpo = isContract
      ? <ContractNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} />
      : <PartnerNewForm embedded screen={screen} onSaved={onCreated} onCancel={onCancel} />
  }

  return <>{barra}{corpo}</>
}
