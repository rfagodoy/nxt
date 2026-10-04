/**
 * Conferência das TRAVAS no servidor — o que mudou em campo que a tela não deixa mudar.
 *
 * A tela da web manda o registro INTEIRO a cada gravação (não um diff), então "travado"
 * não pode significar "não veio": significa "veio DIFERENTE do que está gravado". A
 * comparação é feita depois de passar os dois lados pela mesma normalização que a tela
 * usa para mostrar o registro — senão um padrão (reajustavel=true, valorPago null,
 * vazio×nulo×ausente) apareceria como alteração onde a pessoa não mexeu.
 *
 * Regras (decisões do PO, 04/10/2026):
 *  - Tela SOMENTE CONSULTA: nada muda e nada nasce por ela.
 *  - CRIAR: campo travado pode nascer preenchido — trava é "não alterar o que existe".
 *  - Chave AUSENTE no que chegou = "não mexi" (gravação parcial, ex.: só o status).
 *  - Seção-BLOCO travada (Partes, Pagamentos…): a lista tem de chegar idêntica.
 *  - Lista com campo travado (contatos, endereços…): linha casada por `id`. Linha que
 *    fica não muda o campo travado; linha nova nasce com ele vazio; linha REMOVIDA que
 *    tinha valor no campo travado é recusada (apagar a linha apagaria o valor protegido).
 *    Linha totalmente em branco não conta (a tela semeia uma linha vazia em lista vazia).
 */
import { contractFromApi, contractToPayload } from '@nxt/contracts-core'
import type { LockContext } from './locks'
import { fieldLocked, lockCtx, sectionIsLocked } from './locks'
import { nativeAppliesTo } from './categories'
import { fieldValueKey, type PartnerCategory, type Screen, type ScreenField, type ScreenSubject } from './types'

type Obj = Record<string, unknown>

export interface CampoRecusado {
  /** chave do campo no tipo (nativeKey, fieldKey do personalizado ou chave da seção-bloco) */
  chave: string
  /** rótulo como a tela mostra */
  rotulo: string
  /** rótulo da seção onde o campo mora (quando há) */
  secao?: string
  /** por que foi recusado — vira o texto da mensagem */
  motivo: 'travado' | 'linha-removida' | 'tela-so-consulta'
}

export interface EntradaConferencia {
  subject: Exclude<ScreenSubject, 'GENERICA'>
  /** tela que vale para esta gravação, JÁ reconciliada com a estrutura nativa */
  screen: Screen
  /** camadas extras (etapa do workflow): lockedFields, ou tela forçada a consulta */
  lock?: LockContext
  /** registro gravado (forma da API). null = criação. */
  antes: Obj | null
  /** o que chegou (forma da API). Chave ausente = não mexi. */
  depois: Obj
  /** valores personalizados gravados (fieldKey → texto) */
  customAntes?: Record<string, string>
  /** valores personalizados que chegaram; ausente = a gravação não mexe neles */
  customDepois?: Record<string, string>
}

/* ─── mapa: campo nativo → propriedade(s) do registro ─────────────────────── */

/** Campo nativo do Contrato → propriedades que ele controla no registro. `situacao` não
 *  está aqui de propósito: ela nunca é editada pelo campo (muda por transição — Ativar,
 *  Encerrar…), e transição não é assunto de trava de campo. */
export const CONTRATO_PROPS: Record<string, string[]> = {
  natureza: ['natureza'], numero: ['numero'], titulo: ['titulo'], descricao: ['descricao'],
  objeto: ['objeto'], tipo: ['tipo'], data_assinatura: ['dataAssinatura'],
  mao_de_obra: ['maoDeObra', 'maoDeObraLocal'],
  inicio: ['inicioVigencia'], prazo_indeterminado: ['prazoIndeterminado'],
  /* renovar o período estende o término — é o mesmo dado visto de outro jeito */
  termino: ['terminoVigencia', 'renovacoes'],
  acao_termino: ['acaoTermino', 'renovacaoAnos', 'renovacaoMeses', 'renovacaoDias'],
  moeda: ['moeda'], condicao_pagamento: ['condicaoPagamento'], valor_total: ['valorTotal'],
  valor_parcela: ['valorParcela'], forma_pagamento: ['formaPagamento'], qtd_parcelas: ['qtdParcelas'],
  complemento: ['complementoValor'],
}

/** Seção-BLOCO do Contrato → listas que ela guarda. Travou a seção, a lista não muda. */
export const CONTRATO_BLOCOS: Record<string, string[]> = {
  partes: ['partes'], pagamentos: ['pagamentos'], recebimentos: ['recebimentos'],
  reajuste: ['reajustes', 'reajustesRealizados'], aditivos: ['aditivos'], documentos: ['documentos'],
}

