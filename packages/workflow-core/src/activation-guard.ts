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
    | 'sem-saida' | 'nao-alcanca-fim' | 'gateway-sem-saida' | 'solto' | 'sem-chegada'
    | 'inalcancavel-do-inicio' | 'juncao-travada'
    | 'decisao-sem-padrao' | 'decisao-multipadrao'
    | 'atividade-incompleta' | 'tela-so-consulta'
  /** `erro` impede a ativação; `aviso` é informação — o desenho é legítimo, mas o
   *  desenhista precisa saber o que ele significa em execução. Ausente = erro
   *  (compatibilidade com quem consome o tipo sem tratar severidade). */
  severidade?: 'erro' | 'aviso'
  /** Nó culpado — o editor centraliza/seleciona por ele. Ausente nos problemas de evento. */
  nodeId?: string
  /** Frase completa e autossuficiente: o que está errado, onde e como resolver. */
  mensagem: string
  /** Rótulo curto para a forma AGREGADA (`"Aprovar"` ou `"Aprovar" — sem prazo`). */
  rotulo?: string
}

/** Só o que IMPEDE a ativação. Avisos ficam de fora — eles informam, não barram. */
export const bloqueantes = (ps: ProblemaAtivacao[]): ProblemaAtivacao[] =>
  ps.filter((p) => p.severidade !== 'aviso')

/** Só o que INFORMA (não impede a ativação). */
export const avisos = (ps: ProblemaAtivacao[]): ProblemaAtivacao[] =>
  ps.filter((p) => p.severidade === 'aviso')

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

/** Nós alcançáveis a partir de `origens`, andando no sentido das setas (ou contra,
 *  com `reverso`) — é a base de toda checagem de CAMINHO deste arquivo. */
function alcancaveis(origens: string[], edges: EdgeLike[], reverso = false): Set<string> {
  const vistos = new Set(origens)
  const fila = [...origens]
  while (fila.length) {
    const atual = fila.shift() as string
    for (const e of edges) {
      const de = reverso ? e.to : e.from
      const para = reverso ? e.from : e.to
      if (de !== atual || !para || vistos.has(para)) continue
      vistos.add(para)
      fila.push(para)
    }
  }
  return vistos
}

/**
 * Desenho executável. Duas perguntas, nesta ordem:
 *
 * 1. CONEXÃO (erro): o início liga em algo, nada fica solto, nada fica sem chegada,
 *    gateway tem saída — e, agora, o início ALCANÇA de fato o que desenhou. Grau de
 *    entrada/saída não bastava: um punhado de atividades ligadas entre si, mas longe
 *    do início, passava na checagem antiga e nunca executaria.
 * 2. CAMINHO ATÉ O FIM: basta UM caminho do início ao evento de fim para ativar
 *    (erro se não houver nenhum). Atividade que executa mas não leva ao fim é
 *    legítima — vira AVISO: ela roda, e o processo simplesmente não termina por ela.
 */
