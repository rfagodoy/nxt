'use client'

/* Importação de carga inicial (parceiros e contratos).
 *
 * A tela impõe o fluxo em duas etapas: CONFERIR e só então IMPORTAR. Carga inicial
 * mexe na base inteira de um cliente novo — deixar isso acontecer num clique, sem
 * ninguém ver o que vai entrar, é como aplicar migração sem olhar o SQL.
 *
 * O arquivo é lido AQUI (exceljs já está no bundle da exportação) e as linhas vão como
 * JSON para a API, que valida e grava. A validação não fica no front de propósito:
 * regra de negócio no navegador é regra que se contorna.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, Download,
  ArrowRight, RotateCcw, Info,
} from 'lucide-react'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-context'
import { exportExcel } from '@/lib/export-excel'

type Tipo = 'parceiros' | 'contratos'
type Modo = 'CRIAR' | 'CRIAR_E_ATUALIZAR'
type Coluna = { chave: string; titulo: string; obrigatoria?: boolean; ajuda?: string; exemplo?: string }
type LinhaResultado = {
  linha: number
  acao: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR' | 'ERRO'
  identificacao: string
  detalhe?: string
  problemas: Array<{ linha: number; coluna?: string; mensagem: string }>
}
type Resultado = {
  tipo: Tipo; modo: Modo; total: number
  criar: number; atualizar: number; ignorar: number; erro: number
  linhas: LinhaResultado[]
  aplicado?: { criados: number; atualizados: number; falhas: number }
}

const TIPOS: Array<{ value: Tipo; label: string; nota: string }> = [
  { value: 'parceiros', label: 'Parceiros', nota: 'Comece por aqui: o contrato precisa do parceiro já cadastrado.' },
  { value: 'contratos', label: 'Contratos', nota: 'Cada linha é ligada ao parceiro pelo CNPJ/CPF.' },
]

const ACAO_CLS: Record<LinhaResultado['acao'], string> = {
  CRIAR:     'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  ATUALIZAR: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  IGNORAR:   'bg-muted text-muted-foreground',
  ERRO:      'bg-red-500/10 text-red-700 dark:text-red-400',
}
const ACAO_LABEL: Record<LinhaResultado['acao'], string> = {
  CRIAR: 'Criar', ATUALIZAR: 'Atualizar', IGNORAR: 'Já existe', ERRO: 'Erro',
}

/** Casa o título da planilha com a coluna esperada ignorando acento, caixa e pontuação:
 *  quem exporta do sistema antigo raramente acerta o título exato. */
