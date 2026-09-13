/* ─── Fluxo em BLOCOS — a forma de AUTORIA do workflow ─────────────────────────
 *
 * O editor não desenha mais losangos soltos. A pessoa monta uma SEQUÊNCIA de itens,
 * e cada item é uma atividade ou um bloco que já nasce completo:
 *   - "Escolher um caminho": caminhos com condição + um "caso contrário" fixo; todos se
 *     reencontram na saída do bloco. Um caminho pode, em vez de seguir, ENCERRAR o
 *     processo ou VOLTAR para uma atividade anterior.
 *   - "Fazer ao mesmo tempo": caminhos que começam juntos; o processo segue quando
 *     todos terminarem.
 *
 * O motor NÃO muda: `blocosParaGrafo` gera o mesmo grafo de nós e setas que ele já
 * executa. O que muda é que as formas que travavam a execução deixam de ser
 * desenháveis. As quatro armadilhas do motor, e como o gerador as evita:
 *   1. Caminhos de uma escolha chegando direto numa junção paralela → a junção conta
 *      CHEGADAS e esperaria mais do que vem. O gerador reencontra os caminhos num
 *      ponto único antes de seguir.
 *   2. Volta apontando para um losango de paralelo → ele viraria junção e travaria.
 *      A volta só aponta para ATIVIDADE.
 *   3. Volta saindo de dentro de um paralelo → duplicaria os ramos irmãos. Proibido.
 *   4. Encerrar dentro de um paralelo → os irmãos seguiriam e o processo terminaria
 *      "sem conclusão". Proibido.
 * As proibições vivem em `validarBlocos` (o editor nem oferece a opção nesses lugares).
 */
import type { WfGraph, WfNodeType } from './types'
import type { ProblemaAtivacao } from './activation-guard'

/** Condição estruturada de um caminho (mesma forma do EdgeConditionSpec do editor). */
export interface CondicaoCaminho { logic: 'AND' | 'OR'; rules: Array<{ campo: string; op: string; valor: string }> }

export interface ItemAtividade { kind: 'atividade'; id: string; tipo: 'userTask' | 'serviceTask'; nome?: string }

export type FimCaminho = { tipo: 'segue' } | { tipo: 'encerra' } | { tipo: 'volta'; alvoId: string }

export interface CaminhoCondicional {
  id: string
  /** rótulo escrito pela pessoa; sem ele, o editor mostra a condição em português */
  rotulo?: string
  /** expressão que o motor avalia — gerada pelo construtor a partir de `conditionSpec` */
  condition?: string
  conditionSpec?: CondicaoCaminho
  itens: ItemFluxo[]
  fim: FimCaminho
}
export interface CaminhoPadrao { id: string; itens: ItemFluxo[]; fim: FimCaminho }
export interface BlocoEscolha {
  kind: 'escolha'
  id: string
  pergunta?: string
  caminhos: CaminhoCondicional[]
  casoContrario: CaminhoPadrao
}

export interface CaminhoParalelo { id: string; itens: ItemFluxo[] }
export interface BlocoParalelo { kind: 'paralelo'; id: string; nome?: string; caminhos: CaminhoParalelo[] }

export type ItemFluxo = ItemAtividade | BlocoEscolha | BlocoParalelo

export interface FluxoBlocos {
  versao: 1
  inicioId: string
  fimId: string
  itens: ItemFluxo[]
}

/** Grafo no formato do editor (o mesmo de `formSchema.graph`). */
export interface NoGerado { id: string; type: WfNodeType; name?: string }
export interface SetaGerada {
  id: string; from: string; to: string
  condition?: string; isDefault?: boolean; label?: string; conditionSpec?: CondicaoCaminho
}
export interface GrafoGerado { nodes: NoGerado[]; edges: SetaGerada[] }

/** Sufixo do nó de reencontro/junção gerado para um bloco (ou caminho). */
export const SUFIXO_REENCONTRO = '__fim'
export const ROTULO_CASO_CONTRARIO = 'Caso contrário'

