import { describe, it, expect } from 'vitest'
import { SITUACOES_EXIBIVEIS } from '@nxt/contracts-core'
import { SITUACOES } from './contract-options'
import { SIT_LABEL, SIT_CLS } from './contract-situacao'

/* Este teste existe por causa de um bug real: `CANCELADO` nasceu no motor de
   processos e foi esquecido no filtro da listagem, no card de resumo e no rótulo da
   auditoria — três lugares, todos silenciosos. O contrato cancelado aparecia na
   tabela, entrava no Total e não se encaixava em nenhuma categoria; a soma dos cards
   não fechava e não havia como isolá-lo.
   Situação nova no core agora QUEBRA o teste em vez de sumir da tela. */

describe('cobertura das situações de contrato', () => {
  it('o filtro da listagem cobre todas as situações exibíveis', () => {
    const noFiltro = new Set(SITUACOES.map((s) => s.value))
    const faltando = SITUACOES_EXIBIVEIS.filter((s) => !noFiltro.has(s))
    expect(faltando, `situações sem opção de filtro: ${faltando.join(', ')}`).toEqual([])
  })

  it('toda situação exibível tem rótulo em português', () => {
    const semRotulo = SITUACOES_EXIBIVEIS.filter((s) => !SIT_LABEL[s])
    expect(semRotulo, `situações sem rótulo: ${semRotulo.join(', ')}`).toEqual([])
  })

  it('toda situação exibível tem cor de etiqueta', () => {
    const semCor = SITUACOES_EXIBIVEIS.filter((s) => !SIT_CLS[s])
    expect(semCor, `situações sem cor: ${semCor.join(', ')}`).toEqual([])
  })

  it('o filtro não inventa situação que o core desconhece', () => {
    const conhecidas = new Set<string>(SITUACOES_EXIBIVEIS)
    const intrusas = SITUACOES.map((s) => s.value).filter((v) => !conhecidas.has(v))
    expect(intrusas, `situações que não existem no core: ${intrusas.join(', ')}`).toEqual([])
  })
})
