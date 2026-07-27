'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { AuthShell, campoEscuro } from '@/components/auth/auth-shell'

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // a tela não distingue os casos — ver comentário abaixo
    }
    /* Confirmação SEMPRE, deu certo ou não. Se a tela dissesse "e-mail não cadastrado",
       qualquer pessoa poderia descobrir quem tem conta aqui digitando endereços. */
    setEnviado(true)
    setLoading(false)
  }

  if (enviado) {
    return (
      <AuthShell titulo="Verifique seu e-mail" subtitulo="Se houver conta, o link já está a caminho.">
        <div className="w-full max-w-sm space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-3 text-sm text-white/90">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <p>Se houver uma conta ativa com <strong>{email}</strong>, enviamos um link para definir uma nova senha.</p>
              <p className="text-white/55">O link vale por 60 minutos e só pode ser usado uma vez.</p>
            </div>
          </div>
          <p className="text-xs text-white/45">
            Não chegou? Confira a caixa de spam. Se o sistema ainda não tiver servidor de e-mail
            configurado, procure o administrador — ele consegue definir sua senha diretamente.
          </p>
          <Link href="/sign-in" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />Voltar para o login
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo="Esqueci minha senha" subtitulo="Informe seu e-mail para receber o link de redefinição.">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium text-white/80">E-mail</label>
          <input
            id="email" type="email" autoComplete="username" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading}
            placeholder="voce@empresa.com" className={campoEscuro}
          />
        </div>

        <button
          type="submit" disabled={loading || !email}
          className="inline-flex w-full items-center justify-center gap-2 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-forest hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {loading ? 'Enviando...' : 'Enviar link'}
        </button>

        <Link href="/sign-in" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />Voltar para o login
        </Link>
      </form>
    </AuthShell>
  )
}