export const novoFluxo = (inicioId = 'start', fimId = 'end'): FluxoBlocos => ({ versao: 1, inicioId, fimId, itens: [] })

/* ─── blocos → grafo ─────────────────────────────────────────────────────────── */

type PropsSeta = Pick<SetaGerada, 'condition' | 'conditionSpec' | 'label' | 'isDefault'>
/** Uma seta que ainda vai nascer: sai de `from` e aponta para o próximo item. */
interface Pendente { from: string; props?: PropsSeta }

export function blocosParaGrafo(f: FluxoBlocos): GrafoGerado {
  const nodes: NoGerado[] = [{ id: f.inicioId, type: 'start' }]
  const edges: SetaGerada[] = []
  const ids = new Map<string, number>()
  /* Posição de cada caminho na escolha. O motor testa as saídas NA ORDEM em que aparecem
     no grafo, mas a seta de um caminho VAZIO só nasce no reencontro, depois das outras.
     Sem reordenar no fim, um caminho vazio em 1º lugar seria testado por último. */
  const ordemDoCaminho = new Map<PropsSeta, number>()
  const ordemDaSeta = new Map<SetaGerada, number>()
  const escolhas: string[] = []

  const ligar = (p: Pendente, to: string) => {
    const base = `f_${p.from}__${to}`
    const n = (ids.get(base) ?? 0) + 1
    ids.set(base, n)
    const seta: SetaGerada = { id: n === 1 ? base : `${base}_${n}`, from: p.from, to }
    if (p.props && ordemDoCaminho.has(p.props)) ordemDaSeta.set(seta, ordemDoCaminho.get(p.props)!)
    const pr = p.props
    if (pr?.condition?.trim()) seta.condition = pr.condition
    if (pr?.conditionSpec?.rules?.length) seta.conditionSpec = pr.conditionSpec
    if (pr?.label?.trim()) seta.label = pr.label
    if (pr?.isDefault) seta.isDefault = true
    edges.push(seta)
  }

  /** Reúne várias saídas num ponto só (losango de uma saída = passagem pura no motor). */
  const reencontrar = (saidas: Pendente[], id: string): Pendente[] => {
    if (saidas.length <= 1) return saidas
    nodes.push({ id, type: 'exclusiveGateway' })
    saidas.forEach((p) => ligar(p, id))
    return [{ from: id }]
  }

  const sequencia = (itens: ItemFluxo[], entrada: Pendente[]): Pendente[] =>
    itens.reduce((pend, it) => item(it, pend), entrada)

  const item = (it: ItemFluxo, pend: Pendente[]): Pendente[] => {
    if (it.kind === 'atividade') {
      nodes.push({ id: it.id, type: it.tipo, name: it.nome })
      pend.forEach((p) => ligar(p, it.id))
      return [{ from: it.id }]
    }

    if (it.kind === 'escolha') {
      nodes.push({ id: it.id, type: 'exclusiveGateway', name: it.pergunta })
      escolhas.push(it.id)
      pend.forEach((p) => ligar(p, it.id))
      const seguem: Pendente[] = []
      const caminho = (itens: ItemFluxo[], fim: FimCaminho, props: PropsSeta) => {
        ordemDoCaminho.set(props, ordemDoCaminho.size)
        const saida = sequencia(itens, [{ from: it.id, props }])
        if (fim.tipo === 'segue') seguem.push(...saida)
        else if (fim.tipo === 'encerra') saida.forEach((p) => ligar(p, f.fimId))
        else saida.forEach((p) => ligar(p, fim.alvoId))
      }
      for (const c of it.caminhos) {
        caminho(c.itens, c.fim, { condition: c.condition, conditionSpec: c.conditionSpec, label: c.rotulo })
      }
      caminho(it.casoContrario.itens, it.casoContrario.fim, { isDefault: true, label: ROTULO_CASO_CONTRARIO })
      return reencontrar(seguem, it.id + SUFIXO_REENCONTRO)
    }

    // paralelo
    nodes.push({ id: it.id, type: 'parallelGateway', name: it.nome })
    pend.forEach((p) => ligar(p, it.id))
    const chegadas: Pendente[] = []
    for (const c of it.caminhos) {
      /* armadilha 1: um caminho entrega UMA chegada à junção, mesmo com escolhas dentro */
      chegadas.push(...reencontrar(sequencia(c.itens, [{ from: it.id }]), c.id + SUFIXO_REENCONTRO))
    }
    const juncao = it.id + SUFIXO_REENCONTRO
    nodes.push({ id: juncao, type: 'parallelGateway' })
    chegadas.forEach((p) => ligar(p, juncao))
    return [{ from: juncao }]
  }

  sequencia(f.itens, [{ from: f.inicioId }]).forEach((p) => ligar(p, f.fimId))
  nodes.push({ id: f.fimId, type: 'end' })

  // saídas de cada escolha voltam à ordem dos caminhos, nas mesmas posições da lista
  for (const gid of escolhas) {
    const posicoes = edges.flatMap((e, i) => (e.from === gid ? [i] : []))
    const ordenadas = posicoes.map((i) => edges[i]).sort((a, b) => (ordemDaSeta.get(a) ?? 0) - (ordemDaSeta.get(b) ?? 0))
    posicoes.forEach((pos, k) => { edges[pos] = ordenadas[k] })
  }
  return { nodes, edges }
}

