import { describe, it, expect } from 'vitest'
import { montarChecklist } from './checklist-de-ativacao'

const p = (tipo: string, extra: Record<string, unknown> = {}) => ({ tipo, mensagem: `msg ${tipo}`, ...extra }) as never

describe('checklist de ativação (opção C, PO 07/11/2026)', () => {
  it('agrupa por assunto, numa linha curta com a contagem', () => {
    const c = montarChecklist([
      p('nao-alcanca-fim', { nodeId: 'a' }), p('fim-inalcancavel'), p('inalcancavel-do-inicio', { nodeId: 'b' }),
      p('sem-saida', { nodeId: 'c' }), p('solto', { nodeId: 'd' }),
      p('atividade-incompleta', { nodeId: 'e' }), p('executor-vago', { nodeId: 'f' }),
    ])
    expect(c.grupos.map((g) => [g.titulo, g.itens.length])).toEqual([
      ['Caminhos que não chegam ao Fim', 3],
      ['Formas sem ligação', 2],
      ['Tarefas sem quem faz, prazo ou nome', 2],
    ])
    expect(c.faltam).toBe(7)
  })

  it('quem pode iniciar vai para a configuração, não para o desenho', () => {
    const c = montarChecklist([p('quem-inicia-vazio'), p('sem-saida', { nodeId: 'x' })])
    expect(c.quemIniciaOk).toBe(false)
    expect(c.quemInicia.map((x) => x.tipo)).toEqual(['quem-inicia-vazio'])
    expect(c.grupos.map((g) => g.titulo)).toEqual(['Formas sem ligação'])
    expect(c.faltam).toBe(2)
  })

  it('aviso não conta como falta e fica separado', () => {
    const c = montarChecklist([p('losango-sem-efeito', { severidade: 'aviso' }), p('sem-saida')])
    expect(c.faltam).toBe(1)
    expect(c.avisos).toHaveLength(1)
    expect(c.grupos.flatMap((g) => g.itens)).toHaveLength(1)
  })

  it('recusas do desenho livre caem no assunto certo (ex.: duas setas saindo de uma tarefa)', () => {
    const c = montarChecklist([p('saidas-multiplas'), p('ramos-sem-juncao'), p('seta-no-inicio')])
    expect(c.grupos.map((g) => [g.titulo, g.itens.length])).toEqual([['Formas sem ligação', 1], ['Escolhas e caminhos incompletos', 2]])
  })

  it('tipo desconhecido não some: cai em "Outros ajustes no desenho", por último', () => {
    const c = montarChecklist([p('algo-novo'), p('sem-saida')])
    expect(c.grupos.map((g) => g.titulo)).toEqual(['Formas sem ligação', 'Outros ajustes no desenho'])
  })

  it('sem pendências: nada falta e quem inicia está ok', () => {
    const c = montarChecklist([])
    expect(c).toMatchObject({ faltam: 0, quemIniciaOk: true, grupos: [], avisos: [] })
  })
})
