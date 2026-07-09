import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateContractDto } from './dto/create-contract.dto'
import { UpdateContractDto } from './dto/update-contract.dto'

/* ─── Numeração automática de contratos (Parâmetros gerais) ───────────────────
   Config em AppSetting (org-level, userId=''). Formatação ESPELHADA no front
   (apps/web/src/lib/contract-numbering.ts). */
const CONTRACT_NUMBERING_KEY = 'nxt:settings:parametros:contrato-numeracao'
interface NumberingCfg {
  modo: string; prefixo: string; separador: string; incluirAno: boolean
  digitos: number; sufixo: string; inicio: number; proximo?: number; ano?: number
}
function formatNumero(cfg: NumberingCfg, seq: number, year: number): string {
  const pad = String(Math.max(0, seq)).padStart(Math.max(0, cfg.digitos || 0), '0')
  const parts: string[] = []
  if (cfg.prefixo) parts.push(cfg.prefixo)
  if (cfg.incluirAno) parts.push(String(year))
  parts.push(pad)
  if (cfg.sufixo) parts.push(cfg.sufixo)
  return parts.join(cfg.separador ?? '')
}

type ContractRecord = {
  id: string; numero: string; titulo: string; tipo: string
  situacao: string; inicioVigencia: string | null; terminoVigencia: string | null
  dataAssinatura: string | null; moeda: string; valorTotal: number; valorParcela: number | null
  condicaoPagamento: string | null
  objeto: unknown
  partes: unknown
}

/* ── linha da listagem (deriva dados das partes) ── */
function toRow(c: ContractRecord) {
  const partes = (c.partes as Array<Record<string, string>>) ?? []
  const p0 = partes[0] ?? {}
  const findP = (re: RegExp) => partes.find(p => re.test(p.papel ?? ''))
  const ctn = findP(/contratante/i)
  const ctd = findP(/contratad/i)
  return {
    id:                 c.id,
    numero:             c.numero,
    titulo:             c.titulo,
    tipo:               c.tipo,
    parte_principal:    p0.nome ?? '',
    inicio:             c.inicioVigencia ?? '',
    termino:            c.terminoVigencia ?? null,
    valor_total:        c.valorTotal ?? 0,
    situacao:           c.situacao,
    documento:          p0.documento ?? '',
    papel:              p0.papel ?? '',
    data_assinatura:    c.dataAssinatura ?? '',
    moeda:              c.moeda ?? '',
    valor_parcela:      c.valorParcela ?? 0,
    condicao_pagamento: c.condicaoPagamento ?? '',
    objeto:             (c.objeto as string[]) ?? [],
    contratante_nome:   ctn?.nome ?? '',
    contratante_doc:    ctn?.documento ?? '',
    contratada_nome:    ctd?.nome ?? '',
    contratada_doc:     ctd?.documento ?? '',
  }
}

/* ── Auditoria de contratos ─────────────────────────────────────────────────
   diffContract produz mudanças LEGÍVEIS (não JSON cru): escalares, situação e
   eventos semânticos de aditivos, lançamentos, documentos e partes.
   Mesmo formato do PartnerAuditLog: [{ field, label, before, after }]. */
type AuditChange = { field: string; label: string; before: string; after: string }
type CRec = Record<string, unknown>
type Maps = { tipo: Map<string, string>; condicao: Map<string, string>; objeto: Map<string, string>; papel: Map<string, string>; forma: Map<string, string> }

