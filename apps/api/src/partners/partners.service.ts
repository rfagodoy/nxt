import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { CreatePartnerDto } from './dto/create-partner.dto'
import { UpdatePartnerDto } from './dto/update-partner.dto'
import { QueryPartnersDto } from './dto/query-partners.dto'

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

type PartnerLike = Record<string, unknown>

function diffPartner(oldP: PartnerLike, newP: PartnerLike): AuditChange[] {
  const changes: AuditChange[] = []

  /* situação (tratada como campo) */
  if (val(oldP.status) !== val(newP.status)) {
    changes.push({
      field: 'status', label: 'Situação',
      before: STATUS_LABEL[val(oldP.status)] ?? val(oldP.status) ?? '—',
      after:  STATUS_LABEL[val(newP.status)] ?? val(newP.status) ?? '—',
    })
  }

  /* escalares */
  for (const f of SCALAR_FIELDS) {
    const b = val(oldP[f.key]); const a = val(newP[f.key])
    if (b !== a) changes.push({
      field: f.key, label: f.label,
      before: b ? (f.fmt ? f.fmt(b) : b) : '—',
      after:  a ? (f.fmt ? f.fmt(a) : a) : '—',
    })
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
  if (newS === 'EM_CADASTRAMENTO') return 'EM_CADASTRAMENTO'
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
  paisOrigem: string | null
  contatos: unknown; enderecos: unknown; bancos: unknown; socios: unknown
}

function toRow(p: PartnerSelectRow) {
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

function applyStringFilter(col: string, op: string, val: string): object {
  const mode = 'insensitive' as const
  switch (op) {
    case 'eq':            return { [col]: { equals: val, mode } }
    case 'neq':           return { NOT: { [col]: { equals: val, mode } } }
    case 'startsWith':    return { [col]: { startsWith: val, mode } }
    case 'notStartsWith': return { NOT: { [col]: { startsWith: val, mode } } }
    case 'endsWith':      return { [col]: { endsWith: val, mode } }
    case 'notEndsWith':   return { NOT: { [col]: { endsWith: val, mode } } }
    case 'notContains':   return { NOT: { [col]: { contains: val, mode } } }
    default:              return { [col]: { contains: val, mode } }
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
    case 'cidade':        return { enderecos: { path: ['0', 'cidade'], string_contains: val } }
    case 'estado':        return { enderecos: { path: ['0', 'estado'], string_contains: val } }
    case 'contato':       return { contatos:  { path: ['0', 'nome'],   string_contains: val } }
    default:              return null
  }
}

function buildWhere(
  organizationId: string,
  search?: string,
  filters?: FilterItem[],
  logic?: 'AND' | 'OR',
) {
  const conditions: object[] = []

  if (search?.trim()) {
    const q = search.trim()
    conditions.push({
      OR: [
        { razaoSocial: { contains: q } },
        { nomeFantasia: { contains: q } },
        { documento:    { contains: q } },
      ],
    })
  }

  const filterConditions = (filters ?? [])
    .map(translateFilter)
    .filter((c): c is object => c !== null)

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

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePartnerDto, organizationId: string) {
    const { user, ...data } = dto
    const created = await this.prisma.partner.create({
      data: { ...data, organizationId } as never,
    })
    await this.prisma.partnerAuditLog.create({
      data: {
        partnerId: created.id,
        user:      user ?? 'Usuário do sistema',
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

  async update(id: string, dto: UpdatePartnerDto, organizationId: string) {
    const old = await this.findOne(id, organizationId)
    const { user, motivo, ...data } = dto
    const updated = await this.prisma.partner.update({ where: { id }, data: data as never })

    const changes = diffPartner(old as PartnerLike, updated as PartnerLike)
    if (changes.length) {
      await this.prisma.partnerAuditLog.create({
        data: {
          partnerId: id,
          user:      user ?? 'Usuário do sistema',
          event:     statusEvent(val(old.status), val(updated.status)),
          motivo:    motivo?.trim() ? motivo.trim() : null,
          changes:   changes as never,
        },
      })
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

  async query(dto: QueryPartnersDto, organizationId: string) {
    const page     = Math.max(1, dto.page ?? 1)
    const pageSize = Math.min(Math.max(1, dto.pageSize ?? 50), 10000)
    const where    = buildWhere(organizationId, dto.search, dto.filters, dto.logic)
    const orderBy  = buildOrder(dto.sort)

    const orgWhere = { organizationId }
    const [data, total, nAtivo, nInativo, nEmCad] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, razaoSocial: true, categoria: true, status: true,
          documento: true, nomeFantasia: true, ie: true, im: true,
          rg: true, orgaoExpedidor: true, dataNascimento: true, paisOrigem: true,
          contatos: true, enderecos: true, bancos: true, socios: true,
        },
      }),
      this.prisma.partner.count({ where }),
      this.prisma.partner.count({ where: { ...orgWhere, status: 'ATIVO' } }),
      this.prisma.partner.count({ where: { ...orgWhere, status: 'INATIVO' } }),
      this.prisma.partner.count({ where: { ...orgWhere, status: 'EM_CADASTRAMENTO' } }),
    ])

    const stats = {
      total:           nAtivo + nInativo + nEmCad,
      ativo:           nAtivo,
      inativo:         nInativo,
      emCadastramento: nEmCad,
    }

    return { rows: data.map(toRow), total, stats }
  }
}
