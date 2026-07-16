import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreatePartnerDto } from './dto/create-partner.dto'
import { UpdatePartnerDto } from './dto/update-partner.dto'
import { QueryPartnersDto } from './dto/query-partners.dto'
import {
  type CustomFieldMeta, isNegateOp, customValueWhere, displayCustomValue, customSearchOr,
} from './custom-field-query'

/** SQL Server limita ~2100 parâmetros/consulta; fatiamos os `in` de ids em blocos. */
const IN_CHUNK = 1000
/** Colunas nativas conhecidas (nome/status → Prisma; cidade/estado/contato → JSON).
 *  Um filtro/sort fora deste conjunto é candidato a campo personalizado das Telas. */
const NATIVE_COLS = new Set(['nome', 'categoria', 'identificador', 'status', 'cidade', 'estado', 'contato'])

/* ── legenda de categoria (label p/ display) ── */
const CAT_LABEL: Record<string, string> = {
  PJ_BR:  'PJ Brasileira',  PJ_EST: 'PJ Estrangeira',
  PF_BR:  'PF Brasileira',  PF_EST: 'PF Estrangeira',
}

const STATUS_LABEL: Record<string, string> = {
  ATIVO: 'Ativo', INATIVO: 'Inativo', EM_CADASTRAMENTO: 'Em cadastramento',
}

/* ─── motor de diff (auditoria de campos) ─────────────────── */

export interface AuditChange { field: string; label: string; before: string; after: string }

function fmtDate(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v
}
function val(v: unknown): string { return v == null ? '' : String(v) }

/* campos escalares: chave Prisma → rótulo + formatador opcional */
const SCALAR_FIELDS: { key: string; label: string; fmt?: (v: string) => string }[] = [
  { key: 'categoria',      label: 'Categoria',          fmt: v => CAT_LABEL[v] ?? v },
  { key: 'documento',      label: 'Documento'        },
  { key: 'razaoSocial',    label: 'Razão Social / Nome' },
  { key: 'nomeFantasia',   label: 'Nome Fantasia'    },
  { key: 'ie',             label: 'Inscrição Estadual'  },
  { key: 'im',             label: 'Inscrição Municipal' },
  { key: 'rg',             label: 'RG'               },
  { key: 'orgaoExpedidor', label: 'Órgão Expedidor'  },
  { key: 'dataNascimento', label: 'Data de Nascimento', fmt: fmtDate },
  { key: 'dataAbertura',   label: 'Data de Abertura', fmt: fmtDate },
  { key: 'naturezaJuridica', label: 'Natureza Jurídica' },
  { key: 'cnaePrincipal',  label: 'CNAE Principal'   },
  { key: 'paisOrigem',     label: 'País de Origem'   },
]

/* listas: cada item compara subcampos por posição (cobre alteração/inclusão/remoção) */
const ARRAY_FIELDS: { key: string; label: string; sub: { k: string; l: string }[] }[] = [
  { key: 'contatos', label: 'Contato', sub: [
    { k: 'email', l: 'E-mail' }, { k: 'nome', l: 'Nome do Contato' }, { k: 'telefone', l: 'Telefone' },
    { k: 'celular', l: 'Celular' }, { k: 'cargo', l: 'Cargo' }, { k: 'website', l: 'Website' } ] },
  { key: 'enderecos', label: 'Endereço', sub: [
    { k: 'cep', l: 'CEP' }, { k: 'estado', l: 'Estado' }, { k: 'logradouro', l: 'Logradouro' },
    { k: 'numero', l: 'Número' }, { k: 'complemento', l: 'Complemento' }, { k: 'bairro', l: 'Bairro' },
    { k: 'cidade', l: 'Cidade' }, { k: 'address1', l: 'Endereço — Linha 1' }, { k: 'address2', l: 'Endereço — Linha 2' },
    { k: 'pais_endereco', l: 'País' } ] },
  { key: 'bancos', label: 'Banco', sub: [
    { k: 'banco', l: 'Banco' }, { k: 'tipo_conta', l: 'Tipo de Conta' }, { k: 'agencia', l: 'Agência' },
    { k: 'conta', l: 'Conta' }, { k: 'pix', l: 'Chave PIX' } ] },
  { key: 'socios', label: 'Sócio', sub: [
    { k: 'nome', l: 'Nome' }, { k: 'documento', l: 'Documento' }, { k: 'participacao', l: 'Participação %' },
    { k: 'cargo', l: 'Cargo' } ] },
]

