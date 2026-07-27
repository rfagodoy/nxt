import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import {
  avaliarContrato,
  avaliarParceiro,
  colunasDe,
  linhaVazia,
  marcarDuplicadasNoArquivo,
  type ContratoImportado,
  type LinhaAvaliada,
  type ParceiroImportado,
  type ProblemaLinha,
  type TipoImport,
} from './import-core'

/* Import de planilha: confronta o arquivo com o banco e grava.
 *
 * O fluxo é sempre em DUAS etapas — conferir e depois confirmar. Import de carga
 * inicial mexe na base inteira de um cliente novo: deixar isso acontecer num clique,
 * sem que ninguém veja o que vai entrar, é como aplicar uma migração sem olhar o SQL.
 *
 * A conferência é feita com os MESMOS dados que a confirmação vai gravar, para que o
 * que se vê na tela seja o que acontece — e não uma simulação parecida.
 */

export type ModoImport = 'CRIAR' | 'CRIAR_E_ATUALIZAR'

export interface LinhaResultado {
  linha: number
  acao: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR' | 'ERRO'
  identificacao: string
  detalhe?: string
  problemas: ProblemaLinha[]
}

export interface ResultadoImport {
  tipo: TipoImport
  modo: ModoImport
  total: number
  criar: number
  atualizar: number
  ignorar: number
  erro: number
  linhas: LinhaResultado[]
  /** Só na confirmação. */
  aplicado?: { criados: number; atualizados: number; falhas: number }
}

/** Teto de linhas por arquivo. Não é limitação técnica: é para o usuário descobrir um
 *  problema de mapeamento em 500 linhas e não em 50 mil, e para uma conferência não
 *  segurar a API por minutos. Acima disso, orientamos dividir a planilha. */
export const MAX_LINHAS = 5000

@Injectable()
export class ImportService {
  private readonly logger = new Logger('Import')

  constructor(private readonly prisma: PrismaService) {}

  colunas(tipo: TipoImport) {
    return colunasDe(tipo)
  }

  async avaliar(
    tipo: TipoImport,
    linhas: Record<string, unknown>[],
    organizationId: string,
    modo: ModoImport,
  ): Promise<ResultadoImport> {
    const uteis = linhas
      .map((bruta, i) => ({ bruta, linha: i + 2 })) // +2: linha 1 é o cabeçalho
      .filter(({ bruta }) => !linhaVazia(bruta))

    const avaliadas = uteis.map(({ bruta, linha }) =>
      tipo === 'parceiros' ? avaliarParceiro(bruta, linha) : avaliarContrato(bruta, linha),
    )
    const semDuplicadas = marcarDuplicadasNoArquivo(avaliadas as LinhaAvaliada<unknown>[])

    return tipo === 'parceiros'
      ? this.confrontarParceiros(semDuplicadas as LinhaAvaliada<ParceiroImportado>[], organizationId, modo)
      : this.confrontarContratos(semDuplicadas as LinhaAvaliada<ContratoImportado>[], organizationId, modo)
  }

  /* ── parceiros ─────────────────────────────────────────────────────────────── */

  private async confrontarParceiros(
    linhas: LinhaAvaliada<ParceiroImportado>[],
    organizationId: string,
    modo: ModoImport,
  ): Promise<ResultadoImport> {
    const documentos = linhas.map((l) => l.dados?.documento).filter((d): d is string => !!d)
    const existentes = documentos.length
      ? await this.prisma.partner.findMany({
          where: { organizationId, documento: { in: documentos } },
          select: { id: true, documento: true, razaoSocial: true },
        })
      : []
    const porDocumento = new Map(existentes.map((p) => [p.documento ?? '', p]))

    const resultado: LinhaResultado[] = linhas.map((l) => {
      const identificacao = l.dados ? `${l.dados.razaoSocial}${l.dados.documento ? ` (${l.dados.documento})` : ''}` : `linha ${l.linha}`
      if (!l.dados) return { linha: l.linha, acao: 'ERRO', identificacao, problemas: l.problemas }

      const jaExiste = l.dados.documento ? porDocumento.get(l.dados.documento) : undefined
      if (!jaExiste) return { linha: l.linha, acao: 'CRIAR', identificacao, problemas: [] }
      return modo === 'CRIAR_E_ATUALIZAR'
        ? { linha: l.linha, acao: 'ATUALIZAR', identificacao, detalhe: `já cadastrado como "${jaExiste.razaoSocial}"`, problemas: [] }
        : { linha: l.linha, acao: 'IGNORAR', identificacao, detalhe: `já cadastrado como "${jaExiste.razaoSocial}"`, problemas: [] }
    })

    return this.resumir('parceiros', modo, resultado)
  }

  /* ── contratos ─────────────────────────────────────────────────────────────── */

