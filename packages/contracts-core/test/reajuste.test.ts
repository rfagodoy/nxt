import { describe, it, expect } from 'vitest'
import { num } from '../src/num'
import { valorVigente, parcelaVigente, camposDaNatureza, lancPrevisto, lancPago, lancRealizado, lancDesvio } from '../src/derive'
import { acumuladoPeriodo, aplicarReajuste, pagasAlcancadas, parcelasAlvo, planejarReajuste, proximaDataReajuste, proximaDataReajusteContrato, stepMeses } from '../src/reajuste'
import { ambos, despesaComReajuste, despesaSimples, receita, reajusteParcelaAplicado, semCronograma } from './fixtures'

describe('stepMeses', () => {
  it('mapeia a periodicidade (case-insensitive) e cai em anual quando desconhecida', () => {
    expect(stepMeses('Mensal')).toBe(1)
    expect(stepMeses('SEMESTRAL')).toBe(6)
    expect(stepMeses('')).toBe(12)
    expect(stepMeses('bimestral')).toBe(2)
  })
})

describe('proximaDataReajuste', () => {
  it('sem reajuste aplicado, o 1º reajuste incide NA PRÓPRIA data-base', () => {
    const r = despesaComReajuste.reajustes[0]  // data-base 2027-01
    expect(proximaDataReajuste(despesaComReajuste, r)).toBe('2027-01-01')
  })

  it('data-base fev/2024 → 1º reajuste em fev/2024 (não fev/2025)', () => {
    // regressão do CCT_2026_0001: a data-base é a data em que o reajuste passa a incidir
    const c: any = { ...despesaSimples, reajustes: [{ id: 'r1', indice: '2', data: '2024-02-01', periodicidade: 'Anual' }] }
    expect(proximaDataReajuste(c, c.reajustes[0])).toBe('2024-02-01')
  })

  it('com reajuste aplicado, ancora na última competência', () => {
    const r = reajusteParcelaAplicado.reajustes[0]
    expect(proximaDataReajuste(reajusteParcelaAplicado, r)).toBe('2027-01-01')
  })

  it('linha sem data base não agenda nada; sem índice, agenda (linha em preenchimento)', () => {
    expect(proximaDataReajuste(despesaComReajuste, { id: 'x', indice: '1', data: '', periodicidade: 'Anual' })).toBe('')
    expect(proximaDataReajuste(despesaComReajuste, { id: 'x', indice: '', data: '2027-01-01', periodicidade: 'Anual' })).toBe('2027-01-01')
  })

  it('mas o CONTRATO só agenda por linhas completas (índice + data base)', () => {
    const c = { ...despesaSimples, reajustes: [{ id: 'x', indice: '', data: '2026-01-01', periodicidade: 'Anual' }] }
    expect(proximaDataReajusteContrato(c)).toBe('')
  })

  it('contrato sem linha de reajuste não tem próxima data', () => {
    expect(proximaDataReajusteContrato(despesaSimples)).toBe('')
  })

  it('periodicidade semestral avança 6 meses', () => {
    expect(proximaDataReajuste(receita, receita.reajustes[0])).toBe('2026-07-01')
  })
})

