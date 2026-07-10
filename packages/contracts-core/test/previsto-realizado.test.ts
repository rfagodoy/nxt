/* PREVISTO × REALIZADO.

   A parcela passou a ter dois valores: `valorPrevisto` (contratado) e `valorPago`
   (baixado). "Pago" é derivado da presença do valorPago — não é mais um campo que
   alguém possa deixar inconsistente com o dinheiro.

   Os testes de LEGADO são os mais importantes: um lançamento gravado no modelo antigo
   (um único `valor` + `status` textual) tem que continuar somando exatamente como antes.
   Um erro aqui zeraria o consumo de contratos existentes, em silêncio. */

import { describe, it, expect } from 'vitest'
import {
  consumo, lancDesvio, lancPago, lancPrevisto, lancRealizado,
  somaDesvios, somaLancamentos, somaLancamentosPagos, valorVigente,
} from '../src/derive'
import { aplicarReajuste, pagasAlcancadas } from '../src/reajuste'
import { totaisAVencer } from '../src/parcelas'
import { cct20260001 } from './fixtures'

const prevista = (id: string, venc: string, previsto: number) => ({ id, vencimento: venc, valorPrevisto: previsto })
const paga = (id: string, venc: string, previsto: number, pago: number) =>
  ({ id, vencimento: venc, valorPrevisto: previsto, valorPago: pago, data: venc })

describe('a parcela tem dois valores, e "pago" é derivado do segundo', () => {
  it('sem valorPago, a parcela é prevista', () => {
    const l = prevista('a', '2026-01-10', 1000)
    expect(lancPago(l)).toBe(false)
    expect(lancPrevisto(l)).toBe(1000)
    expect(lancRealizado(l)).toBe(0)
    expect(lancDesvio(l)).toBe(0)
  })

  it('com valorPago, é paga — e o desvio aparece', () => {
    const l = paga('a', '2026-01-10', 1000, 1180)
    expect(lancPago(l)).toBe(true)
    expect(lancRealizado(l)).toBe(1180)
    expect(lancDesvio(l)).toBe(180) // juros/multa
  })

  it('desvio negativo é desconto ou glosa', () => {
    expect(lancDesvio(paga('a', '2026-01-10', 1000, 950))).toBe(-50)
  })

  it('baixa de zero é uma BAIXA: testamos PRESENÇA do valorPago, não maior que zero', () => {
    const l = paga('a', '2026-01-10', 1000, 0)
    expect(lancPago(l)).toBe(true) // com a regra "> 0", voltaria a ser prevista
    expect(lancDesvio(l)).toBe(-1000)
  })
})

describe('LEGADO — dado gravado antes da separação', () => {
  const legadoPrevisto  = { id: 'a', vencimento: '2026-01-10', valor: 1000, status: 'previsto' }
  const legadoPago      = { id: 'b', vencimento: '2026-01-10', valor: 1000, status: 'pago', data: '2026-01-10' }
  /* na origem a seção se chamava "Pagamentos realizados": ausência de status = PAGO */
  const legadoSemStatus = { id: 'c', vencimento: '2026-01-10', valor: 1000 }

  it('status previsto: previsto, realizado zero', () => {
    expect(lancPago(legadoPrevisto)).toBe(false)
    expect(lancPrevisto(legadoPrevisto)).toBe(1000)
    expect(lancRealizado(legadoPrevisto)).toBe(0)
  })

  it('status pago: o mesmo valor é previsto E realizado, desvio zero', () => {
    expect(lancPago(legadoPago)).toBe(true)
    expect(lancPrevisto(legadoPago)).toBe(1000)
    expect(lancRealizado(legadoPago)).toBe(1000)
    expect(lancDesvio(legadoPago)).toBe(0)
  })

  it('SEM status conta como PAGO — lê-lo como previsto zeraria o consumo de contratos antigos', () => {
    expect(lancPago(legadoSemStatus)).toBe(true)
    expect(lancRealizado(legadoSemStatus)).toBe(1000)
  })

  it('no modelo novo o status legado é IGNORADO: quem manda é o valorPago', () => {
    /* registro híbrido: valorPrevisto gravado, mas sobrou um status antigo */
    const hibrido = { id: 'x', vencimento: '2026-01-10', valorPrevisto: 1000, status: 'pago' }
    expect(lancPago(hibrido)).toBe(false) // não há valorPago: não foi baixada
    expect(lancRealizado(hibrido)).toBe(0)
  })
})

