/* Núcleo do import de planilha: colunas, normalização e validação. Puro — sem banco,
 * sem HTTP, sem relógio implícito.
 *
 * O import é onde um sistema herda o passado do cliente, e planilha de verdade não
 * parece com planilha de exemplo: data em três formatos, valor com "R$" e vírgula,
 * CNPJ com máscara em metade das linhas, coluna com espaço no fim do título, acento
 * faltando, linha em branco no meio. Tudo isso é NORMAL e precisa ser aceito — o que
 * não pode é o sistema gravar lixo em silêncio.
 *
 * Regra que orienta o arquivo inteiro: normalizar o que é ambíguo mas óbvio (formato),
 * e RECUSAR o que é ambíguo de verdade (um valor que tanto pode ser 1.234 quanto 1,234).
 */

export type TipoImport = 'parceiros' | 'contratos'

export interface ColunaImport {
  chave: string
  titulo: string
  obrigatoria?: boolean
  /** Texto de ajuda no modelo baixável. */
  ajuda?: string
  exemplo?: string
}

export interface ProblemaLinha {
  linha: number
  coluna?: string
  mensagem: string
}

export interface LinhaAvaliada<T> {
  linha: number
  dados: T | null
  problemas: ProblemaLinha[]
  /** Chave natural — é o que decide se a linha CRIA ou ATUALIZA. */
  chave: string | null
}

/* ─── colunas ───────────────────────────────────────────────────────────────── */

export const COLUNAS_PARCEIRO: ColunaImport[] = [
  { chave: 'categoria', titulo: 'Tipo', obrigatoria: true, ajuda: 'PJ_BR, PF_BR, PJ_EST ou PF_EST', exemplo: 'PJ_BR' },
  { chave: 'razaoSocial', titulo: 'Razão social', obrigatoria: true, exemplo: 'Acme Serviços LTDA' },
  { chave: 'documento', titulo: 'CNPJ/CPF', ajuda: 'Com ou sem máscara. Obrigatório para PJ_BR e PF_BR.', exemplo: '12.345.678/0001-95' },
  { chave: 'nomeFantasia', titulo: 'Nome fantasia', exemplo: 'Acme' },
  { chave: 'ie', titulo: 'Inscrição estadual' },
  { chave: 'im', titulo: 'Inscrição municipal' },
  { chave: 'dataAbertura', titulo: 'Data de abertura', ajuda: 'dd/mm/aaaa', exemplo: '01/03/2015' },
  { chave: 'dataNascimento', titulo: 'Data de nascimento', ajuda: 'dd/mm/aaaa (pessoa física)' },
  { chave: 'status', titulo: 'Situação', ajuda: 'ATIVO, INATIVO ou EM_CADASTRAMENTO (vazio = EM_CADASTRAMENTO)', exemplo: 'ATIVO' },
  { chave: 'email', titulo: 'E-mail', ajuda: 'Vira o primeiro contato do parceiro' },
  { chave: 'telefone', titulo: 'Telefone' },
]

export const COLUNAS_CONTRATO: ColunaImport[] = [
  { chave: 'numero', titulo: 'Número', obrigatoria: true, ajuda: 'O número que o contrato já tem hoje', exemplo: 'CCT-2024-014' },
  { chave: 'titulo', titulo: 'Título', obrigatoria: true, exemplo: 'Manutenção predial' },
  { chave: 'documentoParceiro', titulo: 'CNPJ/CPF do parceiro', obrigatoria: true, ajuda: 'O parceiro precisa existir (importe parceiros antes)', exemplo: '12.345.678/0001-95' },
  { chave: 'tipo', titulo: 'Tipo', ajuda: 'Texto livre — o rótulo usado hoje', exemplo: 'Prestação de serviços' },
  { chave: 'natureza', titulo: 'Natureza', ajuda: 'DESPESA, RECEITA ou AMBOS', exemplo: 'DESPESA' },
  { chave: 'situacao', titulo: 'Situação', ajuda: 'EM_CADASTRO, VIGENTE, ENCERRADO, RESCINDIDO ou CANCELADO', exemplo: 'VIGENTE' },
  { chave: 'inicioVigencia', titulo: 'Início da vigência', ajuda: 'dd/mm/aaaa', exemplo: '01/01/2024' },
  { chave: 'terminoVigencia', titulo: 'Término da vigência', ajuda: 'dd/mm/aaaa. Vazio = prazo indeterminado.', exemplo: '31/12/2026' },
  { chave: 'valorTotal', titulo: 'Valor total', ajuda: 'Ex.: 120.000,00', exemplo: '120000,00' },
  { chave: 'moeda', titulo: 'Moeda', ajuda: 'Vazio = BRL', exemplo: 'BRL' },
  { chave: 'dataAssinatura', titulo: 'Data de assinatura', ajuda: 'dd/mm/aaaa' },
  { chave: 'objeto', titulo: 'Objeto', ajuda: 'Descrição do que é contratado' },
  { chave: 'observacoes', titulo: 'Observações' },
]