/** Campo nativo do Parceiro → propriedade escalar. O documento é UM dado com três rótulos
 *  (CNPJ/CPF/Código conforme o tipo). */
export const PARCEIRO_PROPS: Record<string, string> = {
  cnpj: 'documento', cpf: 'documento', codigo: 'documento',
  razao_social: 'razaoSocial', nome_fantasia: 'nomeFantasia', data_abertura: 'dataAbertura',
  natureza_juridica: 'naturezaJuridica', ie: 'ie', im: 'im', rg: 'rg', orgao_expedidor: 'orgaoExpedidor',
  data_nascimento: 'dataNascimento', pais_origem: 'paisOrigem',
  cnae_principal: 'cnaePrincipal', cnaes_secundarios: 'cnaesSecundarios',
}

/** Campo nativo do Parceiro que mora DENTRO de uma lista: [lista, propriedade da linha]. */
export const PARCEIRO_LINHAS: Record<string, [string, string]> = {
  con_nome: ['contatos', 'nome'], con_cargo: ['contatos', 'cargo'], con_email: ['contatos', 'email'],
  con_telefone: ['contatos', 'telefone'], con_celular: ['contatos', 'celular'], con_website: ['contatos', 'website'],
  end_cep: ['enderecos', 'cep'], end_estado: ['enderecos', 'estado'], end_logradouro: ['enderecos', 'logradouro'],
  end_numero: ['enderecos', 'numero'], end_complemento: ['enderecos', 'complemento'], end_bairro: ['enderecos', 'bairro'],
  end_cidade: ['enderecos', 'cidade'], end_address1: ['enderecos', 'address1'], end_address2: ['enderecos', 'address2'],
  end_pais: ['enderecos', 'pais_endereco'],
  ban_banco: ['bancos', 'banco'], ban_tipo_conta: ['bancos', 'tipo_conta'], ban_agencia: ['bancos', 'agencia'],
  ban_conta: ['bancos', 'conta'], ban_pix: ['bancos', 'pix'],
  soc_nome: ['socios', 'nome'], soc_documento: ['socios', 'documento'],
  soc_participacao: ['socios', 'participacao'], soc_cargo: ['socios', 'cargo'],
}

/** Propriedades que não são DADO do registro: quem gravou e por quê. */
const NAO_DADO = new Set(['user', 'motivo'])

/* ─── normalização ─────────────────────────────────────────────────────────── */

/** Forma canônica para comparar: vazio, nulo e ausente são o mesmo nada; texto sem
 *  espaço nas pontas; número em texto vira número; objeto sem as chaves vazias. */
export function canon(x: unknown): unknown {
  if (x === null || x === undefined) return undefined
  if (typeof x === 'string') {
    const t = x.trim()
    if (t === '') return undefined
    return t
  }
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined
  if (Array.isArray(x)) {
    const arr = x.map(canon).filter(v => v !== undefined)
    return arr.length ? arr : undefined
  }
  if (typeof x === 'object') {
    const out: Obj = {}
    for (const k of Object.keys(x as Obj).sort()) {
      const v = canon((x as Obj)[k])
      if (v !== undefined) out[k] = v
    }
    return Object.keys(out).length ? out : undefined
  }
  return x
}

const numOuTexto = (v: unknown): unknown => {
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return v
}
/** Igualdade depois da canonização; '10' e 10 são o mesmo número. */
export const iguais = (a: unknown, b: unknown): boolean =>
  JSON.stringify(canon(numOuTexto(a))) === JSON.stringify(canon(numOuTexto(b)))

/** Documento (CNPJ/CPF): a tela remascara ao abrir, e o gravado pode estar só em dígitos
 *  (importação). O dado é o mesmo — compara sem a pontuação. */
const soDigitos = (v: unknown) => (typeof v === 'string' ? v.replace(/[^0-9A-Za-z]/g, '') : v)
const iguaisNoCampo = (prop: string, a: unknown, b: unknown) =>
  prop === 'documento' ? iguais(soDigitos(a), soDigitos(b)) : iguais(a, b)

/** Lista-bloco do contrato: compara o CONTEÚDO das linhas, não o id interno — linha antiga
 *  sem id ganha um id aleatório na tela ao abrir, e isso não é alteração de ninguém. */
const semIds = (v: unknown) => (Array.isArray(v) ? v.map(r => (r && typeof r === 'object' ? { ...(r as Obj), id: undefined } : r)) : v)

const vazio = (v: unknown): boolean => canon(v) === undefined

/** Linha de lista sem nada além do id — a tela semeia uma assim em lista vazia. */
const linhaEmBranco = (row: unknown): boolean => {
  if (!row || typeof row !== 'object') return true
  const { id: _id, ...resto } = row as Obj
  return canon(resto) === undefined
}

