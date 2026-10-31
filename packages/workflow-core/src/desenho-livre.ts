/* ─── Desenho livre (v2) ───────────────────────────────────────────────────────
   Spec: docs/superpowers/specs/2026-10-30-desenho-livre-design.md. O desenho (formas +
   setas) é a fonte da verdade do editor; os blocos são derivados dele (`desenhoParaBlocos`)
   e voltam para ele (`blocosParaDesenho`) quando o Roteiro muda a estrutura. */

import type { DesenhoV2, FormaDesenho, RaiaDesenho, SetaDesenho, TipoForma } from '@nxt/types'
import { lerDesenho } from './desenho'
import {
  SUFIXO_REENCONTRO, blocosParaGrafo, modoDaEscolha, temSenaoAntigo,
  type BlocoEscolha, type BlocoParalelo, type CaminhoCondicional, type CaminhoPadrao, type FimCaminho, type FluxoBlocos, type ItemAtividade, type ItemFluxo, type SetaGerada,
} from './blocos'

const TIPOS: readonly TipoForma[] = ['start', 'end', 'userTask', 'serviceTask', 'exclusiveGateway', 'parallelGateway']

/** Confere o JSON gravado. Seta para forma inexistente é descartada (sobra de exclusão);
 *  forma repetida ou estrutura errada invalidam o desenho. */
export function lerDesenhoV2(bruto: unknown): DesenhoV2 | null {
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  if (!obj(bruto) || bruto.versao !== 2 || !Array.isArray(bruto.formas) || !Array.isArray(bruto.setas)) return null
  // posições e raias têm as mesmas regras do v1
  if (!lerDesenho({ versao: 1, posicoes: bruto.posicoes, raias: bruto.raias })) return null
  const ids = new Set<string>()
  const formas: FormaDesenho[] = []
  for (const f of bruto.formas) {
    if (!obj(f) || typeof f.id !== 'string' || !TIPOS.includes(f.tipo as TipoForma) || ids.has(f.id)) return null
    ids.add(f.id)
    formas.push(f as unknown as FormaDesenho)
  }
  const setas: SetaDesenho[] = []
  for (const s of bruto.setas) {
    if (!obj(s) || typeof s.id !== 'string' || typeof s.de !== 'string' || typeof s.para !== 'string') return null
    if (ids.has(s.de) && ids.has(s.para)) setas.push(s as unknown as SetaDesenho)
  }
  return { versao: 2, formas, setas, posicoes: bruto.posicoes as DesenhoV2['posicoes'], raias: bruto.raias as DesenhoV2['raias'] }
}

/** Todos os itens do fluxo, em qualquer profundidade, por id. */
function itensPorId(f: FluxoBlocos): Map<string, ItemFluxo> {
  const m = new Map<string, ItemFluxo>()
  const visitar = (itens: ItemFluxo[]) => {
    for (const it of itens) {
      m.set(it.id, it)
      if (it.kind === 'escolha') for (const c of [...it.caminhos, it.casoContrario]) visitar(c.itens)
      else if (it.kind === 'paralelo') for (const c of it.caminhos) visitar(c.itens)
    }
  }
  visitar(f.itens)
  return m
}

/** Blocos → desenho. Volta da estrutura mudada pelo Roteiro (e abertura de workflows em
 *  blocos): ids, posições e raias do que já existia ficam; formas novas ficam sem posição
 *  (o editor completa). A seta que sai do losango para um caminho leva o id do caminho —
 *  é o que liga a condição editada no bloco à seta do desenho (e vice-versa). */
