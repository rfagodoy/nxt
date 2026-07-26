import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

/* Guarda de segredo para o que PRECISA voltar em texto claro — hoje, a senha do
   SMTP. Senha de e-mail não é como senha de usuário: o servidor tem de apresentá-la
   ao provedor, então hash não serve; tem de ser cifrada e decifrável.

   AES-256-GCM: além de cifrar, autentica. Se alguém adulterar o valor no banco, a
   decifragem FALHA em vez de devolver lixo silencioso.

   A chave vem do ambiente, nunca do banco — senão guardaríamos o cofre junto com a
   chave. `MAIL_ENCRYPTION_KEY` é a dedicada; na falta dela, cai no segredo do JWT,
   que toda instalação já tem. ⚠️ Trocar essa chave torna as senhas já gravadas
   ilegíveis: é preciso reconfigurar o SMTP. */

const PREFIX = 'v1'
const SALT = 'nxt:secret-box:v1' // fixo de propósito: a chave é o segredo, não o sal

function keyFrom(secret: string): Buffer {
  return scryptSync(secret, SALT, 32)
}

/** O ambiente tem com que cifrar? Sem isso, a tela deve dizer o que fazer em vez de
 *  aceitar uma senha e guardá-la em texto claro. */
export function encryptionSecret(): string | null {
  const s = process.env.MAIL_ENCRYPTION_KEY || process.env.AUTH_JWT_SECRET || ''
  return s.trim().length >= 16 ? s : null
}

export function canEncrypt(): boolean {
  return encryptionSecret() !== null
}

/** Cifra um texto. Devolve `v1:<iv>:<tag>:<dados>` em base64. */
export function encryptSecret(plain: string): string {
  const secret = encryptionSecret()
  if (!secret) throw new Error('Sem chave de criptografia: defina MAIL_ENCRYPTION_KEY (ou AUTH_JWT_SECRET) no servidor.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

/** Decifra. Devolve null quando o valor não é decifrável (chave trocada, dado
 *  adulterado ou formato antigo) — quem chama trata como "não configurado", que é
 *  mais honesto do que enviar e-mail com senha errada em silêncio. */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null
  const secret = encryptionSecret()
  if (!secret) return null
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX) return null
  try {
    const [, iv, tag, data] = parts
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