/** Contrato como a TELA o enxerga: ida e volta pelo formulário (mesmos padrões, mesmas
 *  conversões que a tela aplica antes de mandar). */
export const contratoComoATelaVe = (c: Obj): Obj => contractToPayload(contractFromApi(c))

/* ─── a conferência ────────────────────────────────────────────────────────── */

export function alteracoesTravadas(e: EntradaConferencia): CampoRecusado[] {
  const ctx = lockCtx(e.screen, e.lock ?? {})
  const secaoDe = (f: Pick<ScreenField, 'sectionId'>) => e.screen.sections.find(s => s.id === f.sectionId)?.label

  /* Tela somente consulta: não cria e não altera — nem dado, nem situação, nem personalizado. */
  if (ctx.screenReadOnly) {
    if (!e.antes) return [{ chave: '*', rotulo: e.screen.name, motivo: 'tela-so-consulta' }]
    const mudou = houveAlteracao(e)
    return mudou ? [{ chave: '*', rotulo: e.screen.name, motivo: 'tela-so-consulta' }] : []
  }
  /* Criar: trava é "não alterar o que existe" — nada existe ainda. */
  if (!e.antes) return []

  const out: CampoRecusado[] = []
  const veio = (prop: string) => Object.prototype.hasOwnProperty.call(e.depois, prop)

  if (e.subject === 'CONTRATO') {
    const a = contratoComoATelaVe(e.antes)
    const d = contratoComoATelaVe({ ...e.antes, ...e.depois })
    for (const f of e.screen.fields) {
      if (f.source !== 'NATIVE' || !f.nativeKey || !fieldLocked(f, ctx)) continue
      const props = (CONTRATO_PROPS[f.nativeKey] ?? []).filter(veio)
      if (props.some(p => !iguais(semIds(a[p]), semIds(d[p]))))
        out.push({ chave: f.nativeKey, rotulo: f.label, secao: secaoDe(f), motivo: 'travado' })
    }
    for (const s of e.screen.sections) {
      const listas = s.nativeKey ? CONTRATO_BLOCOS[s.nativeKey] : undefined
      if (!listas || !sectionIsLocked(s, ctx)) continue
      if (listas.filter(veio).some(p => !iguais(semIds(a[p]), semIds(d[p]))))
        out.push({ chave: s.nativeKey!, rotulo: s.label, motivo: 'travado' })
    }
  } else {
    const catAntes  = String(e.antes.categoria ?? '') as PartnerCategory
    const catDepois = String(e.depois.categoria ?? e.antes.categoria ?? '') as PartnerCategory
    /* documento: vale a trava do rótulo que se aplica ao tipo (antes OU depois da troca) */
    const vale = (key: string) => nativeAppliesTo(key, catAntes) || nativeAppliesTo(key, catDepois)
    const linhasTravadas = new Map<string, { prop: string; f: ScreenField }[]>()
    for (const f of e.screen.fields) {
      if (f.source !== 'NATIVE' || !f.nativeKey || !fieldLocked(f, ctx)) continue
      const prop = PARCEIRO_PROPS[f.nativeKey]
      if (prop) {
        if (!vale(f.nativeKey) || !veio(prop)) continue
        if (!iguaisNoCampo(prop, e.antes[prop], e.depois[prop]))
          out.push({ chave: f.nativeKey, rotulo: f.label, secao: secaoDe(f), motivo: 'travado' })
        continue
      }
      const lin = PARCEIRO_LINHAS[f.nativeKey]
      if (lin && veio(lin[0])) linhasTravadas.set(lin[0], [...(linhasTravadas.get(lin[0]) ?? []), { prop: lin[1], f }])
    }
    for (const [lista, campos] of linhasTravadas) {
      const rowsA = (Array.isArray(e.antes[lista]) ? e.antes[lista] as Obj[] : []).filter(r => !linhaEmBranco(r))
      const rowsD = (Array.isArray(e.depois[lista]) ? e.depois[lista] as Obj[] : []).filter(r => !linhaEmBranco(r))
      const porIdA = new Map(rowsA.map((r, i) => [String(r.id ?? `__${i}`), r]))
      const porIdD = new Map(rowsD.map((r, i) => [String(r.id ?? `__${i}`), r]))
      const ja = new Set<string>()
      const acusa = (f: ScreenField, motivo: CampoRecusado['motivo']) => {
        const k = `${f.nativeKey}:${motivo}`
        if (ja.has(k)) return
        ja.add(k)
        out.push({ chave: f.nativeKey!, rotulo: f.label, secao: secaoDe(f), motivo })
      }
      for (const [id, rd] of porIdD) {
        const ra = porIdA.get(id)
        for (const { prop, f } of campos)
          if (ra ? !iguaisNoCampo(prop, ra[prop], rd[prop]) : !vazio(rd[prop])) acusa(f, 'travado')
      }
      for (const [id, ra] of porIdA) {
        if (porIdD.has(id)) continue
        for (const { prop, f } of campos) if (!vazio(ra[prop])) acusa(f, 'linha-removida')
      }
    }
  }

  /* personalizados: pela chave do campo no tipo */
  if (e.customDepois) {
    for (const f of e.screen.fields) {
      if (f.source !== 'CUSTOM' || !fieldLocked(f, ctx)) continue
      const k = fieldValueKey(f)
      if (!(k in e.customDepois)) continue
      if (!iguais(e.customAntes?.[k], e.customDepois[k]))
        out.push({ chave: k, rotulo: f.label, secao: secaoDe(f), motivo: 'travado' })
    }
  }
  return out
}

