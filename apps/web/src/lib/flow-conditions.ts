/* Construtor de condições do losango de decisão (Storyboard).
 *
 * A condição NUNCA é digitada: o usuário escolhe [Campo] [operador] [Valor] e o
 * construtor GERA a expressão que o motor já entende (workflow-core/conditions) —
 * zero mudança de engine. O vocabulário são os campos que EXISTEM antes do losango
 * no fluxo: formulários de atividades anteriores (legado) e os campos da Tela de
 * CONTRATO usada por alguma atividade anterior (nativos curados + personalizados,
 * referenciados por id estável como `contrato.<fieldId>` — rótulo resolve ao vivo).
 * Em runtime, a conclusão de cada tarefa de usuário hidrata a variável `contrato`
 * (instances.service) — é ela que as expressões `contrato.*` leem.
 */
import type { EdgeConditionSpec, EdgeConditionRule, CondOp, FieldType } from '@nxt/types'
import { evalCondition } from '@nxt/workflow-core'

export interface CampoDisponivel {
  /** chave da variável em runtime (ex.: `aprovacao`, `contrato.valorTotal`, `contrato.<fieldId>`) */
  key: string
  label: string
  tipo: 'texto' | 'numero' | 'data' | 'selecao' | 'booleano'
  /** opções quando `selecao` (o Valor vira dropdown — ninguém digita "sim" minúsculo) */
  options?: Array<{ value: string; label: string }>
  /** de onde o campo vem — mostrado como grupo no dropdown (nome da atividade/Tela) */
  origem: string
}

export const OPS_POR_TIPO: Record<CampoDisponivel['tipo'], Array<{ value: CondOp; label: string }>> = {
  selecao:  [{ value: 'eq', label: 'é' }, { value: 'neq', label: 'não é' }],
  booleano: [{ value: 'eq', label: 'é' }, { value: 'neq', label: 'não é' }],
  texto:    [{ value: 'eq', label: 'é' }, { value: 'neq', label: 'não é' }],
  /* datas: o avaliador coage relacionais a NÚMERO (ISO vira NaN) — só igualdade. */
  data:     [{ value: 'eq', label: 'é' }, { value: 'neq', label: 'não é' }],
  numero: [
    { value: 'eq', label: 'é igual a' }, { value: 'neq', label: 'é diferente de' },
    { value: 'gt', label: 'é maior que' }, { value: 'gte', label: 'é maior ou igual a' },
    { value: 'lt', label: 'é menor que' }, { value: 'lte', label: 'é menor ou igual a' },
  ],
}

const OP_EXPR: Record<CondOp, string> = { eq: '==', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }
const OP_ROTULO: Record<CondOp, string> = { eq: 'é', neq: 'não é', gt: '>', gte: '≥', lt: '<', lte: '≤' }

/** FieldType (formulário/Tela) → tipo do construtor. `null` = não filtrável
 *  (multiselect/arquivo: o avaliador não tem operador de pertencimento). */
export function tipoDoCampo(t: FieldType | string): CampoDisponivel['tipo'] | null {
  switch (t) {
    case 'number': case 'currency': return 'numero'
    case 'date': return 'data'
    case 'select': return 'selecao'
    case 'checkbox': return 'booleano'
    case 'text': case 'textarea': case 'email': case 'phone': return 'texto'
    default: return null
  }
}