/* listas de CÓDIGOS (array de strings): audita cada inclusão/remoção separadamente */
const CODE_LIST_FIELDS: { key: string; label: string }[] = [
  { key: 'cnaesSecundarios', label: 'CNAE Secundário' },
]

type PartnerLike = Record<string, unknown>

function diffPartner(oldP: PartnerLike, newP: PartnerLike, cnaeLabel: (code: string) => string = (c) => c): AuditChange[] {
  const changes: AuditChange[] = []

  /* situação (tratada como campo) */
  if (val(oldP.status) !== val(newP.status)) {
    changes.push({
      field: 'status', label: 'Situação',
      before: STATUS_LABEL[val(oldP.status)] ?? val(oldP.status) ?? '—',
      after:  STATUS_LABEL[val(newP.status)] ?? val(newP.status) ?? '—',
    })
  }

  /* escalares (cnaePrincipal resolve o código → descrição pelo catálogo) */
  for (const f of SCALAR_FIELDS) {
    const b = val(oldP[f.key]); const a = val(newP[f.key])
    if (b !== a) {
      const fmt = f.key === 'cnaePrincipal' ? cnaeLabel : f.fmt
      changes.push({
        field: f.key, label: f.label,
        before: b ? (fmt ? fmt(b) : b) : '—',
        after:  a ? (fmt ? fmt(a) : a) : '—',
      })
    }
  }

  /* listas de códigos (ex.: CNAEs secundários) → um log por inclusão/remoção */
  for (const cf of CODE_LIST_FIELDS) {
    const oldArr = ((oldP[cf.key] as string[]) ?? []).map(String)
    const newArr = ((newP[cf.key] as string[]) ?? []).map(String)
    const oldSet = new Set(oldArr); const newSet = new Set(newArr)
    for (const code of newArr) if (!oldSet.has(code)) changes.push({ field: `${cf.key}.add.${code}`, label: cf.label, before: '—', after: cnaeLabel(code) })
    for (const code of oldArr) if (!newSet.has(code)) changes.push({ field: `${cf.key}.rem.${code}`, label: cf.label, before: cnaeLabel(code), after: '—' })
  }

  /* listas (por posição → cobre add/remove/alteração de cada subcampo) */
  for (const af of ARRAY_FIELDS) {
    const oldArr = (oldP[af.key] as Array<Record<string, unknown>>) ?? []
    const newArr = (newP[af.key] as Array<Record<string, unknown>>) ?? []
    const n = Math.max(oldArr.length, newArr.length)
    for (let i = 0; i < n; i++) {
      const o = oldArr[i]; const nw = newArr[i]
      for (const s of af.sub) {
        const b = val(o?.[s.k]); const a = val(nw?.[s.k])
        if (b !== a) changes.push({
          field: `${af.key}.${i}.${s.k}`, label: `${s.l} · ${af.label} ${i + 1}`,
          before: b || '—', after: a || '—',
        })
      }
    }
  }

  return changes
}

function statusEvent(oldS: string, newS: string): string {
  if (oldS === newS) return 'ALTERADO'
  if (newS === 'ATIVO')            return oldS === 'INATIVO' ? 'REATIVADO' : 'ATIVADO'
  if (newS === 'INATIVO')          return 'INATIVADO'
  if (newS === 'EM_CADASTRAMENTO') return 'EM_REVISAO' // "Habilitar para alteração" (reabertura); criação usa EM_CADASTRAMENTO
  return 'ALTERADO'
}

/* ── coluna de sort → campo Prisma ── */
const SORT_FIELD: Record<string, string> = {
  nome:          'razaoSocial',
  categoria:     'categoria',
  identificador: 'documento',
  status:        'status',
}