export const colunasDe = (tipo: TipoImport): ColunaImport[] =>
  tipo === 'parceiros' ? COLUNAS_PARCEIRO : COLUNAS_CONTRATO

/* ─── normalização de valores ───────────────────────────────────────────────── */

/** Compara títulos de coluna ignorando acento, caixa, espaço e pontuação: quem exporta
 *  do sistema antigo quase nunca acerta o título exato, e recusar por causa de um
 *  acento faria o usuário desistir antes da primeira linha. */
export function chaveDeTitulo(titulo: string): string {
  return String(titulo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function texto(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export function somenteDigitos(v: unknown): string {
  return texto(v).replace(/\D/g, '')
}

/** Data em ISO (aaaa-mm-dd), aceitando dd/mm/aaaa, aaaa-mm-dd e a data serial do Excel.
 *  Devolve `undefined` quando vazio e `null` quando existe mas é inválida — quem chama
 *  precisa distinguir "não informou" de "informou errado". */
export function dataISO(v: unknown): string | null | undefined {
  const s = texto(v)
  if (!s) return undefined

  // Excel guarda data como número de dias desde 1899-12-30.
  if (/^\d{5}$/.test(s)) {
    const ms = (Number(s) - 25569) * 86_400_000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }

  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (br) {
    const [, d, m, a] = br
    return valida(Number(a), Number(m), Number(d)) ? `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const [, a, m, d] = iso
    return valida(Number(a), Number(m), Number(d)) ? `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null
  }
  return null
}

function valida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1 || ano < 1900 || ano > 2200) return false
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return dia <= ultimo
}

/** Número em pt-BR ou en-US. Devolve `null` quando é inválido ou impossível de
 *  interpretar com segurança.
 *
 *  O ponto delicado é "1.234": mil duzentos e trinta e quatro em pt-BR, um vírgula
 *  duzentos e trinta e quatro em en-US — e errar aqui erra por um fator de MIL no valor
 *  de um contrato. A regra adotada, com o viés explícito de um sistema brasileiro:
 *
 *   · grupo de exatamente 3 dígitos após o ponto  → milhar   ("1.234"    → 1234)
 *   · grupo com outro tamanho                     → decimal  ("1.2345"   → 1.2345)
 *   · mistura que não fecha como nenhum dos dois   → RECUSA  ("1.2345.678")
 *
 *  A recusa é o ponto: onde não dá para saber, o import para e mostra a linha em vez de
 *  gravar um valor plausível e errado. */
export function numero(v: unknown): number | null | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = texto(v).replace(/[\s\u00a0]|R\$/gi, '')   // \u00a0 = NBSP, comum em valor copiado do Excel
  if (!s) return undefined
  const negativo = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/^[-(]|\)$/g, '')

  const temVirgula = s.includes(',')
  const temPonto = s.includes('.')

  if (temVirgula && temPonto) {
    // o separador decimal é o ÚLTIMO que aparece
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (temVirgula) {
    s = s.replace(',', '.')
  } else if (temPonto) {
    const partes = s.split('.')
    const decimalPlausivel = partes.length === 2 && partes[1].length !== 3
    if (!decimalPlausivel) {
      // "1.234" ou "1.234.567": só é seguro quando TODOS os grupos têm 3 dígitos
      const milharValido = partes.slice(1).every((p) => p.length === 3)
      if (!milharValido) return null
      s = partes.join('')
    }
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/* ─── validação de documento ────────────────────────────────────────────────── */

export function cnpjValido(doc: string): boolean {
  const d = somenteDigitos(doc)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (base: string, pesoInicial: number) => {
    let peso = pesoInicial
    let soma = 0
    for (const ch of base) {
      soma += Number(ch) * peso
      peso = peso === 2 ? 9 : peso - 1
    }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(d.slice(0, 12), 5) === Number(d[12]) && calc(d.slice(0, 13), 6) === Number(d[13])
}

export function cpfValido(doc: string): boolean {
  const d = somenteDigitos(doc)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/* ─── avaliação de linhas ───────────────────────────────────────────────────── */

export const CATEGORIAS_PARCEIRO = ['PJ_BR', 'PJ_EST', 'PF_BR', 'PF_EST']
export const STATUS_PARCEIRO = ['ATIVO', 'INATIVO', 'EM_CADASTRAMENTO']
export const SITUACOES_CONTRATO_IMPORT = ['EM_CADASTRO', 'VIGENTE', 'ENCERRADO', 'RESCINDIDO', 'CANCELADO']
export const NATUREZAS_CONTRATO = ['DESPESA', 'RECEITA', 'AMBOS']

export interface ParceiroImportado {
  categoria: string
  razaoSocial: string
  documento: string
  nomeFantasia?: string
  ie?: string
  im?: string
  dataAbertura?: string
  dataNascimento?: string
  status: string
  email?: string
  telefone?: string
}

export interface ContratoImportado {
  numero: string
  titulo: string
  documentoParceiro: string
  tipo?: string
  natureza?: string
  situacao: string
  inicioVigencia?: string
  terminoVigencia?: string
  valorTotal: number
  moeda: string
  dataAssinatura?: string
  objeto?: string
  observacoes?: string
}

type Bruta = Record<string, unknown>

export function avaliarParceiro(bruta: Bruta, linha: number): LinhaAvaliada<ParceiroImportado> {
  const p: ProblemaLinha[] = []
  const erro = (coluna: string, mensagem: string) => p.push({ linha, coluna, mensagem })

  const categoria = texto(bruta.categoria).toUpperCase().replace(/[\s-]/g, '_')
  if (!categoria) erro('Tipo', 'Tipo é obrigatório (PJ_BR, PF_BR, PJ_EST ou PF_EST).')
  else if (!CATEGORIAS_PARCEIRO.includes(categoria)) erro('Tipo', `"${texto(bruta.categoria)}" não é um tipo válido. Use PJ_BR, PF_BR, PJ_EST ou PF_EST.`)

  const razaoSocial = texto(bruta.razaoSocial)
  if (!razaoSocial) erro('Razão social', 'Razão social é obrigatória.')

  const documento = somenteDigitos(bruta.documento)
  if (categoria === 'PJ_BR') {
    if (!documento) erro('CNPJ/CPF', 'CNPJ é obrigatório para PJ_BR.')
    else if (!cnpjValido(documento)) erro('CNPJ/CPF', `CNPJ "${texto(bruta.documento)}" é inválido (dígito verificador não confere).`)
  } else if (categoria === 'PF_BR') {
    if (!documento) erro('CNPJ/CPF', 'CPF é obrigatório para PF_BR.')
    else if (!cpfValido(documento)) erro('CNPJ/CPF', `CPF "${texto(bruta.documento)}" é inválido (dígito verificador não confere).`)
  }

  const abertura = dataISO(bruta.dataAbertura)
  if (abertura === null) erro('Data de abertura', `"${texto(bruta.dataAbertura)}" não é uma data válida (use dd/mm/aaaa).`)
  const nascimento = dataISO(bruta.dataNascimento)
  if (nascimento === null) erro('Data de nascimento', `"${texto(bruta.dataNascimento)}" não é uma data válida (use dd/mm/aaaa).`)

  let status = texto(bruta.status).toUpperCase().replace(/[\s-]/g, '_')
  if (!status) status = 'EM_CADASTRAMENTO'
  else if (status === 'ATIVA') status = 'ATIVO'
  else if (status === 'INATIVA') status = 'INATIVO'
  if (!STATUS_PARCEIRO.includes(status)) erro('Situação', `"${texto(bruta.status)}" não é uma situação válida. Use ATIVO, INATIVO ou EM_CADASTRAMENTO.`)

  /* Chave natural: documento quando existe; senão a razão social. Sem chave não há como
     reimportar sem duplicar — e reimportar depois de corrigir a planilha é a regra, não
     a exceção. */
  const chave = documento || (razaoSocial ? `nome:${razaoSocial.toLowerCase()}` : null)

  if (p.length > 0) return { linha, dados: null, problemas: p, chave }
  return {
    linha,
    chave,
    problemas: [],
    dados: {
      categoria, razaoSocial, documento, status,
      nomeFantasia: texto(bruta.nomeFantasia) || undefined,
      ie: texto(bruta.ie) || undefined,
      im: texto(bruta.im) || undefined,
      dataAbertura: abertura ?? undefined,
      dataNascimento: nascimento ?? undefined,
      email: texto(bruta.email) || undefined,
      telefone: texto(bruta.telefone) || undefined,
    },
  }
}

export function avaliarContrato(bruta: Bruta, linha: number): LinhaAvaliada<ContratoImportado> {
  const p: ProblemaLinha[] = []
  const erro = (coluna: string, mensagem: string) => p.push({ linha, coluna, mensagem })

  const numero = texto(bruta.numero)
  if (!numero) erro('Número', 'Número é obrigatório — é ele que identifica o contrato e evita duplicar na reimportação.')

  const titulo = texto(bruta.titulo)
  if (!titulo) erro('Título', 'Título é obrigatório.')

  const documentoParceiro = somenteDigitos(bruta.documentoParceiro)
  if (!documentoParceiro) erro('CNPJ/CPF do parceiro', 'Informe o CNPJ/CPF do parceiro (ele precisa já estar cadastrado).')

  let situacao = texto(bruta.situacao).toUpperCase().replace(/[\s-]/g, '_')
  if (!situacao) situacao = 'EM_CADASTRO'
  else if (situacao === 'ATIVO') situacao = 'VIGENTE'
  else if (situacao === 'VENCIDO') {
    /* VENCIDO é derivado, nunca gravado: entra como VIGENTE e o sistema conclui o
       vencimento pelo término. Aceitar a palavra e converter evita obrigar o cliente a
       reescrever a planilha inteira. */
    situacao = 'VIGENTE'
  }
  if (!SITUACOES_CONTRATO_IMPORT.includes(situacao)) erro('Situação', `"${texto(bruta.situacao)}" não é uma situação válida. Use EM_CADASTRO, VIGENTE, ENCERRADO, RESCINDIDO ou CANCELADO.`)

  const natureza = texto(bruta.natureza).toUpperCase()
  if (natureza && !NATUREZAS_CONTRATO.includes(natureza)) erro('Natureza', `"${texto(bruta.natureza)}" não é válida. Use DESPESA, RECEITA ou AMBOS.`)

  const inicio = dataISO(bruta.inicioVigencia)
  if (inicio === null) erro('Início da vigência', `"${texto(bruta.inicioVigencia)}" não é uma data válida (use dd/mm/aaaa).`)
  const termino = dataISO(bruta.terminoVigencia)
  if (termino === null) erro('Término da vigência', `"${texto(bruta.terminoVigencia)}" não é uma data válida (use dd/mm/aaaa).`)
  if (inicio && termino && termino < inicio) erro('Término da vigência', 'O término é anterior ao início.')

  const assinatura = dataISO(bruta.dataAssinatura)
  if (assinatura === null) erro('Data de assinatura', `"${texto(bruta.dataAssinatura)}" não é uma data válida (use dd/mm/aaaa).`)

  const valor = numeroDeValor(bruta.valorTotal)
  if (valor === null) erro('Valor total', `"${texto(bruta.valorTotal)}" é ambíguo ou inválido. Escreva 120000,00 (ou 120000.00).`)
  else if (valor !== undefined && valor < 0) erro('Valor total', 'O valor não pode ser negativo.')

  if (p.length > 0) return { linha, dados: null, problemas: p, chave: numero || null }
  return {
    linha,
    chave: numero,
    problemas: [],
    dados: {
      numero, titulo, documentoParceiro, situacao,
      tipo: texto(bruta.tipo) || undefined,
      natureza: natureza || undefined,
      inicioVigencia: inicio ?? undefined,
      terminoVigencia: termino ?? undefined,
      valorTotal: valor ?? 0,
      moeda: texto(bruta.moeda).toUpperCase() || 'BRL',
      dataAssinatura: assinatura ?? undefined,
      objeto: texto(bruta.objeto) || undefined,
      observacoes: texto(bruta.observacoes) || undefined,
    },
  }
}

const numeroDeValor = numero

/** Linha sem nenhum conteúdo — planilha real está cheia delas no fim. */
export function linhaVazia(bruta: Bruta): boolean {
  return Object.values(bruta).every((v) => texto(v) === '')
}

/** Marca linhas repetidas DENTRO da planilha. Duplicidade no arquivo é erro de quem
 *  montou, e importar as duas gravaria o mesmo cadastro duas vezes ou a segunda
 *  sobrescreveria a primeira sem ninguém notar. */
export function marcarDuplicadasNoArquivo<T>(linhas: LinhaAvaliada<T>[]): LinhaAvaliada<T>[] {
  const vistos = new Map<string, number>()
  return linhas.map((l) => {
    if (!l.chave) return l
    const anterior = vistos.get(l.chave)
    if (anterior === undefined) {
      vistos.set(l.chave, l.linha)
      return l
    }
    return {
      ...l,
      dados: null,
      problemas: [...l.problemas, { linha: l.linha, mensagem: `Repetido na planilha: a linha ${anterior} já tem esta mesma identificação.` }],
    }
  })
}
