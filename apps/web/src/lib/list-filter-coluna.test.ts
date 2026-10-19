import { describe, expect, it } from 'vitest'
import { aplicarFiltroColuna, colunaContem, formasVisiveis } from './list-filter'

describe('filtro na coluna — casa com o que a célula MOSTRA', () => {
  it('data ISO também vale como dd/mm/aaaa', () => {
    expect(formasVisiveis('2026-03-15')).toContain('15/03/2026')
    expect(colunaContem('2026-03-15', '15/03')).toBe(true)
  })
  it('número também vale com milhar pt-BR', () => {
    expect(colunaContem('120000', '120.000')).toBe(true)
    expect(colunaContem('1500', '120.000')).toBe(false)
  })
  it('sem acento e sem caixa; vazio não filtra', () => {
    expect(colunaContem('Gerência de Suprimentos', 'gerencia')).toBe(true)
    expect(colunaContem('qualquer', '   ')).toBe(true)
  })
  it('várias colunas somam em E', () => {
    const linhas = [{ n: 'Ana', s: 'Ativo' }, { n: 'Ana', s: 'Inativo' }, { n: 'Caio', s: 'Ativo' }]
    const cols = [{ key: 'n', label: 'Nome', get: (r: typeof linhas[number]) => r.n }, { key: 's', label: 'Situação', get: (r: typeof linhas[number]) => r.s }]
    expect(aplicarFiltroColuna(linhas, cols, [{ col: 'n', value: 'ana' }, { col: 's', value: 'ativo' }])).toHaveLength(2) // "ativo" está em "Inativo" também
    expect(aplicarFiltroColuna(linhas, cols, [{ col: 'n', value: 'ana' }, { col: 's', value: 'inat' }])).toEqual([{ n: 'Ana', s: 'Inativo' }])
  })
})