describe('invariantes das somas', () => {
  const c: any = {
    natureza: 'DESPESA', valorTotal: 3000, valorParcela: 1000, qtdParcelas: 3,
    aditivos: [], renovacoes: [], reajustesRealizados: [], reajustes: [], recebimentos: [],
    pagamentos: [
      paga('p1', '2026-01-10', 1000, 1050), // +50 de juros
      paga('p2', '2026-02-10', 1000, 980),  // -20 de desconto
      prevista('p3', '2026-03-10', 1000),
    ],
  }

  it('soma dos previstos = valor vigente do contrato', () => {
    expect(somaLancamentos(c.pagamentos)).toBe(3000)
    expect(valorVigente(c)).toBe(3000)
  })

  it('soma dos realizados = consumo (o que alimenta o alerta de consumo)', () => {
    expect(somaLancamentosPagos(c.pagamentos)).toBe(2030)
    expect(consumo(c)).toBe(2030)
  })

  it('soma dos desvios = realizado menos previsto, só das pagas', () => {
    expect(somaDesvios(c.pagamentos)).toBe(30) // +50 -20
  })

  it('previsto e realizado são grandezas diferentes — não podem colapsar num número só', () => {
    expect(somaLancamentos(c.pagamentos)).not.toBe(somaLancamentosPagos(c.pagamentos))
  })

  it('totaisAVencer soma o PREVISTO das não pagas', () => {
    const t = totaisAVencer(c, c.pagamentos, '2026-02-20')
    expect(t.firme + t.provisorio + t.vencido).toBe(1000) // só p3
  })
})

describe('o reajuste mexe no PREVISTO e nunca no valorPago', () => {
  const c: any = {
    natureza: 'DESPESA', valorTotal: 3000, valorParcela: 1000, qtdParcelas: 3,
    aditivos: [], renovacoes: [], reajustesRealizados: [], recebimentos: [],
    reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual' }],
    pagamentos: [
      paga('p1', '2026-01-10', 1000, 1050),
      prevista('p2', '2026-02-10', 1000),
      prevista('p3', '2026-03-10', 1000),
    ],
  }

  it('reprecifica o previsto das a vencer; a paga fica intacta nos DOIS valores', () => {
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-01', percentual: 10, base: 'parcela' })
    const p = new Map(r.pagamentos.map(l => [l.id, l]))
    expect(lancPrevisto(p.get('p1')!)).toBe(1000)  // paga: previsto intacto
    expect(lancRealizado(p.get('p1')!)).toBe(1050) // e o realizado também
    expect(lancPrevisto(p.get('p2')!)).toBe(1100)
    expect(lancPrevisto(p.get('p3')!)).toBe(1100)
  })

  it('o delta do contrato fecha com a variação da soma dos previstos — e o consumo não muda', () => {
    const consumoAntes = consumo(c)
    const previstoAntes = somaLancamentos(c.pagamentos)
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-01', percentual: 10, base: 'parcela' })
    const c2 = { ...c, pagamentos: r.pagamentos, reajustesRealizados: [r.reajuste] }

    const delta = Number(r.reajuste.valorNovo) - Number(r.reajuste.valorAnterior)
    expect(delta).toBe(somaLancamentos(r.pagamentos) - previstoAntes) // 200
    expect(valorVigente(c2)).toBe(3200)
    expect(consumo(c2)).toBe(consumoAntes) // o reajuste não reescreve o passado
  })
})

describe('a baixa NÃO pode desmarcar `reajustavel`', () => {
  /* REGRESSÃO de projeto: "pago" e "não reajustável" parecem a mesma coisa e não são.
     `lancPago` já exclui a parcela da reprecificação — é fato derivado. `reajustavel`
     guarda a INTENÇÃO de nunca reajustar (parcela de entrada, sinal, valor negociado).
     Se a baixa apagasse a intenção, `pagasAlcancadas` devolveria zero para toda parcela
     paga e o alerta de diferença não cobrada sumiria sem ninguém perceber. */
  const contrato = (over: Partial<any> = {}): any => ({
    natureza: 'DESPESA', valorTotal: 2000, valorParcela: 1000, qtdParcelas: 2,
    aditivos: [], renovacoes: [], reajustesRealizados: [], reajustes: [], recebimentos: [],
    pagamentos: [
      { ...paga('p1', '2026-03-10', 1000, 1000) },   // paga, reajustável (default)
      { ...paga('p2', '2026-03-10', 1000, 1000), reajustavel: false }, // paga, jamais reajustável
    ],
    ...over,
  })

  it('parcela paga e reajustável ENTRA na diferença não cobrada', () => {
    const r = pagasAlcancadas(contrato(), '2026-03', 10)
    expect(r.quantidade).toBe(1) // só p1 — p2 não subiria nem se estivesse a vencer
    expect(r.diferenca).toBe(100)
  })

  it('se a baixa tivesse desmarcado reajustavel, o alerta seria zero — e mudo', () => {
    const corrompido = contrato({
      pagamentos: [
        { ...paga('p1', '2026-03-10', 1000, 1000), reajustavel: false },
        { ...paga('p2', '2026-03-10', 1000, 1000), reajustavel: false },
      ],
    })
    expect(pagasAlcancadas(corrompido, '2026-03', 10)).toEqual({ quantidade: 0, diferenca: 0 })
  })

  it('o reajuste já ignora a parcela paga sem precisar do flag', () => {
    const c = contrato({ pagamentos: [paga('p1', '2026-03-10', 1000, 1000), prevista('p2', '2026-04-10', 1000)] })
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-03', percentual: 10, base: 'parcela' })
    const p = new Map(r.pagamentos.map(l => [l.id, l]))
    expect(lancPrevisto(p.get('p1')!)).toBe(1000) // paga: intacta, e ela SEGUE reajustável
    expect(p.get('p1')!.reajustavel).toBeUndefined()
    expect(lancPrevisto(p.get('p2')!)).toBe(1100)
    expect(r.reajuste.parcelasReajustadas).toBe(1)
  })
})

