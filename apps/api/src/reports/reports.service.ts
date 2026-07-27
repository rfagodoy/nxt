import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import {
  derivarLinha,
  filtrar,
  ordenar,
  totalizar,
  type CampoOrdenacao,
  type FiltroRelatorio,
  type LinhaRelatorio,
} from './report-core'

/* Relatório de contratos.
 *
 * DECISÃO ESTRUTURAL: os contratos são lidos e derivados em memória, e só então
 * filtrados. Não é preguiça — é a única forma correta aqui.
 *
 * "Vencido" não existe no banco: é VIGENTE com término já passado, considerando
 * aditivos, renovações e reajustes, que moram em colunas JSON. Filtrar no SQL exigiria
 * reimplementar em T-SQL as regras que já existem, testadas, em @nxt/contracts-core — e
 * duas implementações da mesma regra divergem, sempre. Já divergiram neste projeto
 * antes, e foi por isso que o core nasceu.
 *
 * O custo é conhecido: a carga cresce com o número de contratos da organização. Está
 * medido (ver o smoke de escala) e há um teto explícito. Quando o volume justificar,
 * o caminho é materializar a situação efetiva numa coluna computada — não espalhar a
 * regra por dois lugares.
 */

/** Teto de segurança. Acima disso o relatório recusa em vez de derrubar a API — e diz
 *  para filtrar, que é o que a pessoa faria de qualquer forma com tanta linha. */
export const MAX_CONTRATOS_RELATORIO = 20_000

export interface ParametrosRelatorio extends FiltroRelatorio {
  ordenarPor?: CampoOrdenacao
  desc?: boolean
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger('Reports')

  constructor(private readonly prisma: PrismaService) {}

  async contratos(organizationId: string, p: ParametrosRelatorio) {
    const t0 = Date.now()

    const total = await this.prisma.contract.count({ where: { organizationId } })
    if (total > MAX_CONTRATOS_RELATORIO) {
      return {
        excedeu: true as const,
        total,
        limite: MAX_CONTRATOS_RELATORIO,
        mensagem: `Esta organização tem ${total} contratos e o relatório processa até ${MAX_CONTRATOS_RELATORIO} por vez.`,
      }
    }

    const brutos = await this.prisma.contract.findMany({
      where: { organizationId },
      select: {
        id: true, numero: true, titulo: true, tipo: true, natureza: true, situacao: true,
        inicioVigencia: true, terminoVigencia: true, prazoIndeterminado: true,
        moeda: true, valorTotal: true, valorParcela: true, qtdParcelas: true,
        aditivos: true, renovacoes: true, reajustes: true, reajustesRealizados: true,
        pagamentos: true, recebimentos: true, partes: true,
      },
    })

    const hoje = new Date().toISOString().slice(0, 10)
    const linhas: LinhaRelatorio[] = brutos.map((c) => derivarLinha(c as never, hoje))

    /* Mapa contrato → ids de parceiro, para o filtro por parceiro. Sai das `partes`
       (JSON), então é montado aqui e não no core, que não conhece o formato do banco. */
    const parceiroPorContrato = new Map<string, string[]>()
    for (const c of brutos) {
      const partes = Array.isArray(c.partes) ? c.partes : []
      parceiroPorContrato.set(
        c.id,
        partes
          .map((x) => (x && typeof x === 'object' ? String((x as { ref_id?: string }).ref_id ?? '') : ''))
          .filter(Boolean),
      )
    }

    const filtradas = filtrar(linhas, p, parceiroPorContrato)
    const ordenadas = ordenar(filtradas, p.ordenarPor ?? 'numero', !!p.desc)

    const ms = Date.now() - t0
    if (ms > 2000) this.logger.warn(`relatório de contratos levou ${ms}ms sobre ${total} contratos`)

    return {
      excedeu: false as const,
      geradoEm: new Date().toISOString(),
      totalNaBase: total,
      linhas: ordenadas,
      totais: totalizar(ordenadas),
      duracaoMs: ms,
    }
  }

  /** Valores existentes hoje, para montar os filtros da tela sem chutar opção. */
  async opcoes(organizationId: string) {
    const [contratos, parceiros] = await Promise.all([
      this.prisma.contract.findMany({ where: { organizationId }, select: { tipo: true, natureza: true } }),
      this.prisma.partner.findMany({ where: { organizationId }, select: { id: true, razaoSocial: true }, orderBy: { razaoSocial: 'asc' } }),
    ])
    const tipos = [...new Set(contratos.map((c) => c.tipo).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const naturezas = [...new Set(contratos.map((c) => c.natureza).filter((n): n is string => !!n))].sort()
    return { tipos, naturezas, parceiros }
  }
}
