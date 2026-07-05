'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, Plus, Trash2, Download, Loader2, RefreshCw, CloudDownload } from 'lucide-react'
import { LookupTablePage } from '@/components/settings/lookup-table'
import { apiFetch } from '@/lib/http'
import { useLookupTable, type LookupEntry } from '@/hooks/use-lookup-table'
import { useIndiceValores } from '@/hooks/use-indice-valores'
import { INDICES_KEY, INIT_INDICES, BCB_INDICES, normIndiceLabel } from '@/lib/contract-options'

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const fmtComp = (yyyymm: string) => { const [y, m] = yyyymm.split('-'); return m && y ? `${m}/${y}` : yyyymm }

/* Página consolidada: o catálogo de índices (com Código SGS por índice) e a série
   mensal de valores de cada um — manual ou importada do Banco Central — na mesma tela. */
export default function IndicesReajuste() {
  return (
    <div className="space-y-4">
      <LookupTablePage
        title="Índices de reajuste"
        description="Índices econômicos para reajuste de contratos e sua série mensal de valores"
        icon={TrendingUp}
        storageKey={INDICES_KEY}
        initialData={INIT_INDICES}
        withCode
        codeLabel="Código SGS"
        codePlaceholder="Ex: 189"
      />
      <div className="max-w-4xl mx-auto">
        <IndiceValoresManager />
      </div>
    </div>
  )
}

/* Gestor da série mensal (%) do índice selecionado. O Código SGS usado no import vem
   do próprio índice (catálogo acima); sem ele, dá pra digitar na hora. */
