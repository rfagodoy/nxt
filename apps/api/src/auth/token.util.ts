import { createHash, randomBytes } from 'crypto'

// Refresh token opaco de alta entropia (256 bits). Guardamos só o hash sha256 —
// como o token já é aleatório e longo, sha256 basta (evita replay por leitura do DB).
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