const aVal = (x: unknown): string => (x == null ? '' : String(x))
const aArr = (x: unknown): CRec[] => (Array.isArray(x) ? (x as CRec[]) : [])
const aLbl = (m: Map<string, string>, id: string): string => (id ? (m.get(id) ?? id) : '')
const aMoney = (x: unknown): string => {
  if (x === '' || x == null) return ''
  const n = Number(x)
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
const aDate = (x: unknown): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(aVal(x))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : aVal(x)
}
const aMesAno = (x: unknown): string => {
  const m = /^(\d{4})-(\d{2})/.exec(aVal(x))
  return m ? `${m[2]}/${m[1]}` : aVal(x)
}
const SIT_LABEL: Record<string, string> = { EM_CADASTRO: 'Em cadastro/revisão', VIGENTE: 'Vigente', ENCERRADO: 'Encerrado', RESCINDIDO: 'Rescindido', PENDENTE: 'Em cadastro/revisão', ATIVO: 'Vigente' }
const NAT_LABEL: Record<string, string> = { DESPESA: 'Despesa', RECEITA: 'Receita', AMBOS: 'Ambos' }
const ACAO_LABEL: Record<string, string> = { MANUAL: 'Definir manualmente', RENOVAR: 'Renovar automaticamente', ENCERRAR: 'Encerrar automaticamente' }