describe('acumuladoPeriodo', () => {
  /* janela = os N meses ANTERIORES à competência (aniversário). Trimestral em 2026-12 →
     set/out/nov 2026 (fechados), NÃO dez/2026. */
  const serie = { '2026-09': 1, '2026-10': 1, '2026-11': 1 }

  it('compõe multiplicativamente os meses ANTERIORES ao aniversário', () => {
    const r = acumuladoPeriodo(serie, 'Trimestral', '2026-12')
    expect(r?.percentual).toBeCloseTo(3.0301, 4) // 1.01³ − 1 (set+out+nov)
    expect(r?.completo).toBe(true)
  })

  it('NÃO inclui o mês do aniversário — usa só os meses fechados', () => {
    // dez/2026 no lugar de set/2026: fora da janela trimestral de 2026-12 → só 2 meses valem
    const semSet = { '2026-10': 1, '2026-11': 1, '2026-12': 1 }
    const r = acumuladoPeriodo(semSet, 'Trimestral', '2026-12')
    expect(r?.completo).toBe(false)               // set/2026 (necessário) está ausente
    expect(r?.percentual).toBeCloseTo(2.0100, 4)  // 1.01² − 1 (out+nov; dez é ignorado)
  })

  it('janela anual incompleta é sinalizada', () => {
    const r = acumuladoPeriodo(serie, 'Anual', '2026-12')
    expect(r?.completo).toBe(false)
    expect(r?.percentual).toBeCloseTo(3.0301, 4) // só 3 dos 12 meses existem
  })

  it('reajuste anual APLICA NA DATA com o ano decorrido publicado (não espera o mês do aniversário)', () => {
    // aniversário jan/2027; janela = jan..dez/2026 (todos fechados). NÃO precisa de jan/2027.
    const anoFechado: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) anoFechado[`2026-${String(m).padStart(2, '0')}`] = 0.5
    const r = acumuladoPeriodo(anoFechado, 'Anual', '2027-01')
    expect(r?.completo).toBe(true) // 12/12 já publicados → aplicaria na data
    expect(r?.percentual).toBeCloseTo((1.005 ** 12 - 1) * 100, 4)
  })

  it('nenhum mês publicado devolve null', () => {
    expect(acumuladoPeriodo(serie, 'Anual', '2030-12')).toBeNull()
    expect(acumuladoPeriodo(undefined, 'Anual', '2026-12')).toBeNull()
  })
})

describe('parcelasAlvo — só o lado da natureza', () => {
  it('DESPESA alcança apenas pagamentos', () => {
    expect(camposDaNatureza('DESPESA')).toEqual(['pagamentos'])
    const alvo = parcelasAlvo(despesaSimples, '2026-01')
    expect(alvo.every(x => x.campo === 'pagamentos')).toBe(true)
  })

  it('RECEITA alcança apenas recebimentos', () => {
    const alvo = parcelasAlvo(receita, '2026-01')
    expect(alvo.every(x => x.campo === 'recebimentos')).toBe(true)
    expect(alvo).toHaveLength(10) // 12 − 2 pagas
  })

  it('AMBOS alcança os dois lados', () => {
    const alvo = parcelasAlvo(ambos, '2026-01')
    expect(new Set(alvo.map(x => x.campo))).toEqual(new Set(['pagamentos', 'recebimentos']))
    expect(alvo).toHaveLength(12)
  })

  it('ignora parcelas pagas e as anteriores à competência', () => {
    const alvo = parcelasAlvo(despesaSimples, '2026-06')
    expect(alvo).toHaveLength(7) // jun..dez, nenhuma paga
    expect(alvo.map(x => x.lanc.id)).not.toContain('p1')
  })
})

describe('aplicarReajuste — base total', () => {
  it('novo total = anterior × (1 + %), parcelas intactas', () => {
    const r = aplicarReajuste(despesaComReajuste, {
      id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'total',
    })
    expect(r.reajuste.valorAnterior).toBe(12000)
    expect(r.reajuste.valorNovo).toBe(13200)
    expect(r.reajuste.competencia).toBe('2027-01-01')
    expect(r.pagamentos).toEqual(despesaComReajuste.pagamentos)
  })
})

