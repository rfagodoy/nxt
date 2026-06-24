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

  async create(dto: CreateContractDto) {
    const { user, ...data } = dto
    void user
    return this.prisma.contract.create({ data: data as never })
  }

  async findAll(organizationId: string) {
    const data = await this.prisma.contract.findMany({
      where:   { organizationId },
      orderBy: { createdAt: 'desc' },
    })
    return { rows: data.map(c => toRow(c as ContractRecord)) }
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } })
    if (!contract) throw new NotFoundException('Contrato não encontrado')
    return contract
  }

  async update(id: string, dto: UpdateContractDto) {
    await this.findOne(id)
    const { user, motivo, ...data } = dto
    void user; void motivo
    return this.prisma.contract.update({ where: { id }, data: data as never })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.contract.delete({ where: { id } })
  }
}
