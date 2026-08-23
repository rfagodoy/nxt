import { describe, it, expect } from 'vitest'
import { validarDesenho, validarDecisoes, validarAtividades, formatarProblemas } from '../src/activation-guard'
import type { ProblemaAtivacao } from '../src/activation-guard'

const g = (edges: Array<{ from: string; condition?: string; isDefault?: boolean }>) =>
  validarDecisoes([{ id: 'g1', type: 'exclusiveGateway', name: 'Necessita de parecer?' }], edges)

describe('validarDecisoes', () => {
  it('aprova: uma padrão + demais com condição', () => {
    expect(g([
      { from: 'g1', condition: "contrato.x == 'Sim'" },
      { from: 'g1', isDefault: true },
    ])).toEqual([])
  })
  it('recusa sem saída padrão, nomeando o losango e apontando o nó', () => {
    const [p] = g([
      { from: 'g1', condition: "a == 'x'" },
      { from: 'g1', condition: "a == 'y'" },
    ])
    expect(p.mensagem).toMatch(/Necessita de parecer\?.*sem filtros/)
    expect(p.nodeId).toBe('g1')
    expect(p.tipo).toBe('decisao-sem-padrao')
  })
  it('recusa duas padrão', () => {
    expect(g([
      { from: 'g1', isDefault: true },
      { from: 'g1', isDefault: true },
    ])[0].mensagem).toMatch(/2 caminhos/)
  })
  it('recusa saída sem condição que não é a padrão', () => {
    expect(g([
      { from: 'g1', condition: '' },
      { from: 'g1', isDefault: true },
    ])[0].mensagem).toMatch(/sem filtros que não é/)
  })
  it('losango com UMA saída não exige nada (passagem)', () => {
    expect(g([{ from: 'g1' }])).toEqual([])
  })
  it('gateway paralelo fica de fora', () => {
    expect(validarDecisoes(
      [{ id: 'p1', type: 'parallelGateway' }],
      [{ from: 'p1' }, { from: 'p1' }],
    )).toEqual([])
  })
  it('devolve TODOS os losangos com problema, não só o primeiro', () => {
    const problemas = validarDecisoes(
      [
        { id: 'g1', type: 'exclusiveGateway', name: 'Um?' },
        { id: 'g2', type: 'exclusiveGateway', name: 'Dois?' },
      ],
      [
        { from: 'g1', condition: 'a == 1' }, { from: 'g1', condition: 'a == 2' },
        { from: 'g2', condition: 'b == 1' }, { from: 'g2', condition: 'b == 2' },
      ],
    )
    expect(problemas).toHaveLength(2)
  })
})

describe('validarDesenho — mensagens com nome, sem id interno', () => {
  const nos = [
    { id: 'Start_1', type: 'start', name: 'Início' },
    { id: 'Node_4rfpntj', type: 'userTask', name: 'Realizar validação do RH' },
    { id: 'End_1', type: 'end', name: 'Fim' },
  ]
  it('desenho conectado passa', () => {
    expect(validarDesenho(nos, [
      { from: 'Start_1', to: 'Node_4rfpntj' },
      { from: 'Node_4rfpntj', to: 'End_1' },
    ])).toEqual([])
  })
  it('atividade sem saída: nomeia, diz como resolver e aponta o nó (o caso do print do PO)', () => {
    const [p] = validarDesenho(nos, [{ from: 'Start_1', to: 'Node_4rfpntj' }])
    expect(p.mensagem).toContain('"Realizar validação do RH"')
    expect(p.mensagem).toContain('Ligue a saída dela')
    expect(p.mensagem).not.toContain('Node_4rfpntj')
    expect(p.mensagem).not.toContain('userTask')
    expect(p.nodeId).toBe('Node_4rfpntj')
  })
  it('atividade solta (sem chegada nem saída) gera UMA mensagem, de exclusão/conexão', () => {
    const problemas = validarDesenho(nos, [{ from: 'Start_1', to: 'End_1' }])
    expect(problemas).toHaveLength(1)
    expect(problemas[0].mensagem).toMatch(/solta no desenho.*exclua/)
  })
  it('início desligado e fim inalcançável têm mensagens próprias', () => {
    const problemas = validarDesenho(nos, [])
    expect(problemas.some((p) => p.tipo === 'inicio-desligado')).toBe(true)
    expect(problemas.some((p) => p.tipo === 'fim-inalcancavel')).toBe(true)
  })
  it('ação automática e decisão ganham o artigo certo', () => {
    const [p1] = validarDesenho(
      [{ id: 's1', type: 'serviceTask', name: 'Gerar contrato' }],
      [{ from: 'x', to: 's1' }],
    )
    expect(p1.mensagem).toContain('A ação automática "Gerar contrato"')
    const [p2] = validarDesenho(
      [{ id: 'g1', type: 'exclusiveGateway', name: 'Aprovado?' }],
      [{ from: 'x', to: 'g1' }],
    )
    expect(p2.mensagem).toContain('A decisão "Aprovado?"')
    expect(p2.mensagem).toContain('caminhos que ela deve abrir')
    expect(p2.tipo).toBe('gateway-sem-saida')
  })
  it('atividade sem nome não vira id: "Uma atividade sem nome"', () => {
    const [p] = validarDesenho(
      [{ id: 'Node_zzz', type: 'userTask' }],
      [{ from: 'x', to: 'Node_zzz' }],
    )
    expect(p.mensagem).toContain('Uma atividade sem nome')
    expect(p.mensagem).not.toContain('Node_zzz')
  })
})

