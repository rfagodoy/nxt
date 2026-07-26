import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptSecret, decryptSecret, canEncrypt } from './secret-box'

/* A senha do SMTP é o único segredo que o sistema precisa devolver em texto claro
   (hash não serve: o servidor tem de apresentá-la ao provedor). Estes testes cobrem
   o que não pode falhar em silêncio — decifrar errado e mandar e-mail com senha
   inválida seria pior do que não enviar. */

const ORIG = { key: process.env.MAIL_ENCRYPTION_KEY, jwt: process.env.AUTH_JWT_SECRET }

beforeEach(() => {
  process.env.MAIL_ENCRYPTION_KEY = 'chave-de-teste-com-tamanho-suficiente'
  delete process.env.AUTH_JWT_SECRET
})
afterEach(() => {
  process.env.MAIL_ENCRYPTION_KEY = ORIG.key
  process.env.AUTH_JWT_SECRET = ORIG.jwt
})

describe('secret-box', () => {
  it('ida e volta devolve a senha original', () => {
    const senha = 'S3nh4-do-SMTP!'
    expect(decryptSecret(encryptSecret(senha))).toBe(senha)
  })

  it('o valor cifrado não contém a senha em claro', () => {
    const cifrado = encryptSecret('minha-senha-secreta')
    expect(cifrado).not.toContain('minha-senha-secreta')
    expect(cifrado.startsWith('v1:')).toBe(true)
  })

  it('cada cifragem é diferente (iv aleatório), mas ambas decifram', () => {
    const a = encryptSecret('igual')
    const b = encryptSecret('igual')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('igual')
    expect(decryptSecret(b)).toBe('igual')
  })

  it('valor ADULTERADO não decifra (GCM autentica)', () => {
    const cifrado = encryptSecret('original')
    const partes = cifrado.split(':')
    partes[3] = Buffer.from('outra coisa').toString('base64')
    expect(decryptSecret(partes.join(':'))).toBeNull()
  })

  it('chave TROCADA não decifra — e não devolve lixo', () => {
    const cifrado = encryptSecret('original')
    process.env.MAIL_ENCRYPTION_KEY = 'uma-chave-completamente-diferente-1'
    expect(decryptSecret(cifrado)).toBeNull()
  })

  it('formato desconhecido ou vazio devolve null', () => {
    expect(decryptSecret('')).toBeNull()
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret('texto-cru')).toBeNull()
    expect(decryptSecret('v9:a:b:c')).toBeNull()
  })

  it('sem chave no ambiente, não cifra e avisa', () => {
    delete process.env.MAIL_ENCRYPTION_KEY
    expect(canEncrypt()).toBe(false)
    expect(() => encryptSecret('x')).toThrow(/chave de criptografia/i)
  })

  it('cai no segredo do JWT quando não há chave dedicada', () => {
    delete process.env.MAIL_ENCRYPTION_KEY
    process.env.AUTH_JWT_SECRET = 'segredo-jwt-de-tamanho-suficiente'
    expect(canEncrypt()).toBe(true)
    expect(decryptSecret(encryptSecret('via-jwt'))).toBe('via-jwt')
  })

  it('chave curta demais não conta como chave', () => {
    process.env.MAIL_ENCRYPTION_KEY = 'curta'
    delete process.env.AUTH_JWT_SECRET
    expect(canEncrypt()).toBe(false)
  })
})