function diffContract(o: CRec, n: CRec, maps: Maps): AuditChange[] {
  const ch: AuditChange[] = []
  const push = (field: string, label: string, b: string, a: string) => { if (b !== a) ch.push({ field, label, before: b || '—', after: a || '—' }) }

  /* situação + escalares */
  push('situacao', 'Situação', SIT_LABEL[aVal(o.situacao)] ?? aVal(o.situacao), SIT_LABEL[aVal(n.situacao)] ?? aVal(n.situacao))
  push('numero', 'Número', aVal(o.numero), aVal(n.numero))
  push('titulo', 'Título', aVal(o.titulo), aVal(n.titulo))
  push('descricao', 'Descrição', aVal(o.descricao), aVal(n.descricao))
  push('natureza', 'Natureza', NAT_LABEL[aVal(o.natureza)] ?? aVal(o.natureza), NAT_LABEL[aVal(n.natureza)] ?? aVal(n.natureza))
  push('tipo', 'Tipo de contrato', aLbl(maps.tipo, aVal(o.tipo)), aLbl(maps.tipo, aVal(n.tipo)))
  push('inicioVigencia', 'Início da vigência', aDate(o.inicioVigencia), aDate(n.inicioVigencia))
  push('terminoVigencia', 'Término da vigência', aDate(o.terminoVigencia), aDate(n.terminoVigencia))
  push('prazoIndeterminado', 'Prazo indeterminado', o.prazoIndeterminado ? 'Sim' : 'Não', n.prazoIndeterminado ? 'Sim' : 'Não')
  push('acaoTermino', 'Ação no término', ACAO_LABEL[aVal(o.acaoTermino)] ?? aVal(o.acaoTermino), ACAO_LABEL[aVal(n.acaoTermino)] ?? aVal(n.acaoTermino))
  push('dataAssinatura', 'Data de assinatura', aDate(o.dataAssinatura), aDate(n.dataAssinatura))
  push('moeda', 'Moeda', aVal(o.moeda), aVal(n.moeda))
  push('valorTotal', 'Valor total', aMoney(o.valorTotal), aMoney(n.valorTotal))
  push('valorParcela', 'Valor da parcela', aMoney(o.valorParcela), aMoney(n.valorParcela))
  push('qtdParcelas', 'Quantidade de parcelas', aVal(o.qtdParcelas), aVal(n.qtdParcelas))
  push('condicaoPagamento', 'Condição de pagamento', aLbl(maps.condicao, aVal(o.condicaoPagamento)), aLbl(maps.condicao, aVal(n.condicaoPagamento)))
  push('complementoValor', 'Complemento do valor', aVal(o.complementoValor), aVal(n.complementoValor))
  push('observacoes', 'Observações', aVal(o.observacoes), aVal(n.observacoes))
  const objL = (arr: unknown) => (Array.isArray(arr) ? (arr as string[]) : []).map(id => aLbl(maps.objeto, aVal(id))).join(', ')
  push('objeto', 'Objeto do contrato', objL(o.objeto), objL(n.objeto))

  /* aditivos (ciclo de vida) */
  const oA = aArr(o.aditivos), nA = aArr(n.aditivos)
  const oAById = new Map(oA.map(a => [aVal(a.id), a] as [string, CRec]))
  const nAById = new Map(nA.map(a => [aVal(a.id), a] as [string, CRec]))
  const numA = (a: CRec) => (a.numero ? `${aVal(a.numero)}º aditivo` : 'aditivo')
  const efA = (a: CRec) => [a.alteraTermino && 'prorrogação', a.alteraValor && 'reajuste', a.alteraObjeto && 'escopo', a.alteraPartes && 'cessão'].filter(Boolean).join(', ')
  for (const a of nA) if (!oAById.has(aVal(a.id))) ch.push({ field: `aditivo.${aVal(a.id)}`, label: 'Aditivo criado', before: '—', after: `${numA(a)}${efA(a) ? ' — ' + efA(a) : ''}` })
  for (const a of oA) if (!nAById.has(aVal(a.id))) ch.push({ field: `aditivo.${aVal(a.id)}`, label: 'Aditivo removido', before: numA(a), after: '—' })
  for (const a of nA) {
    const prev = oAById.get(aVal(a.id)); if (!prev) continue
    const ps = aVal(prev.situacao) || 'ATIVO', ns = aVal(a.situacao) || 'ATIVO'
    if (ps !== ns) ch.push({ field: `aditivo.${aVal(a.id)}.situacao`, label: ns === 'ATIVO' ? 'Aditivo ativado' : 'Aditivo reaberto para revisão', before: '—', after: `${numA(a)}${efA(a) ? ' — ' + efA(a) : ''}` })
  }

  /* lançamentos */
  for (const [field, label] of [['pagamentos', 'Pagamento'], ['recebimentos', 'Recebimento']] as const) {
    const oL = aArr(o[field]), nL = aArr(n[field])
    const oIds = new Set(oL.map(l => aVal(l.id))), nIds = new Set(nL.map(l => aVal(l.id)))
    const descL = (l: CRec) => [aMoney(l.valor), aLbl(maps.forma, aVal(l.forma)), aDate(l.data)].filter(Boolean).join(' · ')
    for (const l of nL) if (!oIds.has(aVal(l.id))) ch.push({ field: `${field}.${aVal(l.id)}`, label: `${label} registrado`, before: '—', after: descL(l) })
    for (const l of oL) if (!nIds.has(aVal(l.id))) ch.push({ field: `${field}.${aVal(l.id)}`, label: `${label} removido`, before: descL(l), after: '—' })
  }

  /* reajustes efetivamente aplicados */
  const oR = aArr(o.reajustesRealizados), nR = aArr(n.reajustesRealizados)
  const oRIds = new Set(oR.map(r => aVal(r.id))), nRIds = new Set(nR.map(r => aVal(r.id)))
  const descR = (r: CRec) => {
    const alvo = aVal(r.base) === 'parcela' ? aMoney(r.parcelaNova) : aMoney(r.valorNovo)
    return [aVal(r.indiceSnapshot), aVal(r.percentual) !== '' ? `${aVal(r.percentual)}%` : '', aMesAno(r.competencia), alvo].filter(Boolean).join(' · ')
  }
  for (const r of nR) if (!oRIds.has(aVal(r.id))) ch.push({ field: `reajuste.${aVal(r.id)}`, label: 'Reajuste aplicado', before: '—', after: descR(r) })
  for (const r of oR) if (!nRIds.has(aVal(r.id))) ch.push({ field: `reajuste.${aVal(r.id)}`, label: 'Reajuste removido', before: descR(r), after: '—' })

  /* documentos */
  const oD = aArr(o.documentos), nD = aArr(n.documentos)
  const oDIds = new Set(oD.map(d => aVal(d.id))), nDIds = new Set(nD.map(d => aVal(d.id)))
  const descD = (d: CRec) => aVal(d.nome) || aVal(d.arquivo_nome) || 'documento'
  for (const d of nD) if (!oDIds.has(aVal(d.id))) ch.push({ field: `documento.${aVal(d.id)}`, label: 'Documento anexado', before: '—', after: descD(d) })
  for (const d of oD) if (!nDIds.has(aVal(d.id))) ch.push({ field: `documento.${aVal(d.id)}`, label: 'Documento removido', before: descD(d), after: '—' })

  /* partes */
  const oP = aArr(o.partes), nP = aArr(n.partes)
  const oPById = new Map(oP.map(p => [aVal(p.id), p] as [string, CRec]))
  const nPById = new Map(nP.map(p => [aVal(p.id), p] as [string, CRec]))
  const papelL = (p: CRec) => aLbl(maps.papel, aVal(p.papel)) || 'parte'
  for (const p of nP) {
    const prev = oPById.get(aVal(p.id))
    if (!prev) { ch.push({ field: `parte.${aVal(p.id)}`, label: `Parte adicionada · ${papelL(p)}`, before: '—', after: aVal(p.nome) || '—' }); continue }
    if (aVal(prev.ref_id) !== aVal(p.ref_id) || aVal(prev.papel) !== aVal(p.papel))
      ch.push({ field: `parte.${aVal(p.id)}`, label: `Parte alterada · ${papelL(p)}`, before: aVal(prev.nome) || '—', after: aVal(p.nome) || '—' })
  }
  for (const p of oP) if (!nPById.has(aVal(p.id))) ch.push({ field: `parte.${aVal(p.id)}`, label: `Parte removida · ${papelL(p)}`, before: aVal(p.nome) || '—', after: '—' })

  return ch
}