/** Campos NATIVOS do contrato expostos às condições (curados; chave = coluna real). */
export const CAMPOS_NATIVOS_CONTRATO: CampoDisponivel[] = [
  { key: 'contrato.valorTotal',        label: 'Valor total',          tipo: 'numero',   origem: 'Contrato' },
  { key: 'contrato.valorParcela',      label: 'Valor da parcela',     tipo: 'numero',   origem: 'Contrato' },
  { key: 'contrato.qtdParcelas',       label: 'Quantidade de parcelas', tipo: 'numero', origem: 'Contrato' },
  { key: 'contrato.situacao',          label: 'Situação',             tipo: 'texto',    origem: 'Contrato' },
  { key: 'contrato.tipo',              label: 'Tipo de contrato',     tipo: 'texto',    origem: 'Contrato' },
  { key: 'contrato.natureza',          label: 'Natureza',             tipo: 'selecao',  origem: 'Contrato',
    options: [{ value: 'DESPESA', label: 'Despesa' }, { value: 'RECEITA', label: 'Receita' }, { value: 'AMBOS', label: 'Ambos' }] },
  { key: 'contrato.moeda',             label: 'Moeda',                tipo: 'texto',    origem: 'Contrato' },
  { key: 'contrato.prazoIndeterminado', label: 'Prazo indeterminado', tipo: 'booleano', origem: 'Contrato' },
  { key: 'contrato.inicioVigencia',    label: 'Início da vigência',   tipo: 'data',     origem: 'Contrato' },
  { key: 'contrato.terminoVigencia',   label: 'Término da vigência',  tipo: 'data',     origem: 'Contrato' },
]

/* ── vocabulário: o que dá para testar NESTE losango ─────────────────────────── */

interface NodeLike {
  id: string
  type: string
  step?: {
    stepName?: string
    fields?: Array<{ name: string; label: string; type: string; options?: Array<{ label: string; value: string }> }>
    screenRef?: string
    screenSubject?: string
  }
}
interface EdgeLike { from: string; to: string }
interface ScreenLike {
  id: string
  name?: string
  subjectType?: string
  fields?: Array<{ id: string; label: string; type: string; source?: string; options?: Array<{ label: string; value: string }> | null }>
}

/** Nós que alcançam `alvo` seguindo as setas (mesma regra do predecessorasDe do editor). */
function predecessoras(edges: EdgeLike[], alvo: string): Set<string> {
  const entrada = new Map<string, string[]>()
  for (const e of edges) {
    if (!entrada.has(e.to)) entrada.set(e.to, [])
    entrada.get(e.to)!.push(e.from)
  }
  const visto = new Set<string>()
  const fila = [...(entrada.get(alvo) ?? [])]
  while (fila.length) {
    const n = fila.pop()!
    if (visto.has(n)) continue
    visto.add(n)
    for (const p of entrada.get(n) ?? []) if (!visto.has(p)) fila.push(p)
  }
  return visto
}

/** Campos oferecíveis num losango: SÓ o que alguma atividade ANTERIOR captura.
 *  Oferecer campo que ainda não existe naquele ponto é convidar a um fluxo quebrado. */
export function camposDisponiveis(
  nodes: NodeLike[], edges: EdgeLike[], gatewayId: string, screens: ScreenLike[],
): CampoDisponivel[] {
  const preds = predecessoras(edges, gatewayId)
  const out: CampoDisponivel[] = []
  const vistos = new Set<string>()
  const add = (c: CampoDisponivel) => { if (!vistos.has(c.key)) { vistos.add(c.key); out.push(c) } }

  let temTelaContrato = false
  const telasReferenciadas = new Set<string>()

  for (const n of nodes) {
    if (!preds.has(n.id) || !n.step) continue
    /* formulário próprio da atividade (legado do designer antigo — chave = name) */
    for (const f of n.step.fields ?? []) {
      const tipo = tipoDoCampo(f.type)
      if (!tipo || !f.name) continue
      add({ key: f.name, label: f.label || f.name, tipo, options: f.options, origem: n.step.stepName || 'Atividade' })
    }
    if (n.step.screenRef && n.step.screenSubject === 'CONTRATO') {
      temTelaContrato = true
      telasReferenciadas.add(n.step.screenRef)
    }
  }

  if (temTelaContrato) {
    for (const c of CAMPOS_NATIVOS_CONTRATO) add(c)
    for (const s of screens) {
      if (!telasReferenciadas.has(s.id)) continue
      for (const f of s.fields ?? []) {
        if (f.source !== 'CUSTOM') continue
        const tipo = tipoDoCampo(f.type)
        if (!tipo) continue
        add({ key: `contrato.${f.id}`, label: f.label, tipo, options: f.options ?? undefined, origem: s.name || 'Tela do contrato' })
      }
    }
  }

  return out
}

