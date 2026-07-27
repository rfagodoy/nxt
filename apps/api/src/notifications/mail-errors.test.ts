import { describe, it, expect } from 'vitest'
import { humanizeMailError } from './mailer.service'

/* "getaddrinfo ENOTFOUND smtp.x" e "535 5.7.8" não dizem a ninguém o que fazer.
   Quem configura e-mail erra sempre nos mesmos quatro pontos — endereço, porta,
   criptografia e senha de aplicativo — e a mensagem tem de apontar para o ponto. */

const erro = (props: Record<string, unknown>) => Object.assign(new Error(String(props.message ?? 'falhou')), props)

describe('humanizeMailError', () => {
  it('DNS: aponta o endereço', () => {
    const m = humanizeMailError(erro({ code: 'EDNS', message: 'getaddrinfo ENOTFOUND smtp.errado.local' }))
    expect(m).toMatch(/não encontrado/i)
    expect(m).toMatch(/endereço/i)
  })

  it('autenticação: fala de senha de aplicativo', () => {
    expect(humanizeMailError(erro({ code: 'EAUTH', message: '535 5.7.8 Username and Password not accepted' })))
      .toMatch(/senha de aplicativo/i)
  })

  it('autenticação: anexa a resposta crua do servidor (é ela que diagnostica)', () => {
    const m = humanizeMailError(erro({ code: 'EAUTH', message: 'Invalid login', response: '535 5.7.3 Authentication unsuccessful' }))
    expect(m).toMatch(/Resposta do servidor: 535 5\.7\.3/)
  })

  it('autenticação básica desligada não vira "senha errada" — senha de aplicativo NÃO resolve', () => {
    const m = humanizeMailError(erro({
      code: 'EAUTH',
      message: 'Invalid login',
      response: '535 5.7.139 Authentication unsuccessful, basic authentication is disabled',
    }))
    expect(m).toMatch(/autenticação básica/i)
    expect(m).toMatch(/não resolve/i)
    expect(m).toMatch(/5\.7\.139/)
  })

  it('tempo esgotado: fala de porta, criptografia e firewall', () => {
    const m = humanizeMailError(erro({ code: 'ETIMEDOUT' }))
    expect(m).toMatch(/porta/i)
    expect(m).toMatch(/firewall/i)
  })

  it('certificado: aponta a opção de autoassinado', () => {
    expect(humanizeMailError(erro({ message: 'self signed certificate in certificate chain' })))
      .toMatch(/autoassinado/i)
  })

  it('conexão recusada: endereço e porta', () => {
    expect(humanizeMailError(erro({ code: 'ECONNREFUSED' }))).toMatch(/porta/i)
  })

  it('remetente recusado: aponta o remetente', () => {
    expect(humanizeMailError(erro({ code: 'EENVELOPE' }))).toMatch(/remetente/i)
  })

  it('erro desconhecido não some — devolve a mensagem original', () => {
    expect(humanizeMailError(erro({ message: 'algo muito específico do provedor' })))
      .toBe('algo muito específico do provedor')
  })
})