type PartnerSelectRow = {
  id: string; razaoSocial: string; categoria: string; status: string
  documento: string | null; nomeFantasia: string | null
  ie: string | null; im: string | null
  rg: string | null; orgaoExpedidor: string | null; dataNascimento: string | null
  dataAbertura: string | null; naturezaJuridica: string | null
  cnaePrincipal: string | null; cnaesSecundarios: unknown
  paisOrigem: string | null
  contatos: unknown; enderecos: unknown; bancos: unknown; socios: unknown
}

/** Resolvedores de código → rótulo para as colunas de catálogo (natureza/CNAE). */
type RowResolvers = { nat: (code: string) => string; cnae: (code: string) => string }

function toRow(p: PartnerSelectRow, res?: RowResolvers) {
  const c0 = ((p.contatos  as Array<Record<string,string>>) ?? [])[0] ?? {}
  const e0 = ((p.enderecos as Array<Record<string,string>>) ?? [])[0] ?? {}
  const b0 = ((p.bancos    as Array<Record<string,string>>) ?? [])[0] ?? {}
  const s0 = ((p.socios    as Array<Record<string,string>>) ?? [])[0] ?? {}
  return {
    id:            p.id,
    nome:          p.razaoSocial,
    categoria:     CAT_LABEL[p.categoria] ?? p.categoria,
    identificador: p.documento   ?? '',
    cidade:        e0.cidade     ?? '',
    estado:        e0.estado     ?? '',
    contato:       c0.nome       ?? '',
    status:        p.status,
    /* campos nativos extras */
    nomeFantasia:   p.nomeFantasia   ?? '',
    ie:             p.ie             ?? '',
    im:             p.im             ?? '',
    rg:             p.rg             ?? '',
    orgaoExpedidor: p.orgaoExpedidor ?? '',
    dataNascimento: p.dataNascimento ?? '',
    dataAbertura:     p.dataAbertura ?? '',
    naturezaJuridica: p.naturezaJuridica ? (res?.nat(p.naturezaJuridica) ?? p.naturezaJuridica) : '',
    cnaePrincipal:    p.cnaePrincipal    ? (res?.cnae(p.cnaePrincipal)   ?? p.cnaePrincipal)   : '',
    cnaesSecundarios: (() => { const n = ((p.cnaesSecundarios as string[]) ?? []).length; return n ? String(n) : '' })(),
    paisOrigem:     p.paisOrigem     ?? '',
    email:         c0.email       ?? '',
    telefone:      c0.telefone    ?? '',
    celular:       c0.celular     ?? '',
    cargo:         c0.cargo       ?? '',
    website:       c0.website     ?? '',
    cep:           e0.cep         ?? '',
    logradouro:    e0.logradouro  ?? '',
    numero:        e0.numero      ?? '',
    complemento:   e0.complemento ?? '',
    bairro:        e0.bairro      ?? '',
    address1:      e0.address1    ?? '',
    address2:      e0.address2    ?? '',
    endPais:       e0.pais_endereco ?? '',
    banco:         b0.banco       ?? '',
    tipoConta:     b0.tipo_conta  ?? '',
    agencia:       b0.agencia     ?? '',
    conta:         b0.conta       ?? '',
    pix:           b0.pix         ?? '',
    socNome:       s0.nome        ?? '',
    socDoc:        s0.documento   ?? '',
    socPart:       s0.participacao ?? '',
    socCargo:      s0.cargo       ?? '',
  }
}

type FilterItem = { col: string; op: string; value: string }

// SQL Server é case-insensitive pela collation, então não há (nem o conector aceita)
// o `mode: 'insensitive'` do Postgres — os filtros de coluna usam comparação direta.
function applyStringFilter(col: string, op: string, val: string): object {
  switch (op) {
    case 'eq':            return { [col]: { equals: val } }
    case 'neq':           return { NOT: { [col]: { equals: val } } }
    case 'startsWith':    return { [col]: { startsWith: val } }
    case 'notStartsWith': return { NOT: { [col]: { startsWith: val } } }
    case 'endsWith':      return { [col]: { endsWith: val } }
    case 'notEndsWith':   return { NOT: { [col]: { endsWith: val } } }
    case 'notContains':   return { NOT: { [col]: { contains: val } } }
    default:              return { [col]: { contains: val } }
  }
}