export function validarDesenho(nodes: NodeLike[], edges: EdgeLike[]): ProblemaAtivacao[] {
  const problemas: ProblemaAtivacao[] = []
  const starts = nodes.filter((n) => n.type === 'start')
  const ends = nodes.filter((n) => n.type === 'end')
  // Sem nó de início no recorte recebido (fragmento de teste; o editor sempre tem um),
  // "alcançável" é desconhecido — tratamos tudo como alcançável em vez de acusar o
  // desenho inteiro de inalcançável.
  const doInicio = starts.length
    ? alcancaveis(starts.map((n) => n.id), edges)
    : new Set(nodes.map((n) => n.id))
  const chegamAoFim = alcancaveis(ends.map((n) => n.id), edges, true)
  /** Nós já culpados por conexão — não repetimos o mesmo nó com outra frase. */
  const jaCulpado = new Set<string>()

  for (const n of nodes) {
    const tem = {
      saida: edges.some((e) => e.from === n.id),
      chegada: edges.some((e) => e.to === n.id),
    }
    if (n.type === 'start') {
      if (!tem.saida) problemas.push({ tipo: 'inicio-desligado', nodeId: n.id, mensagem: 'O evento de início não está ligado a nada. Arraste uma seta dele até a primeira atividade.' })
      continue
    }
    if (n.type === 'end') continue // o fim é avaliado por CAMINHO, logo abaixo
    if (!tem.saida && !tem.chegada) {
      jaCulpado.add(n.id)
      problemas.push({ tipo: 'solto', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} está solta no desenho — nenhuma seta chega ou sai dela. Ligue-a ao fluxo ou exclua-a.` })
      continue
    }
    if (!tem.chegada) {
      jaCulpado.add(n.id)
      problemas.push({ tipo: 'sem-chegada', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} está desconectada do fluxo — nenhuma seta chega até ela. Ligue uma etapa anterior a ela ou exclua-a.` })
    } else if (!doInicio.has(n.id)) {
      // Tem seta chegando, mas vinda de outro pedaço que o início também não alcança:
      // um bloco inteiro desenhado longe do fluxo. Nunca executa.
      jaCulpado.add(n.id)
      problemas.push({ tipo: 'inalcancavel-do-inicio', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} nunca será executada: não existe caminho do início até ela. Ligue-a ao fluxo que sai do início ou exclua-a.` })
    }
    if (!tem.saida && (n.type === 'exclusiveGateway' || n.type === 'parallelGateway')) {
      jaCulpado.add(n.id)
      problemas.push({ tipo: 'gateway-sem-saida', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} não tem nenhuma saída. Ligue-a aos caminhos que ela deve abrir.` })
    }
  }

  // Executa, mas não termina o processo: AVISO (a partir daqui é desenho válido).
  for (const n of nodes) {
    if (n.type === 'start' || n.type === 'end') continue
    if (jaCulpado.has(n.id) || !doInicio.has(n.id) || chegamAoFim.has(n.id)) continue
    const semSaida = !edges.some((e) => e.from === n.id)
    problemas.push(semSaida
      ? { tipo: 'sem-saida', severidade: 'aviso', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} será executada, mas o processo não termina por ela: ela não leva a lugar nenhum. Se ela deve encerrar o processo, ligue-a ao evento de fim.` }
      : { tipo: 'nao-alcanca-fim', severidade: 'aviso', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} será executada, mas nenhum caminho a partir dela chega ao evento de fim — o processo não termina por esse lado.` })
  }

  // ── junção paralela que nunca sincroniza ────────────────────────────────────
  // A junção só dispara quando TODOS os ramos que entram nela chegam. Se um deles
  // vem de um trecho que o início não alcança, ela espera para sempre: o processo
  // trava ali, sem tarefa em aberto e sem ninguém para agir.
  for (const n of nodes) {
    if (n.type !== 'parallelGateway') continue
    const entradas = edges.filter((e) => e.to === n.id)
    if (entradas.length < 2 || !doInicio.has(n.id)) continue
    const mortos = entradas.filter((e) => !doInicio.has(e.from))
    if (!mortos.length) continue
    problemas.push({ tipo: 'juncao-travada', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `${rotuloLongo(n)} espera ${entradas.length} caminhos, mas ${mortos.length === 1 ? 'um deles vem' : `${mortos.length} deles vêm`} de um trecho que o início nunca alcança — o processo travaria aí para sempre. Ligue esse trecho ao fluxo ou remova a seta que entra na junção.` })
  }

  // ── caminho até o fim ───────────────────────────────────────────────────────
  // Por último de propósito: é um problema do DESENHO INTEIRO, não de um nó. Vindo
  // depois, a lista abre pelos nós culpados — que é onde a pessoa vai clicar.
  if (!ends.some((e) => doInicio.has(e.id))) {
    problemas.push({
      tipo: 'fim-inalcancavel',
      nodeId: ends[0]?.id,
      mensagem: ends.length === 0
        ? 'O desenho não tem evento de fim — o processo nunca terminaria. Adicione um fim e ligue a última atividade a ele.'
        : 'Nenhum caminho do início chega ao evento de fim — o processo nunca terminaria. Ligue ao fim pelo menos um dos caminhos que saem do início.',
    })
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
    // O "caso contrário" é DERIVADO: é a saída SEM FILTROS. Não se olha a marca
    // `isDefault` — ela é consequência, não causa. Olhar a marca fazia a ativação
    // recusar desenho certo (losango que o usuário nunca abriu no modal nasce sem
    // marca) com uma frase que mandava fazer o que já estava feito.
    const semFiltro = saidas.filter((s) => !s.condition?.trim())
    if (semFiltro.length === 0) {
      problemas.push({ tipo: 'decisao-sem-padrao', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `A decisão ${nome} não tem o caminho "caso contrário": deixe exatamente uma saída sem filtros — é por ela que o processo segue quando nenhum filtro casa.` })
      continue
    }
    if (semFiltro.length > 1) {
      problemas.push({ tipo: 'decisao-multipadrao', nodeId: n.id, rotulo: nomeCurto(n), mensagem: `A decisão ${nome} tem ${semFiltro.length} caminhos sem filtros — o processo não saberia por qual seguir. Monte os filtros de todos menos um: o que ficar sem filtros é o "caso contrário".` })
    }
  }
  return problemas
}

