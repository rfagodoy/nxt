/* ─── Desenho livre (v2) ───────────────────────────────────────────────────────
   Spec: docs/superpowers/specs/2026-10-30-desenho-livre-design.md. O desenho (formas +
   setas) é a fonte da verdade do editor; os blocos são derivados dele (`desenhoParaBlocos`)
   e voltam para ele (`blocosParaDesenho`) quando o Roteiro muda a estrutura. */

import type { DesenhoV2, FormaDesenho, RaiaDesenho, SetaDesenho, TipoForma } from '@nxt/types'
import { lerDesenho } from './desenho'
import {
  ID_VALIDO, SUFIXO_REENCONTRO, blocosParaGrafo, lerFluxoBlocos, modoDaEscolha, temSenaoAntigo,
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

/** O losango que junta gerado pelo Roteiro tem o id da escolha + "__fim" — reservado aos
 *  losangos que juntam. Desenhada uma segunda saída nele, ele passa a DIVIDIR (vira bloco),
 *  e o id reservado faria a ativação recusar o desenho: troca-se o id dele (formas, setas e
 *  posição) por um livre, uma vez só — gravado assim, fica. Sem nada a trocar, devolve `d`. */
export function semIdsReservados(d: DesenhoV2): DesenhoV2 {
  const usados = new Set([...d.formas.map((f) => f.id), ...d.setas.map((s) => s.id)])
  const troca = new Map<string, string>()
  for (const f of d.formas) {
    if ((f.tipo !== 'exclusiveGateway' && f.tipo !== 'parallelGateway') || !f.id.endsWith(SUFIXO_REENCONTRO)) continue
    if (d.setas.filter((s) => s.de === f.id).length < 2) continue
    const base = `${f.id.slice(0, -SUFIXO_REENCONTRO.length)}_divide`
    let id = base
    for (let n = 2; usados.has(id); n++) id = `${base}_${n}`
    usados.add(id)
    troca.set(f.id, id)
  }
  if (!troca.size) return d
  const novo = (id: string) => troca.get(id) ?? id
  return {
    ...d,
    formas: d.formas.map((f) => (troca.has(f.id) ? { ...f, id: novo(f.id) } : f)),
    setas: d.setas.map((s) => (troca.has(s.de) || troca.has(s.para) ? { ...s, de: novo(s.de), para: novo(s.para) } : s)),
    posicoes: Object.fromEntries(Object.entries(d.posicoes).map(([id, p]) => [novo(id), p])),
  }
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
 *  é o que liga a condição editada no bloco à seta do desenho (e vice-versa). Com as formas
 *  e setas do desenho anterior, os losangos de passagem dele ficam (`manterPassagens`). */
export function blocosParaDesenho(
  f: FluxoBlocos,
  anterior?: { posicoes: Record<string, { x: number; y: number }>; raias: RaiaDesenho[]; formas?: FormaDesenho[]; setas?: SetaDesenho[] } | null,
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
    } else if (n.type === 'inclusiveGateway') {
      forma.modo = 'todos' // o que junta uma escolha "todos": só aparência (o conversor não lê)
    }
    // losango que não é item: é o que junta (do bloco ou de um caminho)
    if (!it && (n.type === 'exclusiveGateway' || n.type === 'inclusiveGateway' || n.type === 'parallelGateway')) forma.junta = true
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
  const d = anterior?.formas && anterior.setas
    ? manterPassagens(f, { versao: 2, formas: anterior.formas, setas: anterior.setas, posicoes: {}, raias: [] }, formas, setas)
    : { formas, setas }
  const vivos = new Set(d.formas.map((x) => x.id))
  const posicoes = Object.fromEntries(Object.entries(anterior?.posicoes ?? {}).filter(([id]) => vivos.has(id)))
  return { versao: 2, formas: d.formas, setas: d.setas, posicoes, raias: anterior?.raias ?? [] }
}

/** Os blocos sem o que não muda a execução: o losango que junta com o id de sempre, o
 *  "senão" vazio e o modo padrão da escolha. */
function blocosNormalizados(f: FluxoBlocos): string {
  return JSON.stringify(f, (_k, v) => {
    if (v && typeof v === 'object' && (v.kind === 'escolha' || v.kind === 'paralelo')) {
      const { juntaId, ...resto } = v
      const out = juntaId && juntaId !== v.id + SUFIXO_REENCONTRO ? { ...resto, juntaId } : resto
      if (v.kind !== 'escolha') return out
      const cc = v.casoContrario
      return { ...out, modo: v.modo ?? 'primeiro', casoContrario: !cc?.itens?.length && (cc?.fim?.tipo ?? 'segue') === 'segue' ? null : cc }
    }
    return v
  })
}

/** Losango de passagem (uma saída, "sem efeito" para o motor): os blocos não o têm, mas uma
 *  ação do Roteiro não o apaga do desenho (PO, 31/10/2026). Volta do desenho anterior antes
 *  da forma que vinha depois dele: as setas que chegam nela passam a chegar nele — todas, ou
 *  só as que já chegavam nele — e ele segue para ela. Só fica se o desenho continuar dando
 *  os MESMOS blocos que o Roteiro fez; se a forma de depois saiu, ele sai junto. */
function manterPassagens(f: FluxoBlocos, antes: DesenhoV2, formas: FormaDesenho[], setas: SetaDesenho[]): { formas: FormaDesenho[]; setas: SetaDesenho[] } {
  const c = desenhoParaBlocos(antes)
  if (!c.ok) return { formas, setas }
  const doFluxo = new Set(blocosParaGrafo(c.fluxo, { juncaoSempre: true }).nodes.map((n) => n.id))
  const presentes = new Set(formas.map((x) => x.id))
  let pendentes = antes.formas.filter((x) => (x.tipo === 'exclusiveGateway' || x.tipo === 'parallelGateway') && !doFluxo.has(x.id) && !presentes.has(x.id))
  const passagens = new Set(pendentes.map((x) => x.id))
  const saidaAntes = (id: string) => antes.setas.find((s) => s.de === id)
  /** a forma depois do losango (pulando outros de passagem logo em seguida) */
  const depois = (id: string): string | undefined => {
    let x: string | undefined = id
    for (let i = 0; x && passagens.has(x) && i <= passagens.size; i++) x = saidaAntes(x)?.para
    return x
  }
  const esperado = blocosNormalizados(f)
  const daOsMesmosBlocos = (fs: FormaDesenho[], ss: SetaDesenho[]) => {
    const r = desenhoParaBlocos({ versao: 2, formas: fs, setas: ss, posicoes: {}, raias: [] })
    return r.ok && blocosNormalizados(r.fluxo) === esperado
  }
  let fs = formas, ss = setas
  for (let mudou = true; mudou;) {
    mudou = false
    for (const L of pendentes) {
      const destino = depois(L.id)
      if (!destino || !fs.some((x) => x.id === destino)) continue
      const chegam = antes.setas.filter((s) => s.para === L.id)
      const jaChegava = (n: SetaDesenho) => chegam.some((e) => e.de === n.de && (n.id === e.id || !ss.some((x) => x.id === e.id && x.de === e.de)))
      const usados = new Set(ss.map((s) => s.id))
      const s0 = saidaAntes(L.id)
      let id = s0 && !usados.has(s0.id) ? s0.id : `f_${L.id}__${destino}`
      for (let n = 2; usados.has(id); n++) id = `f_${L.id}__${destino}_${n}`
      const saida: SetaDesenho = { ...(s0 ?? {}), id, de: L.id, para: destino }
      for (const religar of [(n: SetaDesenho) => n.para === destino, (n: SetaDesenho) => n.para === destino && jaChegava(n)]) {
        const religadas = new Set(ss.filter(religar))
        if (!religadas.size) continue
        const novas = [...ss.map((n) => (religadas.has(n) ? { ...n, para: L.id } : n)), saida]
        if (!daOsMesmosBlocos([...fs, L], novas)) continue
        ss = novas
        fs = [...fs, L]
        pendentes = pendentes.filter((x) => x !== L)
        mudou = true
        break
      }
    }
  }
  return { formas: fs, setas: ss }
}

/** A estrutura dos blocos sem os atributos que moram numa forma ou numa seta. */
function estruturaDosBlocos(f: FluxoBlocos): string {
  return JSON.stringify(f, (k, v) => (['nome', 'tipo', 'vinculoDe', 'pergunta', 'modo', 'condition', 'conditionSpec', 'rotulo'].includes(k) ? undefined : v))
}

/** Mudança vinda dos blocos (painel do bloco, Roteiro) que só troca ATRIBUTOS — condição e
 *  rótulo de caminho, pergunta e modo da escolha, nome do Ao mesmo tempo, tipo/nome/vínculo
 *  da etapa — vai direto para as formas e setas, sem refazer o desenho (refazer acrescentaria
 *  losangos que juntam e trocaria os ids das setas desenhadas à mão). `null` = a estrutura
 *  mudou; quem chama refaz com `blocosParaDesenho`. */
export function atributosNoDesenho(d: DesenhoV2, antes: FluxoBlocos, depois: FluxoBlocos): DesenhoV2 | null {
  if (estruturaDosBlocos(antes) !== estruturaDosBlocos(depois)) return null
  const itens = itensPorId(depois)
  const caminhos = new Map<string, CaminhoCondicional>()
  for (const it of itens.values()) if (it.kind === 'escolha') for (const c of it.caminhos) caminhos.set(c.id, c)
  const ids = new Set(d.setas.map((s) => s.id))
  if ([...caminhos.keys()].some((id) => !ids.has(id))) return null // caminho sem a seta dele: refaz
  const juntaDe = new Map<string, BlocoEscolha>()
  for (const it of itens.values()) if (it.kind === 'escolha') juntaDe.set(it.juntaId ?? it.id + SUFIXO_REENCONTRO, it)
  const sem = <T extends object>(o: T, k: keyof T, v: unknown): T => {
    const x = { ...o }
    if (v === undefined || v === '') delete x[k]
    else (x as Record<keyof T, unknown>)[k] = v
    return x
  }
  const formas = d.formas.map((fo) => {
    const it = itens.get(fo.id)
    let x = fo
    if (it?.kind === 'atividade') {
      x = sem(sem(sem(x, 'nome', it.nome), 'vinculoDe', it.vinculoDe), 'tipo', it.tipo)
    } else if (it?.kind === 'escolha') {
      x = sem(sem(x, 'pergunta', it.pergunta), 'modo', modoDaEscolha(it))
    } else if (it?.kind === 'paralelo') {
      x = sem(x, 'nome', it.nome)
    } else if (juntaDe.has(fo.id)) {
      // o que junta uma escolha "todos" tem a aparência dela
      x = sem(x, 'modo', modoDaEscolha(juntaDe.get(fo.id)!) === 'todos' ? 'todos' : undefined)
    }
    return x
  })
  const setas = d.setas.map((s) => {
    const c = caminhos.get(s.id)
    if (!c) return s
    return sem(sem(sem(s, 'condition', c.condition), 'conditionSpec', c.conditionSpec as SetaDesenho['conditionSpec']), 'rotulo', c.rotulo)
  })
  return { ...d, formas, setas }
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
  /** Losango que junta: marcado, ou com duas ou mais chegadas. O de uma chegada e uma saída
   *  sem marca DIVIDE (Escolha de um caminho só, como nasce pelo Roteiro) — exceto dentro de
   *  um bloco, onde só divide a Escolha (com `modo`): ali o losango desenhado à mão em que
   *  só um caminho chega (os outros encerram) é o que junta. */
  const ehJunta = (id: string, dentroDeBloco: boolean) => {
    const f = formas.get(id)
    if (f?.junta || entradas(id).length >= 2) return true
    return dentroDeBloco && !(f?.tipo === 'exclusiveGateway' && f.modo)
  }
  const recusar = (tipo: string, mensagem: string, f: string[] = [], s: string[] = []): never => { throw new Recusa({ tipo, mensagem, formas: f, setas: s }) }
  const avisos: ProblemaDoDesenho[] = []
  const percorridas = new Set<string>()
  /** Losango de passagem (uma saída, fora de bloco) → a forma depois dele: a volta que chega
   *  nele é volta para essa forma (ex.: o losango que junta a volta com o caminho de ida). */
  const passagem = new Map<string, string>()

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
      // o já percorrido (antes deste bloco) é destino de volta, não reencontro
      if (vistos.has(x) || rota.has(x) || x === fim || percorridas.has(x)) continue
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
        // etapa de antes deste bloco (dentro de uma escolha anterior, por exemplo): é volta
        if (!ehLosango(atual)) return { itens, fim: { tipo: 'volta', alvoId: atual } }
        const seguinte = passagem.get(atual)
        if (seguinte !== undefined) { atual = seguinte; continue }
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
      if (sai.length === 1 && ehJunta(atual, dentroDeBloco)) {
        if (dentroDeBloco) return { itens, fim: { tipo: 'segue' }, ate: atual }
        // com duas ou mais entradas ele junta (a volta com o caminho de ida): não é aviso
        if (entradas(atual).length === 1) {
          avisos.push({ tipo: 'losango-sem-efeito', severidade: 'aviso', mensagem: 'Um losango tem uma entrada e uma saída: ele não decide nada e foi ignorado.', formas: [atual], setas: [] })
        }
        percorridas.add(atual)
        passagem.set(atual, sai[0].para)
        atual = sai[0].para
        continue
      }
      const r = bloco(atual, rota)
      itens.push(r.item)
      if (!r.depois) {
        // todos os caminhos encerram/voltam. Com itens depois (o Roteiro deixa: é a pendência
        // "trecho-inalcancavel"), o losango que junta, sem chegada, leva a eles
        const junta = atual + SUFIXO_REENCONTRO
        if (ehLosango(junta) && !entradas(junta).length && saidas(junta).length === 1 && !percorridas.has(junta)) {
          percorridas.add(junta)
          atual = saidas(junta)[0].para
          continue
        }
        return { itens, fim: { tipo: 'segue' } }
      }
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
    // o bloco só tem um "Senão" (casoContrario): com dois, um deles sumiria
    const padroes = sai.filter((s) => s.padrao)
    if (ehEscolha && padroes.length > 1) {
      recusar('senao-repetido', `Um losango tem ${padroes.length} caminhos "Senão": só um deles seria usado. Apague os que sobram.`, [id], padroes.map((s) => s.id))
    }
    /* `semOutrosInicios`: o alcance de um caminho não entra pelo começo dos outros. Só na 2ª
       tentativa — uma VOLTA de depois do bloco para dentro de um caminho dele faz os outros
       caminhos "alcançarem" esse começo, e o encontro sairia errado. */
    const tentar = (semOutrosInicios: boolean) => {
      const alcances = sai.map((s) => alcance(s.para, semOutrosInicios
        ? new Set([...rota, ...sai.filter((x) => x !== s).map((x) => x.para)]) : rota))
      const trechos = sai.map((s, i) => {
        const outros = new Set<string>()
        alcances.forEach((a, j) => { if (j !== i) a.forEach((x) => outros.add(x)) })
        return trecho(s.para, new Set(rota), outros, true)
      })
      // o ponto de encontro: todos os caminhos que seguem têm de chegar no MESMO lugar.
      // Caminho que "segue" sem ponto de parada (o bloco de dentro dele encerra/volta em
      // todos os caminhos) não chega a ponto de encontro nenhum.
      const seguem = trechos.map((t, i) => ({ t, s: sai[i] })).filter((x) => x.t.fim.tipo === 'segue' && x.t.ate !== undefined)
      const encontros = [...new Set(seguem.map((x) => x.t.ate))]
      if (encontros.length > 1) {
        recusar('salto-do-encontro', 'Este caminho salta para depois do ponto em que os caminhos se juntam. Ligue-o ao losango que junta.', encontros.filter(Boolean) as string[], seguem.map((x) => x.s.id))
      }
      return { trechos, seguem, encontros }
    }
    const antes = { percorridas: new Set(percorridas), avisos: avisos.length }
    let tentativa: ReturnType<typeof tentar>
    try {
      tentativa = tentar(false)
    } catch (e) {
      if (!(e instanceof Recusa) || e.problema.tipo !== 'salto-do-encontro') throw e
      percorridas.clear(); antes.percorridas.forEach((x) => percorridas.add(x)); avisos.length = antes.avisos
      try { tentativa = tentar(true) } catch { throw e }
    }
    const { trechos, seguem, encontros } = tentativa
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

  /** Seta repetida, ou id que os blocos não aceitam (inválido, repetido, terminando no
   *  sufixo do losango que junta): o editor não cria, mas um desenho gravado pode trazer. */
  const recusarIds = (ids: Set<string>) => recusar('id-invalido',
    'Há formas ou setas com identificação repetida ou inválida (desenho corrompido). Apague as destacadas e desenhe-as de novo.',
    d.formas.filter((f) => ids.has(f.id)).map((f) => f.id), [...new Set(d.setas.filter((s) => ids.has(s.id)).map((s) => s.id))])
  const idsRecusados = (f: FluxoBlocos): Set<string> => {
    const vistos = new Set<string>(), ruins = new Set<string>()
    const ver = (id: string) => { if (!ID_VALIDO.test(id) || id.endsWith(SUFIXO_REENCONTRO) || vistos.has(id)) ruins.add(id); vistos.add(id) }
    const visitar = (itens: ItemFluxo[]) => {
      for (const it of itens) {
        ver(it.id)
        if (it.kind === 'escolha') for (const c of [...it.caminhos, it.casoContrario]) { ver(c.id); visitar(c.itens) }
        else if (it.kind === 'paralelo') for (const c of it.caminhos) { ver(c.id); visitar(c.itens) }
      }
    }
    ver(f.inicioId); ver(f.fimId); visitar(f.itens)
    return ruins
  }

  try {
    const repetidas = new Set(d.setas.filter((s, i) => d.setas.findIndex((x) => x.id === s.id) !== i).map((s) => s.id))
    if (repetidas.size) recusarIds(repetidas)
    const primeira = saidas(inicio)
    if (primeira.length !== 1) recusar('inicio-desligado', 'O Início precisa de uma seta para o primeiro passo.', [inicio])
    if (entradas(inicio).length) recusar('seta-no-inicio', 'Nenhuma seta pode chegar no Início.', [inicio], entradas(inicio).map((s) => s.id))
    // etapa com duas saídas nunca vale: dita antes do percurso, que a leria como um salto
    // (a seta a mais faz outro caminho do bloco "alcançar" a etapa)
    for (const f of d.formas) {
      if (f.tipo !== 'userTask' && f.tipo !== 'serviceTask') continue
      const sai = saidas(f.id)
      if (sai.length > 1) {
        recusar('saidas-multiplas', `Saem ${sai.length} setas de "${nome(f.id)}". Para decidir entre elas, use uma Escolha; para fazer as duas, um Ao mesmo tempo.`, [f.id], sai.map((s) => s.id))
      }
    }
    const t = trecho(primeira[0].para, new Set([inicio]), new Set(), false)
    if (t.fim.tipo === 'volta') {
      recusar('volta-sem-decisao', `A volta para "${nome(t.fim.alvoId)}" não depende de decisão: o processo repetiria para sempre.`, [t.fim.alvoId])
    }
    const fluxo: FluxoBlocos = { versao: 1, inicioId: inicio, fimId: fim, itens: t.itens }
    // ids que a ativação recusaria ("desenho corrompido"): aqui viram pendência, com culpados
    if (!lerFluxoBlocos(fluxo)) {
      const ruins = idsRecusados(fluxo)
      if (ruins.size) recusarIds(ruins)
      // outro motivo (campo que não é texto, em dado antigo): sem culpado a apontar
      recusar('desenho-ilegivel', 'O desenho tem dados que o motor não consegue ler (desenho corrompido). Desfaça a última mudança ou refaça as formas alteradas por último.')
    }
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
