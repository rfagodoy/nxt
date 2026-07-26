import { Injectable, Logger } from '@nestjs/common'
import { createTransport, type Transporter } from 'nodemailer'

/* Envio de e-mail. NASCE DESLIGADO: sem `MAIL_HOST` no ambiente, o serviço não
   tenta conectar em lugar nenhum e o sistema segue funcionando só com o sininho.
   Isso é deliberado — instalação on-premise sem servidor de e-mail é o caso comum,
   e um sistema que falha ao subir porque não achou SMTP é um sistema que ninguém
   instala duas vezes.

   A configuração vem do AMBIENTE, não do banco: credencial de SMTP é segredo de
   infraestrutura ([[project_security_hardening]]), não parâmetro de tela. A tela
   liga/desliga o uso e testa o envio; a senha nunca passa pelo front. */

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer')
  private transporter: Transporter | null = null
  private avisouDesligado = false

  get host(): string { return process.env.MAIL_HOST ?? '' }
  get from(): string { return process.env.MAIL_FROM || 'Nxt <nao-responda@nxt.local>' }
  get enabled(): boolean { return this.host.trim() !== '' }

  /** Resumo do que está configurado (sem expor segredo) — a tela mostra para o admin
   *  entender por que o envio está ou não acontecendo. */
  get status() {
    return {
      enabled: this.enabled,
      host: this.host,
      port: Number(process.env.MAIL_PORT ?? 587),
      secure: process.env.MAIL_SECURE === 'true',
      from: this.from,
      user: process.env.MAIL_USER ? `${process.env.MAIL_USER.slice(0, 2)}***` : '',
    }
  }

  private get client(): Transporter | null {
    if (!this.enabled) {
      if (!this.avisouDesligado) {
        this.logger.log('envio de e-mail desligado (MAIL_HOST ausente) — avisos ficam só no sininho')
        this.avisouDesligado = true
      }
      return null
    }
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.host,
        port: Number(process.env.MAIL_PORT ?? 587),
        secure: process.env.MAIL_SECURE === 'true',
        auth: process.env.MAIL_USER
          ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS ?? '' }
          : undefined,
      })
    }
    return this.transporter
  }

  /** Envia uma mensagem. Nunca lança: e-mail é canal SECUNDÁRIO — o aviso já está no
   *  sininho, e uma falha de SMTP não pode derrubar a conclusão de uma tarefa. */
  async send(msg: MailMessage): Promise<boolean> {
    const client = this.client
    if (!client) return false
    try {
      await client.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
      return true
    } catch (e) {
      this.logger.error(`falha ao enviar para ${msg.to}: ${String(e)}`)
      return false
    }
  }

  /** Envio de teste, disparado pelo admin na tela de parâmetros. Diferente do envio
   *  normal, aqui o erro INTERESSA: quem clicou quer saber o que está errado. */
  async sendTest(to: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.enabled) return { ok: false, error: 'Envio de e-mail desligado: defina MAIL_HOST no ambiente do servidor.' }
    try {
      await this.client!.sendMail({
        from: this.from,
        to,
        subject: 'Nxt — teste de envio',
        text: 'Envio de e-mail configurado corretamente. Esta mensagem foi disparada pela tela de Notificações.',
        html: layout('Teste de envio', '<p>Envio de e-mail configurado corretamente.</p><p>Esta mensagem foi disparada pela tela de Notificações.</p>'),
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
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