export function blocosParaDesenho(
  f: FluxoBlocos,
  anterior?: { posicoes: Record<string, { x: number; y: number }>; raias: RaiaDesenho[] } | null,
): DesenhoV2 {
  const g = blocosParaGrafo(f, { juncaoSempre: true })
  const itens = itensPorId(f)
  const formas: FormaDesenho[] = g.nodes.map((n) => {
    const tipo: TipoForma = n.type === 'inclusiveGateway' ? 'exclusiveGateway' : (n.type as TipoForma)
    const forma: FormaDesenho = { id: n.id, tipo }
    const it = itens.get(n.id)
    if (it?.kind === 'atividade') {
      if (it.nome) forma.nome = it.nome
      if (it.vinculoDe) forma.vinculoDe = it.vinculoDe
    } else if (it?.kind === 'escolha') {
      forma.modo = modoDaEscolha(it)
      if (it.pergunta) forma.pergunta = it.pergunta
    } else if (it?.kind === 'paralelo') {
      if (it.nome) forma.nome = it.nome
    }
    return forma
  })
  // as saídas de cada losango que divide, na ordem dos caminhos (blocosParaGrafo as ordena)
  const idDoCaminho = new Map<SetaGerada, string>()
  for (const it of itens.values()) {
    if (it.kind === 'atividade') continue
    const caminhos = it.kind === 'escolha' ? [...it.caminhos, ...(temSenaoAntigo(it) ? [it.casoContrario] : [])] : it.caminhos
    g.edges.filter((e) => e.from === it.id).forEach((e, i) => { if (caminhos[i]) idDoCaminho.set(e, caminhos[i].id) })
  }
  const setas: SetaDesenho[] = g.edges.map((e) => {
    const s: SetaDesenho = { id: idDoCaminho.get(e) ?? e.id, de: e.from, para: e.to }
    if (e.condition) s.condition = e.condition
    if (e.conditionSpec) s.conditionSpec = e.conditionSpec as SetaDesenho['conditionSpec'] // mesma forma; o tipo da tela é mais estreito nos operadores
    if (e.label) s.rotulo = e.label
    if (e.isDefault) s.padrao = true
    return s
  })
  const vivos = new Set(formas.map((x) => x.id))
  const posicoes = Object.fromEntries(Object.entries(anterior?.posicoes ?? {}).filter(([id]) => vivos.has(id)))
  return { versao: 2, formas, setas, posicoes, raias: anterior?.raias ?? [] }
}

/* ─── Conversor: desenho → blocos ──────────────────────────────────────────────
   Percorre o desenho a partir do Início e monta os blocos (spec §2). Um losango com ≥2
   saídas abre um bloco; cada saída é um caminho, analisado até: o Fim (encerra), uma
   forma já percorrida na rota (volta), um losango de uma saída (o que junta) ou uma
   forma que outro caminho do mesmo bloco também alcança (reencontro). O que não se
   encaixa vira PROBLEMA com a frase e as formas/setas culpadas. */

export interface ProblemaDoDesenho {
  tipo: string
  mensagem: string
  formas: string[]
  setas: string[]
  severidade?: 'aviso'
}
export type Conversao =
  | { ok: true; fluxo: FluxoBlocos; avisos: ProblemaDoDesenho[] }
  | { ok: false; problemas: ProblemaDoDesenho[] }

class Recusa extends Error {
  constructor(readonly problema: ProblemaDoDesenho) { super(problema.mensagem) }
}

type Fim = FimCaminho
interface Trecho { itens: ItemFluxo[]; fim: Fim; /** forma onde o trecho parou (reencontro), quando segue */ ate?: string }

