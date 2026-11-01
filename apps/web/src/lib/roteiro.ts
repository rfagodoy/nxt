import {
  faltasDaAtividade, localDoItem, modoDaEscolha, moverItem, religarVinculos, removerCaminho, temSenaoAntigo, validarBlocos,
  type CaminhoCondicional, type FimCaminho, type FluxoBlocos, type ItemFluxo, type ModoEscolha,
} from '@nxt/workflow-core'
import type { StepFormSchema } from '@nxt/types'

/* ─── Roteiro: o workflow em lista ─────────────────────────────────────────────
   Lógica pura da vista Roteiro (spec docs/superpowers/specs/2026-10-30-roteiro-design.md):
   dos blocos para o que a lista mostra. A tela só desenha o que sai daqui. */

export type Etiqueta =
  | { tipo: 'quem' | 'prazo' | 'tela' | 'devolve' | 'acao' | 'vinculo'; texto: string }
  | { tipo: 'falta'; texto: string }
  /** resposta que não vale mais (o papel escolhido foi excluído): pede outra */
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'carregando'; texto: 'carregando…' }

export interface EtapaRoteiro {
  kind: 'etapa'; id: string; ref: string; indice: number
  nome: string; tipo: 'userTask' | 'serviceTask'; etiquetas: Etiqueta[]; completa: boolean
}
export interface CaminhoRoteiro {
  id: string; condicao: string; itens: NoRoteiro[]; fim: FimCaminho; fimTexto: string
  /** caminho comum ainda sem condição (a ativação pede) */
  semCondicao: boolean
  /** o "Senão" antigo (casoContrario com conteúdo) */
  senao: boolean
}
export interface EscolhaRoteiro {
  kind: 'escolha'; id: string; ref: string; indice: number
  nome: string; modo: ModoEscolha; caminhos: CaminhoRoteiro[]; senaoAntigo: boolean
  /** pendências de ativação do bloco (as mesmas da pílula do topo) */
  problemas: string[]
}
export interface ParaleloRoteiro {
  kind: 'paralelo'; id: string; ref: string; indice: number
  nome: string; ramos: Array<{ id: string; itens: NoRoteiro[] }>
  problemas: string[]
}
export type NoRoteiro = EtapaRoteiro | EscolhaRoteiro | ParaleloRoteiro

export interface ConsultasDoRoteiro {
  steps: Record<string, StepFormSchema>
  /** undefined = sem papel; null = papel definido mas o nome ainda não chegou;
   *  false = a lista de papéis já chegou e o papel não está nela (foi excluído) */
  quemFaz: (id: string) => string | null | false | undefined
  prazo: (id: string) => string | null
  tela: (id: string) => string | null
  /** null = o padrão ("qualquer etapa anterior") */
  devolucao: (id: string) => string | null
  /** rótulo do conector da etapa automática */
  acao: (id: string) => string | null
  nomeDe: (id: string) => string
  condicaoDe: (c: CaminhoCondicional) => string
  /** pendências de ativação de um bloco (escolha / ao mesmo tempo), em frases */
  problemasDe?: (id: string) => string[]
}

function etapa(it: Extract<ItemFluxo, { kind: 'atividade' }>, ref: string, indice: number, c: ConsultasDoRoteiro): EtapaRoteiro {
  // vinculada: a configuração é a da raiz
  const fonte = it.vinculoDe ?? it.id
  const passo = c.steps[fonte]
  const etiquetas: Etiqueta[] = []
  if (it.vinculoDe) etiquetas.push({ tipo: 'vinculo', texto: `mesma etapa que ${c.nomeDe(it.vinculoDe)}` })
  const faltas: string[] = []
  if (it.tipo === 'serviceTask') {
    const acao = c.acao(fonte)
    if (acao) etiquetas.push({ tipo: 'acao', texto: acao })
    if (!passo?.stepName?.trim()) faltas.push('nome')
    if (!acao) faltas.push('ação')
  } else {
    const quem = c.quemFaz(fonte)
    if (quem === null) etiquetas.push({ tipo: 'carregando', texto: 'carregando…' })
    else if (quem === false) etiquetas.push({ tipo: 'aviso', texto: 'Papel removido — escolha outro' })
    else if (quem) etiquetas.push({ tipo: 'quem', texto: quem })
    const prazo = c.prazo(fonte)
    if (prazo) etiquetas.push({ tipo: 'prazo', texto: prazo })
    const tela = c.tela(fonte)
    if (tela) etiquetas.push({ tipo: 'tela', texto: tela })
    const devolve = c.devolucao(fonte)
    if (devolve) etiquetas.push({ tipo: 'devolve', texto: devolve })
    faltas.push(...faltasDaAtividade(passo ?? {}).filter((f) => !(f === 'quem faz' && quem === null)))
  }
  for (const f of faltas) etiquetas.push({ tipo: 'falta', texto: `falta ${f}` })
  return {
    kind: 'etapa', id: it.id, ref, indice,
    nome: passo?.stepName?.trim() ?? '', tipo: it.tipo,
    etiquetas, completa: faltas.length === 0 && !etiquetas.some((e) => e.tipo === 'aviso'),
  }
}

function textoFim(fim: FimCaminho, c: ConsultasDoRoteiro): string {
  if (fim.tipo === 'encerra') return 'encerra o processo'
  if (fim.tipo === 'volta') return `volta para ${c.nomeDe(fim.alvoId)}`
  return 'segue'
}