describe('validarAtividades — o que falta, por atividade', () => {
  it('completa passa', () => {
    expect(validarAtividades([
      { stepName: 'Aprovar', executor: { papelId: 'p1' }, slaBusinessDays: 2 },
    ])).toEqual([])
  })
  it('lista o que falta em linguagem natural, apontando o nó', () => {
    const [p] = validarAtividades([{ stepId: 'n1', stepName: 'Aprovar', executor: null }])
    expect(p.mensagem).toBe('A atividade "Aprovar" está sem executor (papel) e prazo. Clique nela e complete a configuração.')
    expect(p.nodeId).toBe('n1')
    expect(p.rotulo).toBe('"Aprovar" — sem executor (papel) e prazo')
  })
  it('sem nome: mensagem não quebra e pede o nome', () => {
    const [p] = validarAtividades([{ executor: { papelId: 'p1' }, slaBusinessHours: 4 }])
    expect(p.mensagem).toContain('Uma atividade está sem nome')
  })
})

describe('formatarProblemas — agregação por tipo', () => {
  const prob = (tipo: ProblemaAtivacao['tipo'], rotulo: string, mensagem = `msg de ${rotulo}`): ProblemaAtivacao =>
    ({ tipo, rotulo, mensagem })

  it('um problema vai direto, sem cabeçalho', () => {
    expect(formatarProblemas([prob('sem-saida', '"A"', 'Só isso.')])).toBe('Só isso.')
  })
  it('grupo de 1 mantém a mensagem completa; grupo de 2+ agrega com contagem e instrução única', () => {
    const msg = formatarProblemas([
      prob('sem-saida', '"A"'), prob('sem-saida', '"B"'),
      prob('decisao-sem-padrao', '"Aprovado?"'),
    ])
    expect(msg).toContain('Ajuste os pontos abaixo')
    expect(msg).toContain('• 2 atividades não levam a lugar nenhum: "A" e "B". Ligue a saída de cada uma')
    // grupo de 1 preserva a frase própria (não vira "1 decisões...")
    expect(msg).toContain('• msg de "Aprovado?"')
  })
  it('nomes repetidos ganham contagem em vez de repetir a linha', () => {
    const msg = formatarProblemas([
      prob('decisao-sem-padrao', '"Possui erros?"'), prob('decisao-sem-padrao', '"Possui erros?"'),
      prob('decisao-sem-padrao', '"Possui erros?"'), prob('decisao-sem-padrao', '"Existem dúvidas?"'),
    ])
    expect(msg).toContain('4 decisões estão sem o caminho "caso contrário": "Possui erros?" (3) e "Existem dúvidas?".')
  })
  it('singulares por natureza (início/fim) sempre usam a própria mensagem', () => {
    const msg = formatarProblemas([
      { tipo: 'fim-inalcancavel', mensagem: 'Nenhum caminho chega ao evento de fim — o processo nunca terminaria. Ligue a última atividade a ele.' },
      prob('sem-saida', '"A"'), prob('sem-saida', '"B"'),
    ])
    expect(msg).toContain('• Nenhum caminho chega ao evento de fim')
  })
})