export function desenhoParaBlocos(d: DesenhoV2, opcoes: { nomeDe?: (id: string) => string } = {}): Conversao {
  const formas = new Map(d.formas.map((f) => [f.id, f]))
  const saidas = (id: string) => d.setas.filter((s) => s.de === id)
  const entradas = (id: string) => d.setas.filter((s) => s.para === id)
  const nome = (id: string) => opcoes.nomeDe?.(id) || formas.get(id)?.nome || 'etapa sem nome'
  const ehLosango = (id: string) => { const t = formas.get(id)?.tipo; return t === 'exclusiveGateway' || t === 'parallelGateway' }
  const recusar = (tipo: string, mensagem: string, f: string[] = [], s: string[] = []): never => { throw new Recusa({ tipo, mensagem, formas: f, setas: s }) }
  const avisos: ProblemaDoDesenho[] = []
  const percorridas = new Set<string>()

  const inicios = d.formas.filter((f) => f.tipo === 'start')
  const fins = d.formas.filter((f) => f.tipo === 'end')
  if (inicios.length !== 1 || fins.length !== 1) {
    return { ok: false, problemas: [{ tipo: 'inicio-fim', mensagem: 'O desenho precisa de um Início e de um Fim.', formas: [], setas: [] }] }
  }
  const inicio = inicios[0].id, fim = fins[0].id

  /** Formas alcançáveis a partir de `de`, sem passar pela rota (que vira volta) nem pelo Fim. */
  const alcance = (de: string, rota: Set<string>): Set<string> => {
    const vistos = new Set<string>(), fila = [de]
    while (fila.length) {
      const x = fila.shift()!
      if (vistos.has(x) || rota.has(x) || x === fim) continue
      vistos.add(x)
      for (const s of saidas(x)) fila.push(s.para)
    }
    return vistos
  }

  /** Um trecho a partir de `de`. `outros` = formas que outros caminhos do mesmo bloco
   *  alcançam (encontrar uma delas é o reencontro); `dentroDeBloco` = um losango de uma
   *  saída é o que junta (fora de bloco, é "sem efeito"). */
  const trecho = (de: string, rota: Set<string>, outros: Set<string>, dentroDeBloco: boolean): Trecho => {
    const itens: ItemFluxo[] = []
    let atual = de
    for (let guarda = 0; guarda < 10_000; guarda++) {
      if (atual === fim) return { itens, fim: { tipo: 'encerra' } }
      if (outros.has(atual)) return { itens, fim: { tipo: 'segue' }, ate: atual }
      if (rota.has(atual)) return { itens, fim: { tipo: 'volta', alvoId: atual } }
      if (percorridas.has(atual)) {
        recusar('salto-do-encontro', 'Este caminho salta para depois do ponto em que os caminhos se juntam. Ligue-o ao losango que junta.', [atual])
      }
      const forma = formas.get(atual)!
      const sai = saidas(atual)
      if (!ehLosango(atual)) {
        if (forma.tipo === 'start') recusar('seta-no-inicio', 'Nenhuma seta pode chegar no Início.', [atual])
        if (sai.length === 0) recusar('sem-saida', `"${nome(atual)}" não leva a lugar nenhum: ligue-a ao próximo passo ou ao Fim.`, [atual])
        if (sai.length > 1) {
          recusar('saidas-multiplas', `Saem ${sai.length} setas de "${nome(atual)}". Para decidir entre elas, use uma Escolha; para fazer as duas, um Ao mesmo tempo.`, [atual], sai.map((s) => s.id))
        }
        const it: ItemAtividade = { kind: 'atividade', id: atual, tipo: forma.tipo === 'serviceTask' ? 'serviceTask' : 'userTask' }
        if (forma.nome) it.nome = forma.nome
        if (forma.vinculoDe) it.vinculoDe = forma.vinculoDe
        itens.push(it)
        percorridas.add(atual); rota.add(atual)
        atual = sai[0].para
        continue
      }
      if (sai.length === 0) recusar('sem-saida', 'Um losango não leva a lugar nenhum: ligue as saídas dele.', [atual])
      if (sai.length === 1) {
        if (dentroDeBloco) return { itens, fim: { tipo: 'segue' }, ate: atual }
        avisos.push({ tipo: 'losango-sem-efeito', severidade: 'aviso', mensagem: 'Um losango tem uma entrada e uma saída: ele não decide nada e foi ignorado.', formas: [atual], setas: [] })
        percorridas.add(atual)
        atual = sai[0].para
        continue
      }
      const r = bloco(atual, rota)
      itens.push(r.item)
      if (!r.depois) return { itens, fim: { tipo: 'segue' } } // todos os caminhos encerram/voltam
      atual = r.depois
    }
    return recusar('ciclo', 'O desenho dá voltas sem passar por uma decisão.', [de])
  }

  /** Bloco aberto pelo losango `id` (≥2 saídas). Devolve o item e de onde a sequência segue. */
  const bloco = (id: string, rotaAntes: Set<string>): { item: ItemFluxo; depois?: string } => {
    const forma = formas.get(id)!
    const ehEscolha = forma.tipo === 'exclusiveGateway'
    percorridas.add(id)
    const rota = new Set([...rotaAntes, id])
    const sai = saidas(id)
    const alcances = sai.map((s) => alcance(s.para, rota))
    const trechos = sai.map((s, i) => {
      const outros = new Set<string>()
      alcances.forEach((a, j) => { if (j !== i) a.forEach((x) => outros.add(x)) })
      return trecho(s.para, new Set(rota), outros, true)
    })
    // o ponto de encontro: todos os caminhos que seguem têm de chegar no MESMO lugar
    const seguem = trechos.map((t, i) => ({ t, s: sai[i] })).filter((x) => x.t.fim.tipo === 'segue')
    const encontros = [...new Set(seguem.map((x) => x.t.ate))]
    if (encontros.length > 1) {
      recusar('salto-do-encontro', 'Este caminho salta para depois do ponto em que os caminhos se juntam. Ligue-o ao losango que junta.', encontros.filter(Boolean) as string[], seguem.map((x) => x.s.id))
    }
    const encontro = encontros[0]
    let juntaId: string | undefined
    let depois: string | undefined
    if (encontro) {
      const tipoEncontro = formas.get(encontro)?.tipo
      if (ehEscolha && tipoEncontro === 'parallelGateway') {
        recusar('juncao-de-escolha', 'A junção espera todas as setas, mas elas vêm de uma escolha: só um caminho acontece e o processo ficaria parado.', [encontro], seguem.map((x) => x.s.id))
      }
      if (!ehEscolha && tipoEncontro !== 'parallelGateway') {
        recusar('ramos-sem-juncao', `Junte os ramos com um losango +; sem ele, "${nome(encontro)}" seria criada duas vezes.`, [encontro], seguem.map((x) => x.s.id))
      }
      if (ehLosango(encontro)) {
        const saiJ = saidas(encontro)
        if (saiJ.length !== 1) recusar('junta-e-divide', 'Um losango junta e divide ao mesmo tempo: use um losango para juntar e outro para dividir.', [encontro])
        juntaId = encontro
        percorridas.add(encontro)
        depois = saiJ[0].para
      } else {
        depois = encontro // reencontro implícito numa etapa (só escolha)
      }
    }
    if (!ehEscolha) {
      const ruim = trechos.findIndex((t) => t.fim.tipo !== 'segue')
      if (ruim >= 0) {
        const t = trechos[ruim]
        recusar(t.fim.tipo === 'volta' ? 'volta-sem-decisao' : 'ramos-sem-juncao',
          t.fim.tipo === 'volta'
            ? `A volta para "${nome(t.fim.alvoId)}" não depende de decisão: o processo repetiria para sempre.`
            : 'Junte os ramos com um losango +: todo ramo de um Ao mesmo tempo precisa chegar a ele.',
          [id], [sai[ruim].id])
      }
      const item: BlocoParalelo = { kind: 'paralelo', id, caminhos: trechos.map((t, i) => ({ id: sai[i].id, itens: t.itens })) }
      if (forma.nome) item.nome = forma.nome
      if (juntaId && juntaId !== id + SUFIXO_REENCONTRO) item.juntaId = juntaId
      return { item, depois }
    }
    const caminhos: CaminhoCondicional[] = []
    let casoContrario: CaminhoPadrao = { id: `${id}_senao`, itens: [], fim: { tipo: 'segue' } }
    trechos.forEach((t, i) => {
      const s = sai[i]
      if (s.padrao) { casoContrario = { id: s.id, itens: t.itens, fim: t.fim }; return }
      const c: CaminhoCondicional = { id: s.id, itens: t.itens, fim: t.fim }
      if (s.rotulo) c.rotulo = s.rotulo
      if (s.condition) c.condition = s.condition
      if (s.conditionSpec) c.conditionSpec = s.conditionSpec as CaminhoCondicional['conditionSpec']
      caminhos.push(c)
    })
    const item: BlocoEscolha = { kind: 'escolha', id, modo: forma.modo ?? 'primeiro', caminhos, casoContrario }
    if (forma.pergunta) item.pergunta = forma.pergunta
    if (juntaId && juntaId !== id + SUFIXO_REENCONTRO) item.juntaId = juntaId
    return { item, depois }
  }

  try {
    const primeira = saidas(inicio)
    if (primeira.length !== 1) recusar('inicio-desligado', 'O Início precisa de uma seta para o primeiro passo.', [inicio])
    if (entradas(inicio).length) recusar('seta-no-inicio', 'Nenhuma seta pode chegar no Início.', [inicio], entradas(inicio).map((s) => s.id))
    const t = trecho(primeira[0].para, new Set([inicio]), new Set(), false)
    if (t.fim.tipo === 'volta') {
      recusar('volta-sem-decisao', `A volta para "${nome(t.fim.alvoId)}" não depende de decisão: o processo repetiria para sempre.`, [t.fim.alvoId])
    }
    const fluxo: FluxoBlocos = { versao: 1, inicioId: inicio, fimId: fim, itens: t.itens }
    const soltas = d.formas.filter((f) => f.tipo !== 'start' && f.tipo !== 'end' && !percorridas.has(f.id))
    if (soltas.length) {
      return { ok: false, problemas: soltas.map((f) => ({ tipo: 'fora-do-fluxo', mensagem: `"${nome(f.id)}" não está ligada ao fluxo que sai do Início.`, formas: [f.id], setas: [] })) }
    }
    /* As regras dos blocos (caminho sem condição, Senão antigo, volta inválida…) NÃO
       recusam a conversão: quem chama aplica `validarBlocos`/`pendenciasDosBlocos`, como
       sempre — senão uma escolha recém-criada (sem condição) travaria o Roteiro. */
    return { ok: true, fluxo, avisos }
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, problemas: [e.problema] }
    throw e
  }
}
