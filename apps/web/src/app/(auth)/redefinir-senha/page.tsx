'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { KeyRound, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { AuthShell, campoEscuro } from '@/components/auth/auth-shell'

const MIN = 10

function Formulario() {
  const token = useSearchParams().get('token') ?? ''

  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [ver, setVer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const curta = senha.length > 0 && senha.length < MIN
  const divergem = confirma.length > 0 && senha !== confirma
  const podeEnviar = !loading && senha.length >= MIN && senha === confirma

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: senha }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setErro(data?.error ?? 'Não foi possível redefinir a senha.')
        setLoading(false)
        return
      }
      setPronto(true)
    } catch {
      setErro('Serviço indisponível. Tente novamente.')
    }
    setLoading(false)
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Link incompleto. Abra o endereço exatamente como veio no e-mail.</span>
        </div>
        <Link href="/esqueci-senha" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          Pedir um novo link
        </Link>
      </div>
    )
  }

  if (pronto) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-3 text-sm text-white/90">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p>Senha alterada.</p>
            <p className="text-white/55">As sessões abertas em outros dispositivos foram encerradas.</p>
          </div>
        </div>
        <Link
          href="/sign-in"
          className="inline-flex w-full items-center justify-center gap-2 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-forest hover:bg-primary/90 transition-colors"
        >
          Entrar com a nova senha
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="senha" className="text-xs font-medium text-white/80">Nova senha</label>
        <div className="relative">
          <input
            id="senha" type={ver ? 'text' : 'password'} autoComplete="new-password" required autoFocus
            value={senha} onChange={(e) => setSenha(e.target.value)} disabled={loading}
            placeholder="pelo menos 10 caracteres" className={campoEscuro + ' pr-10'}
          />
          <button
            type="button" onClick={() => setVer((v) => !v)} tabIndex={-1}
            aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
          >
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {curta && <p className="text-[11px] text-amber-300/90">Faltam {MIN - senha.length} caractere(s).</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirma" className="text-xs font-medium text-white/80">Repita a nova senha</label>
        <input
          id="confirma" type={ver ? 'text' : 'password'} autoComplete="new-password" required
          value={confirma} onChange={(e) => setConfirma(e.target.value)} disabled={loading}
          placeholder="••••••••" className={campoEscuro}
        />
        {divergem && <p className="text-[11px] text-amber-300/90">As duas senhas não são iguais.</p>}
      </div>

      <button
        type="submit" disabled={!podeEnviar}
        className="inline-flex w-full items-center justify-center gap-2 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-forest hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {loading ? 'Salvando...' : 'Definir nova senha'}
      </button>

      <Link href="/sign-in" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" />Voltar para o login
      </Link>
    </form>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <AuthShell titulo="Definir nova senha" subtitulo="Escolha uma senha que você não use em outro lugar.">
      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </AuthShell>
  )
}
