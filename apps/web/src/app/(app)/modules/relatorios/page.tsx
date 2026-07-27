'use client'

/* Relatório de contratos.
 *
 * A razão de existir: "Vencido" NÃO existe no banco — é derivado (VIGENTE com término
 * já passado, contando aditivos e renovações). Sem esta tela, a única forma de
 * responder "o que está vencido?" era olhar a listagem contrato a contrato.
 *
 * O recorte por período é sobre a VIGÊNCIA, não sobre a data de cadastro: a pergunta
 * de quem gere contrato é "o que esteve valendo neste intervalo".
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileBarChart, Loader2, Filter, Download, RotateCcw, ArrowUpDown } from 'lucide-react'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { SIT_LABEL, SIT_CLS } from '@/lib/contract-situacao'
import { SITUACOES } from '@/lib/contract-options'

type Linha = {
  id: string; numero: string; titulo: string; tipo: string; natureza: string
  situacao: string; inicioVigencia: string | null; terminoVigencia: string | null
  prazoIndeterminado: boolean; valor: number; moeda: string; parceiros: string
  diasParaTerminar: number | null
}
type Totais = {
  contratos: number; valorTotal: number
  porSituacao: Array<{ situacao: string; contratos: number; valor: number }>
  porNatureza: Array<{ natureza: string; contratos: number; valor: number }>
}
type Resposta =
  | { excedeu: true; total: number; limite: number; mensagem: string }
  | { excedeu: false; geradoEm: string; totalNaBase: number; linhas: Linha[]; totais: Totais; duracaoMs: number }
type Opcoes = { tipos: string[]; naturezas: string[]; parceiros: Array<{ id: string; razaoSocial: string }> }
type Campo = 'numero' | 'titulo' | 'situacao' | 'terminoVigencia' | 'valor' | 'parceiros'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—')
const NAT_LABEL: Record<string, string> = { DESPESA: 'Despesa', RECEITA: 'Receita', AMBOS: 'Ambos' }

export default function RelatoriosPage() {
  const [opcoes, setOpcoes] = useState<Opcoes>({ tipos: [], naturezas: [], parceiros: [] })
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [situacoes, setSituacoes] = useState<string[]>([])
  const [naturezas, setNaturezas] = useState<string[]>([])
  const [tipos, setTipos] = useState<string[]>([])
  const [parceiroIds, setParceiroIds] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [ordenarPor, setOrdenarPor] = useState<Campo>('numero')
  const [desc, setDesc] = useState(false)

  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    void apiJson<Opcoes>('/api/reports/contratos/opcoes')
      .then((o) => o && setOpcoes(o))
      .catch(() => null)
  }, [])

  const gerar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await apiFetch('/api/reports/contratos', {
        method: 'POST',
        body: JSON.stringify({ de: de || undefined, ate: ate || undefined, situacoes, naturezas, tipos, parceiroIds, busca: busca || undefined, ordenarPor, desc }),
      })
      setDados(await res.json().catch(() => null))
    } finally {
      setCarregando(false)
    }
  }, [de, ate, situacoes, naturezas, tipos, parceiroIds, busca, ordenarPor, desc])

  // primeira carga: mostra a base inteira, para a tela não nascer vazia
  useEffect(() => { void gerar() }, [ordenarPor, desc]) // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor])

  const limpar = () => {
    setDe(''); setAte(''); setSituacoes([]); setNaturezas([]); setTipos([]); setParceiroIds([]); setBusca('')
  }

  const linhas = useMemo(() => (dados && !dados.excedeu ? dados.linhas : []), [dados])
  const totais = dados && !dados.excedeu ? dados.totais : null

  const exportar = async () => {
    if (!linhas.length) return
    await exportExcel({
      fileName: 'relatorio-contratos',
      sheet: 'Contratos',
      title: 'Relatório de contratos',
      subtitle: `${linhas.length} contrato(s) · ${BRL.format(totais?.valorTotal ?? 0)}${de || ate ? ` · vigência entre ${fmtData(de || null)} e ${fmtData(ate || null)}` : ''}`,
      columns: [
        { header: 'Número', width: 18 }, { header: 'Título', width: 34 }, { header: 'Parceiro(s)', width: 30 },
        { header: 'Tipo', width: 20 }, { header: 'Natureza', width: 12 }, { header: 'Situação', width: 14 },
        { header: 'Início', width: 12 }, { header: 'Término', width: 12 }, { header: 'Valor', width: 16, align: 'right' },
      ],
      rows: linhas.map((l) => [
        l.numero, l.titulo, l.parceiros, l.tipo, NAT_LABEL[l.natureza] ?? l.natureza,
        SIT_LABEL[l.situacao] ?? l.situacao, fmtData(l.inicioVigencia),
        l.prazoIndeterminado ? 'Indeterminado' : fmtData(l.terminoVigencia), l.valor,
      ]),
      footer: ['Total', '', '', '', '', '', '', '', totais?.valorTotal ?? 0],
    })
  }

  const ordenarPorCampo = (c: Campo) => {
    if (c === ordenarPor) setDesc((d) => !d)
    else { setOrdenarPor(c); setDesc(false) }
  }

  const chip = (ativo: boolean) =>
    cn('rounded-md border px-2 py-0.5 text-[11px] transition-colors', ativo ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted')

  const th = (c: Campo, label: string, extra = '') => (
    <th className={cn('px-3 py-1.5 font-medium cursor-pointer select-none hover:text-foreground', extra)} onClick={() => ordenarPorCampo(c)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {ordenarPor === c && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  )

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Relatório de contratos</h1>
          <p className="text-[11px] text-muted-foreground">
            Situação calculada na hora — inclusive <strong>Vencido</strong>, que não é gravado no banco.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportar} disabled={!linhas.length}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />Exportar
          </button>
          <button type="button" onClick={gerar} disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />}
            Aplicar filtros
          </button>
        </div>
      </div>

      {/* filtros */}
      <section className="rounded-xl border bg-card p-3 shadow-sm space-y-2.5">
        <div className="grid gap-2.5 sm:grid-cols-[repeat(2,10rem)_1fr]">
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Vigência de</span>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium">até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Buscar</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="número, título ou parceiro"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground w-16">Situação</span>
          {SITUACOES.map((s) => (
            <button key={s.value} type="button" className={chip(situacoes.includes(s.value))}
              onClick={() => alternar(situacoes, setSituacoes, s.value)}>{s.label}</button>
          ))}
        </div>

        {opcoes.naturezas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground w-16">Natureza</span>
            {opcoes.naturezas.map((n) => (
              <button key={n} type="button" className={chip(naturezas.includes(n))}
                onClick={() => alternar(naturezas, setNaturezas, n)}>{NAT_LABEL[n] ?? n}</button>
            ))}
          </div>
        )}

        {opcoes.tipos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground w-16">Tipo</span>
            {opcoes.tipos.slice(0, 12).map((t) => (
              <button key={t} type="button" className={chip(tipos.includes(t))}
                onClick={() => alternar(tipos, setTipos, t)}>{t}</button>
            ))}
          </div>
        )}

        {opcoes.parceiros.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground w-16">Parceiro</span>
            <select value="" onChange={(e) => e.target.value && alternar(parceiroIds, setParceiroIds, e.target.value)}
              className="h-7 rounded-md border border-input bg-background px-2 text-[11px]">
              <option value="">adicionar…</option>
              {opcoes.parceiros.filter((p) => !parceiroIds.includes(p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.razaoSocial}</option>
              ))}
            </select>
            {parceiroIds.map((id) => {
              const p = opcoes.parceiros.find((x) => x.id === id)
              return (
                <button key={id} type="button" className={chip(true)} onClick={() => alternar(parceiroIds, setParceiroIds, id)}>
                  {p?.razaoSocial ?? id} ×
                </button>
              )
            })}
          </div>
        )}

        <button type="button" onClick={limpar} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3 w-3" />Limpar filtros
        </button>
      </section>

      {dados?.excedeu && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {dados.mensagem} Use os filtros para reduzir o recorte.
        </div>
      )}

      {totais && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-[10.5px] text-muted-foreground">Contratos</p>
            <p className="text-sm font-bold tabular-nums">{totais.contratos}</p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-[10.5px] text-muted-foreground">Valor total</p>
            <p className="text-sm font-bold tabular-nums">{BRL.format(totais.valorTotal)}</p>
          </div>
          {totais.porSituacao.slice(0, 2).map((s) => (
            <div key={s.situacao} className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[10.5px] text-muted-foreground">{SIT_LABEL[s.situacao] ?? s.situacao}</p>
              <p className="text-sm font-bold tabular-nums">{s.contratos} · {BRL.format(s.valor)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border bg-card shadow-sm">
        {carregando && !linhas.length ? (
          <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando…
          </div>
        ) : !linhas.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileBarChart className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Nenhum contrato no recorte escolhido.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b text-left text-muted-foreground">
              <tr>
                {th('numero', 'Número')}
                {th('titulo', 'Título')}
                {th('parceiros', 'Parceiro(s)')}
                {th('situacao', 'Situação')}
                {th('terminoVigencia', 'Término')}
                {th('valor', 'Valor', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-1 whitespace-nowrap font-medium">{l.numero}</td>
                  <td className="px-3 py-1">{l.titulo}</td>
                  <td className="px-3 py-1 text-muted-foreground">{l.parceiros || '—'}</td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${SIT_CLS[l.situacao] ?? ''}`}>
                      {SIT_LABEL[l.situacao] ?? l.situacao}
                    </span>
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    {l.prazoIndeterminado ? <span className="text-muted-foreground">Indeterminado</span> : fmtData(l.terminoVigencia)}
                    {l.diasParaTerminar !== null && l.diasParaTerminar >= 0 && l.diasParaTerminar <= 30 && (
                      <span className="ml-1 text-[10.5px] text-amber-600 dark:text-amber-400">em {l.diasParaTerminar}d</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">{BRL.format(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
