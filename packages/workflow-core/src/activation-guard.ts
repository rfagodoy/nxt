/* Guardas de ATIVAÇÃO do workflow — mensagens na língua do usuário (2026-08-23).
 *
 * Validam o grafo do EDITOR (que tem os NOMES das atividades) e devolvem TODOS os
 * problemas de uma vez, ESTRUTURADOS: `tipo` + `nodeId` permitem ao editor listar
 * pendências clicáveis (clicou → centraliza o nó), e `mensagem` é a frase
 * autossuficiente para o diálogo. A API usa as MESMAS funções na ativação — uma
 * regra só, sem deriva entre cliente e servidor. O compileBpmn continua validando
 * depois, como rede de segurança técnica. */

export interface ProblemaAtivacao {
  tipo:
    | 'inicio-desligado' | 'fim-inalcancavel'
    | 'sem-saida' | 'gateway-sem-saida' | 'solto' | 'sem-chegada'
    | 'decisao-sem-padrao' | 'decisao-multipadrao' | 'decisao-filtro-faltando'
    | 'atividade-incompleta'
  /** Nó culpado — o editor centraliza/seleciona por ele. Ausente nos problemas de evento. */
  nodeId?: string
  /** Frase completa e autossuficiente: o que está errado, onde e como resolver. */
  mensagem: string
  /** Rótulo curto para a forma AGREGADA (`"Aprovar"` ou `"Aprovar" — sem prazo`). */
  rotulo?: string
}

interface NodeLike { id: string; type: string; name?: string }
interface EdgeLike { from: string; to?: string; condition?: string; isDefault?: boolean }

/** Sujeito da frase, com artigo e tipo na língua do Storyboard. */
function rotuloLongo(n: NodeLike): string {
  const nome = n.name?.trim()
  const tipo = n.type === 'serviceTask' ? 'A ação automática'
    : n.type === 'exclusiveGateway' ? 'A decisão'
    : n.type === 'parallelGateway' ? 'A divisão em paralelo'
    : 'A atividade'
  return nome ? `${tipo} "${nome}"` : `${tipo.replace('A ', 'Uma ')} sem nome`
}

const nomeCurto = (n: NodeLike) => (n.name?.trim() ? `"${n.name.trim()}"` : '(sem nome)')

/**
 * Desenho conectado: todo nó precisa de saída (menos o fim) e de chegada (menos o
 * início) — senão o processo fica preso ou tem pedaço morto.
 */
export function validarDesenho(nodes: NodeLike[], edges: EdgeLike[]): ProblemaAtivacao[] {
  const problemas: ProblemaAtivacao[] = []
  for (const n of nodes) {
    const tem = {
      saida: edges.some((e) => e.from === n.id),
      chegada: edges.some((e) => e.to === n.id),
    }
    if (n.type === 'start') {
      if (!tem.saida) problemas.push({ tipo: 'inicio-desligado', nodeId: n.id, mensagem: 'O evento de início não está ligado a nada. Arraste uma seta dele até a primeira atividade.' })
      continue
    }
    if (n.type === 'end') {
      if (!tem.chegada) problemas.push({ tipo: 'fim-inalcancavel', nodeId: n.id, mensagem: 'Nenhum caminho chega ao evento de fim — o processo nunca terminaria. Ligue a última atividade a ele.' })
      continue
    }
    if (!tem.saida && !tem.chegada) {
      problemas.push({ tipo: 'solto', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} está solta no desenho — nenhuma seta chega ou sai dela. Ligue-a ao fluxo ou exclua-a.` })
      continue
    }
    if (!tem.saida) {
      const gateway = n.type === 'exclusiveGateway' || n.type === 'parallelGateway'
      problemas.push(gateway
        ? { tipo: 'gateway-sem-saida', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} não tem nenhuma saída. Ligue-a aos caminhos que ela deve abrir.` }
        : { tipo: 'sem-saida', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} não leva a lugar nenhum — o processo ficaria preso nela. Ligue a saída dela à próxima atividade ou ao evento de fim.` })
    }
    if (!tem.chegada) {
      problemas.push({ tipo: 'sem-chegada', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} está desconectada do fluxo — nenhuma seta chega até ela. Ligue uma etapa anterior a ela ou exclua-a.` })
    }
  }
  return problemas
}

/**
 * Decisões completas: um losango com 2+ saídas precisa de exatamente UM caminho
 * "caso contrário" (sem filtros) e de filtros em todos os outros — sem isso o motor
 * escolheria um caminho por acidente de ordem.
 */
export function validarDecisoes(nodes: NodeLike[], edges: EdgeLike[]): ProblemaAtivacao[] {
  const problemas: ProblemaAtivacao[] = []
  for (const n of nodes) {
    if (n.type !== 'exclusiveGateway') continue
    const saidas = edges.filter((e) => e.from === n.id)
    if (saidas.length < 2) continue
    const nome = n.name?.trim() ? `"${n.name.trim()}"` : 'sem nome'
    const padroes = saidas.filter((s) => s.isDefault)
    if (padroes.length === 0) {
      problemas.push({ tipo: 'decisao-sem-padrao', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `A decisão ${nome} não tem o caminho "caso contrário": deixe exatamente uma saída sem filtros — é por ela que o processo segue quando nenhum filtro casa.` })
      continue
    }
    if (padroes.length > 1) {
      problemas.push({ tipo: 'decisao-multipadrao', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `A decisão ${nome} tem ${padroes.length} caminhos "caso contrário". Deixe apenas um sem filtros.` })
      continue
    }
    const semCondicao = saidas.filter((s) => !s.isDefault && !s.condition?.trim())
    if (semCondicao.length) {
      problemas.push({ tipo: 'decisao-filtro-faltando', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `A decisão ${nome} tem caminho sem filtros que não é o "caso contrário". Monte os filtros dele — ou esvazie só o caminho que deve ser o caso contrário.` })
    }
  }
  return problemas
}