function lista(itens: ItemFluxo[], ref: string, c: ConsultasDoRoteiro): NoRoteiro[] {
  return itens.map((it, indice): NoRoteiro => {
    if (it.kind === 'atividade') return etapa(it, ref, indice, c)
    if (it.kind === 'escolha') {
      const senaoAntigo = temSenaoAntigo(it)
      const caminhos: CaminhoRoteiro[] = it.caminhos.map((cam) => ({
        id: cam.id, condicao: c.condicaoDe(cam), itens: lista(cam.itens, cam.id, c), fim: cam.fim, fimTexto: textoFim(cam.fim, c),
        semCondicao: !cam.condition?.trim(), senao: false,
      }))
      if (senaoAntigo) {
        const s = it.casoContrario
        caminhos.push({ id: s.id, condicao: 'Senão', itens: lista(s.itens, s.id, c), fim: s.fim, fimTexto: textoFim(s.fim, c), semCondicao: false, senao: true })
      }
      return {
        kind: 'escolha', id: it.id, ref, indice, nome: it.pergunta?.trim() ?? '', modo: modoDaEscolha(it), caminhos, senaoAntigo,
        problemas: c.problemasDe?.(it.id) ?? [],
      }
    }
    return {
      kind: 'paralelo', id: it.id, ref, indice, nome: it.nome?.trim() ?? '',
      ramos: it.caminhos.map((r) => ({ id: r.id, itens: lista(r.itens, r.id, c) })),
      problemas: c.problemasDe?.(it.id) ?? [],
    }
  })
}

/** Dos blocos para o que a lista do Roteiro mostra (ref/índice = onde cada item mora). */
export function montarRoteiro(f: FluxoBlocos, c: ConsultasDoRoteiro): NoRoteiro[] {
  return lista(f.itens, 'raiz', c)
}

/** "1 ramo", "2 ramos": o número com a palavra no singular ou no plural. */
export function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** Rótulo do "+" fixo no fim de uma lista: o workflow vazio pede a primeira etapa. */
export function rotuloDoFimDaLista(ref: string, quantos: number): string {
  if (ref !== 'raiz') return 'Etapa neste caminho'
  return quantos ? 'Etapa no fim' : 'Primeira etapa'
}

export type Soltura = { ok: true; fluxo: FluxoBlocos } | { ok: false; motivo: string }

/** Arrastar `itemId` para `destino` (mesma convenção de `moverItem`): só solta onde o motor
 *  aceita. Erros que o fluxo já tinha antes do arrasto não impedem — só os que ele criaria. */
export function podeSoltar(f: FluxoBlocos, itemId: string, destino: { ref: string; indice: number }): Soltura {
  const aqui = localDoItem(f, itemId)
  if (aqui && aqui.ref === destino.ref && (destino.indice === aqui.indice || destino.indice === aqui.indice + 1)) {
    return { ok: true, fluxo: f }
  }
  const g = moverItem(f, itemId, destino.ref, destino.indice)
  if (g === f) return { ok: false, motivo: 'Um bloco não pode entrar nele mesmo.' }
  // conta por tipo+bloco: um bloco que já tinha um erro não esconde um SEGUNDO do mesmo tipo
  const chave = (p: { tipo: string; itemId: string }) => `${p.tipo}|${p.itemId}`
  const antes = new Map<string, number>()
  for (const p of validarBlocos(f)) if (p.severidade === 'erro') antes.set(chave(p), (antes.get(chave(p)) ?? 0) + 1)
  for (const p of validarBlocos(g)) {
    if (p.severidade !== 'erro') continue
    const resta = antes.get(chave(p)) ?? 0
    if (resta > 0) { antes.set(chave(p), resta - 1); continue }
    return { ok: false, motivo: p.mensagem }
  }
  return { ok: true, fluxo: g }
}

/** Os itens da lista `ref` ('raiz' ou id de caminho / ramo), em qualquer profundidade. */
export function itensDaLista(f: FluxoBlocos, ref: string): ItemFluxo[] | undefined {
  if (ref === 'raiz') return f.itens
  const buscar = (itens: ItemFluxo[]): ItemFluxo[] | undefined => {
    for (const it of itens) {
      if (it.kind === 'atividade') continue
      const caminhos = it.kind === 'escolha' ? [...it.caminhos, it.casoContrario] : it.caminhos
      for (const c of caminhos) {
        if (c.id === ref) return c.itens
        const achou = buscar(c.itens)
        if (achou) return achou
      }
    }
    return undefined
  }
  return buscar(f.itens)
}

/** Remover um caminho de escolha leva as etapas dele; uma etapa vinculada cuja RAIZ estava
 *  ali promove a cópia (como `remover` faz com um item). Quem chama copia o passo da raiz
 *  para cada `promovidas[].para`. */
export function removerCaminhoComVinculos(f: FluxoBlocos, blocoId: string, caminhoId: string): { fluxo: FluxoBlocos; promovidas: Array<{ de: string; para: string }> } {
  return religarVinculos(removerCaminho(f, blocoId, caminhoId))
}

/** Pergunta da etapa em que uma pendência deve abrir (ids das perguntas em PerguntasDaEtapa). */
export function secaoDaPendencia(p: { tipo: string }, passo?: Pick<StepFormSchema, 'stepName' | 'executor' | 'slaBusinessDays' | 'slaBusinessHours' | 'slaBusinessMinutes'>): string | undefined {
  if (p.tipo === 'atividade-incompleta') {
    const [falta] = faltasDaAtividade(passo ?? {})
    return falta === 'nome' ? 'identificacao' : falta === 'quem faz' ? 'executor' : falta === 'prazo' ? 'prazo' : undefined
  }
  if (p.tipo.startsWith('executor-')) return 'executor'
  if (p.tipo === 'tela-so-consulta' || p.tipo === 'registro-sem-origem') return 'formulario'
  return undefined
}