describe('aplicarReajuste — base parcela COM cronograma', () => {
  const input = { id: 'x', reajusteId: 'r1', competencia: '2026-06', percentual: 10, base: 'parcela' as const }

  it('reprecifica só as parcelas a vencer a partir da competência', () => {
    const r = aplicarReajuste(despesaComReajuste, input)
    expect(r.reajuste.parcelaAnterior).toBe(1000)
    expect(r.reajuste.parcelaNova).toBe(1100)
    expect(r.reajuste.parcelasReajustadas).toBe(7) // jun..dez

    const porId = new Map(r.pagamentos.map(l => [l.id, lancPrevisto(l)]))
    expect(porId.get('p1')).toBe(1000) // paga: intacta
    expect(porId.get('p5')).toBe(1000) // anterior à competência: intacta
    expect(porId.get('p6')).toBe(1100) // reajustada
    expect(porId.get('p12')).toBe(1100)
  })

  it('o delta do total fecha EXATAMENTE com a soma das parcelas reprecificadas', () => {
    const r = aplicarReajuste(despesaComReajuste, input)
    const antes = despesaComReajuste.pagamentos.reduce((s: number, l: any) => s + lancPrevisto(l), 0)
    const depois = r.pagamentos.reduce((s, l) => s + lancPrevisto(l), 0)
    const deltaCronograma = depois - antes
    const deltaContrato = num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)
    expect(deltaContrato).toBeCloseTo(deltaCronograma, 2)
    expect(deltaContrato).toBe(700) // 7 × 100
  })

  it('reajustes sucessivos ACUMULAM sobre a parcela vigente, não sobre a original', () => {
    const r1 = aplicarReajuste(despesaComReajuste, input)
    const c2 = { ...despesaComReajuste, pagamentos: r1.pagamentos, reajustesRealizados: [r1.reajuste] }
    expect(parcelaVigente(c2)).toBe(1100)

    const r2 = aplicarReajuste(c2, { ...input, id: 'y', competencia: '2026-10' })
    expect(r2.reajuste.parcelaAnterior).toBe(1100)
    expect(r2.reajuste.parcelaNova).toBe(1210) // 1000 × 1,1²
  })

  it('valorVigente após aplicar reflete o delta gravado', () => {
    const r = aplicarReajuste(despesaComReajuste, input)
    const c2 = { ...despesaComReajuste, pagamentos: r.pagamentos, reajustesRealizados: [r.reajuste] }
    expect(valorVigente(c2)).toBe(12700)
  })

  it('AMBOS: o percentual incide sobre cada lado, preservando os valores', () => {
    /* pagamentos de 1000 e recebimentos de 2000 sobem 10% cada — não são igualados. */
    const r = aplicarReajuste(ambos, { ...input, competencia: '2026-01' })
    expect(r.reajuste.parcelasReajustadas).toBe(12)
    expect(lancPrevisto(r.pagamentos[0])).toBe(1100)
    expect(lancPrevisto(r.recebimentos[0])).toBe(2200)
  })

  it('o percentual PRESERVA a estrutura do cronograma; o valor digitado à mão IGUALA', () => {
    /* Cronograma misto: uma entrada de 150.000 (equipamento) + parcelas de 5.000.
       Reajustar 10% sobre cada parcela → 165.000 e 5.500. Igualar destruiria a entrada. */
    const misto = {
      ...despesaComReajuste,
      valorParcela: 5000,
      pagamentos: [
        { id: 'equip', status: 'previsto', vencimento: '2026-07-10', data: '', valor: 150000 },
        { id: 'm1', status: 'previsto', vencimento: '2026-08-10', data: '', valor: 5000 },
      ],
    }
    const porPct = aplicarReajuste(misto, { id: 'x', reajusteId: 'r1', competencia: '2026-07', percentual: 10, base: 'parcela' })
    expect(lancPrevisto(porPct.pagamentos[0])).toBe(165000)
    expect(lancPrevisto(porPct.pagamentos[1])).toBe(5500)

    const porValor = aplicarReajuste(misto, { id: 'x', reajusteId: 'r1', competencia: '2026-07', percentual: 10, base: 'parcela', parcelaNova: 5500 })
    expect(lancPrevisto(porValor.pagamentos[0])).toBe(5500) // igualadas: renegociação de valor único
    expect(lancPrevisto(porValor.pagamentos[1])).toBe(5500)
  })

  it('RECEITA não toca em pagamentos', () => {
    const r = aplicarReajuste(receita, { ...input, competencia: '2026-03' })
    expect(r.pagamentos).toEqual([])
    expect(r.reajuste.parcelasReajustadas).toBe(10)
  })
})

