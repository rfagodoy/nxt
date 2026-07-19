import { describe, it, expect } from 'vitest'
import {
  asNum,
  asStr,
  resolveContractId,
  resolvePartnerId,
  aditivoFromVars,
  applyInputMap,
} from './connector-helpers'

describe('coerções de variável', () => {
  it('asStr trata vazio/nulo como undefined', () => {
    expect(asStr('')).toBeUndefined()
    expect(asStr(null)).toBeUndefined()
    expect(asStr(undefined)).toBeUndefined()
    expect(asStr('  x')).toBe('  x')
    expect(asStr(123)).toBe('123')
  })

  it('asNum: vazio NÃO é zero; não-número vira undefined', () => {
    expect(asNum('')).toBeUndefined()
    expect(asNum(null)).toBeUndefined()
    expect(asNum('abc')).toBeUndefined()
    expect(asNum('1000')).toBe(1000)
    expect(asNum(0)).toBe(0)
    expect(asNum('12.5')).toBe(12.5)
  })
})

describe('resolução do id-alvo', () => {
  it('contrato aceita os aliases mais prováveis', () => {
    expect(resolveContractId({ contratoId: 'c1' })).toBe('c1')
    expect(resolveContractId({ contractId: 'c2' })).toBe('c2')
    expect(resolveContractId({ contrato_id: 'c3' })).toBe('c3')
    expect(resolveContractId({})).toBeUndefined()
  })
  it('parceiro aceita os aliases mais prováveis', () => {
    expect(resolvePartnerId({ partnerId: 'p1' })).toBe('p1')
    expect(resolvePartnerId({ parceiroId: 'p2' })).toBe('p2')
    expect(resolvePartnerId({})).toBeUndefined()
  })
})

describe('applyInputMap (re-liga variável → nome esperado)', () => {
  it('sem mapa, devolve as variáveis inalteradas', () => {
    const vars = { contrato_escolhido: 'c1' }
    expect(applyInputMap(undefined, vars)).toBe(vars)
  })

  it('copia a variável de origem para o nome de convenção do conector', () => {
    const vars = { contrato_escolhido: 'c1', valor_extra: 5000 }
    const out = applyInputMap({ contratoId: 'contrato_escolhido', aditivoAcrescimoValor: 'valor_extra' }, vars)
    expect(out.contratoId).toBe('c1')
    expect(out.aditivoAcrescimoValor).toBe(5000)
    // e a resolução por convenção passa a enxergar o alvo
    expect(resolveContractId(out)).toBe('c1')
    expect(aditivoFromVars(out, 'x', '2026-07-19').novoValor).toBe(5000)
  })

  it('entrada mapeada para variável inexistente é ignorada (não sobrescreve com undefined)', () => {
    const out = applyInputMap({ contratoId: 'nao_existe' }, { contratoId: 'ja_tenho' })
    expect(out.contratoId).toBe('ja_tenho')
  })

  it('não muta o objeto original', () => {
    const vars: Record<string, unknown> = { v: '1' }
    const out = applyInputMap({ contratoId: 'v' }, vars)
    expect(out).not.toBe(vars)
    expect(out.contratoId).toBe('1')
    expect('contratoId' in vars).toBe(false)
  })
})

describe('aditivoFromVars', () => {
  const ID = 'adit_fixo'
  const HOJE = '2026-07-19'

  it('nasce ATIVO com id/data injetados quando nada muda', () => {
    const a = aditivoFromVars({}, ID, HOJE)
    expect(a).toEqual({ id: ID, situacao: 'ATIVO', data: HOJE })
  })

  it('prorrogação: novo término liga alteraTermino', () => {
    const a = aditivoFromVars({ aditivoNovoTermino: '2027-12-31' }, ID, HOJE)
    expect(a.alteraTermino).toBe(true)
    expect(a.novoTermino).toBe('2027-12-31')
    expect(a.alteraValor).toBeUndefined()
  })

  it('valor: acréscimo liga alteraValor (delta somado); parcela absoluta acompanha', () => {
    const a = aditivoFromVars({ aditivoAcrescimoValor: '15000', aditivoNovaParcela: '1250' }, ID, HOJE)
    expect(a.alteraValor).toBe(true)
    expect(a.novoValor).toBe(15000) // delta: valorVigente += 15000
    expect(a.novaParcela).toBe(1250)
  })

  it('alias aditivoNovoValor ainda funciona (mesma semântica de acréscimo)', () => {
    const a = aditivoFromVars({ aditivoNovoValor: '5000' }, ID, HOJE)
    expect(a.alteraValor).toBe(true)
    expect(a.novoValor).toBe(5000)
  })

  it('valor vazio NÃO cria efeito (não vira 0)', () => {
    const a = aditivoFromVars({ aditivoAcrescimoValor: '' }, ID, HOJE)
    expect(a.alteraValor).toBeUndefined()
    expect(a.novoValor).toBeUndefined()
  })

  it('numero e RASCUNHO explícito são respeitados; aliases curtos funcionam', () => {
    const a = aditivoFromVars(
      { numeroAditivo: '1', aditivoSituacao: 'rascunho', novoTermino: '2028-01-01' },
      ID,
      HOJE,
    )
    expect(a.numero).toBe('1')
    expect(a.situacao).toBe('RASCUNHO')
    expect(a.novoTermino).toBe('2028-01-01')
  })
})