/**
 * Atividades completas (política do produto): toda tarefa do usuário precisa de
 * nome, executor (papel) e prazo. Um problema POR atividade, dizendo o que falta.
 */
export function validarAtividades(
  steps: Array<{ stepId?: string; stepName?: string; executor?: { papelId?: string } | null; slaBusinessDays?: number; slaBusinessHours?: number; slaBusinessMinutes?: number }>,
): ProblemaAtivacao[] {
  const problemas: ProblemaAtivacao[] = []
  for (const s of steps) {
    const faltas: string[] = []
    if (!s.stepName?.trim()) faltas.push('nome')
    if (!s.executor?.papelId) faltas.push('executor (papel)')
    const temPrazo = (s.slaBusinessDays ?? 0) > 0 || (s.slaBusinessHours ?? 0) > 0 || (s.slaBusinessMinutes ?? 0) > 0
    if (!temPrazo) faltas.push('prazo')
    if (!faltas.length) continue
    const lista = faltas.length === 1 ? faltas[0] : `${faltas.slice(0, -1).join(', ')} e ${faltas[faltas.length - 1]}`
    const quem = s.stepName?.trim() ? `A atividade "${s.stepName.trim()}"` : 'Uma atividade'
    problemas.push({
      tipo: 'atividade-incompleta',
      nodeId: s.stepId,
      rotulo: `${s.stepName?.trim() ? `"${s.stepName.trim()}"` : '(sem nome)'} — sem ${lista}`,
      mensagem: `${quem} está sem ${lista}. Clique nela e complete a configuração.`,
    })
  }
  return problemas
}

/* ── Agregação: muitos problemas viram POUCOS blocos escaneáveis ───────────── */

/** Cabeçalho agregado por tipo: prefixo com contagem + instrução dita UMA vez.
 *  `null` = problema singular por natureza (usa a própria mensagem). */
const AGREGADO: Record<ProblemaAtivacao['tipo'], { plural: string; instrucao: string } | null> = {
  'inicio-desligado': null,
  'fim-inalcancavel': null,
  'sem-saida': { plural: 'atividades não levam a lugar nenhum', instrucao: 'Ligue a saída de cada uma à próxima atividade ou ao evento de fim.' },
  'gateway-sem-saida': { plural: 'decisões não têm nenhuma saída', instrucao: 'Ligue cada uma aos caminhos que ela deve abrir.' },
  'solto': { plural: 'atividades estão soltas no desenho', instrucao: 'Ligue-as ao fluxo ou exclua-as.' },
  'sem-chegada': { plural: 'atividades estão desconectadas do fluxo (nenhuma seta chega até elas)', instrucao: 'Ligue uma etapa anterior a cada uma ou exclua-as.' },
  'decisao-sem-padrao': { plural: 'decisões estão sem o caminho "caso contrário"', instrucao: 'Em cada uma, deixe exatamente uma saída sem filtros — é por ela que o processo segue quando nenhum filtro casa.' },
  'decisao-multipadrao': { plural: 'decisões têm mais de um caminho "caso contrário"', instrucao: 'Deixe apenas um sem filtros em cada uma.' },
  'decisao-filtro-faltando': { plural: 'decisões têm caminho sem filtros que não é o "caso contrário"', instrucao: 'Monte os filtros que faltam.' },
  'atividade-incompleta': { plural: 'atividades com configuração incompleta', instrucao: 'Clique em cada uma e complete.' },
}

/** `"A", "B" (3) e "C"` — repetições ganham contagem em vez de repetir a linha. */
function listarNomes(rotulos: string[]): string {
  const contagem = new Map<string, number>()
  for (const r of rotulos) contagem.set(r, (contagem.get(r) ?? 0) + 1)
  const itens = [...contagem.entries()].map(([r, n]) => (n > 1 ? `${r} (${n})` : r))
  return itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/**
 * Mensagem única para o diálogo: 1 problema vai direto; vários são AGRUPADOS por
 * tipo — um bloco por tipo, com os nomes juntos e a instrução dita uma vez.
 */
export function formatarProblemas(problemas: ProblemaAtivacao[]): string {
  if (problemas.length === 0) return ''
  if (problemas.length === 1) return problemas[0].mensagem
  const porTipo = new Map<ProblemaAtivacao['tipo'], ProblemaAtivacao[]>()
  for (const p of problemas) porTipo.set(p.tipo, [...(porTipo.get(p.tipo) ?? []), p])
  const blocos: string[] = []
  for (const [tipo, grupo] of porTipo) {
    const agg = AGREGADO[tipo]
    if (!agg || grupo.length === 1) {
      blocos.push(...grupo.map((p) => p.mensagem))
      continue
    }
    blocos.push(`${grupo.length} ${agg.plural}: ${listarNomes(grupo.map((p) => p.rotulo ?? '(sem nome)'))}. ${agg.instrucao}`)
  }
  return `O workflow ainda não pode ser ativado. Ajuste os pontos abaixo e tente de novo:\n${blocos.map((b) => `• ${b}`).join('\n')}`
}