/* ── geração da expressão e do rótulo ────────────────────────────────────────── */

/** Valor literal na expressão, pelo tipo do campo. String é aspada; aspas simples no
 *  valor trocam para aspas duplas (o avaliador aceita as duas; não há escape). */
function literal(valor: string, tipo: CampoDisponivel['tipo']): string {
  if (tipo === 'numero') {
    const n = Number(valor.replace(',', '.'))
    return Number.isFinite(n) ? String(n) : "''"
  }
  if (tipo === 'booleano') return valor === 'true' ? 'true' : 'false'
  return valor.includes("'") ? `"${valor.replace(/"/g, '')}"` : `'${valor}'`
}

/** Expressão que o motor avalia — gerada, nunca digitada. */
export function gerarExpressao(spec: EdgeConditionSpec, tipoDe: (key: string) => CampoDisponivel['tipo']): string {
  const partes = spec.rules
    .filter((r) => r.campo && r.valor !== '')
    .map((r) => `${r.campo} ${OP_EXPR[r.op]} ${literal(r.valor, tipoDe(r.campo))}`)
  return partes.join(spec.logic === 'OR' ? ' || ' : ' && ')
}

/* ── Simulador ("Testar decisão"): o MESMO avaliador da execução, com variáveis de
      mentira. Nada é gravado — é uma lente sobre o desenho. ── */

/** Chaves com ponto (`contrato.fld_x`) viram objeto aninhado — o avaliador resolve
 *  caminhos por ponto sobre as variáveis, exatamente como em runtime. Coerção pelo
 *  tipo do campo: número aceita vírgula; booleano vira true/false. */
export function montarVarsSimulacao(
  valores: Record<string, string>,
  tipoDe: (key: string) => CampoDisponivel['tipo'],
): Record<string, unknown> {
  const vars: Record<string, unknown> = {}
  for (const [key, bruto] of Object.entries(valores)) {
    if (bruto === '') continue
    const tipo = tipoDe(key)
    const valor: unknown =
      tipo === 'numero' ? Number(bruto.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) :
      tipo === 'booleano' ? bruto === 'true' :
      bruto
    const partes = key.split('.')
    let alvo = vars
    for (let i = 0; i < partes.length - 1; i++) {
      const p = partes[i]
      if (typeof alvo[p] !== 'object' || alvo[p] === null) alvo[p] = {}
      alvo = alvo[p] as Record<string, unknown>
    }
    alvo[partes[partes.length - 1]] = valor
  }
  return vars
}

/** Decide a saída vencedora — espelho fiel do pickExclusive do motor: primeira
 *  condição verdadeira NA ORDEM das saídas; nenhuma casou → a padrão; sem padrão →
 *  null (em execução seria erro; o simulador mostra o aviso). */
export function decidirSaida(
  outs: Array<{ id: string; condition?: string; isDefault?: boolean }>,
  vars: Record<string, unknown>,
): string | null {
  for (const e of outs) {
    if (e.isDefault) continue
    try { if (evalCondition(e.condition, vars)) return e.id } catch { /* expressão inválida não casa */ }
  }
  return outs.find((e) => e.isDefault)?.id ?? null
}

/** Rótulo humano da condição (auto-rótulo da seta): "Parecer do Patrimônio é Sim". */
export function rotuloDaCondicao(
  spec: EdgeConditionSpec,
  labelDe: (key: string) => string,
  valorLabelDe: (rule: EdgeConditionRule) => string,
): string {
  const rs = spec.rules.filter((r) => r.campo && r.valor !== '')
  if (!rs.length) return ''
  const um = (r: EdgeConditionRule) => `${labelDe(r.campo)} ${OP_ROTULO[r.op]} ${valorLabelDe(r)}`
  if (rs.length === 1) return um(rs[0])
  return `${um(rs[0])} ${spec.logic === 'OR' ? 'ou' : 'e'} +${rs.length - 1}`
}
