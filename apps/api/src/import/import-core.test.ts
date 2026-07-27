import { describe, it, expect } from 'vitest'
import {
  avaliarContrato,
  avaliarParceiro,
  chaveDeTitulo,
  cnpjValido,
  cpfValido,
  dataISO,
  linhaVazia,
  marcarDuplicadasNoArquivo,
  numero,
} from './import-core'

/* Planilha de cliente não parece com planilha de exemplo. Estes testes são o
   inventário do que aparece de verdade: data em três formatos, valor com R$ e vírgula,
   documento com máscara, título de coluna com acento faltando, linha em branco no fim.
   Aceitar tudo isso é requisito; gravar lixo em silêncio é o que não pode acontecer. */

describe('chaveDeTitulo', () => {
  it('casa títulos que o usuário digitaria de formas diferentes', () => {
    const esperado = chaveDeTitulo('Razão social')
    for (const t of ['razao social', 'RAZÃO SOCIAL', ' Razão  Social ', 'razão_social', 'Razao-Social']) {
      expect(chaveDeTitulo(t), t).toBe(esperado)
    }
  })
})

describe('dataISO', () => {
  it('aceita dd/mm/aaaa', () => {
    expect(dataISO('01/03/2015')).toBe('2015-03-01')
    expect(dataISO('1/3/2015')).toBe('2015-03-01')
  })

  it('aceita ISO e separadores alternativos', () => {
    expect(dataISO('2015-03-01')).toBe('2015-03-01')
    expect(dataISO('01.03.2015')).toBe('2015-03-01')
  })

  it('aceita a data serial do Excel', () => {
    expect(dataISO('45292')).toBe('2024-01-01')
  })

  it('distingue "não informado" de "informado errado"', () => {
    expect(dataISO('')).toBeUndefined()
    expect(dataISO(null)).toBeUndefined()
    expect(dataISO('31/02/2024')).toBeNull()   // fevereiro não tem 31
    expect(dataISO('ontem')).toBeNull()
  })

  it('valida o último dia do mês', () => {
    expect(dataISO('29/02/2024')).toBe('2024-02-29')  // bissexto
    expect(dataISO('29/02/2023')).toBeNull()
  })
})

describe('numero', () => {
  it('aceita o formato brasileiro', () => {
    expect(numero('120.000,00')).toBe(120000)
    expect(numero('1.234.567,89')).toBe(1234567.89)
    expect(numero('1234,56')).toBe(1234.56)
  })

  it('aceita o formato americano', () => {
    expect(numero('120000.00')).toBe(120000)
    expect(numero('1,234,567.89')).toBe(1234567.89)
  })

  it('limpa R$ e espaços', () => {
    expect(numero('R$ 1.500,00')).toBe(1500)
  })

  it('entende negativo entre parênteses (contabilidade)', () => {
    expect(numero('(1.500,00)')).toBe(-1500)
  })

  it('RECUSA quando não fecha como milhar nem como decimal', () => {
    // grupos de tamanhos incompatíveis: nem 1.234.567 (milhar) nem 1.2345 (decimal)
    expect(numero('1.2345.678')).toBeNull()
  })

  it('assume milhar quando o grupo tem exatamente 3 dígitos (viés pt-BR, declarado)', () => {
    expect(numero('1.234')).toBe(1234)
    expect(numero('12.345.678')).toBe(12345678)
  })

  it('assume decimal quando o grupo NÃO tem 3 dígitos (milhar seria impossível)', () => {
    expect(numero('1.2345')).toBe(1.2345)
    expect(numero('1.23')).toBe(1.23)
  })

  it('distingue vazio de inválido', () => {
    expect(numero('')).toBeUndefined()
    expect(numero('abc')).toBeNull()
  })
})

describe('documentos', () => {
  it('valida CNPJ com e sem máscara', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11.222.333/0001-99')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
  })

  it('valida CPF com e sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('529.982.247-26')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
  })
})