describe('aplicarReajuste — overrides do formulário', () => {
  it('base total: valorNovo digitado à mão manda sobre o percentual', () => {
    const r = aplicarReajuste(despesaComReajuste, {
      id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'total', valorNovo: 15000,
    })
    expect(r.reajuste.valorNovo).toBe(15000)
    expect(r.reajuste.percentual).toBe(10) // registro histórico do que foi negociado
  })

  it('base total: valorAnterior digitado à mão é a base do cálculo', () => {
    const r = aplicarReajuste(despesaComReajuste, {
      id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'total', valorAnterior: 10000,
    })
    expect(r.reajuste.valorAnterior).toBe(10000)
    expect(r.reajuste.valorNovo).toBe(11000)
  })

  it('base parcela: parcelaNova digitada à mão reprecifica com o valor exato', () => {
    const r = aplicarReajuste(despesaComReajuste, {
      id: 'x', reajusteId: 'r1', competencia: '2026-06', percentual: 10, base: 'parcela', parcelaNova: 1234.56,
    })
    expect(r.reajuste.parcelaNova).toBe(1234.56)
    expect(lancPrevisto(r.pagamentos[11])).toBe(1234.56)
    /* o total continua fechando com o cronograma */
    const delta = num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)
    expect(delta).toBeCloseTo(7 * (1234.56 - 1000), 2)
  })

  it('base parcela: o total anterior é sempre o vigente, não um override', () => {
    const r = aplicarReajuste(despesaComReajuste, {
      id: 'x', reajusteId: 'r1', competencia: '2026-06', percentual: 10, base: 'parcela', valorAnterior: 999,
    })
    expect(r.reajuste.valorAnterior).toBe(12000)
  })
})

describe('aplicarReajuste — base parcela SEM cronograma', () => {
  it('delta = (nova − anterior) × qtdParcelas', () => {
    const r = aplicarReajuste(semCronograma, {
      id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'parcela',
    })
    expect(r.reajuste.parcelaNova).toBe(1100)
    expect(r.reajuste.parcelasReajustadas).toBe(12)
    expect(num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)).toBe(1200)
  })

  it('qtdParcelas pode ser sobrescrita pelo chamador', () => {
    const r = aplicarReajuste(semCronograma, {
      id: 'x', reajusteId: 'r1', competencia: '2027-01', percentual: 10, base: 'parcela', qtdParcelas: 5,
    })
    expect(r.reajuste.parcelasReajustadas).toBe(5)
    expect(num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)).toBe(500)
  })
})

describe('arredondamento', () => {
  it('cada parcela vai a centavos e o total fecha EXATAMENTE com a soma do cronograma', () => {
    const c = { ...despesaComReajuste, valorParcela: 333.33, pagamentos: despesaComReajuste.pagamentos.map((l: any) => ({ ...l, valor: 333.33 })) }
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-06', percentual: 4.62, base: 'parcela' })
    expect(r.reajuste.parcelaNova).toBe(348.73) // 333,33 × 1,0462 = 348,7278…

    const antes = c.pagamentos.reduce((s: number, l: any) => s + lancPrevisto(l), 0)
    const depois = r.pagamentos.reduce((s, l) => s + lancPrevisto(l), 0)
    expect(num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)).toBeCloseTo(depois - antes, 2)
  })
})

