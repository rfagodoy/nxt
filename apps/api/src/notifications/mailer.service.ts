import { Injectable, Logger } from '@nestjs/common'
import { createTransport, type Transporter } from 'nodemailer'
import { MailSettingsService, type EffectiveMailConfig } from './mail-settings.service'

/* Envio de e-mail. NASCE DESLIGADO: sem servidor configurado (nem na tela, nem no
   ambiente), o serviço não tenta conectar em lugar nenhum e o sistema segue
   funcionando só com o sininho. Instalação on-premise sem servidor de e-mail é o
   caso comum, e um sistema que falha ao subir porque não achou SMTP é um sistema que
   ninguém instala duas vezes.

   A configuração é POR ORGANIZAÇÃO (tela) com fallback no ambiente. */

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer')
  /** transporte por assinatura da config: trocar o servidor na tela troca o transporte
   *  sem reiniciar o serviço, e configurações iguais reaproveitam a conexão. */
  private transports = new Map<string, Transporter>()

  constructor(private readonly settings: MailSettingsService) {}

  private assinatura(c: EffectiveMailConfig): string {
    return [c.host, c.port, c.secure, c.requireTLS, c.user, c.pass ? 'auth' : 'anon', c.allowSelfSigned].join('|')
  }

  private transportFor(c: EffectiveMailConfig): Transporter {
    const chave = this.assinatura(c)
    const existente = this.transports.get(chave)
    if (existente) return existente
    const t = createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      requireTLS: c.requireTLS,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      // SMTP interno com certificado próprio é comum; só quando o admin pede
      tls: c.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
    })
    // um transporte por config basta; o mapa não cresce com o uso, só com mudança
    this.transports.set(chave, t)
    return t
  }

  /** Há canal de e-mail para esta organização? */
  async enabled(organizationId: string): Promise<boolean> {
    return (await this.settings.resolve(organizationId)) !== null
  }

  /** Envia. Nunca lança: e-mail é canal SECUNDÁRIO — o aviso já está no sininho, e
   *  uma falha de SMTP não pode derrubar a conclusão de uma tarefa. */
  async send(organizationId: string, msg: MailMessage): Promise<boolean> {
    const cfg = await this.settings.resolve(organizationId)
    if (!cfg) return false
    try {
      await this.transportFor(cfg).sendMail({
        from: cfg.from, to: msg.to, replyTo: cfg.replyTo,
        subject: msg.subject, text: msg.text, html: msg.html,
      })
      return true
    } catch (e) {
      this.logger.error(`falha ao enviar para ${msg.to}: ${String(e)}`)
      return false
    }
  }

  /** Testa a conexão SEM enviar mensagem (handshake + autenticação). É o teste que
   *  responde "o servidor aceita minhas credenciais?" sem encher a caixa de ninguém. */
  async verify(organizationId: string): Promise<{ ok: boolean; error?: string }> {
    const cfg = await this.settings.resolve(organizationId)
    if (!cfg) return { ok: false, error: 'Nenhum servidor de e-mail configurado.' }
    try {
      await this.transportFor(cfg).verify()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: humanizeMailError(e) }
    }
  }

  /** Envio de teste real, disparado pelo admin. Diferente do envio normal, aqui o
   *  erro INTERESSA: quem clicou quer saber o que está errado. */
  async sendTest(organizationId: string, to: string): Promise<{ ok: boolean; error?: string }> {
    const cfg = await this.settings.resolve(organizationId)
    if (!cfg) return { ok: false, error: 'Nenhum servidor de e-mail configurado.' }
    try {
      await this.transportFor(cfg).sendMail({
        from: cfg.from, to, replyTo: cfg.replyTo,
        subject: 'Nxt — teste de envio',
        text: 'Envio de e-mail configurado corretamente. Esta mensagem foi disparada pela tela de configuração.',
        html: layout('Teste de envio', '<p>Envio de e-mail configurado corretamente.</p><p>Esta mensagem foi disparada pela tela de configuração do Nxt.</p>'),
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: humanizeMailError(e) }
    }
  }
}

/** Erro de SMTP em português, com a saída provável. A mensagem crua do nodemailer
 *  ("535 5.7.8 ...") não diz a ninguém o que fazer. */
export function humanizeMailError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string; response?: string }
  const msg = err?.message ?? String(e)
  const code = err?.code ?? ''
  const resposta = (err?.response ?? '').trim()
  /* A resposta crua do servidor é anexada nas recusas de autenticação: é ela que
     separa "senha errada" (o usuário conserta) de "o provedor desligou o acesso por
     senha" (o usuário NÃO conserta — só trocando de provedor). Sem isso, os dois
     casos chegam ao suporte com a mesma frase e a investigação recomeça do zero. */
  const detalhe = resposta && resposta !== msg ? ` · Resposta do servidor: ${resposta}` : ''
  if (code === 'EAUTH' || err?.responseCode === 535) {
    const alvo = `${msg} ${resposta}`
    if (/basic auth\w*\s+(is\s+)?disabled|5\.7\.139|SmtpClientAuthentication|authentication is disabled/i.test(alvo)) {
      return 'O servidor recusou a autenticação por senha: este provedor desligou o acesso por usuário e senha (autenticação básica) para esta conta. Senha de aplicativo não resolve — é preciso liberar o SMTP autenticado na conta ou usar outro servidor de envio.' + detalhe
    }
    return 'Usuário ou senha recusados pelo servidor. Em Gmail/Office 365 com verificação em duas etapas, use uma senha de aplicativo.' + detalhe
  }
  if (code === 'EDNS' || code === 'ENOTFOUND' || /ENOTFOUND|EAI_AGAIN/.test(msg)) {
    return 'Servidor não encontrado: o endereço não existe ou o DNS do servidor não conseguiu resolvê-lo. Confira se digitou certo (ex.: smtp.gmail.com).'
  }
  if (code === 'ECONNECTION' || code === 'ECONNREFUSED' || /ECONNREFUSED/.test(msg)) {
    return 'O servidor recusou a conexão: confira o endereço e a porta.'
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET') return 'Tempo esgotado ao conectar. Verifique a porta, o tipo de criptografia e se o firewall libera a saída.'
  if (/self.signed|unable to verify/i.test(msg)) return 'O certificado do servidor não pôde ser validado. Se for um SMTP interno, marque "aceitar certificado autoassinado".'
  if (code === 'EENVELOPE') return 'O servidor recusou o remetente ou o destinatário. Confira o e-mail do remetente.'
  return msg
}

/* ─── layout das mensagens ────────────────────────────────────────────────────
   HTML de e-mail é território de cliente antigo: sem CSS externo, sem flexbox,
   tabela e estilo inline. Mantido simples de propósito — a marca aqui é a
   assinatura, não um layout que quebra no Outlook. */
const ESMERALDA = '#18C07A'
const TINTA = '#0C1410'

export function layout(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f6f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${TINTA}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e8e5">
    <tr><td style="background:${TINTA};padding:16px 20px">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-.02em">N<span style="color:${ESMERALDA}">x</span>t</span>
    </td></tr>
    <tr><td style="padding:20px">
      <h1 style="margin:0 0 12px;font-size:16px;font-weight:600">${escapeHtml(titulo)}</h1>
      <div style="font-size:14px;line-height:1.55">${corpo}</div>
    </td></tr>
    <tr><td style="padding:12px 20px;border-top:1px solid #e3e8e5;font-size:11px;color:#6b7772">
      Você recebeu este aviso porque é responsável por uma atividade no Nxt.
    </td></tr>
  </table></body></html>`
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}
