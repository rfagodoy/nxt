/* ─── Prévia de início ────────────────────────────────────────────────────────
   Antes de iniciar um processo a pessoa precisa ver ONDE ela entra e o que vem
   logo depois. Este módulo lê o grafo compilado e responde isso — sem React, sem
   Prisma, e sem inventar sequência onde o desenho ramifica.

   Por que NÃO "a trilha completa": em fluxo real não existe UMA sequência. O de
   Solicitação de contratos tem 16 atividades, 6 decisões, uma bifurcação em
   paralelo e três laços de correção — enfileirar as 16 seria uma lista mentirosa,
   porque a ordem depende das respostas dadas no caminho. O resumo honesto é:
   a atividade de ENTRADA, o que se abre logo DEPOIS dela, e o TAMANHO do que vem.

   Puro e determinístico de propósito: a mesma pergunta é respondida pela API (na
   prévia do "Novo processo") e pode ser respondida pelo editor sem duplicar regra. */

import type { WfGraph, WfNode } from './types'

/** Uma atividade na prévia. Só o que a tela precisa mostrar. */
export interface EtapaPrevia {
  id: string
  nome: string
  tipo: 'userTask' | 'serviceTask'
  /** Rótulo do losango que levou até aqui — presente quando a etapa só acontece
   *  se uma decisão apontar para ela ("Aprovação do RH?"). */
  decisao?: string
  /** Prazo da atividade em dias úteis, quando configurado. */
  prazoDiasUteis?: number
  /** Tela que a pessoa preenche nesta atividade (id — o nome é resolvido fora). */
  formRef?: string
  /** Executor configurado no desenho (papel + entidade), resolvido fora daqui. */
  executor?: WfNode['executor']
}

export interface ResumoDeInicio {
  /** Atividade onde o processo descansa assim que é iniciado. `null` quando o
   *  desenho abre em várias já no início (aí as etapas de entrada vão em `frentes`). */
  primeira: EtapaPrevia | null
  /** Atividades que passam a existir AO MESMO TEMPO depois da primeira (bifurcação
   *  em paralelo). Vazio quando não há paralelo logo após a entrada. */
  frentes: EtapaPrevia[]
  /** Atividades possíveis depois da primeira quando NÃO há paralelo — possíveis,
   *  não certas: um losango no meio faz cada uma depender de uma condição. */
  proximas: EtapaPrevia[]
  /** Existe caminho que leva ao fim já depois da primeira (o processo pode
   *  encerrar cedo, sem passar por mais nenhuma atividade). */
  podeTerminarCedo: boolean
  totais: { atividades: number; decisoes: number }
  /** Há decisão no desenho, então o caminho não é fixo. A tela usa isto para não
   *  prometer uma sequência que o processo não garante. */
  caminhoVaria: boolean
}

function comoEtapa(no: WfNode, decisao?: string): EtapaPrevia {
  return {
    id: no.id,
    nome: (no.name ?? '').trim() || 'Atividade sem nome',
    tipo: no.type === 'serviceTask' ? 'serviceTask' : 'userTask',
    ...(decisao ? { decisao } : {}),
    ...(no.slaBusinessDays != null ? { prazoDiasUteis: no.slaBusinessDays } : {}),
    ...(no.formRef ? { formRef: no.formRef } : {}),
    ...(no.executor ? { executor: no.executor } : {}),
  }
}

interface Alcance {
  etapas: EtapaPrevia[]
  /** Passou por uma bifurcação paralela: as etapas encontradas nascem JUNTAS. */
  viaParalelo: boolean
  /** Algum caminho chega ao evento de fim sem passar por outra atividade. */
  alcancaFim: boolean
}

/** Caminha do nó `deId` para a frente ATRAVESSANDO gateways e parando na primeira
 *  atividade de cada ramo — é o conjunto de coisas que podem acontecer "a seguir".
 *  O conjunto de visitados sustenta os LAÇOS do desenho (correção que volta para a
 *  análise): sem ele, um fluxo com volta rodaria para sempre. */
function alcancar(graph: WfGraph, deId: string): Alcance {
  const saidasDe = (id: string) => graph.edges.filter((e) => e.from === id)
  const etapas: EtapaPrevia[] = []
  const vistos = new Set<string>([deId])
  let viaParalelo = false
  let alcancaFim = false

  const fila: Array<{ id: string; decisao?: string }> = saidasDe(deId).map((e) => ({ id: e.to }))
  while (fila.length > 0) {
    const atual = fila.shift() as { id: string; decisao?: string }
    if (vistos.has(atual.id)) continue
    vistos.add(atual.id)

    const no = graph.nodes[atual.id]
    if (!no) continue

    if (no.type === 'userTask' || no.type === 'serviceTask') {
      etapas.push(comoEtapa(no, atual.decisao))
      continue // a atividade é onde o token DESCANSA: o ramo para aqui
    }
    if (no.type === 'end') {
      alcancaFim = true
      continue
    }
    if (no.type === 'parallelGateway') viaParalelo = true

    // Losango: o nome dele é a pergunta que decide os ramos abaixo. Carrega adiante
    // para a etapa saber sob qual condição ela existe.
    const rotulo = no.type === 'exclusiveGateway' ? (no.name ?? '').trim() || undefined : atual.decisao
    for (const e of saidasDe(atual.id)) fila.push({ id: e.to, decisao: rotulo })
  }

  return { etapas, viaParalelo, alcancaFim }
}

/** Lê o grafo compilado e devolve o que mostrar antes de iniciar o processo. */
export function resumoDeInicio(graph: WfGraph): ResumoDeInicio {
  const nos = Object.values(graph?.nodes ?? {})
  const totais = {
    atividades: nos.filter((n) => n.type === 'userTask' || n.type === 'serviceTask').length,
    decisoes: nos.filter((n) => n.type === 'exclusiveGateway').length,
  }
  const caminhoVaria = totais.decisoes > 0

  const entrada = alcancar(graph, graph?.startId ?? '')

  // O início já abre em várias atividades: não há uma "primeira", há frentes.
  if (entrada.etapas.length !== 1) {
    return {
      primeira: null,
      frentes: entrada.etapas,
      proximas: [],
      podeTerminarCedo: entrada.alcancaFim,
      totais,
      caminhoVaria,
    }
  }

  const primeira = entrada.etapas[0]
  const depois = alcancar(graph, primeira.id)
  return {
    primeira,
    frentes: depois.viaParalelo ? depois.etapas : [],
    proximas: depois.viaParalelo ? [] : depois.etapas,
    podeTerminarCedo: depois.alcancaFim,
    totais,
    caminhoVaria,
  }
}