describe('avaliarParceiro', () => {
  const ok = { categoria: 'PJ_BR', razaoSocial: 'Acme LTDA', documento: '11.222.333/0001-81' }

  it('aceita a linha completa e limpa o documento', () => {
    const r = avaliarParceiro(ok, 2)
    expect(r.problemas).toEqual([])
    expect(r.dados?.documento).toBe('11222333000181')
    expect(r.dados?.status).toBe('EM_CADASTRAMENTO')
    expect(r.chave).toBe('11222333000181')
  })

  it('cobra CNPJ de PJ_BR e acusa dígito errado', () => {
    expect(avaliarParceiro({ ...ok, documento: '' }, 2).problemas[0].mensagem).toMatch(/CNPJ é obrigatório/)
    expect(avaliarParceiro({ ...ok, documento: '11.222.333/0001-99' }, 2).problemas[0].mensagem).toMatch(/inválido/)
  })

  it('aceita variações de escrita da situação', () => {
    expect(avaliarParceiro({ ...ok, status: 'ativa' }, 2).dados?.status).toBe('ATIVO')
    expect(avaliarParceiro({ ...ok, status: 'Em Cadastramento' }, 2).dados?.status).toBe('EM_CADASTRAMENTO')
  })

  it('não exige documento de parceiro estrangeiro', () => {
    const r = avaliarParceiro({ categoria: 'PJ_EST', razaoSocial: 'Acme Corp' }, 2)
    expect(r.problemas).toEqual([])
    expect(r.chave).toBe('nome:acme corp')
  })

  it('junta TODOS os problemas da linha, não só o primeiro', () => {
    const r = avaliarParceiro({ categoria: 'XPTO', razaoSocial: '', documento: '123' }, 5)
    expect(r.problemas.length).toBeGreaterThanOrEqual(2)
    expect(r.dados).toBeNull()
    expect(r.problemas.every((p) => p.linha === 5)).toBe(true)
  })
})

describe('avaliarContrato', () => {
  const ok = {
    numero: 'CCT-2024-014', titulo: 'Manutenção', documentoParceiro: '11.222.333/0001-81',
    situacao: 'VIGENTE', inicioVigencia: '01/01/2024', terminoVigencia: '31/12/2026', valorTotal: 'R$ 120.000,00',
  }

  it('aceita a linha completa', () => {
    const r = avaliarContrato(ok, 2)
    expect(r.problemas).toEqual([])
    expect(r.dados?.valorTotal).toBe(120000)
    expect(r.dados?.terminoVigencia).toBe('2026-12-31')
    expect(r.dados?.moeda).toBe('BRL')
  })

  it('converte VENCIDO para VIGENTE (vencido é derivado, nunca gravado)', () => {
    expect(avaliarContrato({ ...ok, situacao: 'Vencido' }, 2).dados?.situacao).toBe('VIGENTE')
  })

  it('recusa término anterior ao início', () => {
    const r = avaliarContrato({ ...ok, inicioVigencia: '01/01/2025', terminoVigencia: '31/12/2024' }, 2)
    expect(r.problemas[0].mensagem).toMatch(/anterior ao início/)
  })

  it('recusa valor ambíguo em vez de errar por mil vezes', () => {
    const r = avaliarContrato({ ...ok, valorTotal: '1.2345.678' }, 2)
    expect(r.problemas[0].mensagem).toMatch(/ambíguo/)
  })

  it('exige número, título e parceiro', () => {
    const r = avaliarContrato({ numero: '', titulo: '', documentoParceiro: '' }, 3)
    expect(r.problemas.length).toBe(3)
  })

  it('término vazio é permitido (prazo indeterminado)', () => {
    const r = avaliarContrato({ ...ok, terminoVigencia: '' }, 2)
    expect(r.problemas).toEqual([])
    expect(r.dados?.terminoVigencia).toBeUndefined()
  })
})

describe('linhaVazia', () => {
  it('reconhece a linha em branco do fim da planilha', () => {
    expect(linhaVazia({ a: '', b: null, c: '   ' })).toBe(true)
    expect(linhaVazia({ a: '', b: 'x' })).toBe(false)
  })
})

describe('marcarDuplicadasNoArquivo', () => {
  it('barra a segunda ocorrência e aponta a linha da primeira', () => {
    const linhas = [
      { linha: 2, chave: 'A', dados: { x: 1 }, problemas: [] },
      { linha: 3, chave: 'B', dados: { x: 2 }, problemas: [] },
      { linha: 4, chave: 'A', dados: { x: 3 }, problemas: [] },
    ]
    const r = marcarDuplicadasNoArquivo(linhas)
    expect(r[0].dados).not.toBeNull()
    expect(r[1].dados).not.toBeNull()
    expect(r[2].dados).toBeNull()
    expect(r[2].problemas[0].mensagem).toMatch(/linha 2/)
  })

  it('linha sem chave não é tratada como duplicada', () => {
    const linhas = [
      { linha: 2, chave: null, dados: null, problemas: [] },
      { linha: 3, chave: null, dados: null, problemas: [] },
    ]
    expect(marcarDuplicadasNoArquivo(linhas)[1].problemas).toEqual([])
  })
})
