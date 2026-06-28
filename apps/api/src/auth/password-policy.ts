import { BadRequestException } from '@nestjs/common'

export const MIN_PASSWORD_LENGTH = 10

// Lista curta de senhas óbvias/vazadas a barrar (defesa básica, sem dependência).
const COMMON = new Set([
  'password', 'senha123', '12345678', '123456789', '1234567890', 'qwertyui',
  'admin123', 'iloveyou', 'password1', 'senha1234', 'nxt12345', 'changeme',
])

/** Valida a força da senha; lança BadRequest com mensagem clara se fraca. */
export function assertStrongPassword(password: string, email?: string): void {
  const pw = password ?? ''
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  }
  if (COMMON.has(pw.toLowerCase())) {
    throw new BadRequestException('Essa senha é muito comum. Escolha outra.')
  }
  if (email) {
    const local = email.split('@')[0]?.toLowerCase()
    if (local && local.length >= 3 && pw.toLowerCase().includes(local)) {
      throw new BadRequestException('A senha não pode conter o seu e-mail.')
    }
  }
}
