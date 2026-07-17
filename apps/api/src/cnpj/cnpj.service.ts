import { HttpException, Injectable, NotFoundException } from '@nestjs/common'
import { isValidCNPJ } from '../partners/doc-validation'

export interface CnpjSocio {
  nome: string
  qualificacao: string
  documento: string
}

export interface CnpjResult {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  dataAbertura: string          // yyyy-mm-dd
  situacao: string              // ATIVA | BAIXADA | INAPTA | SUSPENSA | NULA
  naturezaJuridica: string      // código IBGE formatado (ex.: 206-2)
  naturezaJuridicaDescricao: string
  cnaePrincipal: string         // código subclasse formatado (ex.: 6201-5/01)
  cnaesSecundarios: string[]
  endereco: {
    cep: string; logradouro: string; numero: string; complemento: string
    bairro: string; cidade: string; estado: string
  }
  telefone: string
  email: string
  porte: string
  capitalSocial: number | null
  socios: CnpjSocio[]
}

/** Resposta bruta da BrasilAPI (`/api/cnpj/v1/:cnpj`) — só os campos que usamos. */
interface BrasilApiCnpj {
  razao_social?: string
  nome_fantasia?: string
  data_inicio_atividade?: string
  descricao_situacao_cadastral?: string
  codigo_natureza_juridica?: number | string
  natureza_juridica?: string
  cnae_fiscal?: number | string
  cnaes_secundarios?: { codigo?: number | string }[]
  logradouro?: string; numero?: string; complemento?: string; bairro?: string
  municipio?: string; uf?: string; cep?: string | number
  ddd_telefone_1?: string; email?: string
  porte?: string; capital_social?: number
  qsa?: { nome_socio?: string; qualificacao_socio?: string; cnpj_cpf_do_socio?: string }[]
}

/**
 * Consulta de CNPJ pelo SERVIDOR (browser não fala com host externo — CSP 'self').
 * Fonte: BrasilAPI, que serve a base ABERTA do CNPJ da Receita Federal. NUNCA
 * raspamos o site da RFB (CAPTCHA). Normaliza para os campos do cadastro de PJ.
 * Provider é fixo por ora (BrasilAPI); on-premise offline exigirá base local — o
 * ponto de troca é `fetchProvider`.
 */
@Injectable()
export class CnpjService {
  private static readonly TIMEOUT_MS = 8000

  async lookup(rawCnpj: string): Promise<CnpjResult> {
    const cnpj = (rawCnpj ?? '').replace(/\D/g, '')
    if (cnpj.length !== 14) throw new HttpException('CNPJ inválido', 400)
    // valida o dígito verificador ANTES de bater no provedor externo (evita 502 confuso
    // p/ CNPJ malformado e uma chamada de rede desnecessária).
    if (!isValidCNPJ(cnpj)) throw new HttpException('CNPJ inválido', 400)

    const data = await this.fetchProvider(cnpj)

    // A base ABERTA da RFB (BrasilAPI/minhareceita) omite o e-mail. Quando faltar,
    // tenta a ReceitaWS (best-effort — rate-limit/offline não quebram a busca).
    let email = (data.email ?? '').trim().toLowerCase()
    if (!email) email = await this.fetchEmailFallback(cnpj)

    return {
      cnpj,
      razaoSocial:  (data.razao_social ?? '').trim(),
      nomeFantasia: (data.nome_fantasia ?? '').trim(),
      dataAbertura: (data.data_inicio_atividade ?? '').slice(0, 10),
      situacao:     (data.descricao_situacao_cadastral ?? '').toUpperCase(),
      naturezaJuridica:          formatNatureza(data.codigo_natureza_juridica),
      naturezaJuridicaDescricao: (data.natureza_juridica ?? '').trim(),
      cnaePrincipal:    formatCnae(data.cnae_fiscal),
      cnaesSecundarios: (data.cnaes_secundarios ?? []).map((c) => formatCnae(c.codigo)).filter(Boolean),
      endereco: {
        cep:         String(data.cep ?? '').replace(/\D/g, ''),
        logradouro:  (data.logradouro ?? '').trim(),
        numero:      (data.numero ?? '').trim(),
        complemento: (data.complemento ?? '').trim(),
        bairro:      (data.bairro ?? '').trim(),
        cidade:      titleCase(data.municipio ?? ''),
        estado:      (data.uf ?? '').trim().toUpperCase(),
      },
      telefone: (data.ddd_telefone_1 ?? '').trim(),
      email,
      porte:    (data.porte ?? '').trim(),
      capitalSocial: typeof data.capital_social === 'number' ? data.capital_social : null,
      socios: (data.qsa ?? []).map((s) => ({
        nome:         (s.nome_socio ?? '').trim(),
        qualificacao: (s.qualificacao_socio ?? '').trim(),
        documento:    (s.cnpj_cpf_do_socio ?? '').trim(),
      })).filter((s) => s.nome),
    }
  }

  /** Ponto único de troca de provedor (SaaS = BrasilAPI; on-prem futuro = base local). */
  private async fetchProvider(cnpj: string): Promise<BrasilApiCnpj> {
    let res: Response
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), CnpjService.TIMEOUT_MS)
      try {
        // User-Agent explícito: a BrasilAPI (atrás de Cloudflare) responde 403 ao UA
        // default do Node/undici; com um UA identificado, 200.
        res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          signal:  ctrl.signal,
          headers: { 'User-Agent': 'Nxt/1.0 (cadastro-parceiro)', Accept: 'application/json' },
        })
      } finally {
        clearTimeout(timer)
      }
    } catch {
      throw new HttpException('Serviço de consulta de CNPJ indisponível', 502)
    }
    if (res.status === 404) throw new NotFoundException('CNPJ não encontrado')
    if (!res.ok) throw new HttpException('Serviço de consulta de CNPJ indisponível', 502)
    return (await res.json()) as BrasilApiCnpj
  }

  /**
   * E-mail só existe em provedores que enriquecem além da base aberta (ex.: ReceitaWS).
   * BEST-EFFORT: qualquer falha (429 rate-limit, offline, timeout) → '' e a busca segue.
   * `RECEITAWS_TOKEN` (opcional) usa o tier pago e eleva o limite.
   */
  private async fetchEmailFallback(cnpj: string): Promise<string> {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      try {
        const token = process.env.RECEITAWS_TOKEN
        const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
          signal:  ctrl.signal,
          headers: {
            'User-Agent': 'Nxt/1.0 (cadastro-parceiro)',
            Accept:       'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (!res.ok) return ''
        const d = (await res.json()) as { status?: string; email?: string }
        return d.status === 'OK' && d.email ? d.email.trim().toLowerCase() : ''
      } finally {
        clearTimeout(timer)
      }
    } catch {
      return ''
    }
  }
}

/** Código de natureza jurídica IBGE: 4 dígitos → "XXX-X" (ex.: 2062 → 206-2). */
function formatNatureza(code: number | string | undefined): string {
  const d = String(code ?? '').replace(/\D/g, '')
  if (d.length !== 4) return d
  return `${d.slice(0, 3)}-${d.slice(3)}`
}

/** Código CNAE subclasse: 7 dígitos → "DDDD-D/DD" (ex.: 6201501 → 6201-5/01). */
function formatCnae(code: number | string | undefined): string {
  const d = String(code ?? '').replace(/\D/g, '')
  if (d.length !== 7) return d
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`
}

function titleCase(s: string): string {
  return s.trim().toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}
