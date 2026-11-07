import { describe, it, expect } from 'vitest'
import { consultaDeSelecionaveis, LIMITE_PADRAO, LIMITE_MAXIMO } from './usuarios-selecionaveis'

/* O seletor de pessoas busca no servidor (centenas de usuários por organização, PO 07/11/2026):
   nada de baixar a lista inteira. */

const ORG = 'org1'

describe('consultaDeSelecionaveis — busca', () => {
  it('sem termo: só ativos da organização, por nome, até o limite padrão', () => {
    expect(consultaDeSelecionaveis(ORG, {})).toEqual({
      where: { organizationId: ORG, status: 'ATIVO' },
      orderBy: { name: 'asc' },
      take: LIMITE_PADRAO,
    })
  })

  it('com termo: procura no nome OU no e-mail, sem espaços nas pontas', () => {
    expect(consultaDeSelecionaveis(ORG, { q: '  pmoura ' }).where).toEqual({
      organizationId: ORG, status: 'ATIVO',
      OR: [{ name: { contains: 'pmoura' } }, { email: { contains: 'pmoura' } }],
    })
  })

  it('termo só de espaços conta como sem termo', () => {
    expect(consultaDeSelecionaveis(ORG, { q: '   ' }).where).toEqual({ organizationId: ORG, status: 'ATIVO' })
  })

  it('limite pedido vale, mas não passa do máximo nem fica abaixo de 1', () => {
    expect(consultaDeSelecionaveis(ORG, { limit: '5' }).take).toBe(5)
    expect(consultaDeSelecionaveis(ORG, { limit: '100000' }).take).toBe(LIMITE_MAXIMO)
    expect(consultaDeSelecionaveis(ORG, { limit: '0' }).take).toBe(LIMITE_PADRAO)
    expect(consultaDeSelecionaveis(ORG, { limit: 'abc' }).take).toBe(LIMITE_PADRAO)
  })
})

describe('consultaDeSelecionaveis — por ids (nomes de quem já está escolhido)', () => {
  it('traz exatamente os ids pedidos, ativos e da organização, sem o limite da busca', () => {
    const c = consultaDeSelecionaveis(ORG, { ids: 'u1,u2, u3 ,,u1' })
    expect(c.where).toEqual({ organizationId: ORG, status: 'ATIVO', id: { in: ['u1', 'u2', 'u3'] } })
    expect(c.take).toBe(3)
  })

  it('ids tem prioridade sobre o termo', () => {
    expect(consultaDeSelecionaveis(ORG, { ids: 'u1', q: 'ana' }).where).toEqual({ organizationId: ORG, status: 'ATIVO', id: { in: ['u1'] } })
  })

  it('não aceita uma lista gigante de ids', () => {
    const muitos = Array.from({ length: 1000 }, (_, i) => `u${i}`).join(',')
    expect((consultaDeSelecionaveis(ORG, { ids: muitos }).where as { id: { in: string[] } }).id.in).toHaveLength(LIMITE_MAXIMO)
  })
})