/** Grafo do editor → grafo que o motor executa. */
export function grafoParaMotor(g: GrafoGerado): WfGraph {
  const start = g.nodes.find((n) => n.type === 'start')
  const nodes: WfGraph['nodes'] = {}
  for (const n of g.nodes) nodes[n.id] = { id: n.id, type: n.type, ...(n.name ? { name: n.name } : {}) }
  return {
    startId: start?.id ?? '',
    nodes,
    edges: g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, ...(e.condition ? { condition: e.condition } : {}), ...(e.isDefault ? { isDefault: true } : {}) })),
  }
}

/* ─── grafo → blocos (só o que é linear) ─────────────────────────────────────── */

/** Lê um grafo LINEAR (início → atividades → fim) como blocos. Qualquer outra forma
 *  devolve `null`: estruturar um desenho livre arbitrário exigiria adivinhar a intenção
 *  de quem desenhou, e errar em silêncio seria pior do que dizer que não dá. */
export function grafoParaBlocos(
  nodes: Array<{ id: string; type: string; name?: string }>,
  edges: Array<{ from: string; to: string }>,
): FluxoBlocos | null {
  const starts = nodes.filter((n) => n.type === 'start')
  const ends = nodes.filter((n) => n.type === 'end')
  if (starts.length !== 1 || ends.length !== 1) return null
  const porId = new Map(nodes.map((n) => [n.id, n]))
  const saidas = (id: string) => edges.filter((e) => e.from === id)
  const entradas = (id: string) => edges.filter((e) => e.to === id)
  const itens: ItemFluxo[] = []
  let atual = starts[0].id
  const visto = new Set<string>([atual])
  for (;;) {
    const s = saidas(atual)
    if (s.length !== 1) return null
    const prox = porId.get(s[0].to)
    if (!prox || visto.has(prox.id) || entradas(prox.id).length !== 1) return null
    if (prox.type === 'end') break
    if (prox.type !== 'userTask' && prox.type !== 'serviceTask') return null
    itens.push({ kind: 'atividade', id: prox.id, tipo: prox.type, nome: prox.name })
    visto.add(prox.id)
    atual = prox.id
  }
  if (visto.size + 1 !== nodes.length) return null // sobrou nó fora da linha
  return { versao: 1, inicioId: starts[0].id, fimId: ends[0].id, itens }
}

/* ─── percorrer ──────────────────────────────────────────────────────────────── */

