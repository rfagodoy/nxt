/* Campo do FILTRO precisa estar preenchido na hora da escolha (PO, 22/11/2026).
 *
 * A escolha lê o contrato do processo quando o processo chega nela. Campo em branco não
 * casa com filtro nenhum: o processo segue pelo caso contrário, sem erro que avise. A
 * garantia de que o campo tem valor é o "Concluir tarefa", que cobra os obrigatórios das
 * telas da atividade. Então todo caminho do início até a escolha precisa passar por uma
 * atividade que exige o campo.
 *
 * "Todo caminho" (e não "alguma atividade anterior") porque uma atividade num ramo de uma
 * escolha anterior, ou numa linha paralela que corre ao lado, não garante nada: o processo
 * pode chegar à escolha sem passar por ela. A junção de um "ao mesmo tempo" só segue com
 * todas as linhas que entram nela, então o que uma delas exige vale depois da junção.
 *
 * A regra não conhece telas: quem chama diz o que cada atividade cobra, na chave do filtro
 * (`contrato.maoDeObra`), e quais campos podem ser exigidos (@nxt/screens-core). */
import type { ProblemaAtivacao } from './activation-guard'

interface No { id: string; type: string; name?: string }
interface Seta { from: string; to?: string; conditionSpec?: { rules?: Array<{ campo?: string }> } }

export interface EntradaFiltrosObrigatorios {
  nodes: readonly No[]
  edges: readonly Seta[]
  /** atividade (id) → campos que o "Concluir tarefa" dela cobra, na chave do filtro */
  cobrados: ReadonlyMap<string, ReadonlySet<string>>
  /** o campo pode ser exigido numa tela? (os que não podem não são conferidos) */
  exigivel: (chave: string) => boolean
  /** nome do campo como a tela mostra; ausente = a própria chave */
  rotuloDoCampo?: (chave: string) => string | undefined
}

/** O que o processo alcança a partir do início sem passar pelos `bloqueados`. Junção de
 *  "ao mesmo tempo" (2+ chegadas) só é alcançada com TODAS as chegadas alcançadas. */
function alcancaDoInicio(nodes: readonly No[], edges: readonly Seta[], bloqueados: ReadonlySet<string>): Set<string> {
  const chegadas = new Map<string, string[]>()
  for (const e of edges) if (e.to) chegadas.set(e.to, [...(chegadas.get(e.to) ?? []), e.from])
  const juncao = (id: string) => nodes.find((n) => n.id === id)?.type === 'parallelGateway' && (chegadas.get(id)?.length ?? 0) >= 2
  const vistos = new Set(nodes.filter((n) => n.type === 'start' && !bloqueados.has(n.id)).map((n) => n.id))
  for (let mudou = true; mudou;) {
    mudou = false
    for (const e of edges) {
      if (!e.to || !vistos.has(e.from) || vistos.has(e.to) || bloqueados.has(e.to)) continue
      if (juncao(e.to) && !chegadas.get(e.to)!.every((de) => vistos.has(de))) continue
      vistos.add(e.to)
      mudou = true
    }
  }
  return vistos
}

const listar = (nomes: string[]) => (nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`)

export function validarCamposDosFiltros(e: EntradaFiltrosObrigatorios): ProblemaAtivacao[] {
  const problemas: ProblemaAtivacao[] = []
  const nomeDe = (id: string) => e.nodes.find((n) => n.id === id)?.name?.trim() ?? ''

  /* escolha → campos testados nos filtros das saídas dela, na ordem em que aparecem */
  const porEscolha = new Map<string, string[]>()
  for (const s of e.edges) {
    for (const r of s.conditionSpec?.rules ?? []) {
      const campo = r.campo?.trim()
      if (!campo || !e.exigivel(campo)) continue
      const campos = porEscolha.get(s.from) ?? []
      if (!campos.includes(campo)) porEscolha.set(s.from, [...campos, campo])
    }
  }

  for (const [escolha, campos] of porEscolha) {
    const pergunta = nomeDe(escolha)
    const aEscolha = pergunta ? `A escolha "${pergunta}"` : 'Uma escolha sem pergunta'
    /* o que vem antes da escolha: alcançável do início sem atravessá-la */
    const antes = alcancaDoInicio(e.nodes, e.edges, new Set([escolha]))
    for (const campo of campos) {
      const exigem = [...e.cobrados].filter(([, cs]) => cs.has(campo)).map(([id]) => id)
      if (!alcancaDoInicio(e.nodes, e.edges, new Set(exigem)).has(escolha)) continue

      const nome = `"${e.rotuloDoCampo?.(campo) ?? campo}"`
      const exigemAntes = exigem.filter((id) => antes.has(id))
      const nomes = (ids: string[]) => listar(ids.map((id) => (nomeDe(id) ? `"${nomeDe(id)}"` : 'uma atividade sem nome')))
      const mensagem = exigemAntes.length
        ? `${aEscolha} testa ${nome}, que só é obrigatório em ${nomes(exigemAntes)}, mas há caminho até a escolha que não passa por lá: por ele o campo pode chegar em branco, e o processo seguiria pelo caso contrário. Marque ${nome} como obrigatório também na tela das atividades desse caminho.`
        : exigem.length
          ? `${aEscolha} testa ${nome}, mas o campo só é obrigatório em ${nomes(exigem)}, depois da escolha: na hora da decisão ele ainda está em branco, e o processo seguiria pelo caso contrário. Marque ${nome} como obrigatório na tela de uma atividade antes da escolha.`
          : `${aEscolha} testa ${nome}, mas nenhuma atividade antes dela exige esse campo: em branco, o processo seguiria pelo caso contrário sem avisar. Marque ${nome} como obrigatório na tela de uma atividade antes da escolha, em Personalização de Telas.`
      problemas.push({
        tipo: 'filtro-sem-obrigatorio',
        nodeId: escolha,
        rotulo: `${pergunta ? `"${pergunta}"` : '(sem pergunta)'} — ${nome}`,
        mensagem,
      })
    }
  }
  return problemas
}
