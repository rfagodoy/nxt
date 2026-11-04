/* ─── Gavetas do editor (estilo Bizagi): qual abre, configuração e contas ───────
   Puro. `gavetaDoAlvo` diz qual gaveta o duplo clique (Enter, "Parametrizar") abre; as
   `config*` completam a configuração gravada na forma com os padrões (o que a gaveta mostra);
   `restaurarAlvo` é o Cancelar das gavetas novas: devolve SÓ o que a gaveta edita ao estado da
   abertura (o resto do desenho — uma forma movida ao lado — fica como está). */
import type {
  ConfigFim, ConfigForma, ConfigSubprocesso, ConfigTemporizador, DesenhoV2, FaseDesenho, FormaDesenho, LayoutDesenho, SetaDesenho, StepFormSchema,
} from '@nxt/types'
import { varianteDe } from '@nxt/workflow-core'
import { herdaDaRaia, raiaDaForma } from './raias'
import { layoutDe, mudarOrientacao } from './layout'
import { TODOS_OS_ITENS, type ItemCatalogo } from './catalogo'

/** O que o desenho manda abrir (o `AlvoDaGaveta` do canvas). */
export type AlvoDeGaveta = { k: 'forma' | 'seta' | 'raia' | 'fase' | 'piscina' | 'mensagem'; id: string }

/** Id da piscina principal (o workflow) no `AlvoDeGaveta`; as externas vão pelo id delas. */
export const PISCINA_DO_PROCESSO = 'principal'

export type QualGaveta =
  /** as 5 perguntas de hoje (tarefa de usuário, ação automática) */
  | 'etapa'
  /** a escolha de hoje (no bloco ou o losango solto) */
  | 'escolha'
  /** o "ao mesmo tempo" de hoje, quando o losango é um bloco */
  | 'bloco'
  /** a gaveta nova da forma (início, fim, intermediário, subprocesso, envio…) */
  | 'forma'
  | 'seta' | 'raia' | 'fase' | 'piscinaPrincipal' | 'piscinaExterna' | 'mensagem'

/** Qual gaveta a forma abre. `ehBloco` = o losango é um bloco do fluxo (só o "ao mesmo tempo"
 *  usa: a escolha abre a de hoje sempre, no bloco ou solta). */
export function gavetaDaForma(f: Pick<FormaDesenho, 'tipo' | 'variante'>, ehBloco: boolean): 'etapa' | 'escolha' | 'bloco' | 'forma' {
  switch (f.tipo) {
    case 'serviceTask': return 'etapa'
    case 'userTask': return varianteDe(f) === 'usuario' ? 'etapa' : 'forma'
    case 'exclusiveGateway': return 'escolha'
    case 'parallelGateway': return ehBloco ? 'bloco' : 'forma'
    default: return 'forma'
  }
}

/** A gaveta do alvo; null se ele não existe mais no desenho. */
export function gavetaDoAlvo(alvo: AlvoDeGaveta, d: DesenhoV2, ehBloco: (id: string) => boolean = () => false): QualGaveta | null {
  const l = layoutDe(d)
  switch (alvo.k) {
    case 'forma': {
      const f = d.formas.find((x) => x.id === alvo.id)
      return f ? gavetaDaForma(f, ehBloco(f.id)) : null
    }
    case 'seta': return d.setas.some((s) => s.id === alvo.id) ? 'seta' : null
    case 'raia': return d.raias.some((r) => r.id === alvo.id) ? 'raia' : null
    case 'fase': return l.fases.some((f) => f.id === alvo.id) ? 'fase' : null
    case 'piscina':
      if (alvo.id === PISCINA_DO_PROCESSO) return 'piscinaPrincipal'
      return l.piscinasExternas.some((p) => p.id === alvo.id) ? 'piscinaExterna' : null
    case 'mensagem': return l.fluxosMensagem.some((m) => m.id === alvo.id) ? 'mensagem' : null
  }
}