/* Classifica UMA mudança no seu evento: a transição de situação é ATIVADO/EM_REVISAO/...
   (só ela); aditivo/lançamento/documento têm seus eventos; o resto é ATUALIZAÇÃO.
   Assim, alterar campos + ativar num mesmo salvar gera logs SEPARADOS. */
function classifyChange(c: AuditChange, novaSituacao: string): string {
  if (c.field === 'situacao') {
    if (novaSituacao === 'VIGENTE')     return 'ATIVADO'
    if (novaSituacao === 'EM_CADASTRO') return 'EM_REVISAO'
    if (novaSituacao === 'ENCERRADO')   return 'ENCERRADO'
    if (novaSituacao === 'RESCINDIDO')  return 'RESCINDIDO'
    return 'ATUALIZADO'
  }
  if (c.field.startsWith('aditivo'))     return 'ADITIVO'
  if (c.field.startsWith('reajuste'))    return 'REAJUSTE'
  if (c.field.startsWith('pagamentos') || c.field.startsWith('recebimentos')) return 'LANCAMENTO'
  if (c.field.startsWith('documento'))   return 'DOCUMENTO'
  return 'ATUALIZADO'
}
const isTransitionEvent = (ev: string) => ['ATIVADO', 'EM_REVISAO', 'ENCERRADO', 'RESCINDIDO'].includes(ev)

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /* Resolve nome/documento das partes "ao vivo" a partir da entidade referenciada
     (parceiro/empresa/unidade) pelo ref_id — assim o contrato sempre reflete os
     dados atuais, mesmo que tenham mudado depois de selecionados. Mantém o snapshot
     gravado como fallback quando a entidade não é encontrada (ex.: excluída). */
  private async resolvePartesLive(contracts: Array<{ partes: unknown }>, organizationId: string) {
    const ids = { PARCEIRO: new Set<string>(), EMPRESA: new Set<string>(), UNIDADE: new Set<string>() }
    for (const c of contracts)
      for (const p of (c.partes as Array<Record<string, string>>) ?? [])
        if (p?.ref_id && ids[p.ref_tipo as keyof typeof ids]) ids[p.ref_tipo as keyof typeof ids].add(p.ref_id)

    const [partners, empresas, unidades] = await Promise.all([
      ids.PARCEIRO.size ? this.prisma.partner.findMany({ where: { organizationId, id: { in: [...ids.PARCEIRO] } }, select: { id: true, razaoSocial: true, documento: true } }) : [],
      ids.EMPRESA.size  ? this.prisma.groupCompany.findMany({ where: { organizationId, id: { in: [...ids.EMPRESA] } }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } }) : [],
      ids.UNIDADE.size  ? this.prisma.orgUnit.findMany({ where: { organizationId, id: { in: [...ids.UNIDADE] } }, select: { id: true, nome: true, codigo: true } }) : [],
    ])
    const pMap = new Map(partners.map(p => [p.id, { nome: p.razaoSocial,                 documento: p.documento ?? '' }]))
    const eMap = new Map(empresas.map(e => [e.id, { nome: e.nomeFantasia || e.razaoSocial, documento: e.cnpj ?? '' }]))
    const uMap = new Map(unidades.map(u => [u.id, { nome: u.nome,                         documento: u.codigo ?? '' }]))
    const pick = (tipo: string, id: string) =>
      tipo === 'PARCEIRO' ? pMap.get(id) : tipo === 'EMPRESA' ? eMap.get(id) : tipo === 'UNIDADE' ? uMap.get(id) : undefined

    for (const c of contracts) {
      const partes = (c.partes as Array<Record<string, string>>) ?? []
      c.partes = partes.map(p => {
        const live = p?.ref_id ? pick(p.ref_tipo, p.ref_id) : undefined
        return live ? { ...p, nome: live.nome, documento: live.documento } : p
      })
    }
  }

  async create(dto: CreateContractDto, organizationId: string) {
    const { user, ...data } = dto
    const numero = await this.resolveNumero(organizationId, (data as { numero?: string }).numero)
    const created = await this.prisma.contract.create({ data: { ...data, numero, organizationId } as never })
    await this.prisma.contractAuditLog.create({
      data: {
        contractId: created.id,
        user:       user ?? 'Usuário do sistema',
        event:      'CRIADO',
        changes:    [{ field: 'situacao', label: 'Situação', before: '—', after: SIT_LABEL[created.situacao] ?? created.situacao }] as never,
      },
    })
    return created
  }

  /** Resolve o número do contrato: no modo AUTO gera pela config e incrementa o contador;
   *  no modo MANUAL (ou sem config) usa o número informado pelo cliente.
   *  Read-modify-write do contador (concorrência baixa neste ERP interno). */
  private async resolveNumero(organizationId: string, provided?: string): Promise<string> {
    const where = { organizationId_userId_key: { organizationId, userId: '', key: CONTRACT_NUMBERING_KEY } }
    const row = await this.prisma.appSetting.findUnique({ where })
    const cfg = (row?.value ?? null) as NumberingCfg | null
    if (!cfg || cfg.modo !== 'AUTO') return (provided ?? '').trim()

    const year = new Date().getFullYear()
    let seq: number
    let ano = cfg.ano ?? year
    if (cfg.incluirAno && cfg.ano !== year) { seq = cfg.inicio ?? 1; ano = year } // reinício anual
    else seq = cfg.proximo ?? cfg.inicio ?? 1

    const numero = formatNumero(cfg, seq, year)
    await this.prisma.appSetting.update({ where, data: { value: { ...cfg, proximo: seq + 1, ano } as never } })
    return numero
  }

  /* mapas id -> rótulo das tabelas auxiliares, para a auditoria mostrar nomes (não ids) */
  private async loadMaps(organizationId: string): Promise<Maps> {
    const [tipo, condicao, objeto, papel, forma] = await Promise.all([
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:tipos'),
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:condicoes'),
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:objetos'),
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:papeis:v2'),
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:formas-pagamento'),
    ])
    return { tipo, condicao, objeto, papel, forma }
  }

  /* Carrega uma tabela auxiliar (AppSetting de organização) como mapa id → rótulo atual. */
  private async loadLookupMap(organizationId: string, key: string): Promise<Map<string, string>> {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId: '', key } },
    })
    const entries = (row?.value as unknown as Array<{ id: string; label: string }> | null) ?? []
    return new Map(entries.map(e => [e.id, e.label]))
  }

  /* Aplica os termos aditivos sobre o registro (em memória) para refletir o estado
     VIGENTE na listagem/dashboard: término, valor, objeto e partes (cessão). O original
     persistido não muda — a tela de detalhe recebe o bruto e deriva o vigente no front.
     Mesma lógica de terminoVigente/valorVigente/partesVigentes do front. */
  private applyAditivos(c: Record<string, unknown>) {
    const aditivos = (c.aditivos as Array<Record<string, unknown>>) ?? []
    for (const a of aditivos) {
      if (a.situacao === 'RASCUNHO') continue  // só aditivo ATIVO aplica (legado sem situacao = ativo)
      if (a.alteraTermino && a.novoTermino) c.terminoVigencia = a.novoTermino
      if (a.alteraValor && a.novoValor != null) c.valorTotal = (Number(c.valorTotal) || 0) + (Number(a.novoValor) || 0)  // acréscimo somado ao inicial
      if (a.alteraValor && a.novaParcela != null) c.valorParcela = a.novaParcela
      if (a.alteraObjeto) c.objeto = (a.novoObjeto as unknown[]) ?? []
      if (a.alteraPartes) {
        const cessoes = (a.cessoes as Array<Record<string, string>>) ?? []
        for (const ce of cessoes)
          c.partes = ((c.partes as Array<Record<string, string>>) ?? []).map(p =>
            p.id === ce.parteId ? { ...p, ref_tipo: ce.ref_tipo, ref_id: ce.ref_id, nome: ce.nome, documento: ce.documento } : p)
      }
    }
    /* renovações automáticas (cláusula, não aditivo) estendem a vigência (mais tardia vence) e
       somam o valor do período gerado ao total do contrato */
    for (const r of ((c.renovacoes as Array<Record<string, unknown>>) ?? [])) {
      const nt = r.novoTermino as string | undefined
      if (nt && (!c.terminoVigencia || nt > (c.terminoVigencia as string))) c.terminoVigencia = nt
      c.valorTotal = (Number(c.valorTotal) || 0) + (Number(r.valorPeriodo) || 0)
    }
    /* reajustes efetivamente aplicados: delta somado ao valor total (parcela tratada abaixo) */
    const reajustes = (c.reajustesRealizados as Array<Record<string, unknown>>) ?? []
    for (const r of reajustes) {
      c.valorTotal = (Number(c.valorTotal) || 0) + (Number(r.valorNovo) || 0) - (Number(r.valorAnterior) || 0)
    }
    /* parcela vigente = último evento (aditivo ATIVO ou reajuste de parcela) por data */
    const parcelaEventos = [
      ...aditivos.filter(a => a.situacao !== 'RASCUNHO' && a.alteraValor && a.novaParcela != null).map(a => ({ data: String(a.data ?? ''), val: a.novaParcela })),
      ...reajustes.filter(r => Number(r.parcelaNova)).map(r => ({ data: String(r.competencia ?? ''), val: r.parcelaNova })),
    ].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
    if (parcelaEventos.length) c.valorParcela = parcelaEventos[parcelaEventos.length - 1].val
  }

  async findAll(organizationId: string) {
    const data = await this.prisma.contract.findMany({
      where:   { organizationId },
      orderBy: { createdAt: 'desc' },
    })
    for (const c of data as Array<Record<string, unknown>>) this.applyAditivos(c)
    await this.resolvePartesLive(data as Array<{ partes: unknown }>, organizationId)

    /* Resolve ao vivo os rótulos de tabelas auxiliares usados na listagem:
       tipo (coluna) e papel (deriva Contratante/Contratada). Fallback no valor
       gravado para registros legados (gravados como rótulo antes do padrão por id). */
    const [tiposMap, papeisMap] = await Promise.all([
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:tipos'),
      this.loadLookupMap(organizationId, 'nxt:settings:contratos:papeis:v2'),
    ])
    const live = (map: Map<string, string>, v: string) => map.get(v) ?? v
    for (const c of data as Array<{ tipo: string; partes: unknown }>) {
      c.tipo = live(tiposMap, c.tipo)
      for (const p of (c.partes as Array<Record<string, string>>) ?? []) p.papel = live(papeisMap, p.papel)
    }

    return { rows: data.map(c => toRow(c as ContractRecord)) }
  }

  async findOne(id: string, organizationId: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id, organizationId } })
    if (!contract) throw new NotFoundException('Contrato não encontrado')
    await this.resolvePartesLive([contract as { partes: unknown }], organizationId)
    return contract
  }

  async update(id: string, dto: UpdateContractDto, organizationId: string) {
    /* busca o BRUTO (sem resolvePartesLive) para o diff comparar estado gravado vs novo */
    const old = await this.prisma.contract.findFirst({ where: { id, organizationId } })
    if (!old) throw new NotFoundException('Contrato não encontrado')
    const { user, motivo, ...data } = dto
    const updated = await this.prisma.contract.update({ where: { id }, data: data as never })

    const changes = diffContract(old as CRec, updated as CRec, await this.loadMaps(organizationId))
    if (changes.length) {
      /* cada mudança vai pro SEU evento (situação → transição; campos → Atualização; etc.),
         gerando um log por evento. O motivo acompanha só a transição de situação. */
      const na = aVal(updated.situacao)
      const byEvent = new Map<string, AuditChange[]>()
      for (const c of changes) {
        const ev = classifyChange(c, na)
        const list = byEvent.get(ev) ?? []
        list.push(c); byEvent.set(ev, list)
      }
      /* não-transições primeiro; a transição por último (createdAt maior → topo do histórico) */
      const order = [...byEvent.keys()].sort((a, b) => Number(isTransitionEvent(a)) - Number(isTransitionEvent(b)))
      for (const ev of order) {
        await this.prisma.contractAuditLog.create({
          data: {
            contractId: id,
            user:       user ?? 'Usuário do sistema',
            event:      ev,
            motivo:     isTransitionEvent(ev) && motivo?.trim() ? motivo.trim() : null,
            changes:    byEvent.get(ev) as never,
          },
        })
      }
    }
    return updated
  }

  async getAuditLogs(contractId: string, organizationId: string) {
    const exists = await this.prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } })
    if (!exists) throw new NotFoundException('Contrato não encontrado')
    return this.prisma.contractAuditLog.findMany({ where: { contractId }, orderBy: { createdAt: 'desc' } })
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.contract.delete({ where: { id } })
  }

  /* Consulta a série mensal de um índice na API pública do Banco Central (SGS) e devolve
     [{ competencia: 'yyyy-mm', valor: <% do mês> }]. Fonte opcional (Fase 3): a tabela manual
     continua sendo a fonte de verdade; este import só é usado quando o servidor tem internet. */
  async importBcb(code: string, from?: string, to?: string, full = false): Promise<Array<{ competencia: string; valor: number }>> {
    if (!code || !/^\d+$/.test(code)) throw new BadRequestException('Código da série (SGS) inválido.')
    const toBcbDate = (yyyymm: string | undefined, mesesAtras: number): string => {
      let d: Date
      if (yyyymm && /^\d{4}-\d{2}$/.test(yyyymm)) { const [y, m] = yyyymm.split('-').map(Number); d = new Date(Date.UTC(y, m - 1, 1)) }
      else { d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - mesesAtras) }
      return `01/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
    }
    // full = série completa (sem intervalo → BCB devolve toda a série); senão, janela padrão de 5 anos
    const url = full
      ? `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json`
      : `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${toBcbDate(from, 60)}&dataFinal=${toBcbDate(to, 0)}`
    let raw: Array<{ data: string; valor: string }>
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      raw = (await res.json()) as Array<{ data: string; valor: string }>
    } catch {
      throw new ServiceUnavailableException('Não foi possível consultar o Banco Central (verifique a conexão do servidor).')
    }
    return (raw ?? [])
      .map(d => {
        const [, mm, yyyy] = String(d.data).split('/')
        return { competencia: yyyy && mm ? `${yyyy}-${mm}` : '', valor: Number(String(d.valor).replace(',', '.')) }
      })
      .filter(x => x.competencia && Number.isFinite(x.valor))
  }
}