// Filtros sobre campos JSON (cidade/estado/contato). O conector SQL Server do Prisma
// não suporta filtro JSON-path, então são resolvidos por T-SQL (JSON_VALUE) em
// `resolveJsonFilter` — aqui o translate só os ignora (retorna null).
const JSON_FILTER: Record<string, { col: 'enderecos' | 'contatos'; path: string }> = {
  cidade:  { col: 'enderecos', path: '$[0].cidade' },
  estado:  { col: 'enderecos', path: '$[0].estado' },
  contato: { col: 'contatos',  path: '$[0].nome'   },
}

// Mapeia o operador para o padrão LIKE/igualdade e se a condição final é negada.
function jsonLikeParam(op: string, val: string): { param: string; exact: boolean; negate: boolean } {
  switch (op) {
    case 'eq':            return { param: val,        exact: true,  negate: false }
    case 'neq':           return { param: val,        exact: true,  negate: true  }
    case 'startsWith':    return { param: `${val}%`,  exact: false, negate: false }
    case 'notStartsWith': return { param: `${val}%`,  exact: false, negate: true  }
    case 'endsWith':      return { param: `%${val}`,  exact: false, negate: false }
    case 'notEndsWith':   return { param: `%${val}`,  exact: false, negate: true  }
    case 'notContains':   return { param: `%${val}%`, exact: false, negate: true  }
    default:              return { param: `%${val}%`, exact: false, negate: false }
  }
}

function translateFilter(f: FilterItem): object | null {
  const val = f.value.trim()
  if (!val) return null
  switch (f.col) {
    case 'nome':          return applyStringFilter('razaoSocial', f.op, val)
    case 'categoria':     return applyStringFilter('categoria',   f.op, val)
    case 'identificador': return applyStringFilter('documento',   f.op, val)
    case 'status':        return applyStringFilter('status',      f.op, val)
    default:              return null // cidade/estado/contato → resolveJsonFilter
  }
}

function buildWhere(
  organizationId: string,
  search?: string,
  filters?: FilterItem[],
  logic?: 'AND' | 'OR',
  jsonConditions: object[] = [],
  searchCustomIds: string[] = [],
) {
  const conditions: object[] = []

  if (search?.trim()) {
    const q = search.trim()
    const or: object[] = [
      { razaoSocial: { contains: q } },
      { nomeFantasia: { contains: q } },
      { documento:    { contains: q } },
    ]
    /* busca "todas as colunas" também alcança os valores custom (por id resolvido) */
    if (searchCustomIds.length) or.push({ id: { in: searchCustomIds } })
    conditions.push({ OR: or })
  }

  const filterConditions = [
    ...(filters ?? []).map(translateFilter).filter((c): c is object => c !== null),
    ...jsonConditions,
  ]

  if (filterConditions.length) {
    conditions.push(logic === 'OR' ? { OR: filterConditions } : { AND: filterConditions })
  }

  if (!conditions.length) return { organizationId }
  return { organizationId, AND: conditions }
}

function buildOrder(sort?: { col: string; dir: 'asc' | 'desc' }) {
  if (!sort) return { createdAt: 'desc' as const }
  const field = SORT_FIELD[sort.col]
  if (!field) return { createdAt: 'desc' as const }
  return { [field]: sort.dir as 'asc' | 'desc' }
}

