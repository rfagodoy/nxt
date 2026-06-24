'use client'

import Link from 'next/link'
import { ArrowLeft, Pencil, FileText, DollarSign, Users } from 'lucide-react'

const MOCK = {
  id: '1', numero: 'CTR-2026-001', titulo: 'Prestação de Serviços de TI',
  tipo: 'Prestação de Serviços', situacao: 'ATIVO',
  inicio: '01/01/2026', termino: '31/12/2026', assinatura: '28/12/2025',
  prazo_indeterminado: false,
  objeto: 'Contratação de empresa especializada para prestação de serviços de suporte técnico, desenvolvimento e manutenção de sistemas de informação.',
  valor_parcela: 10000, valor_total: 120000, moeda: 'BRL',
  condicao_pagamento: 'Mensal', complemento_valor: 'Mais impostos conforme nota fiscal',
  indice_reajuste: 'IPCA', data_reajuste: '01/01/2027', periodicidade_reajuste: 'Anual',
  partes: [
    { papel: 'Contratante',  documento: '00.000.000/0001-00', nome: 'Minha Empresa Ltda'  },
    { papel: 'Contratada',   documento: '12.ABC.345/0001-99', nome: 'Tech Solutions Ltda' },
  ],
}

const SIT_CLS: Record<string, string> = {
  ATIVO: 'bg-green-100 text-green-800', PENDENTE: 'bg-yellow-100 text-yellow-800',
  ENCERRADO: 'bg-gray-100 text-gray-600', RESCINDIDO: 'bg-red-100 text-red-700', SUSPENSO: 'bg-orange-100 text-orange-700',
}
const SIT_LABEL: Record<string, string> = {
  ATIVO: 'Ativo', PENDENTE: 'Pend. assinatura', ENCERRADO: 'Encerrado', RESCINDIDO: 'Rescindido', SUSPENSO: 'Suspenso',
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-xs col-span-2">{value || '—'}</span>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

export default function ContratoDetail() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/modules/contratos" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-base font-semibold tracking-tight">{MOCK.titulo}</h1>
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${SIT_CLS[MOCK.situacao]}`}>
                {SIT_LABEL[MOCK.situacao]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[11px] font-medium">{MOCK.tipo}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{MOCK.numero}</span>
            </div>
          </div>
        </div>
        <Link href={`/modules/contratos/${MOCK.id}/edit`}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium hover:bg-muted transition-colors">
          <Pencil className="h-3.5 w-3.5" />Editar
        </Link>
      </div>

      <Section icon={FileText} title="Dados Básicos">
        <Row label="Número"            value={MOCK.numero} />
        <Row label="Título"            value={MOCK.titulo} />
        <Row label="Tipo"              value={MOCK.tipo} />
        <Row label="Situação"          value={SIT_LABEL[MOCK.situacao]} />
        <Row label="Data de assinatura" value={MOCK.assinatura} />
        <Row label="Início da vigência" value={MOCK.inicio} />
        <Row label="Término da vigência" value={MOCK.prazo_indeterminado ? 'Prazo indeterminado' : MOCK.termino} />
        <Row label="Objeto"            value={MOCK.objeto} />
      </Section>

      <Section icon={DollarSign} title="Valores">
        <Row label="Moeda"               value={MOCK.moeda} />
        <Row label="Valor da parcela"    value={BRL.format(MOCK.valor_parcela)} />
        <Row label="Valor total"         value={BRL.format(MOCK.valor_total)} />
        <Row label="Condição de pagamento" value={MOCK.condicao_pagamento} />
        <Row label="Complemento"         value={MOCK.complemento_valor} />
        <Row label="Índice de reajuste"  value={MOCK.indice_reajuste} />
        <Row label="Data para reajuste"  value={MOCK.data_reajuste} />
        <Row label="Periodicidade"       value={MOCK.periodicidade_reajuste} />
      </Section>

      <Section icon={Users} title="Partes Envolvidas">
        <div className="overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-0 py-2 font-medium text-muted-foreground">Papel</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">CPF / CNPJ</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome / Razão Social</th>
              </tr>
            </thead>
            <tbody>
              {MOCK.partes.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{p.papel}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{p.documento}</td>
                  <td className="px-3 py-2">{p.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

    </div>
  )
}