describe('planejarReajuste — decide se o motor aplica', () => {
  /* 0,5% ao mês em 2026 e 2027 — cobre a janela de 12 meses FECHADOS (jan..dez/2026) do
     aniversário 2027-01 */
  const serieCheia: Record<string, number> = {}
  for (const ano of [2026, 2027]) for (let m = 1; m <= 12; m++) serieCheia[`${ano}-${String(m).padStart(2, '0')}`] = 0.5
  /* data-base 2027-01 = a data em que o 1º reajuste incide (Design: data-base é a data
     do reajuste, não uma âncora um ano antes) → competência 2027-01 */
  const comReajuste = (over: any = {}) => ({
    ...despesaComReajuste,
    reajustes: [{ id: 'r1', indice: '1', data: '2027-01-01', periodicidade: 'Anual', ...over }],
  })

  it('linha sem índice não tem agenda', () => {
    const c = comReajuste({ indice: '' })
    expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').motivo).toBe('SEM_AGENDA')
  })

  it('competência futura não vence', () => {
    const c = comReajuste({ aplicacao: 'AUTOMATICA' })
    const p = planejarReajuste(c, c.reajustes[0], serieCheia, '2026-06-01')
    expect(p.aplicar).toBe(false)
    expect(p.motivo).toBe('NAO_VENCIDO')
    expect(p.vencido).toBe(false)
    expect(p.competencia).toBe('2027-01-01')
  })

  it('linha SEM política nunca aplica sozinha — default é MANUAL', () => {
    const c = comReajuste()
    const p = planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01')
    expect(p.aplicar).toBe(false)
    expect(p.motivo).toBe('MANUAL')
    expect(p.vencido).toBe(true)   // vencido: continua notificando
  })

  it('o extinto SUSPENSA vira MANUAL: não aplica, mas volta a AVISAR', () => {
    /* "Suspensa" silenciava o aviso de um reajuste pendente sem resolvê-lo. Um dado
       legado com esse valor não pode continuar mudo — é lido como MANUAL. */
    const c = comReajuste({ aplicacao: 'SUSPENSA' })
    const p = planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01')
    expect(p.aplicar).toBe(false)
    expect(p.motivo).toBe('MANUAL')
    expect(p.vencido).toBe(true)   // continua notificando
  })

  it('qualquer valor desconhecido em `aplicacao` cai em MANUAL', () => {
    for (const v of ['', 'sim', 'automatica ', undefined]) {
      const c = comReajuste({ aplicacao: v })
      expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').motivo).toBe('MANUAL')
    }
  })

  it('reajuste de 0% substitui "suspender": não muda valor, mas ancora a próxima competência', () => {
    const c = comReajuste({ aplicacao: 'MANUAL' })
    const r = aplicarReajuste(c, { id: 'z', reajusteId: 'r1', competencia: '2027-01', percentual: 0, base: 'parcela' })
    expect(r.reajuste.parcelaNova).toBe(r.reajuste.parcelaAnterior)
    expect(num(r.reajuste.valorNovo)).toBe(num(r.reajuste.valorAnterior))

    const c2 = { ...c, pagamentos: r.pagamentos, reajustesRealizados: [r.reajuste] }
    expect(proximaDataReajuste(c2, c2.reajustes[0])).toBe('2028-01-01')
    /* e o alerta de pendência some, porque não há mais pendência */
    expect(planejarReajuste(c2, c2.reajustes[0], serieCheia, '2027-06-01').vencido).toBe(false)
  })

  it('AUTOMATICA sem série publicada não aplica', () => {
    const c = comReajuste({ aplicacao: 'AUTOMATICA' })
    expect(planejarReajuste(c, c.reajustes[0], {}, '2027-06-01').motivo).toBe('SEM_SERIE')
  })

  it('AUTOMATICA com janela INCOMPLETA não aplica — o índice ainda não saiu por inteiro', () => {
    const c = comReajuste({ aplicacao: 'AUTOMATICA' })
    const parcial = { '2026-12': 0.5, '2026-11': 0.4 } // só 2 dos 12 meses
    const p = planejarReajuste(c, c.reajustes[0], parcial, '2027-06-01')
    expect(p.aplicar).toBe(false)
    expect(p.motivo).toBe('JANELA_INCOMPLETA')
    expect(p.percentual).toBeGreaterThan(0) // sabe o parcial, mas recusa usá-lo
  })

  it('AUTOMATICA, vencida e com janela completa → aplica', () => {
    const c = comReajuste({ aplicacao: 'AUTOMATICA' })
    const p = planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01')
    expect(p.aplicar).toBe(true)
    expect(p.competencia).toBe('2027-01-01')
    expect(p.base).toBe('parcela')     // contrato tem parcela
    /* 1,005^12 − 1 = 6,1678…% → arredondado a 2 casas, como o registro manual faz */
    expect(p.percentual).toBe(6.17)
  })

  it('a base NÃO é configurável: contrato com parcela reajusta a parcela', () => {
    const c = comReajuste({ aplicacao: 'AUTOMATICA' })
    expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').base).toBe('parcela')
  })

  it('sem parcela no contrato, a base é o total', () => {
    const c = { ...comReajuste({ aplicacao: 'AUTOMATICA' }), valorParcela: 0, reajustesRealizados: [] }
    expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').base).toBe('total')
  })
})