/** Todas as listas de itens do fluxo, com o id que as endereça ('raiz' ou id do caminho). */
function listas(f: FluxoBlocos): Array<{ ref: string; itens: ItemFluxo[] }> {
  const out: Array<{ ref: string; itens: ItemFluxo[] }> = []
  const visitar = (ref: string, itens: ItemFluxo[]) => {
    out.push({ ref, itens })
    for (const it of itens) {
      if (it.kind === 'escolha') {
        it.caminhos.forEach((c) => visitar(c.id, c.itens))
        visitar(it.casoContrario.id, it.casoContrario.itens)
      } else if (it.kind === 'paralelo') {
        it.caminhos.forEach((c) => visitar(c.id, c.itens))
      }
    }
  }
  visitar('raiz', f.itens)
  return out
}

export function acharItem(f: FluxoBlocos, id: string): ItemFluxo | undefined {
  for (const l of listas(f)) {
    const it = l.itens.find((x) => x.id === id)
    if (it) return it
  }
  return undefined
}

export function listarAtividades(f: FluxoBlocos): ItemAtividade[] {
  return listas(f).flatMap((l) => l.itens.filter((x): x is ItemAtividade => x.kind === 'atividade'))
}

/** Atividades que podem ser DESTINO de uma volta a partir da escolha `escolhaId`: as que
 *  vêm antes dela no fluxo e não moram dentro de um "ao mesmo tempo" (armadilha 3). */
export function destinosDeVolta(f: FluxoBlocos, escolhaId: string): ItemAtividade[] {
  let resultado: ItemAtividade[] | null = null
  const ativs = (itens: ItemFluxo[]): ItemAtividade[] => itens.flatMap((it) =>
    it.kind === 'atividade' ? [it]
      : it.kind === 'escolha' ? [...it.caminhos.flatMap((c) => ativs(c.itens)), ...ativs(it.casoContrario.itens)]
        : [])                                     // paralelo: nada de dentro dele
  const buscar = (itens: ItemFluxo[], antes: ItemAtividade[], dentroParalelo: boolean) => {
    const acumulado = [...antes]
    for (const it of itens) {
      if (resultado) return
      if (it.id === escolhaId) { resultado = dentroParalelo ? [] : acumulado; return }
      if (it.kind === 'escolha') {
        for (const c of [...it.caminhos, it.casoContrario]) buscar(c.itens, acumulado, dentroParalelo)
      } else if (it.kind === 'paralelo') {
        for (const c of it.caminhos) buscar(c.itens, acumulado, true)
      }
      acumulado.push(...ativs([it]))
    }
  }
  buscar(f.itens, [], false)
  return resultado ?? []
}

/* ─── validar ────────────────────────────────────────────────────────────────── */

export interface ProblemaBloco {
  tipo:
    | 'escolha-sem-caminho' | 'caminho-sem-condicao' | 'paralelo-com-um-caminho'
    | 'saida-dentro-de-paralelo' | 'volta-invalida' | 'trecho-inalcancavel'
  severidade: 'erro' | 'aviso'
  itemId: string
  mensagem: string
}

const nomeEscolha = (b: BlocoEscolha) => (b.pergunta?.trim() ? `A escolha “${b.pergunta.trim()}”` : 'Uma escolha sem pergunta')
const nomeParalelo = (b: BlocoParalelo) => (b.nome?.trim() ? `O bloco “${b.nome.trim()}”` : 'Um bloco “ao mesmo tempo” sem nome')

