'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Phone, MapPin, CreditCard, Users, Pencil,
  Clock, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePartnerLogs, getLogUser, LOG_EVENT_LABEL, LOG_EVENT_CLS, type LogEvent } from '@/hooks/use-partner-logs'

/* ─── tipos ──────────────────────────────────────────────── */

interface Contact  { nome?: string; cargo?: string; email?: string; telefone?: string; celular?: string; website?: string }
interface Address  { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; estado?: string; address1?: string; pais_endereco?: string }
interface Bank     { banco?: string; tipo_conta?: string; agencia?: string; conta?: string; pix?: string }
interface Socio    { nome?: string; documento?: string; participacao?: string; cargo?: string }

interface PartnerAPI {
  id: string
  categoria: string
  status: string
  documento: string | null
  razaoSocial: string
  nomeFantasia: string | null
  ie: string | null
  im: string | null
  contatos: Contact[]
  enderecos: Address[]
  bancos: Bank[]
  socios: Socio[]
}

/* ─── constantes ─────────────────────────────────────────── */

const CAT_LABEL: Record<string, string> = {
  PJ_BR: 'PJ Brasileira', PJ_EST: 'PJ Estrangeira',
  PF_BR: 'PF Brasileira', PF_EST: 'PF Estrangeira',
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ATIVO:            { label: 'Ativo',            cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'   },
  EM_CADASTRAMENTO: { label: 'Em cadastramento', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'     },
  INATIVO:          { label: 'Inativo',          cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'        },
  BLOQUEADO:        { label: 'Bloqueado',        cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'         },
}

/* ─── utilitários ────────────────────────────────────────── */

function formatLogDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/* ─── componentes de apresentação ───────────────────────── */

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-xs col-span-2">{value || '—'}</span>
    </div>
  )
}

function Section({
  icon: Icon, title, children, collapsible = false,
}: {
  icon: React.ElementType; title: string; children: React.ReactNode; collapsible?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(p => !p)}
        className={cn(
          'w-full px-4 py-2 border-b bg-muted/30 flex items-center gap-2',
          collapsible && 'hover:bg-muted/50 transition-colors',
        )}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <h3 className="text-xs font-semibold flex-1 text-left">{title}</h3>
        {collapsible && (
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', !open && '-rotate-90')} />
        )}
      </button>
      {open && <div className="px-4">{children}</div>}
    </div>
  )
}

/* ─── página ─────────────────────────────────────────────── */

export default function ParceiroDetail() {
  const { id } = useParams<{ id: string }>()
  const [partner,        setPartner]        = useState<PartnerAPI | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [changingStatus, setChangingStatus] = useState(false)

  const { logs, addLog } = usePartnerLogs(id ?? null)

  const fetchPartner = useCallback(() => {
    if (!id) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/partners/${id}`)
      .then(r => r.json())
      .then(data => { setPartner(data as PartnerAPI); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchPartner() }, [fetchPartner])

  const changeStatus = async (newStatus: string, event: LogEvent, description: string) => {
    if (!partner) return
    setChangingStatus(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/partners/${partner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        addLog({ user: getLogUser(), event, description })
        setPartner(p => p ? { ...p, status: newStatus } : p)
      }
    } finally {
      setChangingStatus(false)
    }
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-8 text-center">Carregando...</div>
  }
  if (!partner) {
    return <div className="text-xs text-muted-foreground py-8 text-center">Parceiro não encontrado.</div>
  }

  const addr       = partner.enderecos?.[0]
  const cont       = partner.contatos?.[0]
  const bank       = partner.bancos?.[0]
  const statusInfo = STATUS[partner.status] ?? { label: partner.status, cls: 'bg-gray-100 text-gray-600' }
  const catLabel   = CAT_LABEL[partner.categoria] ?? partner.categoria
  const isPJ       = partner.categoria === 'PJ_BR' || partner.categoria === 'PJ_EST'
  const isBR       = partner.categoria === 'PJ_BR' || partner.categoria === 'PF_BR'

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/modules/parceiros" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-base font-semibold tracking-tight">{partner.razaoSocial}</h1>
              <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold', statusInfo.cls)}>
                {statusInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 text-[11px] font-medium">
                {catLabel}
              </span>
              {partner.documento && (
                <span className="font-mono text-[11px] text-muted-foreground">{partner.documento}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {partner.status === 'EM_CADASTRAMENTO' && (
            <button
              onClick={() => void changeStatus('ATIVO', 'ATIVADO', 'Cadastro ativado')}
              disabled={changingStatus}
              className="inline-flex items-center h-7 px-3 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {changingStatus ? 'Aguarde...' : 'Ativar'}
            </button>
          )}
          {partner.status === 'ATIVO' && (
            <button
              onClick={() => void changeStatus('INATIVO', 'INATIVADO', 'Cadastro inativado')}
              disabled={changingStatus}
              className="inline-flex items-center h-7 px-3 rounded-md border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
            >
              {changingStatus ? 'Aguarde...' : 'Inativar'}
            </button>
          )}
          {partner.status === 'INATIVO' && (
            <button
              onClick={() => void changeStatus('ATIVO', 'REATIVADO', 'Cadastro reativado')}
              disabled={changingStatus}
              className="inline-flex items-center h-7 px-3 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {changingStatus ? 'Aguarde...' : 'Reativar'}
            </button>
          )}
          <Link
            href={`/modules/parceiros/${partner.id}/edit`}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />Editar
          </Link>
        </div>
      </div>

      {/* ── Identificação ── */}
      <Section icon={Building2} title="Identificação">
        <Row label="Documento"                               value={partner.documento} />
        <Row label={isPJ ? 'Razão Social' : 'Nome Completo'} value={partner.razaoSocial} />
        {isPJ && <Row label="Nome Fantasia"    value={partner.nomeFantasia} />}
        {partner.ie && <Row label="Insc. Estadual"  value={partner.ie} />}
        {partner.im && <Row label="Insc. Municipal" value={partner.im} />}
      </Section>

      {/* ── Contato ── */}
      {cont && (
        <Section icon={Phone} title="Contato">
          <Row label="Nome do Contato" value={cont.nome} />
          <Row label="Cargo"           value={cont.cargo} />
          <Row label="E-mail"          value={cont.email} />
          <Row label="Telefone"        value={cont.telefone} />
          <Row label="Celular"         value={cont.celular} />
          {cont.website && <Row label="Website" value={cont.website} />}
        </Section>
      )}

      {/* ── Endereço ── */}
      {addr && (
        <Section icon={MapPin} title="Endereço">
          {addr.cep        && <Row label="CEP"        value={addr.cep} />}
          {addr.logradouro && (
            <Row label="Logradouro" value={[addr.logradouro, addr.numero, addr.complemento ? `— ${addr.complemento}` : ''].filter(Boolean).join(', ')} />
          )}
          {addr.bairro     && <Row label="Bairro"      value={addr.bairro} />}
          {addr.cidade     && <Row label="Cidade / UF" value={[addr.cidade, addr.estado].filter(Boolean).join(' — ')} />}
          {addr.address1   && <Row label="Endereço"    value={addr.address1} />}
          {addr.pais_endereco && <Row label="País"     value={addr.pais_endereco} />}
        </Section>
      )}

      {/* ── Dados Bancários ── */}
      {bank && (
        <Section icon={CreditCard} title="Dados Bancários">
          {bank.banco      && <Row label="Banco"     value={bank.banco} />}
          {bank.tipo_conta && <Row label="Tipo"      value={bank.tipo_conta} />}
          {bank.agencia    && <Row label="Agência"   value={bank.agencia} />}
          {bank.conta      && <Row label="Conta"     value={bank.conta} />}
          {bank.pix        && <Row label="Chave PIX" value={bank.pix} />}
        </Section>
      )}

      {/* ── Quadro de Sócios ── */}
      {isPJ && (partner.socios?.length ?? 0) > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold">Quadro de Sócios</h3>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {partner.socios.length} sócio{partner.socios.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Documento</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Participação</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cargo</th>
                </tr>
              </thead>
              <tbody>
                {partner.socios.map((s, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-medium">{s.nome || '—'}</td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">{s.documento || '—'}</td>
                    <td className="px-4 py-2">{s.participacao || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.cargo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Histórico ── */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold">Histórico</h3>
          </div>
          {logs.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{logs.length} registro{logs.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            Nenhum registro de histórico.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">Data/hora</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Usuário</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Motivo</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...logs].reverse().map(log => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap align-top">
                      {formatLogDate(log.ts)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground align-top whitespace-nowrap">{log.user}</td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="leading-snug">{log.description}</p>
                      {log.changes && log.changes.length > 0 && (
                        <div className="mt-2 rounded border overflow-hidden">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="bg-muted/40 border-b">
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-1/3">Campo</th>
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-1/3">Antes</th>
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-1/3">Depois</th>
                              </tr>
                            </thead>
                            <tbody>
                              {log.changes.map((c, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="px-3 py-1.5 font-medium">{c.label}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground line-through">{c.before || '—'}</td>
                                  <td className="px-3 py-1.5">{c.after || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap', LOG_EVENT_CLS[log.event])}>
                        {LOG_EVENT_LABEL[log.event]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
