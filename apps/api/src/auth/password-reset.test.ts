import { describe, it, expect } from 'vitest'
import {
  RESET_TTL_MINUTES,
  RESET_COOLDOWN_SECONDS,
  RESPOSTA_NEUTRA,
  expiraEm,
  linkDeReset,
  podePedirDeNovo,
  tokenUtilizavel,
} from './password-reset'

/* O risco deste fluxo não é o token: é contar ao mundo quem tem conta no sistema.
   Por isso as três formas de token imprestável (inexistente, usado, vencido) precisam
   ser indistinguíveis, e a resposta da API precisa ser sempre a mesma. */

const agora = new Date('2026-07-27T12:00:00Z')
const daqui = (min: number) => new Date(agora.getTime() + min * 60_000)

describe('tokenUtilizavel', () => {
  it('aceita token novo e não usado', () => {
    expect(tokenUtilizavel({ expiresAt: daqui(30), usedAt: null }, agora)).toBe(true)
  })

  it('recusa token já usado — mesmo dentro da validade', () => {
    expect(tokenUtilizavel({ expiresAt: daqui(30), usedAt: daqui(-1) }, agora)).toBe(false)
  })

  it('recusa token vencido', () => {
    expect(tokenUtilizavel({ expiresAt: daqui(-1), usedAt: null }, agora)).toBe(false)
  })

  it('recusa token inexistente', () => {
    expect(tokenUtilizavel(null, agora)).toBe(false)
    expect(tokenUtilizavel(undefined, agora)).toBe(false)
  })

  it('no limite exato da expiração, já não vale', () => {
    expect(tokenUtilizavel({ expiresAt: agora, usedAt: null }, agora)).toBe(false)
  })
})

describe('podePedirDeNovo', () => {
  it('primeiro pedido sempre passa', () => {
    expect(podePedirDeNovo(null, agora)).toBe(true)
  })

  it('barra pedido logo em seguida (senão dá para encher a caixa de alguém)', () => {
    const há10s = new Date(agora.getTime() - 10_000)
    expect(podePedirDeNovo(há10s, agora)).toBe(false)
  })

  it('libera depois do intervalo', () => {
    const passado = new Date(agora.getTime() - RESET_COOLDOWN_SECONDS * 1000)
    expect(podePedirDeNovo(passado, agora)).toBe(true)
  })
})

describe('linkDeReset', () => {
  it('monta a URL com o token codificado', () => {
    expect(linkDeReset('https://nxt.empresa.com.br', 'abc123')).toBe('https://nxt.empresa.com.br/redefinir-senha?token=abc123')
  })

  it('não produz barra dupla quando a base termina em barra', () => {
    expect(linkDeReset('https://nxt.empresa.com.br/', 'abc')).not.toContain('br//')
  })

  it('cai no localhost quando WEB_URL não está definida', () => {
    expect(linkDeReset('', 'abc')).toBe('http://localhost:3000/redefinir-senha?token=abc')
  })

  it('escapa caractere especial do token', () => {
    expect(linkDeReset('https://x.com', 'a+b/c')).toContain('token=a%2Bb%2Fc')
  })
})

describe('expiraEm', () => {
  it('usa a janela declarada', () => {
    expect(expiraEm(agora).getTime() - agora.getTime()).toBe(RESET_TTL_MINUTES * 60_000)
  })
})

describe('RESPOSTA_NEUTRA', () => {
  it('não diz se a conta existe', () => {
    expect(RESPOSTA_NEUTRA.mensagem).toMatch(/se houver/i)
    expect(RESPOSTA_NEUTRA.mensagem).not.toMatch(/não encontrad|inexistente|inválid/i)
  })
})
