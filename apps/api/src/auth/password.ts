import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

// Hash de senha com scrypt (núcleo do Node — memory-hard, sem dependência nativa).
// Formato persistido: `scrypt$<saltHex>$<hashHex>`.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

const KEYLEN = 64
const SALT_BYTES = 16

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scrypt(plain, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/** Verifica a senha contra o hash, em tempo constante. Falha fechada em formato inválido. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  if (expected.length === 0) return false
  const derived = await scrypt(plain, salt, expected.length)
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