export function validarBlocos(f: FluxoBlocos): ProblemaBloco[] {
  const problemas: ProblemaBloco[] = []
  const atividadeIds = new Set(listarAtividades(f).map((a) => a.id))

  const conferirSequencia = (itens: ItemFluxo[], dentroParalelo: boolean) => {
    itens.forEach((it, i) => {
      if (it.kind === 'escolha') {
        const nome = nomeEscolha(it)
        if (it.caminhos.length === 0) {
          problemas.push({ tipo: 'escolha-sem-caminho', severidade: 'erro', itemId: it.id, mensagem: `${nome} só tem o caso contrário. Acrescente ao menos um caminho com condição.` })
        }
        it.caminhos.forEach((c, n) => {
          if (!c.condition?.trim()) {
            problemas.push({ tipo: 'caminho-sem-condicao', severidade: 'erro', itemId: it.id, mensagem: `${nome}: o ${n + 1}º caminho ainda não tem condição. Sem ela, ele seria escolhido sempre.` })
          }
        })
        const todos = [...it.caminhos, it.casoContrario]
        for (const c of todos) {
          if (dentroParalelo && c.fim.tipo !== 'segue') {
            problemas.push({ tipo: 'saida-dentro-de-paralelo', severidade: 'erro', itemId: it.id, mensagem: `${nome} está dentro de um bloco “ao mesmo tempo”: ali um caminho não pode ${c.fim.tipo === 'encerra' ? 'encerrar o processo' : 'voltar para outra atividade'}, porque os caminhos irmãos continuariam rodando.` })
          }
          if (c.fim.tipo === 'volta') {
            const alvo = c.fim.alvoId
            const validos = new Set(destinosDeVolta(f, it.id).map((a) => a.id))
            if (!atividadeIds.has(alvo) || (!dentroParalelo && !validos.has(alvo))) {
              problemas.push({ tipo: 'volta-invalida', severidade: 'erro', itemId: it.id, mensagem: `${nome}: um caminho volta para uma atividade que não vem antes desta escolha (ou que foi removida). Escolha outra atividade.` })
            }
          }
          conferirSequencia(c.itens, dentroParalelo)
        }
        if (todos.every((c) => c.fim.tipo !== 'segue') && i < itens.length - 1) {
          problemas.push({ tipo: 'trecho-inalcancavel', severidade: 'erro', itemId: it.id, mensagem: `${nome}: todos os caminhos encerram o processo ou voltam, então o que vem depois dela nunca será executado.` })
        }
      } else if (it.kind === 'paralelo') {
        if (it.caminhos.length < 2) {
          problemas.push({ tipo: 'paralelo-com-um-caminho', severidade: 'aviso', itemId: it.id, mensagem: `${nomeParalelo(it)} tem só ${it.caminhos.length === 1 ? 'um caminho' : 'nenhum caminho'}: nada acontece ao mesmo tempo.` })
        }
        it.caminhos.forEach((c) => conferirSequencia(c.itens, true))
      }
    })
  }
  conferirSequencia(f.itens, false)
  return problemas
}

/** Os problemas dos blocos na forma das pendências de ativação (editor e API). */
export function pendenciasDosBlocos(f: FluxoBlocos): ProblemaAtivacao[] {
  return validarBlocos(f).map((p) => ({ tipo: p.tipo, severidade: p.severidade, nodeId: p.itemId, mensagem: p.mensagem }))
}

/* ─── ler o que veio de fora ─────────────────────────────────────────────────── */

/** Id que também serve de id de elemento no BPMN (NCName simples). */
const ID_VALIDO = /^[A-Za-z_][A-Za-z0-9_.-]{0,120}$/

/** Confere a FORMA de um fluxo em blocos recebido de fora (JSON gravado, corpo de
 *  requisição). Devolve o fluxo tipado, ou `null` se algo não bate — id faltando ou
 *  repetido, tipo desconhecido, volta sem destino. A API usa isto antes de gerar o
 *  grafo: um JSON adulterado não pode virar grafo executável. */