function IndiceValoresManager() {
  const indices = useLookupTable(INDICES_KEY, INIT_INDICES)
  const store   = useIndiceValores()

  const [indiceId, setIndiceId] = useState('')
  const indice = indices.entries.find(i => i.id === indiceId)
  const linhas = useMemo(() => {
    const map = store.valores[indiceId] ?? {}
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1)) // competência desc
  }, [store.valores, indiceId])

  /* adicionar valor manual */
  const [novaComp, setNovaComp] = useState('')
  const [novoPct, setNovoPct]   = useState('')
  const addValor = () => {
    if (!indiceId || !novaComp) return
    const pct = parseFloat(novoPct.replace(',', '.'))
    if (!Number.isFinite(pct)) return
    store.setValor(indiceId, novaComp, pct)
    setNovaComp(''); setNovoPct('')
  }

  /* ações em lote: sincronizar catálogo com o BCB + importar séries completas */
  const [syncing, setSyncing] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const sincronizarCatalogo = () => {
    const merged: LookupEntry[] = indices.entries.map(e => ({ ...e }))
    for (const c of BCB_INDICES) {
      const found = merged.find(e => normIndiceLabel(e.label) === normIndiceLabel(c.label))
      if (found) { if (!found.code) found.code = c.sgs }
      else merged.push({ id: `bcb_${c.sgs}`, label: c.label, code: c.sgs, active: true })
    }
    indices.replace(merged)
    setBulkMsg({ tipo: 'ok', texto: 'Catálogo sincronizado: índices do BCB adicionados e códigos SGS preenchidos.' })
  }

  const importarTudo = async () => {
    const comSgs = indices.entries.filter(e => e.code && /^\d+$/.test(e.code))
    if (!comSgs.length) { setBulkMsg({ tipo: 'erro', texto: 'Nenhum índice com Código SGS. Sincronize o catálogo primeiro.' }); return }
    setSyncing(true); setBulkMsg(null)
    let ok = 0, fail = 0
    for (const e of comSgs) {
      try {
        const res = await apiFetch(`/api/contracts/indices/bcb?code=${e.code}&full=1`)
        if (!res.ok) { fail++; continue }
        const dados = await res.json() as Array<{ competencia: string; valor: number }>
        const map: Record<string, number> = {}
        for (const d of dados) map[d.competencia] = d.valor
        if (Object.keys(map).length) { store.mergeMany(e.id, map); ok++ } else fail++
      } catch { fail++ }
    }
    setSyncing(false)
    setBulkMsg({ tipo: fail && !ok ? 'erro' : 'ok', texto: `Séries completas importadas: ${ok} índice(s)${fail ? `, ${fail} falha(s)` : ''}.` })
  }

  /* import do Banco Central — SGS vem do código do índice, editável */
  const [sgs, setSgs]     = useState('')
  const [de, setDe]       = useState('')
  const [ate, setAte]     = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg]     = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const selecionarIndice = (id: string) => {
    setIndiceId(id); setMsg(null)
    setSgs(indices.entries.find(i => i.id === id)?.code ?? '')
  }

  const importar = async () => {
    if (!indiceId || !/^\d+$/.test(sgs)) { setMsg({ tipo: 'erro', texto: 'Informe o Código SGS numérico (cadastre-o no índice acima).' }); return }
    setImporting(true); setMsg(null)
    try {
      const qs = new URLSearchParams({ code: sgs, ...(de ? { from: de } : {}), ...(ate ? { to: ate } : {}) })
      const res = await apiFetch(`/api/contracts/indices/bcb?${qs.toString()}`)
      if (!res.ok) { setMsg({ tipo: 'erro', texto: `Falha ao importar (${res.status}).` }); return }
      const dados = await res.json() as Array<{ competencia: string; valor: number }>
      if (!dados.length) { setMsg({ tipo: 'erro', texto: 'Nenhum dado retornado para o período.' }); return }
      const map: Record<string, number> = {}
      for (const d of dados) map[d.competencia] = d.valor
      store.mergeMany(indiceId, map)
      setMsg({ tipo: 'ok', texto: `${dados.length} competência(s) importada(s) do Banco Central.` })
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não foi possível consultar o Banco Central.' })
    } finally { setImporting(false) }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Valores de índice (série mensal %)</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          A série é a fonte de verdade — preencha manualmente ou importe do Banco Central. Sugere o percentual ao aplicar um reajuste.
        </p>
      </div>

      {/* ações em lote */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={sincronizarCatalogo}
          className="inline-flex items-center gap-1.5 h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />Sincronizar catálogo (BCB)
        </button>
        <button type="button" onClick={importarTudo} disabled={syncing}
          className="inline-flex items-center gap-1.5 h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
          {syncing ? 'Importando séries...' : 'Importar séries completas'}
        </button>
        {bulkMsg && <span className={bulkMsg.tipo === 'ok' ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-destructive'}>{bulkMsg.texto}</span>}
      </div>

      <label className="block space-y-1 max-w-xs">
        <span className="text-[11px] font-medium text-muted-foreground">Índice</span>
        <select value={indiceId} onChange={e => selecionarIndice(e.target.value)} className={inputCls}>
          <option value="">Selecione um índice...</option>
          {indices.active.map(i => <option key={i.id} value={i.id}>{i.label}{i.code ? ` (SGS ${i.code})` : ''}</option>)}
        </select>
      </label>

      {indice && (
        <>
          {/* import BCB */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Importar do Banco Central (opcional)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">Código SGS</span>
                <input value={sgs} onChange={e => setSgs(e.target.value)} placeholder="ex.: 189" className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">De (mês)</span>
                <input type="month" value={de} onChange={e => setDe(e.target.value)} className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">Até (mês)</span>
                <input type="month" value={ate} onChange={e => setAte(e.target.value)} className={inputCls} />
              </label>
              <button type="button" onClick={importar} disabled={importing}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">IPCA=433 · IGP-M=189 · INPC=188 · IGP-DI=190 · CDI=4391 · SELIC=4390. Cadastre o código no índice acima para não precisar redigitar. Sem intervalo, importa os últimos 5 anos.</p>
            {msg && <p className={msg.tipo === 'ok' ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-destructive'}>{msg.texto}</p>}
          </div>

          {/* adicionar manual */}
          <div className="flex items-end gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Competência</span>
              <input type="month" value={novaComp} onChange={e => setNovaComp(e.target.value)} className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Percentual (%)</span>
              <input value={novoPct} onChange={e => setNovoPct(e.target.value)} placeholder="0,00" className={inputCls} />
            </label>
            <button type="button" onClick={addValor} disabled={!novaComp || !novoPct}
              className="inline-flex items-center gap-1.5 h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors">
              <Plus className="h-3.5 w-3.5" />Adicionar
            </button>
          </div>

          {/* tabela de valores */}
          {linhas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum valor cadastrado para {indice.label}.</p>
          ) : (
            <div className="rounded-md border overflow-hidden max-w-sm">
              <div className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2 px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Competência</span><span>Percentual</span><span />
              </div>
              <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
                {linhas.map(([comp, pct]) => (
                  <div key={comp} className="group grid grid-cols-[1fr_1fr_2rem] items-center gap-2 px-3 py-1.5 hover:bg-muted/30">
                    <span className="text-xs font-medium tabular-nums">{fmtComp(comp)}</span>
                    <span className="text-xs tabular-nums">{String(pct).replace('.', ',')}%</span>
                    <button type="button" onClick={() => store.removeValor(indiceId, comp)} title="Remover"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
