import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateContractDto } from './dto/create-contract.dto'
import { UpdateContractDto } from './dto/update-contract.dto'

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
    void user
    return this.prisma.contract.create({ data: { ...data, organizationId } as never })
  }

  /* Carrega uma tabela auxiliar (AppSetting de organização) como mapa id → rótulo atual. */
  private async loadLookupMap(organizationId: string, key: string): Promise<Map<string, string>> {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId: '', key } },
    })
    const entries = (row?.value as unknown as Array<{ id: string; label: string }> | null) ?? []
    return new Map(entries.map(e => [e.id, e.label]))
  }

  async findAll(organizationId: string) {
    const data = await this.prisma.contract.findMany({
      where:   { organizationId },
      orderBy: { createdAt: 'desc' },
    })
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
    await this.findOne(id, organizationId)
    const { user, motivo, ...data } = dto
    void user; void motivo
    return this.prisma.contract.update({ where: { id }, data: data as never })
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.contract.delete({ where: { id } })
  }
}