describe('pagasAlcancadas — a diferença que o motor NÃO cobra', () => {
  it('conta as pagas a partir da competência e soma o percentual sobre cada uma', () => {
    /* despesaSimples: p1..p3 pagas (jan..mar), 1000 cada */
    const r = pagasAlcancadas(despesaSimples, '2026-02', 10)
    expect(r.quantidade).toBe(2)          // fev e mar
    expect(r.diferenca).toBe(200)         // 2 × (1000 × 10%)
  })

  it('a diferença respeita o valor de CADA parcela paga', () => {
    const misto = { ...despesaSimples, pagamentos: [
      { id: 'a', status: 'pago', vencimento: '2026-02-10', data: '2026-02-10', valor: 150000 },
      { id: 'b', status: 'pago', vencimento: '2026-03-10', data: '2026-03-10', valor: 5000 },
    ] }
    const r = pagasAlcancadas(misto, '2026-02', 10)
    expect(r.quantidade).toBe(2)
    expect(r.diferenca).toBe(15500)       // 15.000 + 500
  })

  it('zero quando nenhuma paga é alcançada', () => {
    expect(pagasAlcancadas(despesaSimples, '2026-06', 10)).toEqual({ quantidade: 0, diferenca: 0 })
  })

  it('só o lado da natureza', () => {
    expect(pagasAlcancadas(receita, '2026-01', 10).quantidade).toBe(2) // recebimentos pagos
  })
})