  private async confrontarContratos(
    linhas: LinhaAvaliada<ContratoImportado>[],
    organizationId: string,
    modo: ModoImport,
  ): Promise<ResultadoImport> {
    const numeros = linhas.map((l) => l.dados?.numero).filter((n): n is string => !!n)
    const docsParceiro = linhas.map((l) => l.dados?.documentoParceiro).filter((d): d is string => !!d)

    const [existentes, parceiros] = await Promise.all([
      numeros.length
        ? this.prisma.contract.findMany({ where: { organizationId, numero: { in: numeros } }, select: { id: true, numero: true, titulo: true } })
        : Promise.resolve([]),
      docsParceiro.length
        ? this.prisma.partner.findMany({ where: { organizationId, documento: { in: docsParceiro } }, select: { id: true, documento: true, razaoSocial: true } })
        : Promise.resolve([]),
    ])
    const porNumero = new Map(existentes.map((c) => [c.numero, c]))
    const porDocumento = new Map(parceiros.map((p) => [p.documento ?? '', p]))

    const resultado: LinhaResultado[] = linhas.map((l) => {
      const identificacao = l.dados ? `${l.dados.numero} — ${l.dados.titulo}` : `linha ${l.linha}`
      if (!l.dados) return { linha: l.linha, acao: 'ERRO', identificacao, problemas: l.problemas }

      /* O vínculo é o que separa import útil de import inútil: contrato sem parceiro
         entra órfão e alguém vai ter que ligar os dois à mão depois, um por um. */
      const parceiro = porDocumento.get(l.dados.documentoParceiro)
      if (!parceiro) {
        return {
          linha: l.linha,
          acao: 'ERRO',
          identificacao,
          problemas: [{
            linha: l.linha,
            coluna: 'CNPJ/CPF do parceiro',
            mensagem: `Não existe parceiro cadastrado com o documento ${l.dados.documentoParceiro}. Importe os parceiros primeiro.`,
          }],
        }
      }

      const jaExiste = porNumero.get(l.dados.numero)
      if (!jaExiste) return { linha: l.linha, acao: 'CRIAR', identificacao, detalhe: `parceiro: ${parceiro.razaoSocial}`, problemas: [] }
      return modo === 'CRIAR_E_ATUALIZAR'
        ? { linha: l.linha, acao: 'ATUALIZAR', identificacao, detalhe: `número já usado por "${jaExiste.titulo}"`, problemas: [] }
        : { linha: l.linha, acao: 'IGNORAR', identificacao, detalhe: `número já usado por "${jaExiste.titulo}"`, problemas: [] }
    })

    return this.resumir('contratos', modo, resultado)
  }

  private resumir(tipo: TipoImport, modo: ModoImport, linhas: LinhaResultado[]): ResultadoImport {
    const conta = (a: LinhaResultado['acao']) => linhas.filter((l) => l.acao === a).length
    return {
      tipo, modo,
      total: linhas.length,
      criar: conta('CRIAR'),
      atualizar: conta('ATUALIZAR'),
      ignorar: conta('IGNORAR'),
      erro: conta('ERRO'),
      linhas,
    }
  }

  /* ── gravação ──────────────────────────────────────────────────────────────── */

  /** Aplica o que a conferência aprovou.
   *
   *  Linha com erro é PULADA, não aborta o lote: numa carga de mil contratos, três
   *  linhas com data errada não podem impedir as outras 997 de entrar — o usuário
   *  corrige as três e reimporta, e a chave natural evita duplicar o que já entrou. */
  async aplicar(
    tipo: TipoImport,
    linhas: Record<string, unknown>[],
    organizationId: string,
    modo: ModoImport,
    autor: { nome: string; id?: string },
  ): Promise<ResultadoImport> {
    const previa = await this.avaliar(tipo, linhas, organizationId, modo)

    const uteis = linhas
      .map((bruta, i) => ({ bruta, linha: i + 2 }))
      .filter(({ bruta }) => !linhaVazia(bruta))
    const dadosPorLinha = new Map(
      uteis.map(({ bruta, linha }) => {
        const a = tipo === 'parceiros' ? avaliarParceiro(bruta, linha) : avaliarContrato(bruta, linha)
        return [linha, a.dados]
      }),
    )

    let criados = 0, atualizados = 0, falhas = 0

    for (const r of previa.linhas) {
      if (r.acao === 'ERRO' || r.acao === 'IGNORAR') continue
      const dados = dadosPorLinha.get(r.linha)
      if (!dados) continue
      try {
        if (tipo === 'parceiros') {
          const feito = await this.gravarParceiro(dados as ParceiroImportado, organizationId, autor, r.acao)
          if (feito === 'CRIADO') criados++
          else atualizados++
        } else {
          const feito = await this.gravarContrato(dados as ContratoImportado, organizationId, autor, r.acao)
          if (feito === 'CRIADO') criados++
          else atualizados++
        }
      } catch (e) {
        falhas++
        r.acao = 'ERRO'
        r.problemas = [{ linha: r.linha, mensagem: `Falhou ao gravar: ${e instanceof Error ? e.message : String(e)}` }]
        this.logger.error(`import ${tipo} linha ${r.linha}: ${String(e)}`)
      }
    }

    this.logger.log(`import ${tipo}: ${criados} criado(s), ${atualizados} atualizado(s), ${falhas} falha(s), por ${autor.nome}`)
    return { ...previa, ...this.resumir(tipo, modo, previa.linhas), aplicado: { criados, atualizados, falhas } }
  }