/** O item da paleta que cria a forma (o ícone e o nome do chip da gaveta); undefined se nenhum. */
export function itemDaForma(f: Pick<FormaDesenho, 'tipo' | 'variante' | 'modo'>): ItemCatalogo | undefined {
  const v = varianteDe(f)
  return TODOS_OS_ITENS.find((i) => i.tipo === f.tipo && varianteDe(i) === v
    && (f.tipo !== 'exclusiveGateway' || (i.modo ?? 'primeiro') === (f.modo ?? 'primeiro')))
}

/** O nome do elemento como a paleta o chama ("Fim com erro", "Temporizador") — o rótulo da gaveta. */
export function nomeDoElemento(f: Pick<FormaDesenho, 'tipo' | 'variante' | 'modo'>): string {
  return itemDaForma(f)?.nome ?? 'Elemento'
}

/* ── configuração das formas novas ── */

type Livre = Record<string, string | number | boolean>
const ehObjeto = (c: unknown): c is Record<string, unknown> => !!c && typeof c === 'object' && !Array.isArray(c)

const UNIDADES: ReadonlyArray<ConfigTemporizador['unidade']> = ['diasUteis', 'diasCorridos', 'horasUteis']
const CAMPOS_DATA: ReadonlyArray<NonNullable<ConfigTemporizador['campoData']>> = ['vencimento', 'assinatura', 'inicioVigencia']

/** O temporizador como a gaveta o mostra: o gravado, completado pelos padrões. */
export function configTemporizador(c: ConfigForma | undefined): ConfigTemporizador {
  const o = ehObjeto(c) ? c : {}
  const espera = o.espera === 'data' ? 'data' : 'prazo'
  const n = typeof o.n === 'number' && Number.isFinite(o.n) && o.n >= 0 ? o.n : espera === 'data' ? 30 : 1
  const unidade = UNIDADES.includes(o.unidade as ConfigTemporizador['unidade']) ? o.unidade as ConfigTemporizador['unidade'] : 'diasUteis'
  const out: ConfigTemporizador = { espera, n, unidade }
  if (espera === 'data') {
    out.campoData = CAMPOS_DATA.includes(o.campoData as NonNullable<ConfigTemporizador['campoData']>) ? o.campoData as ConfigTemporizador['campoData'] : 'vencimento'
    out.sentido = o.sentido === 'depois' ? 'depois' : 'antes'
  }
  return out
}

export function configSubprocesso(c: ConfigForma | undefined): ConfigSubprocesso {
  const o = ehObjeto(c) ? c : {}
  const out: ConfigSubprocesso = {
    versao: o.versao === 'fixa' ? 'fixa' : 'ativa',
    levarContrato: o.levarContrato !== false,
    campos: Array.isArray(o.campos) ? o.campos.filter((x): x is string => typeof x === 'string') : [],
    esperar: o.esperar !== false,
  }
  if (typeof o.processId === 'string' && o.processId) out.processId = o.processId
  if (out.versao === 'fixa' && typeof o.versaoFixa === 'number') out.versaoFixa = o.versaoFixa
  return out
}

/** Fim com erro / cancelamento. `avisarQuemIniciou` nasce marcado (o mockup). */
export function configFim(c: ConfigForma | undefined): ConfigFim {
  const o = ehObjeto(c) ? c : {}
  const out: ConfigFim = { avisarQuemIniciou: o.avisarQuemIniciou !== false }
  if (typeof o.motivo === 'string') out.motivo = o.motivo
  if (typeof o.codigo === 'string') out.codigo = o.codigo
  return out
}

/** Configuração livre (envio, recebimento, início agendado/por evento): o gravado por cima dos
 *  padrões, só com as chaves e os tipos dos padrões. */
export function configLivre<T extends Livre>(c: ConfigForma | undefined, padrao: T): T {
  const o = ehObjeto(c) ? c : {}
  const out = { ...padrao }
  for (const k of Object.keys(padrao) as Array<keyof T>) {
    const v = o[k as string]
    if (typeof v === typeof padrao[k]) out[k] = v as T[keyof T]
  }
  return out
}