/** Alguma coisa mudou? (usado pela tela somente consulta, onde tudo é travado). */
function houveAlteracao(e: EntradaConferencia): boolean {
  const antes = e.antes!
  const props = Object.keys(e.depois).filter(k => !NAO_DADO.has(k))
  if (e.subject === 'CONTRATO') {
    const a = contratoComoATelaVe(antes)
    const d = contratoComoATelaVe({ ...antes, ...e.depois })
    if (props.some(p => !iguais(semIds(a[p]), semIds(d[p])))) return true
  } else {
    const linhas = new Set(['contatos', 'enderecos', 'bancos', 'socios'])
    const limpa = (v: unknown, p: string) => (linhas.has(p) && Array.isArray(v) ? v.filter(r => !linhaEmBranco(r)) : v)
    if (props.some(p => !iguaisNoCampo(p, limpa(antes[p], p), limpa(e.depois[p], p)))) return true
  }
  if (e.customDepois)
    for (const [k, v] of Object.entries(e.customDepois)) if (!iguais(e.customAntes?.[k], v)) return true
  return false
}

/* ─── a frase ─────────────────────────────────────────────────────────────── */

const listaPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

/** Mensagem única, em português, para o erro da API e para a tela. */
export function fraseDasTravas(itens: CampoRecusado[]): string {
  const so = itens.find(i => i.motivo === 'tela-so-consulta')
  if (so) return `A tela “${so.rotulo}” é somente consulta: nada pode ser gravado por ela.`
  const trav = [...new Set(itens.filter(i => i.motivo === 'travado').map(i => `“${i.rotulo}”`))]
  const rem  = [...new Set(itens.filter(i => i.motivo === 'linha-removida').map(i => `“${i.rotulo}”`))]
  const partes: string[] = []
  if (trav.length) partes.push(trav.length === 1
    ? `${trav[0]} está travado nesta tela e não pode ser alterado.`
    : `${listaPt(trav)} estão travados nesta tela e não podem ser alterados.`)
  if (rem.length) partes.push(`Não é possível remover uma linha que tem ${listaPt(rem)} preenchido — ${rem.length === 1 ? 'o campo está travado' : 'os campos estão travados'}.`)
  return partes.join(' ')
}

/**
 * "Renovar período" mexe em três lugares de uma vez: o término (renovações), as parcelas do
 * novo período (pagamentos/recebimentos) e os reajustes vencidos que ele aplica antes. Se
 * QUALQUER um deles está travado nesta tela, a API recusaria a gravação — então o botão
 * nem aparece. Mesmo mapa da conferência: uma verdade só.
 */
export function renovacaoLiberada(screen: Screen | null | undefined, lock: LockContext = {}): boolean {
  if (!screen) return true
  const ctx = lockCtx(screen, lock)
  if (ctx.screenReadOnly) return false
  const termino = screen.fields.find(f => f.source === 'NATIVE' && f.nativeKey === 'termino')
  if (termino && fieldLocked(termino, ctx)) return false
  const listas = new Set(['pagamentos', 'recebimentos', 'reajustes', 'reajustesRealizados'])
  return !screen.sections.some(s =>
    s.nativeKey && (CONTRATO_BLOCOS[s.nativeKey] ?? []).some(p => listas.has(p)) && sectionIsLocked(s, ctx))
}

/**
 * A linha da lista (contato, endereço, banco, sócio) tem valor em algum campo travado?
 * Então ela não pode ser removida — apagar a linha apagaria o valor protegido (decisão
 * do PO, 04/10/2026). A tela esconde a lixeira dela; a API recusa do mesmo jeito.
 */
export function linhaTemValorTravado(
  lista: 'contatos' | 'enderecos' | 'bancos' | 'socios',
  linha: object,
  travado: (nativeKey: string) => boolean,
): boolean {
  const row = linha as Obj
  return Object.entries(PARCEIRO_LINHAS).some(([k, [l, p]]) => l === lista && travado(k) && !vazio(row[p]))
}
