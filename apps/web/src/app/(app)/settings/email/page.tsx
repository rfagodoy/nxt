'use client'

/* Configuração do servidor de e-mail. Tudo o que o envio precisa está aqui: servidor,
   porta, criptografia, autenticação, remetente — e as duas provas de que funciona
   (testar conexão e enviar de verdade).

   A SENHA é gravada cifrada e NUNCA volta para esta tela: o campo mostra que existe
   uma senha guardada e permite trocá-la, não lê-la. */

import { useState, useEffect, useCallback } from 'react'
import {
  Mail, Loader2, Save, Check, Send, PlugZap, Trash2, AlertTriangle, ShieldCheck, Eye, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-context'

type Security = 'NONE' | 'SSL' | 'STARTTLS'

interface Config {
  host: string; port: number; security: Security; user: string
  fromName: string; fromEmail: string; replyTo: string; allowSelfSigned: boolean
  hasPassword: boolean
  origem: 'BANCO' | 'AMBIENTE' | 'NENHUM'
  podeGuardarSenha: boolean
  pronto: boolean
}

/** Atalhos dos provedores mais usados — o que muda entre eles é só endereço, porta e
 *  criptografia; errar essa combinação é a causa nº 1 de "não envia". */
const PRESETS: Array<{ nome: string; host: string; port: number; security: Security; dica?: string }> = [
  { nome: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, security: 'STARTTLS', dica: 'Com verificação em duas etapas, use uma Senha de app (não a senha da conta).' },
  { nome: 'Microsoft 365 / Outlook',  host: 'smtp.office365.com', port: 587, security: 'STARTTLS', dica: 'A conta precisa ter o envio SMTP autenticado liberado pelo administrador.' },
  { nome: 'Zoho Mail',                host: 'smtp.zoho.com', port: 465, security: 'SSL' },
  { nome: 'Amazon SES',               host: 'email-smtp.us-east-1.amazonaws.com', port: 587, security: 'STARTTLS', dica: 'Use as credenciais SMTP do SES (diferentes da chave de API).' },
  { nome: 'Servidor interno',         host: '', port: 25, security: 'NONE', dica: 'SMTP da empresa costuma dispensar autenticação e usar certificado próprio.' },
]

const SEGURANCA: Array<{ value: Security; label: string; hint: string }> = [
  { value: 'STARTTLS', label: 'STARTTLS', hint: 'Porta 587 — o padrão hoje' },
  { value: 'SSL',      label: 'SSL/TLS',  hint: 'Porta 465 — conexão cifrada desde o início' },
  { value: 'NONE',     label: 'Nenhuma',  hint: 'Porta 25 — só em rede interna confiável' },
]

const VAZIO: Config = {
  host: '', port: 587, security: 'STARTTLS', user: '',
  fromName: 'Nxt', fromEmail: '', replyTo: '', allowSelfSigned: false,
  hasPassword: false, origem: 'NENHUM', podeGuardarSenha: true, pronto: false,
}

export default function EmailConfigPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [cfg, setCfg] = useState<Config | null>(null)
  const [senha, setSenha] = useState('')
  const [trocarSenha, setTrocarSenha] = useState(false)
  const [verSenha, setVerSenha] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testando, setTestando] = useState<'conexao' | 'envio' | null>(null)
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<Config>('/api/notifications/email-config').catch(() => null)
    setCfg(data ?? VAZIO)
    setTrocarSenha(!(data?.hasPassword))
  }, [])
  useEffect(() => { void load() }, [load])

  const patch = (p: Partial<Config>) => setCfg((c) => (c ? { ...c, ...p } : c))

  const aplicarPreset = (i: number) => {
    const p = PRESETS[i]
    patch({ host: p.host, port: p.port, security: p.security })
  }

  const salvar = async () => {
    if (!cfg) return
    setSaving(true); setErro(null); setResultado(null)
    try {
      const body: Record<string, unknown> = {
        host: cfg.host, port: cfg.port, security: cfg.security, user: cfg.user,
        fromName: cfg.fromName, fromEmail: cfg.fromEmail, replyTo: cfg.replyTo,
        allowSelfSigned: cfg.allowSelfSigned,
      }
      // só manda a senha quando o usuário decidiu trocá-la
      if (trocarSenha) body.password = senha
      const res = await apiFetch('/api/notifications/email-config', { method: 'PUT', body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setErro(data?.message || 'Não foi possível salvar.'); return }
      setCfg(data as Config); setSenha(''); setTrocarSenha(!(data as Config).hasPassword)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const testar = async (tipo: 'conexao' | 'envio') => {
    setTestando(tipo); setResultado(null)
    try {
      const rota = tipo === 'conexao' ? 'email-verify' : 'email-test'
      const res = await apiFetch(`/api/notifications/${rota}`, { method: 'POST' })
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null
      setResultado(data?.ok
        ? { ok: true, msg: tipo === 'conexao' ? 'Conexão e autenticação funcionaram.' : 'E-mail enviado — confira sua caixa de entrada.' }
        : { ok: false, msg: data?.error || 'Falhou.' })
    } finally { setTestando(null) }
  }

  const limpar = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/notifications/email-config', { method: 'DELETE' })
      if (res.ok) { setCfg(await res.json() as Config); setSenha(''); setTrocarSenha(true); setResultado(null) }
    } finally { setSaving(false) }
  }

  if (!cfg) {
    return <div className="flex items-center justify-center py-16 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando…</div>
  }

  const input = 'h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60'

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Envio de e-mail</h1>
          <p className="text-[11px] text-muted-foreground">Servidor usado para mandar os avisos do sistema para fora</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {cfg.origem === 'BANCO' && (
              <Button variant="outline" size="sm" onClick={limpar} disabled={saving} title="Remover a configuração desta organização">
                <Trash2 className="h-3.5 w-3.5" />Limpar
              </Button>
            )}
            <Button size="sm" onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? 'Salvo' : 'Salvar'}
            </Button>
          </div>
        )}
      </div>

      {/* estado do canal */}
      <div className={cn('rounded-xl border px-3 py-2 flex items-center gap-2 text-[12px]',
        cfg.pronto ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200')}>
        {cfg.pronto ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span className="flex-1">
          {cfg.pronto
            ? <>Canal configurado{cfg.origem === 'AMBIENTE' && ' pelo ambiente do servidor'}. Os avisos pessoais saem por e-mail conforme as regras em Notificações.</>
            : <>Sem envio de e-mail: os avisos ficam apenas no sininho. Preencha servidor e remetente abaixo.</>}
        </span>
        {cfg.origem === 'AMBIENTE' && <span className="text-[10.5px] opacity-80">definido por variáveis de ambiente</span>}
      </div>

      {!cfg.podeGuardarSenha && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          O servidor não tem chave de criptografia, então a senha do e-mail não pode ser guardada com segurança.
          Defina <code className="font-mono">MAIL_ENCRYPTION_KEY</code> (ou <code className="font-mono">AUTH_JWT_SECRET</code>) no ambiente e recarregue esta página.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem] flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-3">
          {/* servidor */}
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Servidor</h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, i) => (
                <button key={p.nome} type="button" disabled={!isAdmin} onClick={() => aplicarPreset(i)}
                  className="h-7 px-2.5 rounded-md border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                  {p.nome}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <label className="space-y-1">
                <span className="text-xs font-medium">Endereço do servidor (SMTP)</span>
                <input disabled={!isAdmin} className={input} value={cfg.host} placeholder="smtp.suaempresa.com.br"
                  onChange={(e) => patch({ host: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium">Porta</span>
                <input disabled={!isAdmin} type="number" className={input} value={cfg.port}
                  onChange={(e) => patch({ port: Number(e.target.value) || 0 })} />
              </label>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium">Criptografia</span>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {SEGURANCA.map((s) => (
                  <button key={s.value} type="button" disabled={!isAdmin} onClick={() => patch({ security: s.value })}
                    className={cn('rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:opacity-60',
                      cfg.security === s.value ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
                    <span className="text-xs font-medium block">{s.label}</span>
                    <span className="text-[10.5px] text-muted-foreground">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" disabled={!isAdmin} className="mt-0.5 h-3.5 w-3.5 accent-primary" checked={cfg.allowSelfSigned}
                onChange={(e) => patch({ allowSelfSigned: e.target.checked })} />
              <span>
                Aceitar certificado autoassinado
                <span className="block text-[10.5px] text-muted-foreground">Necessário em alguns servidores internos. Não use com provedor público.</span>
              </span>
            </label>
          </section>

          {/* autenticação */}
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Autenticação</h2>
            <p className="text-[11px] text-muted-foreground -mt-2">Deixe em branco se o servidor interno não exigir login.</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium">Usuário</span>
                <input disabled={!isAdmin} className={input} value={cfg.user} placeholder="avisos@suaempresa.com.br"
                  onChange={(e) => patch({ user: e.target.value })} />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium">Senha</span>
                {cfg.hasPassword && !trocarSenha ? (
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 flex-1 items-center rounded-md border border-input bg-muted/40 px-2.5 text-xs text-muted-foreground">
                      •••••••••• (guardada)
                    </span>
                    {isAdmin && <Button variant="outline" size="sm" onClick={() => { setTrocarSenha(true); setSenha('') }}>Trocar</Button>}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input disabled={!isAdmin || !cfg.podeGuardarSenha} type={verSenha ? 'text' : 'password'} className={input}
                      value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="senha ou senha de aplicativo" autoComplete="new-password" />
                    <button type="button" onClick={() => setVerSenha((v) => !v)} className="h-8 px-2 rounded-md border text-muted-foreground hover:text-foreground">
                      {verSenha ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
                <span className="block text-[10.5px] text-muted-foreground">Guardada cifrada; nunca é exibida de volta.</span>
              </label>
            </div>
          </section>

          {/* remetente */}
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Remetente</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium">Nome exibido</span>
                <input disabled={!isAdmin} className={input} value={cfg.fromName} placeholder="Nxt"
                  onChange={(e) => patch({ fromName: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium">E-mail do remetente</span>
                <input disabled={!isAdmin} className={input} value={cfg.fromEmail} placeholder="nao-responda@suaempresa.com.br"
                  onChange={(e) => patch({ fromEmail: e.target.value })} />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium">Responder para <span className="text-muted-foreground font-normal">(opcional)</span></span>
                <input disabled={!isAdmin} className={input} value={cfg.replyTo} placeholder="contratos@suaempresa.com.br"
                  onChange={(e) => patch({ replyTo: e.target.value })} />
                <span className="block text-[10.5px] text-muted-foreground">Para onde vai a resposta de quem clicar em &quot;responder&quot;.</span>
              </label>
            </div>
          </section>
        </div>

        {/* provas */}
        <aside className="space-y-3">
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-2.5">
            <h2 className="text-sm font-semibold">Provar que funciona</h2>
            <p className="text-[11px] text-muted-foreground -mt-1">Salve antes de testar — o teste usa o que está gravado.</p>

            <Button variant="outline" size="sm" className="w-full justify-start" disabled={!isAdmin || testando !== null} onClick={() => void testar('conexao')}>
              {testando === 'conexao' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              Testar conexão
            </Button>
            <p className="text-[10.5px] text-muted-foreground -mt-1">Conecta e autentica, sem enviar mensagem.</p>

            <Button variant="outline" size="sm" className="w-full justify-start" disabled={!isAdmin || testando !== null} onClick={() => void testar('envio')}>
              {testando === 'envio' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar e-mail de teste
            </Button>
            <p className="text-[10.5px] text-muted-foreground -mt-1">Manda uma mensagem real para o seu próprio e-mail.</p>

            {resultado && (
              <div className={cn('rounded-md border px-2.5 py-2 text-[11px]',
                resultado.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200')}>
                {resultado.msg}
              </div>
            )}
            {erro && <p className="text-[11px] text-destructive">{erro}</p>}
          </section>

          <section className="rounded-xl border bg-muted/20 p-4 space-y-2 text-[11px] text-muted-foreground">
            <p className="text-xs font-semibold text-foreground">Não está enviando?</p>
            <p>· <span className="text-foreground">Gmail/Microsoft com duas etapas</span>: a senha da conta não funciona — gere uma senha de aplicativo.</p>
            <p>· <span className="text-foreground">Tempo esgotado</span>: porta bloqueada pelo firewall de saída, ou criptografia trocada (587 = STARTTLS, 465 = SSL).</p>
            <p>· <span className="text-foreground">Certificado não validado</span>: servidor interno — marque a opção de certificado autoassinado.</p>
            <p>· <span className="text-foreground">Remetente recusado</span>: muitos provedores exigem que o remetente seja o mesmo usuário autenticado.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
