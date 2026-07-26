import { Injectable, Logger } from '@nestjs/common'
import { SettingsService } from '../settings/settings.service'
import { canEncrypt, encryptSecret, decryptSecret } from './secret-box'

/* Configuração do servidor de e-mail POR ORGANIZAÇÃO, editável na tela.

   Antes isso vinha só de variáveis de ambiente: seguro, e inviável na prática — numa
   instalação on-premise quem sabe o endereço do SMTP é o cliente, não quem instala, e
   toda mudança virava chamado para editar arquivo e reiniciar serviço.

   A SENHA é cifrada em repouso (ver secret-box) e NUNCA volta para o front: a tela
   sabe apenas se existe uma senha guardada. O ambiente continua funcionando como
   fallback, então instalação que já configurou por variável não quebra. */

export const MAIL_SETTINGS_KEY = 'nxt:settings:smtp'

export type MailSecurity = 'NONE' | 'SSL' | 'STARTTLS'

/** O que a tela edita e o que fica gravado (com a senha cifrada). */
export interface StoredMailConfig {
  host: string
  port: number
  security: MailSecurity
  user: string
  /** cifrada; nunca sai do backend */
  passwordEnc?: string | null
  fromName: string
  fromEmail: string
  replyTo?: string
  /** aceitar certificado autoassinado (comum em SMTP interno de empresa) */
  allowSelfSigned?: boolean
}

/** O que a tela recebe: sem segredo, com o suficiente para explicar o estado. */
export interface MailConfigView {
  host: string
  port: number
  security: MailSecurity
  user: string
  fromName: string
  fromEmail: string
  replyTo: string
  allowSelfSigned: boolean
  /** há senha guardada? (o valor nunca é devolvido) */
  hasPassword: boolean
  /** de onde vem a configuração em uso */
  origem: 'BANCO' | 'AMBIENTE' | 'NENHUM'
  /** o servidor tem chave para cifrar a senha? */
  podeGuardarSenha: boolean
  /** a configuração está completa a ponto de enviar? */
  pronto: boolean
}

/** Config resolvida para o envio (com a senha em claro, só dentro do backend). */
export interface EffectiveMailConfig {
  host: string
  port: number
  secure: boolean
  requireTLS: boolean
  user: string
  pass: string
  from: string
  replyTo?: string
  allowSelfSigned: boolean
}