  private async gravarParceiro(
    p: ParceiroImportado,
    organizationId: string,
    autor: { nome: string; id?: string },
    acao: LinhaResultado['acao'],
  ): Promise<'CRIADO' | 'ATUALIZADO'> {
    /* E-mail e telefone da planilha viram o primeiro CONTATO: são colunas JSON no
       modelo, e deixá-los de fora faria o cliente importar uma base de parceiros com
       quem ninguém consegue falar. */
    const contatos = p.email || p.telefone
      ? JSON.stringify([{ id: `imp_${Date.now()}`, nome: p.razaoSocial, email: p.email ?? '', telefone: p.telefone ?? '', cargo: '', principal: true }])
      : undefined

    const dados = {
      categoria: p.categoria,
      razaoSocial: p.razaoSocial,
      documento: p.documento || null,
      nomeFantasia: p.nomeFantasia ?? null,
      ie: p.ie ?? null,
      im: p.im ?? null,
      dataAbertura: p.dataAbertura ?? null,
      dataNascimento: p.dataNascimento ?? null,
      status: p.status,
      ...(contatos ? { contatos } : {}),
    }

    if (acao === 'ATUALIZAR' && p.documento) {
      const alvo = await this.prisma.partner.findFirst({ where: { organizationId, documento: p.documento }, select: { id: true } })
      if (alvo) {
        await this.prisma.partner.update({ where: { id: alvo.id }, data: dados as never })
        await this.auditarParceiro(alvo.id, autor, 'ALTERADO', 'Atualizado por importação de planilha')
        return 'ATUALIZADO'
      }
    }

    const criado = await this.prisma.partner.create({ data: { ...dados, organizationId } as never })
    await this.auditarParceiro(criado.id, autor, 'EM_CADASTRAMENTO', 'Criado por importação de planilha')
    return 'CRIADO'
  }

  private async gravarContrato(
    c: ContratoImportado,
    organizationId: string,
    autor: { nome: string; id?: string },
    acao: LinhaResultado['acao'],
  ): Promise<'CRIADO' | 'ATUALIZADO'> {
    const parceiro = await this.prisma.partner.findFirst({
      where: { organizationId, documento: c.documentoParceiro },
      select: { id: true, razaoSocial: true, documento: true },
    })
    if (!parceiro) throw new Error(`parceiro ${c.documentoParceiro} não encontrado`)

    const partes = JSON.stringify([{
      id: `imp_${Date.now()}`,
      papel: 'CONTRATADO',
      ref_tipo: 'PARCEIRO',
      ref_id: parceiro.id,
      nome: parceiro.razaoSocial,
      documento: parceiro.documento ?? '',
    }])

    const dados = {
      numero: c.numero,
      titulo: c.titulo,
      tipo: c.tipo ?? '',
      natureza: c.natureza ?? null,
      situacao: c.situacao,
      inicioVigencia: c.inicioVigencia ?? null,
      terminoVigencia: c.terminoVigencia ?? null,
      /* Sem término e sem indeterminado explícito, o contrato ficaria sem prazo nenhum
         e sumiria dos avisos. Planilha sem data de término quase sempre É contrato de
         prazo indeterminado — assumimos isso e mostramos na conferência. */
      prazoIndeterminado: !c.terminoVigencia,
      valorTotal: c.valorTotal,
      moeda: c.moeda,
      dataAssinatura: c.dataAssinatura ?? null,
      objeto: c.objeto ? JSON.stringify([c.objeto]) : '[]',
      observacoes: c.observacoes ?? null,
      partes,
    }

    if (acao === 'ATUALIZAR') {
      const alvo = await this.prisma.contract.findFirst({ where: { organizationId, numero: c.numero }, select: { id: true } })
      if (alvo) {
        await this.prisma.contract.update({ where: { id: alvo.id }, data: dados as never })
        await this.auditarContrato(alvo.id, autor, 'ALTERADO', 'Atualizado por importação de planilha')
        return 'ATUALIZADO'
      }
    }

    const criado = await this.prisma.contract.create({ data: { ...dados, organizationId } as never })
    await this.auditarContrato(criado.id, autor, 'CRIADO', 'Criado por importação de planilha')
    return 'CRIADO'
  }

  /* A auditoria registra a ORIGEM: seis meses depois, "de onde veio este cadastro?"
     é a primeira pergunta quando um dado parece estranho. */
  private auditarParceiro(partnerId: string, autor: { nome: string; id?: string }, event: string, motivo: string) {
    return this.prisma.partnerAuditLog.create({
      data: { partnerId, user: autor.nome, userId: autor.id ?? null, event, motivo, changes: [] as never },
    })
  }

  private auditarContrato(contractId: string, autor: { nome: string; id?: string }, event: string, motivo: string) {
    return this.prisma.contractAuditLog.create({
      data: { contractId, user: autor.nome, userId: autor.id ?? null, event, motivo, changes: [] as never },
    })
  }
}
