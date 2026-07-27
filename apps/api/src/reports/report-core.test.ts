import { describe, it, expect } from 'vitest'
import { derivarLinha, dentroDoPeriodo, filtrar, ordenar, totalizar, type LinhaRelatorio } from './report-core'

/* O motivo deste módulo existir: "Vencido" NÃO existe no banco — é derivado. Um
   relatório que filtrasse situacao='VENCIDO' no SQL devolveria zero linhas para sempre,
   e quem gere contratos concluiria que não há nenhum vencido. É a pior resposta errada
   possível. Estes testes travam esse comportamento. */

const HOJE = '2026-07-27'

const bruto = (over: Record<string, unknown> = {}) => ({
  id: 'c1', numero: 'CCT-001', titulo: 'Contrato', tipo: 'Serviços', natureza: 'DESPESA',
  situacao: 'VIGENTE', inicioVigencia: '2024-01-01', terminoVigencia: '2026-12-31',
  prazoIndeterminado: false, moeda: 'BRL', valorTotal: 1000,
  aditivos: [], renovacoes: [], reajustes: [], reajustesRealizados: [],
  pagamentos: [], recebimentos: [], partes: [{ nome: 'Acme LTDA' }],
  ...over,
}) as never

const linha = (over: Partial<LinhaRelatorio> = {}): LinhaRelatorio => ({
  id: 'x', numero: 'N', titulo: 'T', tipo: '', natureza: '', situacao: 'VIGENTE',
  inicioVigencia: '2024-01-01', terminoVigencia: '2026-12-31', prazoIndeterminado: false,
  valor: 0, moeda: 'BRL', parceiros: '', diasParaTerminar: null, ...over,
})

describe('derivarLinha', () => {
  it('deriva VENCIDO de um contrato VIGENTE com término no passado', () => {
    const l = derivarLinha(bruto({ terminoVigencia: '2025-12-31' }), HOJE)
    expect(l.situacao).toBe('VENCIDO')
  })

  it('mantém VIGENTE quando o término ainda não chegou', () => {
    expect(derivarLinha(bruto(), HOJE).situacao).toBe('VIGENTE')
  })

  it('prazo indeterminado NUNCA vence', () => {
    const l = derivarLinha(bruto({ prazoIndeterminado: true, terminoVigencia: '2020-01-01' }), HOJE)
    expect(l.situacao).toBe('VIGENTE')
    expect(l.terminoVigencia).toBeNull()
  })

  it('não mexe em quem já saiu do jogo', () => {
    expect(derivarLinha(bruto({ situacao: 'ENCERRADO', terminoVigencia: '2020-01-01' }), HOJE).situacao).toBe('ENCERRADO')
    expect(derivarLinha(bruto({ situacao: 'CANCELADO', terminoVigencia: '2020-01-01' }), HOJE).situacao).toBe('CANCELADO')
  })

  it('normaliza situação do modelo antigo', () => {
    expect(derivarLinha(bruto({ situacao: 'ATIVO' }), HOJE).situacao).toBe('VIGENTE')
  })

  it('conta os dias até o término', () => {
    expect(derivarLinha(bruto({ terminoVigencia: '2026-08-06' }), HOJE).diasParaTerminar).toBe(10)
    expect(derivarLinha(bruto({ terminoVigencia: '2026-07-17' }), HOJE).diasParaTerminar).toBe(-10)
  })

  it('traz os nomes das partes', () => {
    expect(derivarLinha(bruto(), HOJE).parceiros).toBe('Acme LTDA')
  })
})

describe('dentroDoPeriodo', () => {
  const l = linha({ inicioVigencia: '2024-01-01', terminoVigencia: '2026-12-31' })

  it('sem filtro, tudo entra', () => {
    expect(dentroDoPeriodo(l)).toBe(true)
  })

  it('entra quem esteve em vigor em ALGUM momento da janela', () => {
    expect(dentroDoPeriodo(l, '2025-01-01', '2025-12-31')).toBe(true)   // atravessa a janela
    expect(dentroDoPeriodo(l, '2026-12-01', '2027-01-31')).toBe(true)   // termina dentro
  })

  it('fica de fora quem começou depois da janela', () => {
    expect(dentroDoPeriodo(l, '2020-01-01', '2023-12-31')).toBe(false)
  })

  it('fica de fora quem terminou antes da janela', () => {
    expect(dentroDoPeriodo(linha({ terminoVigencia: '2023-01-01' }), '2024-01-01', '2024-12-31')).toBe(false)
  })

  it('prazo indeterminado entra sempre que já começou', () => {
    const ind = linha({ prazoIndeterminado: true, terminoVigencia: null })
    expect(dentroDoPeriodo(ind, '2030-01-01', '2030-12-31')).toBe(true)
  })
})