/** Colunas do Partner trazidas para a listagem (reutilizado nos dois caminhos de query). */
const PARTNER_SELECT = {
  id: true, razaoSocial: true, categoria: true, status: true,
  documento: true, nomeFantasia: true, ie: true, im: true,
  rg: true, orgaoExpedidor: true, dataNascimento: true, paisOrigem: true,
  dataAbertura: true, naturezaJuridica: true, cnaePrincipal: true, cnaesSecundarios: true,
  contatos: true, enderecos: true, bancos: true, socios: true,
} satisfies Record<string, true>

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePartnerDto, organizationId: string, actor?: string) {
    /* `user` do payload é descartado — o autor vem do token (`actor`), não do cliente */
    const { user: _clientUser, ...data } = dto
    const created = await this.prisma.partner.create({
      data: { ...data, organizationId } as never,
    })
    await this.prisma.partnerAuditLog.create({
      data: {
        partnerId: created.id,
        user:      actor ?? 'Usuário do sistema',
        event:     created.status === 'ATIVO' ? 'ATIVADO' : 'EM_CADASTRAMENTO',
        changes:   [{ field: 'status', label: 'Situação', before: '—', after: STATUS_LABEL[created.status] ?? created.status }] as never,
      },
    })
    return created
  }

  findAll(organizationId: string) {
    return this.prisma.partner.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, organizationId: string) {
    const partner = await this.prisma.partner.findFirst({ where: { id, organizationId } })
    if (!partner) throw new NotFoundException('Parceiro não encontrado')
    return partner
  }

  async update(id: string, dto: UpdatePartnerDto, organizationId: string, actor?: string) {
    const old = await this.findOne(id, organizationId)
    /* `user` do payload é descartado — o autor vem do token (`actor`), não do cliente */
    const { user: _clientUser, motivo, ...data } = dto
    const updated = await this.prisma.partner.update({ where: { id }, data: data as never })

    /* resolvedor de CNAE (principal + secundários, antes e depois) → "código — descrição" no histórico */
    const cnaeCodes = new Set<string>()
    for (const p of [old, updated] as PartnerLike[]) {
      if (p.cnaePrincipal) cnaeCodes.add(String(p.cnaePrincipal))
      for (const c of (p.cnaesSecundarios as string[] | undefined) ?? []) cnaeCodes.add(String(c))
    }
    let cnaeMap = new Map<string, string>()
    if (cnaeCodes.size) {
      const rows = await this.prisma.cnae.findMany({ where: { code: { in: [...cnaeCodes] } } })
      cnaeMap = new Map(rows.map((r) => [r.code, r.descricao]))
    }
    const cnaeLabel = (c: string) => { const d = cnaeMap.get(c); return d ? `${c} — ${d}` : c }

    const changes = diffPartner(old as PartnerLike, updated as PartnerLike, cnaeLabel)
    if (changes.length) {
      /* cada mudança vai pro SEU evento: a transição de status vira Ativado/Inativado/...
         (só a mudança de situação) e os campos viram Atualização — logs separados. */
      const transEvent = statusEvent(val(old.status), val(updated.status))
      const byEvent = new Map<string, AuditChange[]>()
      for (const c of changes) {
        const ev = c.field === 'status' ? transEvent : 'ALTERADO'
        const list = byEvent.get(ev) ?? []
        list.push(c); byEvent.set(ev, list)
      }
      const isTransition = (ev: string) => ev !== 'ALTERADO'
      /* não-transição primeiro; a transição por último (createdAt maior → topo do histórico) */
      const order = [...byEvent.keys()].sort((a, b) => Number(isTransition(a)) - Number(isTransition(b)))
      for (const ev of order) {
        await this.prisma.partnerAuditLog.create({
          data: {
            partnerId: id,
            user:      actor ?? 'Usuário do sistema',
            event:     ev,
            motivo:    isTransition(ev) && motivo?.trim() ? motivo.trim() : null,
            changes:   byEvent.get(ev) as never,
          },
        })
      }
    }
    return updated
  }

  async getAuditLogs(partnerId: string, organizationId: string) {
    await this.findOne(partnerId, organizationId) // garante que o parceiro é do tenant
    return this.prisma.partnerAuditLog.findMany({
      where:   { partnerId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.partner.delete({ where: { id } })
  }

  /**
   * Resolve um filtro sobre campo JSON (cidade/estado/contato) em SQL Server.
   * O conector não suporta filtro JSON-path, então buscamos os ids casados por
   * T-SQL cru — `col`/`path` vêm de uma allow-list fixa (JSON_FILTER), nunca do
   * usuário; o termo vai parametrizado (@P2). Retorna {id:{in|notIn}} ou null
   * (filtro não-JSON ou valor vazio) para o chamador ignorar. Espelha o padrão
   * de modules.service.searchRecords.
   */
  private async resolveJsonFilter(organizationId: string, f: FilterItem): Promise<object | null> {
    const val = f.value.trim()
    const spec = JSON_FILTER[f.col]
    if (!val || !spec) return null

    const { param, exact, negate } = jsonLikeParam(f.op, val)
    const cmp = exact ? '= @P2' : 'LIKE @P2'
    const sql =
      `SELECT id FROM partners ` +
      `WHERE organizationId = @P1 AND JSON_VALUE(${spec.col}, '${spec.path}') ${cmp}`
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(sql, organizationId, param)
    const ids = rows.map((r) => r.id)
    return negate ? { id: { notIn: ids } } : { id: { in: ids } }
  }

  /** Campos personalizados do Parceiro (source=CUSTOM da tela do FORNECEDOR): id → tipo/opções. */
  private async loadPartnerCustomFields(organizationId: string): Promise<Map<string, CustomFieldMeta>> {
    const fields = await this.prisma.screenField.findMany({
      where:  { source: 'CUSTOM', screen: { organizationId, subjectType: 'FORNECEDOR' } },
      select: { id: true, type: true, options: true },
    })
    return new Map(fields.map((f) => [f.id, {
      type:    f.type,
      options: (f.options as unknown as { value: string; label: string }[] | null) ?? [],
    }]))
  }

  /** Filtro por campo custom → {id:{in|notIn}} (mesmo shape do filtro JSON), via screen_field_values. */
  private async resolveCustomFilter(organizationId: string, f: FilterItem, meta: CustomFieldMeta): Promise<object | null> {
    const val = f.value.trim()
    if (!val) return null
    const rows = await this.prisma.screenFieldValue.findMany({
      where:  { organizationId, subjectType: 'PARTNER', fieldId: f.col, ...customValueWhere(f.op, val, meta) },
      select: { subjectId: true },
    })
    const ids = [...new Set(rows.map((r) => r.subjectId))]
    return isNegateOp(f.op) ? { id: { notIn: ids } } : { id: { in: ids } }
  }

  /** Ids de parceiros cujos valores custom casam a busca global (por rótulo, resolvendo listas). */
  private async resolveCustomSearchIds(organizationId: string, q: string, fields: Map<string, CustomFieldMeta>): Promise<string[]> {
    const rows = await this.prisma.screenFieldValue.findMany({
      where:  { organizationId, subjectType: 'PARTNER', OR: customSearchOr(q, fields) },
      select: { subjectId: true },
    })
    return [...new Set(rows.map((r) => r.subjectId))]
  }

  /** Totais por situação (org-wide, independem de filtro/sort). */
  private async computeStats(organizationId: string) {
    const [ativo, inativo, emCad] = await this.prisma.$transaction([
      this.prisma.partner.count({ where: { organizationId, status: 'ATIVO' } }),
      this.prisma.partner.count({ where: { organizationId, status: 'INATIVO' } }),
      this.prisma.partner.count({ where: { organizationId, status: 'EM_CADASTRAMENTO' } }),
    ])
    return { total: ativo + inativo + emCad, ativo, inativo, emCadastramento: emCad }
  }

  /** Resolve Natureza Jurídica/CNAE da página → descrição e mapeia para Row. */
  private async hydrateRows(data: PartnerSelectRow[]) {
    const natCodes  = [...new Set(data.map((d) => d.naturezaJuridica).filter((c): c is string => !!c))]
    const cnaeCodes = [...new Set(data.map((d) => d.cnaePrincipal).filter((c): c is string => !!c))]
    const [nats, cnaes] = await Promise.all([
      natCodes.length  ? this.prisma.naturezaJuridica.findMany({ where: { code: { in: natCodes } } })  : Promise.resolve([]),
      cnaeCodes.length ? this.prisma.cnae.findMany({ where: { code: { in: cnaeCodes } } }) : Promise.resolve([]),
    ])
    const natMap  = new Map(nats.map((n) => [n.code, n.descricao]))
    const cnaeMap = new Map(cnaes.map((c) => [c.code, c.descricao]))
    const res: RowResolvers = {
      nat:  (c) => { const d = natMap.get(c);  return d ? `${c} — ${d}` : c },
      cnae: (c) => { const d = cnaeMap.get(c); return d ? `${c} — ${d}` : c },
    }
    return data.map((p) => toRow(p, res))
  }

  async query(dto: QueryPartnersDto, organizationId: string) {
    const page     = Math.max(1, dto.page ?? 1)
    const pageSize = Math.min(Math.max(1, dto.pageSize ?? 50), 10000)

    /* carrega os campos custom só quando o request os referencia (filtro/sort/busca) */
    const referencesCustom =
      !!dto.search?.trim() ||
      (!!dto.sort && !SORT_FIELD[dto.sort.col]) ||
      (dto.filters ?? []).some((f) => f.value?.trim() && !NATIVE_COLS.has(f.col))
    const customFields = referencesCustom
      ? await this.loadPartnerCustomFields(organizationId)
      : new Map<string, CustomFieldMeta>()

    const [jsonConditions, customFilterConds] = await Promise.all([
      Promise.all((dto.filters ?? []).map((f) => this.resolveJsonFilter(organizationId, f)))
        .then((cs) => cs.filter((c): c is object => c !== null)),
      Promise.all((dto.filters ?? [])
        .filter((f) => customFields.has(f.col) && f.value?.trim())
        .map((f) => this.resolveCustomFilter(organizationId, f, customFields.get(f.col)!)))
        .then((cs) => cs.filter((c): c is object => c !== null)),
    ])
    const searchCustomIds = dto.search?.trim()
      ? await this.resolveCustomSearchIds(organizationId, dto.search.trim(), customFields)
      : []

    const where = buildWhere(
      organizationId, dto.search, dto.filters, dto.logic,
      [...jsonConditions, ...customFilterConds], searchCustomIds,
    )
    const stats = await this.computeStats(organizationId)

    /* ordenação por campo custom: não há coluna no Partner → carrega ids filtrados,
       ordena pelos valores (rótulo resolvido) e pagina em memória */
    const sortCol = dto.sort?.col
    if (dto.sort && sortCol && !SORT_FIELD[sortCol] && customFields.has(sortCol)) {
      return this.queryByCustomSort(organizationId, where, page, pageSize, dto.sort.dir, sortCol, customFields.get(sortCol)!, stats)
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where, orderBy: buildOrder(dto.sort),
        skip: (page - 1) * pageSize, take: pageSize, select: PARTNER_SELECT,
      }),
      this.prisma.partner.count({ where }),
    ])
    return { rows: await this.hydrateRows(data as PartnerSelectRow[]), total, stats }
  }

  private async queryByCustomSort(
    organizationId: string, where: object, page: number, pageSize: number,
    dir: 'asc' | 'desc', fieldId: string, meta: CustomFieldMeta,
    stats: { total: number; ativo: number; inativo: number; emCadastramento: number },
  ) {
    const idRows = await this.prisma.partner.findMany({ where, select: { id: true } })
    const allIds = idRows.map((r) => r.id)

    const valMap = new Map<string, string>()
    for (let i = 0; i < allIds.length; i += IN_CHUNK) {
      const chunk = allIds.slice(i, i + IN_CHUNK)
      const vals = await this.prisma.screenFieldValue.findMany({
        where:  { organizationId, subjectType: 'PARTNER', fieldId, subjectId: { in: chunk } },
        select: { subjectId: true, value: true },
      })
      for (const v of vals) valMap.set(v.subjectId, displayCustomValue(v.value, meta))
    }

    const mult = dir === 'asc' ? 1 : -1
    const sorted = [...allIds].sort((a, b) => {
      const va = valMap.get(a) ?? ''
      const vb = valMap.get(b) ?? ''
      if (va === vb) return 0
      if (!va) return 1  // vazios sempre por último, independentemente da direção
      if (!vb) return -1
      return mult * va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })

    const pageIds = sorted.slice((page - 1) * pageSize, page * pageSize)
    const rows = pageIds.length
      ? await this.prisma.partner.findMany({ where: { id: { in: pageIds } }, select: PARTNER_SELECT })
      : []
    const byId = new Map((rows as PartnerSelectRow[]).map((r) => [r.id, r]))
    const ordered = pageIds.map((id) => byId.get(id)).filter((r): r is PartnerSelectRow => !!r)
    return { rows: await this.hydrateRows(ordered), total: allIds.length, stats }
  }
}