export function lerFluxoBlocos(bruto: unknown): FluxoBlocos | null {
  const ids = new Set<string>()
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  const texto = (x: unknown) => x === undefined || typeof x === 'string'
  const idNovo = (x: unknown): boolean => {
    if (typeof x !== 'string' || !ID_VALIDO.test(x) || x.endsWith(SUFIXO_REENCONTRO) || ids.has(x)) return false
    ids.add(x)
    return true
  }
  const fimOk = (x: unknown): boolean => obj(x) && (x.tipo === 'segue' || x.tipo === 'encerra' || (x.tipo === 'volta' && typeof x.alvoId === 'string'))
  const condicaoOk = (x: unknown): boolean => x === undefined || (obj(x) && (x.logic === 'AND' || x.logic === 'OR') && Array.isArray(x.rules)
    && x.rules.every((r) => obj(r) && typeof r.campo === 'string' && typeof r.op === 'string' && typeof r.valor === 'string'))
  const itensOk = (x: unknown): boolean => Array.isArray(x) && x.every(itemOk)
  const itemOk = (it: unknown): boolean => {
    if (!obj(it) || !idNovo(it.id)) return false
    if (it.kind === 'atividade') return (it.tipo === 'userTask' || it.tipo === 'serviceTask') && texto(it.nome)
    if (it.kind === 'escolha') {
      return texto(it.pergunta) && Array.isArray(it.caminhos)
        && it.caminhos.every((c) => obj(c) && idNovo(c.id) && texto(c.rotulo) && texto(c.condition) && condicaoOk(c.conditionSpec) && fimOk(c.fim) && itensOk(c.itens))
        && obj(it.casoContrario) && idNovo(it.casoContrario.id) && fimOk(it.casoContrario.fim) && itensOk(it.casoContrario.itens)
    }
    if (it.kind === 'paralelo') {
      return texto(it.nome) && Array.isArray(it.caminhos) && it.caminhos.every((c) => obj(c) && idNovo(c.id) && itensOk(c.itens))
    }
    return false
  }
  if (!obj(bruto) || bruto.versao !== 1 || !idNovo(bruto.inicioId) || !idNovo(bruto.fimId) || !itensOk(bruto.itens)) return null
  return bruto as unknown as FluxoBlocos
}

/* ─── editar (sempre devolve um fluxo NOVO) ───────────────────────────────────── */

const clonar = (f: FluxoBlocos): FluxoBlocos => JSON.parse(JSON.stringify(f)) as FluxoBlocos

function listaPorRef(f: FluxoBlocos, ref: string): ItemFluxo[] | undefined {
  return listas(f).find((l) => l.ref === ref)?.itens
}

/** Onde mora o item: a lista e a posição. */
function localDe(f: FluxoBlocos, id: string): { itens: ItemFluxo[]; indice: number } | undefined {
  for (const l of listas(f)) {
    const indice = l.itens.findIndex((x) => x.id === id)
    if (indice >= 0) return { itens: l.itens, indice }
  }
  return undefined
}

export function inserirItem(f: FluxoBlocos, ref: string, indice: number, novo: ItemFluxo): FluxoBlocos {
  const g = clonar(f)
  const lista = listaPorRef(g, ref)
  if (!lista) return f
  lista.splice(Math.max(0, Math.min(indice, lista.length)), 0, novo)
  return g
}

/** Ids de tudo que mora dentro do item (inclusive ele e seus caminhos). */
function idsInternos(it: ItemFluxo): Set<string> {
  const ids = new Set<string>([it.id])
  const visitar = (x: ItemFluxo) => {
    ids.add(x.id)
    if (x.kind === 'escolha') {
      for (const c of [...x.caminhos, x.casoContrario]) { ids.add(c.id); c.itens.forEach(visitar) }
    } else if (x.kind === 'paralelo') {
      for (const c of x.caminhos) { ids.add(c.id); c.itens.forEach(visitar) }
    }
  }
  visitar(it)
  return ids
}

/** Caminhos que voltavam para uma atividade que deixou de existir passam a seguir. */
function soltarVoltasOrfas(g: FluxoBlocos): void {
  const existentes = new Set(listarAtividades(g).map((a) => a.id))
  for (const l of listas(g)) {
    for (const it of l.itens) {
      if (it.kind !== 'escolha') continue
      for (const c of [...it.caminhos, it.casoContrario]) {
        if (c.fim.tipo === 'volta' && !existentes.has(c.fim.alvoId)) c.fim = { tipo: 'segue' }
      }
    }
  }
}

