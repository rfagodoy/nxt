import { describe, it, expect } from 'vitest'
import { chaveDoCampo, chaveDaSecao, catalogoCanonico, chavesRemovidas } from './custom-catalog'

const d = (iso: string) => new Date(iso)
const linha = (o: Partial<{ id: string; fieldKey: string | null; source: string; updatedAt: Date }> = {}) => ({
  id: 'x', fieldKey: null as string | null, source: 'CUSTOM', updatedAt: d('2026-01-01'), ...o,
})

describe('chaveDoCampo', () => {
  it('usa a fieldKey quando existe', () => {
    expect(chaveDoCampo({ id: 'linha_2', fieldKey: 'fld_1' })).toBe('fld_1')
  })

  it('cai no id quando a linha é anterior ao backfill', () => {
    expect(chaveDoCampo({ id: 'fld_1' })).toBe('fld_1')
    expect(chaveDoCampo({ id: 'fld_1', fieldKey: null })).toBe('fld_1')
  })

  it('linha antiga e espelho da MESMA origem respondem pela mesma chave', () => {
    const origem  = { id: 'fld_1', fieldKey: 'fld_1' }
    const espelho = { id: 'linha_9', fieldKey: 'fld_1' }
    expect(chaveDoCampo(origem)).toBe(chaveDoCampo(espelho))
  })
})

describe('catalogoCanonico', () => {
  it('elege a linha de ORIGEM (id === chave), mesmo se outra foi alterada depois', () => {
    const origem  = linha({ id: 'fld_1', fieldKey: 'fld_1', updatedAt: d('2026-01-01') })
    const espelho = linha({ id: 'linha_9', fieldKey: 'fld_1', updatedAt: d('2026-06-01') })
    expect(catalogoCanonico([espelho, origem]).get('fld_1')).toBe(origem)
    expect(catalogoCanonico([origem, espelho]).get('fld_1')).toBe(origem)
  })

  it('sem a origem (tela apagada), vale a alteração mais recente', () => {
    const a = linha({ id: 'linha_1', fieldKey: 'fld_1', updatedAt: d('2026-02-01') })
    const b = linha({ id: 'linha_2', fieldKey: 'fld_1', updatedAt: d('2026-05-01') })
    expect(catalogoCanonico([a, b]).get('fld_1')).toBe(b)
    expect(catalogoCanonico([b, a]).get('fld_1')).toBe(b)
  })

  it('ignora campo NATIVO — a definição dele é do sistema', () => {
    const nativo = linha({ id: 'n1', fieldKey: 'n1', source: 'NATIVE' })
    expect(catalogoCanonico([nativo]).size).toBe(0)
  })

  it('uma entrada por CAMPO, não por linha', () => {
    const linhas = [
      linha({ id: 'fld_1', fieldKey: 'fld_1' }),
      linha({ id: 'l2', fieldKey: 'fld_1' }),
      linha({ id: 'l3', fieldKey: 'fld_1' }),
      linha({ id: 'fld_2', fieldKey: 'fld_2' }),
    ]
    expect([...catalogoCanonico(linhas).keys()].sort()).toEqual(['fld_1', 'fld_2'])
  })
})

describe('chavesRemovidas', () => {
  it('acusa o campo que saiu do payload', () => {
    const antes  = [{ id: 'fld_1', fieldKey: 'fld_1' }, { id: 'l2', fieldKey: 'fld_2' }]
    const depois = [{ id: 'fld_1', fieldKey: 'fld_1', source: 'CUSTOM' }]
    expect(chavesRemovidas(antes, depois)).toEqual(['fld_2'])
  })

  it('trocar de linha (mesmo campo, outro id) NÃO é remoção', () => {
    const antes  = [{ id: 'l7', fieldKey: 'fld_1' }]
    const depois = [{ id: 'l8', fieldKey: 'fld_1', source: 'CUSTOM' }]
    expect(chavesRemovidas(antes, depois)).toEqual([])
  })

  it('ocultar não é remover: o campo continua no payload', () => {
    const antes  = [{ id: 'fld_1', fieldKey: 'fld_1' }]
    const depois = [{ id: 'fld_1', fieldKey: 'fld_1', source: 'CUSTOM' }]
    expect(chavesRemovidas(antes, depois)).toEqual([])
  })

  it('não conta campo nativo do payload como sobrevivente de um custom homônimo', () => {
    const antes  = [{ id: 'fld_1', fieldKey: 'fld_1' }]
    const depois = [{ id: 'fld_1', fieldKey: 'fld_1', source: 'NATIVE' }]
    expect(chavesRemovidas(antes, depois)).toEqual(['fld_1'])
  })

  it('nada a remover quando a tela não tinha campo personalizado', () => {
    expect(chavesRemovidas([], [{ id: 'fld_1', fieldKey: 'fld_1', source: 'CUSTOM' }])).toEqual([])
  })
})

describe('chaveDaSecao', () => {
  it('seção nativa responde pela nativeKey — a mesma em todas as telas do tipo', () => {
    const naTelaA = { id: 'nsec_contrato_dados_gerais', nativeKey: 'dados_gerais' }
    const naTelaB = { id: 'cm_outra_linha',             nativeKey: 'dados_gerais' }
    expect(chaveDaSecao(naTelaA)).toBe('dados_gerais')
    expect(chaveDaSecao(naTelaA)).toBe(chaveDaSecao(naTelaB))
  })

  it('seção personalizada responde pelo próprio id', () => {
    expect(chaveDaSecao({ id: 'ss_1788', nativeKey: null })).toBe('ss_1788')
    expect(chaveDaSecao({ id: 'ss_1788' })).toBe('ss_1788')
  })
})