/**
 * A tela da atividade tem que servir ao que a atividade FAZ. Uma etapa que cria ou
 * edita apontando para uma tela em SOMENTE CONSULTA é um beco: o executor abre o
 * formulário, não consegue mexer em nada e a etapa nunca sai do lugar. Consultar
 * (entityMode VIEW) numa tela dessas é legítimo — é exatamente o par certo.
 *
 * A trava campo a campo NÃO entra aqui de propósito: travar alguns campos numa etapa
 * é o uso normal do recurso. Só o "tudo travado" impede o trabalho.
 */
export function validarTelasDasAtividades(
  steps: Array<{ stepId?: string; stepName?: string; screenRef?: string; entityMode?: string }>,
  telas: Array<{ id: string; name?: string; readOnly?: boolean }>,
): ProblemaAtivacao[] {
  const porId = new Map(telas.map((t) => [t.id, t]))
  const problemas: ProblemaAtivacao[] = []
  for (const s of steps) {
    if (!s.screenRef) continue
    const modo = s.entityMode ?? 'CREATE'
    if (modo === 'VIEW') continue
    const tela = porId.get(s.screenRef)
    if (!tela?.readOnly) continue
    const quem = s.stepName?.trim() ? `A atividade "${s.stepName.trim()}"` : 'Uma atividade'
    const verbo = modo === 'CREATE' ? 'criar' : 'editar'
    const nomeTela = tela.name?.trim() ? `"${tela.name.trim()}"` : 'escolhida'
    problemas.push({
      tipo: 'tela-so-consulta',
      nodeId: s.stepId,
      rotulo: s.stepName?.trim() ? `"${s.stepName.trim()}"` : '(sem nome)',
      mensagem: `${quem} precisa ${verbo} o registro, mas a tela ${nomeTela} é somente consulta — ninguém conseguiria preencher. Escolha outra tela na atividade, ou tire o "somente consulta" dela em Personalização de Telas.`,
    })
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
  'sem-saida': { plural: 'atividades serão executadas sem terminar o processo', instrucao: 'Elas não levam a lugar nenhum — ligue-as ao evento de fim se devem encerrar o processo.' },
  'gateway-sem-saida': { plural: 'decisões não têm nenhuma saída', instrucao: 'Ligue cada uma aos caminhos que ela deve abrir.' },
  'solto': { plural: 'atividades estão soltas no desenho', instrucao: 'Ligue-as ao fluxo ou exclua-as.' },
  'sem-chegada': { plural: 'atividades estão desconectadas do fluxo (nenhuma seta chega até elas)', instrucao: 'Ligue uma etapa anterior a cada uma ou exclua-as.' },
  'decisao-sem-padrao': { plural: 'decisões estão sem o caminho "caso contrário"', instrucao: 'Em cada uma, deixe exatamente uma saída sem filtros — é por ela que o processo segue quando nenhum filtro casa.' },
  'decisao-multipadrao': { plural: 'decisões têm mais de um caminho sem filtros', instrucao: 'Em cada uma, monte os filtros de todos menos um — o que ficar sem filtros é o "caso contrário".' },
  'atividade-incompleta': { plural: 'atividades com configuração incompleta', instrucao: 'Clique em cada uma e complete.' },
  'tela-so-consulta': { plural: 'atividades preenchem uma tela que é somente consulta', instrucao: 'Em cada uma, escolha outra tela — ou tire o "somente consulta" da tela, em Personalização de Telas.' },
  'nao-alcanca-fim': { plural: 'atividades serão executadas sem terminar o processo', instrucao: 'Nenhum caminho a partir delas chega ao evento de fim — ligue-as ao fim se elas devem encerrar o processo.' },
  'inalcancavel-do-inicio': { plural: 'atividades nunca serão executadas (o início não chega até elas)', instrucao: 'Ligue-as ao fluxo que sai do início ou exclua-as.' },
  'juncao-travada': { plural: 'junções esperam por caminhos que o início nunca alcança', instrucao: 'O processo travaria nelas: ligue esses trechos ao fluxo ou remova as setas que entram na junção.' },
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
 * Só entra o que IMPEDE a ativação: aviso não vira recusa.
 */
export function formatarProblemas(entrada: ProblemaAtivacao[]): string {
  const problemas = bloqueantes(entrada)
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
