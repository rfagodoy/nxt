import { HttpException, Injectable, NotFoundException } from '@nestjs/common'

export interface CepResult {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  estado: string
}

/**
 * Consulta de CEP pelo SERVIDOR. O browser não fala com hosts externos (CSP
 * connect-src 'self'), então o proxy vive aqui — mesmo padrão dos índices do BCB.
 * Normaliza a resposta da ViaCEP para o shape que o cadastro de endereço usa.
 */
@Injectable()
export class CepService {
  private static readonly TIMEOUT_MS = 5000

  async lookup(rawCep: string): Promise<CepResult> {
    const cep = (rawCep ?? '').replace(/\D/g, '')
    if (cep.length !== 8) throw new HttpException('CEP inválido', 400)

    let res: Response
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), CepService.TIMEOUT_MS)
      try {
        res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal })
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // offline / timeout / DNS — provável em on-premise sem saída externa
      throw new HttpException('Serviço de CEP indisponível', 502)
    }
    if (!res.ok) throw new HttpException('Serviço de CEP indisponível', 502)

    const data = (await res.json()) as {
      erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string
    }
    if (data.erro) throw new NotFoundException('CEP não encontrado')

    return {
      cep,
      logradouro: data.logradouro ?? '',
      bairro:     data.bairro ?? '',
      cidade:     data.localidade ?? '',
      estado:     data.uf ?? '',
    }
  }
}
