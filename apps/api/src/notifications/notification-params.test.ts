import { describe, it, expect } from 'vitest'
import { tarefasParams, DEFAULT_TAREFAS } from './notification-params'

/* O bloco `tarefas` chega do AppSetting, que é editado por uma tela e pode vir de
   uma versão anterior (sem o bloco) ou com lixo. A varredura de prazos roda a cada
   5 minutos: um valor inválido aqui viraria aviso repetido ou aviso nenhum. */
describe('tarefasParams', () => {
  it('usa o padrão quando o bloco não existe', () => {
    expect(tarefasParams(null)).toEqual(DEFAULT_TAREFAS)
    expect(tarefasParams({})).toEqual(DEFAULT_TAREFAS)
    expect(tarefasParams({ vigencia: { enabled: true } })).toEqual(DEFAULT_TAREFAS)
  })

  it('respeita valores configurados', () => {
    expect(tarefasParams({ tarefas: { enabled: false, antecedenciaHoras: 4 } }))
      .toEqual({ enabled: false, antecedenciaHoras: 4 })
  })

  it('rejeita antecedência inválida e cai no padrão', () => {
    for (const h of [0, -3, Number.NaN, 'muitas' as unknown as number, null as unknown as number]) {
      expect(tarefasParams({ tarefas: { enabled: true, antecedenciaHoras: h } }).antecedenciaHoras)
        .toBe(DEFAULT_TAREFAS.antecedenciaHoras)
    }
  })

  it('desligar o aviso preventivo não mexe na antecedência gravada', () => {
    expect(tarefasParams({ tarefas: { enabled: false, antecedenciaHoras: 48 } }))
      .toEqual({ enabled: false, antecedenciaHoras: 48 })
  })
})