describe('a diferença não cobrada é DERIVÁVEL — pode ser recalculada a qualquer momento', () => {
  /* O alerta de diferença não cobrada era emitido como efeito colateral da aplicação do
     reajuste e sumia na varredura seguinte. A correção o deriva do estado, e isso só é
     válido se `pagasAlcancadas` for ESTÁVEL: a parcela paga não é reprecificada, logo seu
     previsto não muda, logo a conta dá o mesmo número hoje, amanhã e daqui a um ano. */
  const contrato = (): any => ({
    natureza: 'DESPESA', valorTotal: 3000, valorParcela: 1000, qtdParcelas: 3,
    aditivos: [], renovacoes: [], reajustesRealizados: [], recebimentos: [],
    reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual' }],
    pagamentos: [
      paga('p1', '2026-02-10', 1000, 1000),   // paga e reajustável: entra na diferença
      prevista('p2', '2026-03-10', 1000),
      prevista('p3', '2026-04-10', 1000),
    ],
  })

  it('o número é o mesmo antes e depois de aplicar o reajuste', () => {
    const c = contrato()
    const antes = pagasAlcancadas(c, '2026-02', 10)
    expect(antes).toEqual({ quantidade: 1, diferenca: 100 })

    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-02', percentual: 10, base: 'parcela' })
    const depois = { ...c, pagamentos: r.pagamentos, reajustesRealizados: [r.reajuste] }

    /* recalcular sobre o contrato JÁ reajustado devolve o mesmo — é isto que permite ao
       motor reemitir o alerta em toda varredura em vez de emiti-lo uma vez e perdê-lo */
    expect(pagasAlcancadas(depois, '2026-02', 10)).toEqual(antes)
    expect(pagasAlcancadas(depois, '2026-02', 10)).toEqual(pagasAlcancadas(depois, '2026-02', 10))
  })

  it('estornar a parcela zera a diferença: o alerta some sozinho', () => {
    const c = contrato()
    const estornada = { ...c, pagamentos: [prevista('p1', '2026-02-10', 1000), ...c.pagamentos.slice(1)] }
    expect(pagasAlcancadas(estornada, '2026-02', 10)).toEqual({ quantidade: 0, diferenca: 0 })
  })
})

describe('o comprovante é metadado: nenhuma regra o lê, nenhuma regra o perde', () => {
  /* `comPrevisto` reconstrói o lançamento ao reprecificar (tira o `valor` legado). Se ele
     enumerasse campos em vez de espalhar o resto, o anexo sumiria no primeiro reajuste —
     e o usuário perderia o comprovante sem nenhum evento que explicasse. */
  const comAnexo = { ...prevista('p1', '2026-04-10', 1000), comprovante_key: 'org__abc__nota.pdf', comprovante_nome: 'nota.pdf' }
  const c: any = {
    natureza: 'DESPESA', valorTotal: 1000, valorParcela: 1000, qtdParcelas: 1,
    aditivos: [], renovacoes: [], reajustesRealizados: [], reajustes: [], recebimentos: [],
    pagamentos: [comAnexo],
  }

  it('sobrevive à reprecificação do reajuste', () => {
    const r = aplicarReajuste(c, { id: 'x', reajusteId: 'r1', competencia: '2026-03', percentual: 10, base: 'parcela' })
    const p = r.pagamentos[0]
    expect(lancPrevisto(p)).toBe(1100)              // o valor mudou
    expect(p.comprovante_key).toBe('org__abc__nota.pdf') // o anexo não
    expect(p.comprovante_nome).toBe('nota.pdf')
  })

  it('não afeta `pago`, nem soma, nem desvio', () => {
    expect(lancPago(comAnexo)).toBe(false) // anexo não baixa a parcela
    expect(somaLancamentos(c.pagamentos)).toBe(1000)
    expect(somaLancamentosPagos(c.pagamentos)).toBe(0)
    expect(lancDesvio(comAnexo)).toBe(0)
  })
})

describe('CCT_2026_0001 (fixture legada) continua somando como antes', () => {
  it('as parcelas pagas somam o consumo; o previsto inclui as projetadas', () => {
    expect(consumo(cct20260001)).toBe(210000)
    expect(somaLancamentos(cct20260001.pagamentos)).toBe(570000)
    expect(somaDesvios(cct20260001.pagamentos)).toBe(0) // legado nunca tem desvio
  })
})