export function removerItem(f: FluxoBlocos, id: string): FluxoBlocos {
  const g = clonar(f)
  const local = localDe(g, id)
  if (!local) return f
  local.itens.splice(local.indice, 1)
  soltarVoltasOrfas(g)
  return g
}

export function moverItem(f: FluxoBlocos, id: string, ref: string, indice: number): FluxoBlocos {
  const item = acharItem(f, id)
  if (!item || idsInternos(item).has(ref)) return f          // bloco não entra em si mesmo
  const g = clonar(f)
  const origem = localDe(g, id)
  const destino = listaPorRef(g, ref)
  if (!origem || !destino) return f
  const [movido] = origem.itens.splice(origem.indice, 1)
  const ajuste = origem.itens === destino && origem.indice < indice ? indice - 1 : indice
  destino.splice(Math.max(0, Math.min(ajuste, destino.length)), 0, movido)
  return g
}

export function atualizarItem(f: FluxoBlocos, id: string, patch: Partial<ItemFluxo>): FluxoBlocos {
  const g = clonar(f)
  const local = localDe(g, id)
  if (!local) return f
  local.itens[local.indice] = { ...local.itens[local.indice], ...patch, id, kind: local.itens[local.indice].kind } as ItemFluxo
  return g
}

export function adicionarCaminho(f: FluxoBlocos, blocoId: string, caminhoId: string): FluxoBlocos {
  const g = clonar(f)
  const b = acharItem(g, blocoId)
  if (!b || b.kind === 'atividade') return f
  if (b.kind === 'escolha') b.caminhos.push({ id: caminhoId, itens: [], fim: { tipo: 'segue' } })
  else b.caminhos.push({ id: caminhoId, itens: [] })
  return g
}

/** Remove um caminho. O "caso contrário" não sai: ele é o que torna a escolha segura. */
export function removerCaminho(f: FluxoBlocos, blocoId: string, caminhoId: string): FluxoBlocos {
  const g = clonar(f)
  const b = acharItem(g, blocoId)
  if (!b || b.kind === 'atividade') return f
  const antes = b.caminhos.length
  if (b.kind === 'escolha') b.caminhos = b.caminhos.filter((c) => c.id !== caminhoId)
  else b.caminhos = b.caminhos.filter((c) => c.id !== caminhoId)
  if (b.caminhos.length === antes) return f
  soltarVoltasOrfas(g)
  return g
}

/** Sobe (-1) ou desce (+1) um caminho condicional. A ORDEM importa: o motor segue pelo
 *  primeiro caminho cuja condição for verdadeira. O caso contrário fica sempre por último. */
export function moverCaminho(f: FluxoBlocos, blocoId: string, caminhoId: string, delta: -1 | 1): FluxoBlocos {
  const g = clonar(f)
  const b = acharItem(g, blocoId)
  if (!b || b.kind === 'atividade') return f
  const lista: Array<{ id: string }> = b.caminhos
  const de = lista.findIndex((c) => c.id === caminhoId)
  const para = de + delta
  if (de < 0 || para < 0 || para >= lista.length) return f
  const [c] = lista.splice(de, 1)
  lista.splice(para, 0, c)
  return g
}

type PatchCaminho = Partial<Omit<CaminhoCondicional, 'id' | 'itens'>>
export function atualizarCaminho(f: FluxoBlocos, caminhoId: string, patch: PatchCaminho): FluxoBlocos {
  const g = clonar(f)
  for (const l of listas(g)) {
    for (const it of l.itens) {
      if (it.kind === 'escolha') {
        const c = it.caminhos.find((x) => x.id === caminhoId)
        if (c) { Object.assign(c, patch); return g }
        if (it.casoContrario.id === caminhoId) {
          if (patch.fim) it.casoContrario.fim = patch.fim
          return g
        }
      }
    }
  }
  return f
}
