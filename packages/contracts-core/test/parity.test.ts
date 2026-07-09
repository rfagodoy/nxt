/* Teste de CARACTERIZAÇÃO: prova que o core devolve exatamente os mesmos números
   que as duas implementações anteriores (front e backend). É a rede de proteção da
   extração — se um destes testes ficar vermelho, a refatoração mudou dinheiro. */

import { describe, it, expect } from 'vitest'
import { terminoVigente, valorVigente, parcelaVigente, consumo } from '../src/derive'
import { aditivoLegado, paridade, reajusteTotalAplicado } from './fixtures'
import {
  toForm,
  terminoVigenteFront, valorVigenteFront, parcelaVigenteFront,
  terminoVigenteBack, valorVigenteBack, parcelaVigenteBack, consumoBack,
} from './legacy'

describe('paridade core × implementação antiga do BACKEND', () => {
  for (const [nome, c] of paridade) {
    it(`${nome}: término, valor, parcela e consumo idênticos`, () => {
      expect(terminoVigente(c)).toBe(terminoVigenteBack(c))
      expect(valorVigente(c)).toBe(valorVigenteBack(c))
      expect(parcelaVigente(c)).toBe(parcelaVigenteBack(c))
      expect(consumo(c)).toBe(consumoBack(c))
    })
  }
})

/* `reajuste total aplicado` sai daqui: o front tinha um BUG nesse caso, provado abaixo. */
const paridadeFront = paridade.filter(([, c]) => c !== reajusteTotalAplicado)

describe('paridade core × implementação antiga do FRONT', () => {
  for (const [nome, c] of paridadeFront) {
    it(`${nome}: término, valor e parcela idênticos`, () => {
      const v = toForm(c)
      expect(terminoVigente(v)).toBe(terminoVigenteFront(v))
      expect(valorVigente(v)).toBe(valorVigenteFront(v))
      /* o front devolvia string; o core devolve número — a comparação é do VALOR */
      expect(parcelaVigente(v)).toBe(parseFloat(parcelaVigenteFront(v)) || 0)
    })
  }
})

describe('BUG do front corrigido pela extração: reajuste base `total` zerava a parcela vigente', () => {
  /* Um reajuste base 'total' grava parcelaNova = 0. O front filtrava com `r.parcelaNova`
     — e a STRING '0' é truthy —, então o evento entrava na lista e, no laço seguinte,
     `if (e.val)` também aceitava '0', fixando a parcela vigente em zero. O backend
     filtrava com `Number(r.parcelaNova)` e escapava. Resultado: a tela de detalhe mostrava
     parcela 0 enquanto a listagem mostrava a parcela correta. O core adota a semântica
     numérica — a única que faz sentido. */
  const v = toForm(reajusteTotalAplicado)

  it('o front devolvia 0', () => {
    expect(reajusteTotalAplicado.reajustesRealizados[0].parcelaNova).toBe(0)
    expect(parseFloat(parcelaVigenteFront(v)) || 0).toBe(0)
  })

  it('o backend devolvia a parcela correta', () => {
    expect(parcelaVigenteBack(reajusteTotalAplicado)).toBe(1000)
  })

  it('o core devolve a parcela correta, nos dois formatos', () => {
    expect(parcelaVigente(v)).toBe(1000)
    expect(parcelaVigente(reajusteTotalAplicado)).toBe(1000)
  })

  it('término e valor sempre bateram — a divergência era só na parcela', () => {
    expect(terminoVigente(v)).toBe(terminoVigenteFront(v))
    expect(valorVigente(v)).toBe(valorVigenteFront(v))
  })
})

describe('divergência conhecida: aditivo legado sem `situacao`', () => {
  /* O front (`=== 'ATIVO'`) ignorava o aditivo; o backend (`!== 'RASCUNHO'`) aplicava.
     O core adota a semântica do backend — e é a correta, porque `contractFromApi`
     normaliza `situacao` ausente para 'ATIVO' antes de o front ver o dado. Ou seja:
     no caminho real (API → front) a divergência nunca era observável. */
  it('core aplica o aditivo, como o backend sempre fez', () => {
    expect(valorVigente(aditivoLegado)).toBe(valorVigenteBack(aditivoLegado))
    expect(valorVigente(aditivoLegado)).toBe(17000) // 12000 + 5000
    expect(parcelaVigente(aditivoLegado)).toBe(1200)
  })

  it('o front CRU discordava — e é essa a divergência que a extração elimina', () => {
    const cruParaOFront = { ...aditivoLegado } // sem passar por contractFromApi
    expect(valorVigenteFront(cruParaOFront)).toBe(12000) // ignorava o aditivo
    expect(valorVigente(cruParaOFront)).toBe(17000)
  })

  it('passando por contractFromApi (toForm), os dois concordam', () => {
    const v = toForm(aditivoLegado)
    expect(valorVigenteFront(v)).toBe(17000)
    expect(valorVigente(v)).toBe(17000)
  })
})

describe('CCT_2026_0001 — os números que o usuário vê hoje', () => {
  const c = paridade[0][1]
  it('vigência estendida pelas 6 renovações automáticas', () => {
    expect(c.terminoVigencia).toBe('2020-07-22')
    expect(terminoVigente(c)).toBe('2026-07-22')
  })
  it('valor vigente = total original + 6 × valorPeriodo', () => {
    expect(valorVigente(c)).toBe(210000 + 6 * 60000)
  })
  it('parcela vigente permanece a original: não há reajuste aplicado', () => {
    expect(c.reajustes).toEqual([])
    expect(parcelaVigente(c)).toBe(5000)
  })
})