export const ENVIO_PADRAO = { para: '', canal: 'portal', levaMinuta: true, levaMensagem: true, levaAnexos: false }
export const RECEBIMENTO_PADRAO = { de: '', recebido: 'assinatura' }
export const INICIO_AGENDADO_PADRAO = { quando: 'contrato', quemIniciou: 'gestor' }
export const INICIO_EVENTO_PADRAO = { evento: 'criado' }

/** A forma com `patch` por cima da configuração (o mesmo objeto se nada muda). */
export function comConfig(f: FormaDesenho, patch: Record<string, unknown>): FormaDesenho {
  const atual = ehObjeto(f.config) ? f.config as Record<string, unknown> : {}
  if (Object.keys(patch).every((k) => atual[k] === patch[k])) return f
  const nova: Record<string, unknown> = { ...atual }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete nova[k]
    else nova[k] = v
  }
  return { ...f, config: nova as ConfigForma }
}

/** "a, b , ,c" → ['a', 'b', 'c'] (os campos que vão para o subprocesso). */
export const camposDoTexto = (texto: string): string[] => texto.split(',').map((x) => x.trim()).filter(Boolean)

/* ── listas e contas das gavetas ── */

export interface WorkflowDaLista { id: string; name: string; status: string; version?: number }

/** Workflows que um subprocesso pode chamar: os ATIVOS, menos este, por nome. */
export function workflowsAtivos<T extends WorkflowDaLista>(lista: readonly T[] | null | undefined, idAtual?: string): T[] {
  return (lista ?? [])
    .filter((w) => w.status === 'ACTIVE' && w.id !== idAtual)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Tarefas de usuário desenhadas na raia (pelo centro) e quantas seguem o executor padrão. */
export function tarefasNaRaia(
  d: DesenhoV2, raiaId: string, alturaDe: (id: string) => number, steps: Record<string, StepFormSchema | undefined>,
): { total: number; usamOPadrao: number } {
  let total = 0, usamOPadrao = 0
  for (const f of d.formas) {
    if (f.tipo !== 'userTask' || varianteDe(f) !== 'usuario') continue
    if (raiaDaForma(d, f.id, alturaDe)?.id !== raiaId) continue
    total++
    const s = steps[f.id]
    if (!s || herdaDaRaia(s)) usamOPadrao++
  }
  return { total, usamOPadrao }
}

/** Formas com o centro (x lógico) na fase: as fases vão lado a lado a partir de x = 0; antes da
 *  primeira conta na primeira e depois da última, na última (ela se estica até o fim). */
export function formasNaFase(fases: ReadonlyArray<Pick<FaseDesenho, 'id' | 'largura'>>, faseId: string, centrosX: readonly number[]): number {
  const i = fases.findIndex((f) => f.id === faseId)
  if (i === -1) return 0
  const inicio = fases.slice(0, i).reduce((s, f) => s + f.largura, 0)
  const de = i === 0 ? -Infinity : inicio
  const ate = i === fases.length - 1 ? Infinity : inicio + fases[i].largura
  return centrosX.filter((x) => x >= de && x < ate).length
}

/* ── Cancelar ── */

/** Volta ao estado da abertura (`antes`) só o que a gaveta do alvo edita. O que a gaveta não
 *  toca (posição, altura da raia, largura da fase) segue como está agora. Nada a desfazer =
 *  o mesmo desenho. A piscina principal só guarda aqui a orientação (nome, descrição e "quem
 *  inicia" moram fora do desenho). */
export function restaurarAlvo(atual: DesenhoV2, antes: DesenhoV2, alvo: AlvoDeGaveta): DesenhoV2 {
  switch (alvo.k) {
    case 'forma': {
      const velha = antes.formas.find((f) => f.id === alvo.id)
      const i = atual.formas.findIndex((f) => f.id === alvo.id)
      if (!velha || i === -1 || atual.formas[i] === velha) return atual
      return { ...atual, formas: atual.formas.map((f, j) => (j === i ? velha : f)) }
    }
    case 'raia': {
      const velha = antes.raias.find((r) => r.id === alvo.id)
      const i = atual.raias.findIndex((r) => r.id === alvo.id)
      if (!velha || i === -1) return atual
      const r = atual.raias[i]
      if (r.nome === velha.nome && r.executor === velha.executor) return atual
      const { executor: _, ...sem } = r
      const nova = velha.executor ? { ...sem, nome: velha.nome, executor: velha.executor } : { ...sem, nome: velha.nome }
      return { ...atual, raias: atual.raias.map((x, j) => (j === i ? nova : x)) }
    }
    case 'fase': {
      const l = layoutDe(atual)
      const velha = layoutDe(antes).fases.find((f) => f.id === alvo.id)
      const i = l.fases.findIndex((f) => f.id === alvo.id)
      if (!velha || i === -1) return atual
      const f = l.fases[i]
      if (f.nome === velha.nome && f.prazoDiasUteis === velha.prazoDiasUteis) return atual
      const { prazoDiasUteis: _, ...sem } = f
      const nova: FaseDesenho = velha.prazoDiasUteis === undefined ? { ...sem, nome: velha.nome } : { ...sem, nome: velha.nome, prazoDiasUteis: velha.prazoDiasUteis }
      return { ...atual, layout: { ...l, fases: l.fases.map((x, j) => (j === i ? nova : x)) } }
    }
    case 'piscina': {
      if (alvo.id === PISCINA_DO_PROCESSO) {
        const r = mudarOrientacao(atual, layoutDe(antes).orientacao)
        // workflow sem `layout` que só mudou a orientação e voltou: some o layout (senão "Não salvo" fica)
        if (!antes.layout && r.layout && layoutPadrao(r.layout)) { const { layout: _, ...sem } = r; return sem }
        return r
      }
      const l = layoutDe(atual)
      const velha = layoutDe(antes).piscinasExternas.find((p) => p.id === alvo.id)
      const i = l.piscinasExternas.findIndex((p) => p.id === alvo.id)
      if (!velha || i === -1) return atual
      const p = l.piscinasExternas[i]
      if (p.nome === velha.nome && p.quem === velha.quem && p.canal === velha.canal) return atual
      const nova = { ...p, nome: velha.nome, quem: velha.quem, canal: velha.canal }
      return { ...atual, layout: { ...l, piscinasExternas: l.piscinasExternas.map((x, j) => (j === i ? nova : x)) } }
    }
    case 'mensagem': {
      const l = layoutDe(atual)
      const velha = layoutDe(antes).fluxosMensagem.find((m) => m.id === alvo.id)
      const i = l.fluxosMensagem.findIndex((m) => m.id === alvo.id)
      if (!velha || i === -1 || l.fluxosMensagem[i].rotulo === velha.rotulo) return atual
      const { rotulo: _, ...sem } = l.fluxosMensagem[i]
      const nova = velha.rotulo === undefined ? sem : { ...sem, rotulo: velha.rotulo }
      return { ...atual, layout: { ...l, fluxosMensagem: l.fluxosMensagem.map((x, j) => (j === i ? nova : x)) } }
    }
    case 'seta': {
      const velha = antes.setas.find((x) => x.id === alvo.id)
      const i = atual.setas.findIndex((x) => x.id === alvo.id)
      if (!velha || i === -1 || atual.setas[i].rotulo === velha.rotulo) return atual
      const { rotulo: _, ...sem } = atual.setas[i]
      const nova = velha.rotulo === undefined ? sem : { ...sem, rotulo: velha.rotulo }
      return { ...atual, setas: atual.setas.map((x, j) => (j === i ? nova : x)) }
    }
  }
}

/** O executor padrão da raia (`undefined` tira). O mesmo desenho se nada muda. */
export function executorDaRaia(d: DesenhoV2, id: string, executor: StepFormSchema['executor']): DesenhoV2 {
  const i = d.raias.findIndex((r) => r.id === id)
  if (i === -1 || d.raias[i].executor === executor) return d
  const { executor: _, ...sem } = d.raias[i]
  const nova = executor ? { ...sem, executor } : sem
  return { ...d, raias: d.raias.map((r, j) => (j === i ? nova : r)) }
}

/** Nome da raia: em branco não grava (como renomear na faixa). */
export function nomeDaRaia(d: DesenhoV2, id: string, nome: string): DesenhoV2 {
  const limpo = nome.trim()
  const i = d.raias.findIndex((r) => r.id === id)
  if (!limpo || i === -1 || d.raias[i].nome === limpo) return d
  return { ...d, raias: d.raias.map((r, j) => (j === i ? { ...r, nome: limpo } : r)) }
}

/** O layout é o padrão (nada além do que um desenho sem `layout` já mostra)? */
function layoutPadrao(l: LayoutDesenho): boolean {
  return l.orientacao === 'horizontal' && l.larguraPiscina === undefined && !l.fases.length && !l.piscinasExternas.length
    && !l.fluxosMensagem.length && !Object.keys(l.tamanhos).length
}

/** Rótulo de uma seta de sequência (fora de Escolha): em branco tira a chave. */
export function rotuloDaSeta(d: DesenhoV2, id: string, rotulo: string): DesenhoV2 {
  const i = d.setas.findIndex((x) => x.id === id)
  if (i === -1) return d
  const limpo = rotulo.trim()
  if ((d.setas[i].rotulo ?? '') === limpo) return d
  const { rotulo: _, ...sem } = d.setas[i]
  const nova: SetaDesenho = limpo ? { ...sem, rotulo: limpo } : sem
  return { ...d, setas: d.setas.map((x, j) => (j === i ? nova : x)) }
}

/** As setas como vão ser gravadas: condição e "senão" só valem na seta que sai de uma Escolha
 *  (a de uma seta religada some); o rótulo e as pontas livres valem em qualquer seta. */
export function setasParaGravar(d: Pick<DesenhoV2, 'formas' | 'setas'>): SetaDesenho[] {
  const deEscolha = new Set(d.formas.filter((f) => f.tipo === 'exclusiveGateway').map((f) => f.id))
  return d.setas.map((x) => {
    if (deEscolha.has(x.de)) return x
    const s: SetaDesenho = { id: x.id, de: x.de, para: x.para }
    if (x.rotulo?.trim()) s.rotulo = x.rotulo
    // as pontas livres (só visuais) valem em qualquer seta
    if (x.saida) s.saida = x.saida
    if (x.entrada) s.entrada = x.entrada
    return s
  })
}

/** Cancelar na etapa de uma forma: volta o passo da abertura, ou o tira se ele não existia
 *  (digitar o nome o criou). O mesmo mapa quando nada muda. */
export function restaurarPasso(
  steps: Record<string, StepFormSchema>, id: string, antes: StepFormSchema | undefined,
): Record<string, StepFormSchema> {
  if (antes) return steps[id] === antes ? steps : { ...steps, [id]: antes }
  if (!(id in steps)) return steps
  const { [id]: _, ...resto } = steps
  return resto
}

/** Cancelar da gaveta da escolha / "ao mesmo tempo" (no bloco ou o losango solto): lá se
 *  acrescenta e tira caminho, então o desenho inteiro volta ao da abertura — formas, setas,
 *  condições, pergunta e modo. A POSIÇÃO de quem já existia fica como está agora (mover uma
 *  forma com a gaveta aberta não é o que a gaveta desfaz). Nada mudou = o mesmo desenho. */
export function restaurarDesenhoDoBloco(atual: DesenhoV2, antes: DesenhoV2): DesenhoV2 {
  if (atual === antes) return atual
  const posicoes = { ...antes.posicoes }
  for (const id of Object.keys(posicoes)) if (atual.posicoes[id]) posicoes[id] = atual.posicoes[id]
  return { ...antes, posicoes }
}