describe('filtrar', () => {
  const linhas = [
    linha({ id: 'a', numero: 'A-1', situacao: 'VIGENTE', natureza: 'DESPESA', tipo: 'Serviços', parceiros: 'Acme' }),
    linha({ id: 'b', numero: 'B-2', situacao: 'VENCIDO', natureza: 'RECEITA', tipo: 'Locação', parceiros: 'Beta' }),
    linha({ id: 'c', numero: 'C-3', situacao: 'ENCERRADO', natureza: 'DESPESA', tipo: 'Serviços', parceiros: 'Gama' }),
  ]

  it('filtra por VENCIDO — a situação que não existe no banco', () => {
    const r = filtrar(linhas, { situacoes: ['VENCIDO'] })
    expect(r.map((l) => l.id)).toEqual(['b'])
  })

  it('aceita várias situações', () => {
    expect(filtrar(linhas, { situacoes: ['VIGENTE', 'VENCIDO'] }).length).toBe(2)
  })

  it('combina filtros (e não soma)', () => {
    expect(filtrar(linhas, { naturezas: ['DESPESA'], tipos: ['Serviços'], situacoes: ['VIGENTE'] }).map((l) => l.id)).toEqual(['a'])
  })

  it('busca por número, título e parceiro', () => {
    expect(filtrar(linhas, { busca: 'beta' }).map((l) => l.id)).toEqual(['b'])
    expect(filtrar(linhas, { busca: 'C-3' }).map((l) => l.id)).toEqual(['c'])
  })

  it('filtra por parceiro usando o mapa de vínculos', () => {
    const mapa = new Map([['a', ['p1']], ['b', ['p2']], ['c', ['p1', 'p3']]])
    expect(filtrar(linhas, { parceiroIds: ['p1'] }, mapa).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('sem filtro devolve tudo', () => {
    expect(filtrar(linhas, {}).length).toBe(3)
  })
})

describe('totalizar', () => {
  const linhas = [
    linha({ situacao: 'VIGENTE', natureza: 'DESPESA', valor: 100 }),
    linha({ situacao: 'VIGENTE', natureza: 'RECEITA', valor: 50.5 }),
    linha({ situacao: 'VENCIDO', natureza: 'DESPESA', valor: 25.25 }),
  ]

  it('soma sem erro de ponto flutuante', () => {
    expect(totalizar(linhas).valorTotal).toBe(175.75)
  })

  it('agrupa por situação, do maior valor para o menor', () => {
    const t = totalizar(linhas)
    expect(t.porSituacao[0]).toEqual({ situacao: 'VIGENTE', contratos: 2, valor: 150.5 })
  })

  it('agrupa por natureza e nomeia a ausência', () => {
    const t = totalizar([...linhas, linha({ natureza: '', valor: 1 })])
    expect(t.porNatureza.some((n) => n.natureza === '(não informada)')).toBe(true)
  })

  it('lista vazia não quebra', () => {
    expect(totalizar([])).toEqual({ contratos: 0, valorTotal: 0, porSituacao: [], porNatureza: [] })
  })
})

describe('ordenar', () => {
  const linhas = [
    linha({ numero: 'B', valor: 10, terminoVigencia: '2026-01-01' }),
    linha({ numero: 'A', valor: 30, terminoVigencia: null, prazoIndeterminado: true }),
    linha({ numero: 'C', valor: 20, terminoVigencia: '2025-01-01' }),
  ]

  it('ordena por texto respeitando pt-BR', () => {
    expect(ordenar(linhas, 'numero').map((l) => l.numero)).toEqual(['A', 'B', 'C'])
  })

  it('ordena por número, decrescente', () => {
    expect(ordenar(linhas, 'valor', true).map((l) => l.valor)).toEqual([30, 20, 10])
  })

  it('sem término fica por último NAS DUAS direções', () => {
    expect(ordenar(linhas, 'terminoVigencia').at(-1)?.numero).toBe('A')
    expect(ordenar(linhas, 'terminoVigencia', true).at(-1)?.numero).toBe('A')
  })
})