describe('REGRESSÃO: contrato misto (equipamento à vista + manutenção mensal)', () => {
  /* O CCT_2026_0001 do PO: R$ 150.000 de equipamentos + 12 × R$ 5.000 de manutenção.
     A reprecificação antiga IGUALAVA todas as parcelas a vencer à parcela nova — se o
     lançamento do equipamento estivesse a vencer, R$ 150.000 viraria R$ 5.250, calado.
     Agora o percentual incide sobre cada parcela e a estrutura se preserva. */
  const misto: any = {
    natureza: 'DESPESA', valorTotal: 210000, valorParcela: 5000, qtdParcelas: 12,
    aditivos: [], renovacoes: [], reajustesRealizados: [], recebimentos: [],
    reajustes: [{ id: 'r1', indice: '1', data: '2019-04-01', periodicidade: 'Anual' }],
    pagamentos: [
      { id: 'equip', status: 'previsto', vencimento: '2020-05-10', data: '', valor: 150000 },
      ...Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, status: 'previsto', vencimento: `2020-0${6 + i}-10`, data: '', valor: 5000 })),
    ],
  }

  it('o equipamento NÃO é achatado para o valor da parcela', () => {
    const r = aplicarReajuste(misto, { id: 'x', reajusteId: 'r1', competencia: '2020-05', percentual: 5, base: 'parcela' })
    const v = new Map(r.pagamentos.map(l => [l.id, lancPrevisto(l)]))
    expect(v.get('equip')).toBe(157500) // 150.000 + 5%, não 5.250
    expect(v.get('m0')).toBe(5250)
  })

  it('parcela paga fica intacta — o equipamento entregue não reajusta', () => {
    const pago = { ...misto, pagamentos: misto.pagamentos.map((l: any) => (l.id === 'equip' ? { ...l, status: 'pago', data: '2020-05-10' } : l)) }
    const r = aplicarReajuste(pago, { id: 'x', reajusteId: 'r1', competencia: '2020-05', percentual: 5, base: 'parcela' })
    const v = new Map(r.pagamentos.map(l => [l.id, lancPrevisto(l)]))
    expect(v.get('equip')).toBe(150000)  // intacto
    expect(v.get('m0')).toBe(5250)       // só a manutenção sobe
    expect(r.reajuste.parcelasReajustadas).toBe(3)
  })

  it('o total cresce exatamente pelo que as parcelas cresceram', () => {
    const r = aplicarReajuste(misto, { id: 'x', reajusteId: 'r1', competencia: '2020-05', percentual: 5, base: 'parcela' })
    const antes = misto.pagamentos.reduce((s: number, l: any) => s + lancPrevisto(l), 0)
    const depois = r.pagamentos.reduce((s, l) => s + lancPrevisto(l), 0)
    expect(num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)).toBeCloseTo(depois - antes, 2)
  })
})

describe('parcela marcada como NÃO reajustável', () => {
  /* `reajustavel: false` tira a parcela do alcance do reajuste. Ausente = reajustável,
     para que todo dado legado continue se comportando como antes. */
  const c: any = {
    natureza: 'DESPESA', valorTotal: 210000, valorParcela: 5000, qtdParcelas: 12,
    aditivos: [], renovacoes: [], reajustesRealizados: [], recebimentos: [],
    reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual' }],
    pagamentos: [
      { id: 'equip', status: 'previsto', vencimento: '2026-07-10', data: '', valor: 150000, reajustavel: false },
      { id: 'm1',    status: 'previsto', vencimento: '2026-08-10', data: '', valor: 5000 },
      { id: 'm2',    status: 'previsto', vencimento: '2026-09-10', data: '', valor: 5000, reajustavel: true },
    ],
  }

  it('fica fora de parcelasAlvo', () => {
    const alvo = parcelasAlvo(c, '2026-07')
    expect(alvo.map(x => x.lanc.id)).toEqual(['m1', 'm2'])
  })

  it('não é reprecificada — nem pelo percentual', () => {
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-07', percentual: 10, base: 'parcela' })
    const v = new Map(r.pagamentos.map(l => [l.id, lancPrevisto(l)]))
    expect(v.get('equip')).toBe(150000)   // intacta
    expect(v.get('m1')).toBe(5500)
    expect(v.get('m2')).toBe(5500)
    expect(r.reajuste.parcelasReajustadas).toBe(2)
  })

  it('nem quando o usuário digita a nova parcela à mão', () => {
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-07', percentual: 10, base: 'parcela', parcelaNova: 5500 })
    expect(lancPrevisto(r.pagamentos[0])).toBe(150000)
  })

  it('o total cresce só pelo que as parcelas reajustáveis cresceram', () => {
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-07', percentual: 10, base: 'parcela' })
    expect(num(r.reajuste.valorNovo) - num(r.reajuste.valorAnterior)).toBe(1000) // 2 × 500
  })

  it('paga e não reajustável não entra na diferença não cobrada', () => {
    const pago = { ...c, pagamentos: c.pagamentos.map((l: any) => ({ ...l, status: 'pago', data: l.vencimento })) }
    const r = pagasAlcancadas(pago, '2026-07', 10)
    expect(r.quantidade).toBe(2)      // só m1 e m2
    expect(r.diferenca).toBe(1000)    // o equipamento não conta
  })
})
