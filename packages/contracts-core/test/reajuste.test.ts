import { describe, it, expect } from 'vitest'
import { num } from '../src/num'
import { valorVigente, parcelaVigente, camposDaNatureza } from '../src/derive'
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
  it('sem reajuste aplicado, ancora na data base do cadastro', () => {
    const r = despesaComReajuste.reajustes[0]
    expect(proximaDataReajuste(despesaComReajuste, r)).toBe('2027-01-01')
  })

  it('com reajuste aplicado, ancora na última competência', () => {
    const r = reajusteParcelaAplicado.reajustes[0]
    expect(proximaDataReajuste(reajusteParcelaAplicado, r)).toBe('2027-01-01')
  })

  it('linha sem data base não agenda nada; sem índice, agenda (linha em preenchimento)', () => {
    expect(proximaDataReajuste(despesaComReajuste, { id: 'x', indice: '1', data: '', periodicidade: 'Anual' })).toBe('')
    expect(proximaDataReajuste(despesaComReajuste, { id: 'x', indice: '', data: '2026-01-01', periodicidade: 'Anual' })).toBe('2027-01-01')
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
  const serie = { '2026-10': 1, '2026-11': 1, '2026-12': 1 }

  it('compõe multiplicativamente os meses da janela', () => {
    const r = acumuladoPeriodo(serie, 'Trimestral', '2026-12')
    expect(r?.percentual).toBeCloseTo(3.0301, 4) // 1.01³ − 1
    expect(r?.completo).toBe(true)
  })

  it('janela incompleta é sinalizada — índice ainda não publicado', () => {
    const r = acumuladoPeriodo(serie, 'Anual', '2026-12')
    expect(r?.completo).toBe(false)
    expect(r?.percentual).toBeCloseTo(3.0301, 4) // só 3 dos 12 meses existem
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

    const porId = new Map(r.pagamentos.map(l => [l.id, num(l.valor)]))
    expect(porId.get('p1')).toBe(1000) // paga: intacta
    expect(porId.get('p5')).toBe(1000) // anterior à competência: intacta
    expect(porId.get('p6')).toBe(1100) // reajustada
    expect(porId.get('p12')).toBe(1100)
  })

  it('o delta do total fecha EXATAMENTE com a soma das parcelas reprecificadas', () => {
    const r = aplicarReajuste(despesaComReajuste, input)
    const antes = despesaComReajuste.pagamentos.reduce((s: number, l: any) => s + num(l.valor), 0)
    const depois = r.pagamentos.reduce((s, l) => s + num(l.valor), 0)
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

  it('AMBOS reprecifica os dois lados — com a MESMA parcela vigente', () => {
    /* O contrato tem um único `valorParcela`, então o reajuste de parcela leva os dois
       lados ao mesmo valor, mesmo que hoje difiram (aqui: 1000 e 2000 → ambos 1100).
       É o comportamento que já existia; preservado de propósito. Um contrato AMBOS com
       parcelas distintas por lado simplesmente não é representável no modelo atual. */
    const r = aplicarReajuste(ambos, { ...input, competencia: '2026-01' })
    expect(r.reajuste.parcelasReajustadas).toBe(12)
    expect(num(r.pagamentos[0].valor)).toBe(1100)
    expect(num(r.recebimentos[0].valor)).toBe(1100)
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
    expect(num(r.pagamentos[11].valor)).toBe(1234.56)
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
  it('parcela e total ficam em centavos, e o total fecha com o cronograma', () => {
    const c = { ...despesaComReajuste, valorParcela: 333.33 }
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-06', percentual: 4.62, base: 'parcela' })
    expect(r.reajuste.parcelaNova).toBe(348.73) // 333,33 × 1,0462 = 348,7278…
    const alvo = parcelasAlvo(c, '2026-06')
    const delta = alvo.reduce((s, x) => s + (348.73 - num(x.lanc.valor)), 0)
    expect(num(r.reajuste.valorNovo)).toBeCloseTo(num(r.reajuste.valorAnterior) + delta, 2)
  })
})

describe('planejarReajuste — decide se o motor aplica', () => {
  /* 0,5% ao mês em 2026 e 2027 — cobre a janela de 12 meses que termina em 2027-01 */
  const serieCheia: Record<string, number> = {}
  for (const ano of [2026, 2027]) for (let m = 1; m <= 12; m++) serieCheia[`${ano}-${String(m).padStart(2, '0')}`] = 0.5
  /* linha ancorada em 2026-01, anual → próxima competência 2027-01 */
  const comReajuste = (over: any = {}) => ({
    ...despesaComReajuste,
    reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual', ...over }],
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

  it('SUSPENSA não aplica', () => {
    const c = comReajuste({ aplicacao: 'SUSPENSA' })
    expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').motivo).toBe('SUSPENSA')
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

  it('base explícita na linha vence o default', () => {
    const c = comReajuste({ aplicacao: 'AUTOMATICA', base: 'total' })
    expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').base).toBe('total')
  })

  it('sem parcela no contrato, o default é base total', () => {
    const c = { ...comReajuste({ aplicacao: 'AUTOMATICA' }), valorParcela: 0, reajustesRealizados: [] }
    expect(planejarReajuste(c, c.reajustes[0], serieCheia, '2027-06-01').base).toBe('total')
  })
})

describe('pagasAlcancadas — a diferença que o motor NÃO cobra', () => {
  it('conta as pagas a partir da competência e soma a diferença', () => {
    /* despesaSimples: p1..p3 pagas (jan..mar), 1000 cada */
    const r = pagasAlcancadas(despesaSimples, '2026-02', 1100)
    expect(r.quantidade).toBe(2)          // fev e mar
    expect(r.diferenca).toBe(200)         // 2 × 100
  })

  it('zero quando nenhuma paga é alcançada', () => {
    expect(pagasAlcancadas(despesaSimples, '2026-06', 1100)).toEqual({ quantidade: 0, diferenca: 0 })
  })

  it('só o lado da natureza', () => {
    expect(pagasAlcancadas(receita, '2026-01', 550).quantidade).toBe(2) // recebimentos pagos
  })
})