const DEFAULTS: StoredMailConfig = {
  host: '', port: 587, security: 'STARTTLS', user: '',
  fromName: 'Nxt', fromEmail: '', replyTo: '', allowSelfSigned: false,
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

@Injectable()
export class MailSettingsService {
  private readonly logger = new Logger('MailSettings')

  constructor(private readonly settings: SettingsService) {}

  private async raw(organizationId: string): Promise<StoredMailConfig | null> {
    const row = await this.settings.get(organizationId, MAIL_SETTINGS_KEY)
    const v = row.value as unknown as Partial<StoredMailConfig> | null
    if (!v || typeof v !== 'object' || !v.host) return null
    return {
      host: String(v.host),
      port: Number(v.port) || 587,
      security: (['NONE', 'SSL', 'STARTTLS'].includes(String(v.security)) ? v.security : 'STARTTLS') as MailSecurity,
      user: String(v.user ?? ''),
      passwordEnc: v.passwordEnc ?? null,
      fromName: String(v.fromName ?? 'Nxt'),
      fromEmail: String(v.fromEmail ?? ''),
      replyTo: String(v.replyTo ?? ''),
      allowSelfSigned: !!v.allowSelfSigned,
    }
  }

  /** Configuração vinda do AMBIENTE (compatibilidade com quem já configurou assim). */
  private fromEnv(): StoredMailConfig | null {
    const host = (process.env.MAIL_HOST ?? '').trim()
    if (!host) return null
    const secure = process.env.MAIL_SECURE === 'true'
    const from = process.env.MAIL_FROM || 'Nxt <nao-responda@nxt.local>'
    const m = /^(.*?)\s*<(.+)>$/.exec(from)
    return {
      host,
      port: Number(process.env.MAIL_PORT ?? 587),
      security: secure ? 'SSL' : 'STARTTLS',
      user: process.env.MAIL_USER ?? '',
      passwordEnc: null,
      fromName: m ? m[1].replace(/"/g, '').trim() : 'Nxt',
      fromEmail: m ? m[2] : from,
      replyTo: '',
      allowSelfSigned: false,
    }
  }

  /** Estado para a tela — sem segredo nenhum. */
  async view(organizationId: string): Promise<MailConfigView> {
    const banco = await this.raw(organizationId)
    const env = this.fromEnv()
    const cfg = banco ?? env ?? DEFAULTS
    const origem: MailConfigView['origem'] = banco ? 'BANCO' : env ? 'AMBIENTE' : 'NENHUM'
    const temSenha = banco ? !!banco.passwordEnc : !!process.env.MAIL_PASS
    return {
      host: cfg.host, port: cfg.port, security: cfg.security, user: cfg.user,
      fromName: cfg.fromName, fromEmail: cfg.fromEmail, replyTo: cfg.replyTo ?? '',
      allowSelfSigned: !!cfg.allowSelfSigned,
      hasPassword: temSenha,
      origem,
      podeGuardarSenha: canEncrypt(),
      // usuário sem senha é válido (SMTP interno costuma dispensar autenticação)
      pronto: !!cfg.host && !!cfg.fromEmail && (!cfg.user || temSenha),
    }
  }

  /** Grava. Senha ausente = mantém a que já existe (a tela não devolve a antiga);
   *  string vazia explícita = remove a senha. */
  async put(
    organizationId: string,
    dto: Partial<StoredMailConfig> & { password?: string | null },
  ): Promise<MailConfigView> {
    const atual = await this.raw(organizationId)

    let passwordEnc = atual?.passwordEnc ?? null
    if (dto.password !== undefined) {
      const nova = (dto.password ?? '').trim()
      if (nova === '') passwordEnc = null
      else if (!canEncrypt()) {
        throw new Error('Sem chave de criptografia no servidor: defina MAIL_ENCRYPTION_KEY (ou AUTH_JWT_SECRET) antes de guardar a senha.')
      } else passwordEnc = encryptSecret(nova)
    }

    const cfg: StoredMailConfig = {
      host: (dto.host ?? atual?.host ?? '').trim(),
      port: Number(dto.port ?? atual?.port ?? 587) || 587,
      security: (dto.security ?? atual?.security ?? 'STARTTLS') as MailSecurity,
      user: (dto.user ?? atual?.user ?? '').trim(),
      passwordEnc,
      fromName: (dto.fromName ?? atual?.fromName ?? 'Nxt').trim(),
      fromEmail: (dto.fromEmail ?? atual?.fromEmail ?? '').trim(),
      replyTo: (dto.replyTo ?? atual?.replyTo ?? '').trim(),
      allowSelfSigned: dto.allowSelfSigned ?? atual?.allowSelfSigned ?? false,
    }

    if (cfg.fromEmail && !isEmail(cfg.fromEmail)) throw new Error('E-mail do remetente inválido.')
    if (cfg.replyTo && !isEmail(cfg.replyTo)) throw new Error('E-mail de resposta inválido.')

    await this.settings.put(organizationId, MAIL_SETTINGS_KEY, cfg as never)
    return this.view(organizationId)
  }

  /** Apaga a configuração da organização (volta ao ambiente, se houver). */
  async clear(organizationId: string): Promise<MailConfigView> {
    await this.settings.put(organizationId, MAIL_SETTINGS_KEY, {} as never)
    return this.view(organizationId)
  }

  /** Config pronta para o transporte. `null` = canal desligado (sem servidor). */
  async resolve(organizationId: string): Promise<EffectiveMailConfig | null> {
    const banco = await this.raw(organizationId)
    const cfg = banco ?? this.fromEnv()
    if (!cfg?.host) return null

    let pass = ''
    if (banco) {
      const aberta = decryptSecret(banco.passwordEnc)
      if (banco.passwordEnc && aberta === null) {
        // chave trocada ou dado adulterado: melhor não enviar do que autenticar errado
        this.logger.error('senha de SMTP não pôde ser decifrada — reconfigure o e-mail')
        return null
      }
      pass = aberta ?? ''
    } else {
      pass = process.env.MAIL_PASS ?? ''
    }

    const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail
    return {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.security === 'SSL',
      requireTLS: cfg.security === 'STARTTLS',
      user: cfg.user,
      pass,
      from: from || 'Nxt <nao-responda@nxt.local>',
      replyTo: cfg.replyTo || undefined,
      allowSelfSigned: !!cfg.allowSelfSigned,
    }
  }
}