const chaveDeTitulo = (t: string) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export default function ImportacaoPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [tipo, setTipo] = useState<Tipo>('parceiros')
  const [modo, setModo] = useState<Modo>('CRIAR')
  const [colunas, setColunas] = useState<Coluna[]>([])
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<Record<string, unknown>[]>([])
  const [naoMapeadas, setNaoMapeadas] = useState<string[]>([])
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [ocupado, setOcupado] = useState<'lendo' | 'conferindo' | 'importando' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregarColunas = useCallback(async (t: Tipo) => {
    const c = await apiJson<Coluna[]>(`/api/import/${t}/colunas`).catch(() => null)
    setColunas(Array.isArray(c) ? c : [])
    return Array.isArray(c) ? c : []
  }, [])

  const trocarTipo = async (t: Tipo) => {
    setTipo(t); limpar(); await carregarColunas(t)
  }

  const limpar = () => {
    setArquivo(null); setLinhas([]); setResultado(null); setErro(null); setNaoMapeadas([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const baixarModelo = async () => {
    const cols = colunas.length ? colunas : await carregarColunas(tipo)
    await exportExcel({
      fileName: `modelo-importacao-${tipo}`,
      sheet: 'Modelo',
      title: `Modelo de importação — ${tipo === 'parceiros' ? 'Parceiros' : 'Contratos'}`,
      subtitle: 'Preencha a partir da linha abaixo do cabeçalho. Colunas com * são obrigatórias.',
      columns: cols.map((c) => ({ header: c.obrigatoria ? `${c.titulo} *` : c.titulo, width: 26 })),
      // duas linhas de apoio: um exemplo real e a explicação de cada coluna
      rows: [
        cols.map((c) => c.exemplo ?? ''),
        cols.map((c) => c.ajuda ?? ''),
      ],
    })
  }

  const lerArquivo = async (file: File) => {
    setOcupado('lendo'); setErro(null); setResultado(null)
    try {
      const cols = colunas.length ? colunas : await carregarColunas(tipo)
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) { setErro('A planilha está vazia.'); return }

      /* O cabeçalho nem sempre é a linha 1: modelos costumam trazer título e subtítulo
         em cima. Procuramos a primeira linha que casa com pelo menos uma coluna
         conhecida, em vez de exigir que o usuário apague as linhas de enfeite. */
      let headerRow = 1
      let mapa: Record<number, string> = {}
      for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
        const tentativa: Record<number, string> = {}
        ws.getRow(r).eachCell((cell, col) => {
          const k = chaveDeTitulo(String(cell.value ?? '').replace(/\*/g, ''))
          const achou = cols.find((c) => chaveDeTitulo(c.titulo) === k)
          if (achou) tentativa[col] = achou.chave
        })
        if (Object.keys(tentativa).length > Object.keys(mapa).length) { mapa = tentativa; headerRow = r }
      }

      if (Object.keys(mapa).length === 0) {
        setErro('Nenhuma coluna reconhecida. Baixe o modelo e confira os títulos do cabeçalho.')
        return
      }

      const reconhecidas = new Set(Object.values(mapa))
      setNaoMapeadas(cols.filter((c) => !reconhecidas.has(c.chave)).map((c) => c.titulo))

      const out: Record<string, unknown>[] = []
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const linha: Record<string, unknown> = {}
        ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
          const chave = mapa[col]
          if (!chave) return
          const v = cell.value
          // célula de fórmula devolve { result }; data vem como Date
          const bruto = v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v
          linha[chave] = bruto instanceof Date ? bruto.toISOString().slice(0, 10) : bruto ?? ''
        })
        out.push(linha)
      }
      setArquivo(file.name)
      setLinhas(out)
    } catch (e) {
      setErro(`Não foi possível ler o arquivo: ${e instanceof Error ? e.message : 'formato não reconhecido'}`)
    } finally {
      setOcupado(null)
    }
  }

  const chamar = async (rota: 'conferir' | 'aplicar') => {
    setOcupado(rota === 'conferir' ? 'conferindo' : 'importando'); setErro(null)
    try {
      const res = await apiFetch(`/api/import/${tipo}/${rota}`, {
        method: 'POST',
        body: JSON.stringify({ linhas, modo }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setErro(data?.message ?? 'Não foi possível processar a planilha.'); return }
      setResultado(data as Resultado)
    } finally {
      setOcupado(null)
    }
  }

  const problemas = useMemo(() => (resultado?.linhas ?? []).filter((l) => l.acao === 'ERRO'), [resultado])
  const podeImportar = !!resultado && !resultado.aplicado && (resultado.criar + resultado.atualizar) > 0

  if (!isAdmin) {
    return <p className="text-xs text-muted-foreground">Somente administradores podem importar dados.</p>
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Importação de dados</h1>
        <p className="text-[11px] text-muted-foreground">
          Carga inicial a partir de planilha. Nada é gravado antes de você conferir o que vai entrar.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[22rem_1fr] flex-1 min-h-0">
        {/* ── coluna esquerda: preparo ── */}
        <div className="space-y-3 overflow-y-auto">
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">1. O que importar</h2>
            <div className="grid gap-1.5">
              {TIPOS.map((t) => (
                <button key={t.value} type="button" onClick={() => trocarTipo(t.value)}
                  className={cn('rounded-md border px-2.5 py-2 text-left transition-colors',
                    tipo === t.value ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
                  <span className="text-xs font-medium block">{t.label}</span>
                  <span className="text-[10.5px] text-muted-foreground">{t.nota}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={baixarModelo}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Download className="h-3.5 w-3.5" />Baixar modelo de planilha
            </button>
          </section>

          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">2. Se o registro já existir</h2>
            <div className="grid gap-1.5">
              <button type="button" onClick={() => { setModo('CRIAR'); setResultado(null) }}
                className={cn('rounded-md border px-2.5 py-2 text-left transition-colors',
                  modo === 'CRIAR' ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
                <span className="text-xs font-medium block">Não mexer</span>
                <span className="text-[10.5px] text-muted-foreground">Só cria o que ainda não existe. Mais seguro para reimportar.</span>
              </button>
              <button type="button" onClick={() => { setModo('CRIAR_E_ATUALIZAR'); setResultado(null) }}
                className={cn('rounded-md border px-2.5 py-2 text-left transition-colors',
                  modo === 'CRIAR_E_ATUALIZAR' ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
                <span className="text-xs font-medium block">Atualizar com os dados da planilha</span>
                <span className="text-[10.5px] text-muted-foreground">Sobrescreve o cadastro existente. O que estiver em branco na planilha apaga o valor atual.</span>
              </button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">3. Arquivo</h2>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerArquivo(f) }} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!ocupado}
              className="w-full rounded-lg border border-dashed px-3 py-6 text-center hover:bg-muted/50 transition-colors disabled:opacity-60">
              {ocupado === 'lendo'
                ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                : <Upload className="h-5 w-5 mx-auto text-muted-foreground" />}
              <span className="mt-1.5 block text-xs font-medium">{arquivo ?? 'Escolher planilha (.xlsx)'}</span>
              {arquivo && <span className="text-[10.5px] text-muted-foreground">{linhas.length} linha(s) lida(s)</span>}
            </button>

            {naoMapeadas.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                <Info className="inline h-3 w-3 mr-1" />
                Sem correspondência na planilha: {naoMapeadas.join(', ')}. Essas colunas ficarão vazias.
              </p>
            )}

            {linhas.length > 0 && (
              <div className="flex gap-2">
                <button type="button" onClick={() => chamar('conferir')} disabled={!!ocupado}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {ocupado === 'conferindo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  Conferir
                </button>
                <button type="button" onClick={limpar} disabled={!!ocupado}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60">
                  <RotateCcw className="h-3.5 w-3.5" />Limpar
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ── coluna direita: conferência ── */}
        <div className="flex flex-col min-h-0 rounded-xl border bg-card shadow-sm">
          {erro && (
            <div className="m-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {erro}
            </div>
          )}

          {!resultado && !erro && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground max-w-xs">
                Escolha a planilha e clique em <strong>Conferir</strong>. Você verá linha a linha o que será
                criado, o que já existe e o que está com problema — antes de qualquer gravação.
              </p>
            </div>
          )}

          {resultado && (
            <>
              <div className="border-b p-4 space-y-3">
                {resultado.aplicado ? (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Importação concluída: <strong>{resultado.aplicado.criados}</strong> criado(s),{' '}
                      <strong>{resultado.aplicado.atualizados}</strong> atualizado(s)
                      {resultado.aplicado.falhas > 0 && <>, <strong>{resultado.aplicado.falhas}</strong> falha(s)</>}.
                      {resultado.erro > 0 && ' As linhas com erro não foram importadas — corrija e reimporte apenas elas.'}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nada foi gravado ainda. Confira o resumo e confirme.
                  </p>
                )}

                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: 'Linhas', v: resultado.total, cls: 'text-foreground' },
                    { label: 'Criar', v: resultado.criar, cls: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Atualizar', v: resultado.atualizar, cls: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Já existem', v: resultado.ignorar, cls: 'text-muted-foreground' },
                    { label: 'Com erro', v: resultado.erro, cls: 'text-red-600 dark:text-red-400' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border px-2.5 py-1.5">
                      <p className="text-[10.5px] text-muted-foreground">{s.label}</p>
                      <p className={`text-sm font-bold tabular-nums ${s.cls}`}>{s.v}</p>
                    </div>
                  ))}
                </div>

                {podeImportar && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => chamar('aplicar')} disabled={!!ocupado}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                      {ocupado === 'importando' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Importar {resultado.criar + resultado.atualizar} registro(s)
                    </button>
                    {/* medido: ~40ms por registro (cada um é gravado com sua auditoria).
                        Dizer antes evita que a pessoa ache que travou e feche a aba. */}
                    {resultado.criar + resultado.atualizar > 300 && (
                      <span className="text-[11px] text-muted-foreground">
                        Cerca de {Math.ceil(((resultado.criar + resultado.atualizar) * 40) / 1000 / 60)} min — não feche esta aba.
                      </span>
                    )}
                    {resultado.erro > 0 && (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="inline h-3 w-3 mr-1" />
                        {resultado.erro} linha(s) com erro serão puladas.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* linhas com problema primeiro: é o que exige ação */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-1.5 font-medium w-16">Linha</th>
                      <th className="px-3 py-1.5 font-medium w-24">Ação</th>
                      <th className="px-3 py-1.5 font-medium">Registro</th>
                      <th className="px-3 py-1.5 font-medium">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...problemas, ...(resultado.linhas ?? []).filter((l) => l.acao !== 'ERRO')].map((l) => (
                      <tr key={l.linha} className="border-b last:border-0 align-top">
                        <td className="px-3 py-1 tabular-nums text-muted-foreground">{l.linha}</td>
                        <td className="px-3 py-1">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${ACAO_CLS[l.acao]}`}>
                            {ACAO_LABEL[l.acao]}
                          </span>
                        </td>
                        <td className="px-3 py-1">{l.identificacao}</td>
                        <td className="px-3 py-1 text-muted-foreground">
                          {l.problemas.length > 0
                            ? l.problemas.map((p, i) => (
                                <span key={i} className="block text-red-700 dark:text-red-400">
                                  {p.coluna ? <strong>{p.coluna}: </strong> : null}{p.mensagem}
                                </span>
                              ))
                            : l.detalhe ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
