import { describe, it, expect } from 'vitest'
import { isDeliverableEmail, motivoInentregavel, explicaInentregavel } from './email-address'

/* O caso que originou isto: `admin@nxt.local` (usuário semente) recebeu aviso, o
   provedor devolveu "domínio não encontrado" e o quique caiu na caixa do remetente.
   Quique repetido custa reputação do remetente — e reputação perdida derruba o aviso
   de todo mundo. */

describe('isDeliverableEmail', () => {
  it('aceita endereço comum', () => {
    for (const e of ['rafael@gmail.com', 'nao-responda@nxt.com.br', 'a.b+tag@sub.dominio.io']) {
      expect(isDeliverableEmail(e), e).toBe(true)
    }
  })

  it('recusa o domínio semente admin@nxt.local', () => {
    expect(isDeliverableEmail('admin@nxt.local')).toBe(false)
    expect(motivoInentregavel('admin@nxt.local')).toBe('dominio-nao-roteavel')
  })

  it('recusa os demais TLDs reservados', () => {
    for (const e of ['a@x.localhost', 'a@x.internal', 'a@x.invalid', 'a@x.test', 'a@x.example']) {
      expect(isDeliverableEmail(e), e).toBe(false)
    }
  })

  it('recusa domínio de documentação', () => {
    expect(motivoInentregavel('joao@example.com')).toBe('dominio-de-exemplo')
  })

  it('recusa o que nem é endereço', () => {
    for (const e of ['', '   ', 'sem-arroba', 'a@sem-ponto', 'a b@x.com', 'a@x.com, b@y.com', null, undefined]) {
      expect(isDeliverableEmail(e as string), String(e)).toBe(false)
    }
  })

  it('não se importa com caixa alta nem espaço em volta', () => {
    expect(isDeliverableEmail('  Rafael@Gmail.COM  ')).toBe(true)
    expect(isDeliverableEmail(' ADMIN@NXT.LOCAL ')).toBe(false)
  })

  it('a explicação diz o que fazer, não só o que houve', () => {
    const m = explicaInentregavel('admin@nxt.local', 'dominio-nao-roteavel')
    expect(m).toMatch(/nunca seria entregue/i)
    expect(m).toMatch(/endereço real/i)
  })
})
