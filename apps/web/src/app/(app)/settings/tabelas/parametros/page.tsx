'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, SlidersHorizontal, Hash, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import {
  CONTRACT_NUMBERING_KEY, DEFAULT_NUMBERING, formatNumero, type NumberingCfg,
} from '@/lib/contract-numbering'

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const labelCls = 'block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/30')}>
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}

export default function ParametrosGerais() {
  const [mounted, setMounted] = useState(false)
  const [saved,   setSaved]   = useState(false)

  // config vinda do backend (para preservar contador vivo proximo/ano ao salvar)
  const [loaded, setLoaded] = useState<NumberingCfg>(DEFAULT_NUMBERING)

  const [modo,       setModo]       = useState<NumberingCfg['modo']>(DEFAULT_NUMBERING.modo)
  const [prefixo,    setPrefixo]    = useState(DEFAULT_NUMBERING.prefixo)
  const [separador,  setSeparador]  = useState(DEFAULT_NUMBERING.separador)
  const [incluirAno, setIncluirAno] = useState(DEFAULT_NUMBERING.incluirAno)
  const [digitos,    setDigitos]    = useState(DEFAULT_NUMBERING.digitos)
  const [sufixo,     setSufixo]     = useState(DEFAULT_NUMBERING.sufixo)
  const [inicio,     setInicio]     = useState(DEFAULT_NUMBERING.inicio)

  const apply = (c: NumberingCfg) => {
    setLoaded(c)
    setModo(c.modo); setPrefixo(c.prefixo); setSeparador(c.separador)
    setIncluirAno(c.incluirAno); setDigitos(c.digitos); setSufixo(c.sufixo); setInicio(c.inicio)
  }

  useEffect(() => {
    setMounted(true)
    const cached = cacheRead<NumberingCfg | null>(CONTRACT_NUMBERING_KEY, null)
    if (cached) apply({ ...DEFAULT_NUMBERING, ...cached })
    void pullSetting<NumberingCfg>(CONTRACT_NUMBERING_KEY).then(remote => { if (remote) apply({ ...DEFAULT_NUMBERING, ...remote }) })
  }, [])

  const year = new Date().getFullYear()
  const draft: NumberingCfg = { modo, prefixo, separador, incluirAno, digitos, sufixo, inicio, proximo: loaded.proximo, ano: loaded.ano }

  /* sequência mostrada no preview: reinício anual pendente ou início alterado → usa 'inicio';
     caso contrário, o contador vivo do backend. */
  const seqPreview =
    (incluirAno && loaded.ano !== year) ? inicio
    : (inicio !== loaded.inicio)        ? inicio
    : (loaded.proximo ?? inicio)
  const preview = formatNumero(draft, seqPreview, year)

  const save = () => {
    // preserva o contador vivo; reinicia quando o usuário muda a Sequência inicial ou ainda não há contador
    const inicioMudou = inicio !== loaded.inicio
    const proximo = (loaded.proximo == null || inicioMudou) ? inicio : loaded.proximo
    const ano = incluirAno ? (inicioMudou ? year : (loaded.ano ?? year)) : undefined
    const cfg: NumberingCfg = { modo, prefixo, separador, incluirAno, digitos, sufixo, inicio, proximo, ano }
    pushSetting(CONTRACT_NUMBERING_KEY, cfg)
    setLoaded(cfg)
    setSaved(true); setTimeout(() => setSaved(false), 2200)
  }

  const isAuto = modo === 'AUTO'

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* cabeçalho */}
      <div className="flex items-center gap-2.5">
        <Link href="/settings/tabelas" title="Voltar para o hub"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="p-2 rounded-lg bg-primary/10"><SlidersHorizontal className="h-4 w-4 text-primary" /></div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Parâmetros gerais</h1>
          <p className="text-[11px] text-muted-foreground">Configurações de comportamento do sistema.</p>
        </div>
      </div>

      {!mounted ? (
        <div className="rounded-xl border bg-card shadow-sm h-64 animate-pulse" />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* título do bloco */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold">Numeração de contratos</h2>
          </div>

          <div className="p-4 space-y-4">
            {/* modo */}
            <div>
              <label className={labelCls}>Modo de numeração</label>
              <div className="grid grid-cols-2 gap-2 max-w-sm">
                {([['MANUAL', 'Manual', 'Você digita o número em cada contrato'], ['AUTO', 'Automática', 'O sistema gera o número ao salvar']] as const).map(([val, title, desc]) => (
                  <button key={val} type="button" onClick={() => setModo(val)}
                    className={cn('rounded-lg border p-2.5 text-left transition-all', modo === val ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'hover:border-primary/30')}>
                    <p className={cn('text-xs font-semibold', modo === val && 'text-primary')}>{title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* opções do modo automático */}
            {isAuto && (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Prefixo</label>
                    <input value={prefixo} onChange={e => setPrefixo(e.target.value)} placeholder="Ex: CTR" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Separador</label>
                    <input value={separador} onChange={e => setSeparador(e.target.value)} maxLength={3} placeholder="Ex: -" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Sequência inicial</label>
                    <input type="number" min={0} value={inicio} onChange={e => setInicio(Math.max(0, parseInt(e.target.value) || 0))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Nº de dígitos (zeros à esquerda)</label>
                    <input type="number" min={1} max={12} value={digitos} onChange={e => setDigitos(Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Sufixo (opcional)</label>
                    <input value={sufixo} onChange={e => setSufixo(e.target.value)} placeholder="Ex: BR" className={inputCls} />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">Incluir o ano e reiniciar a cada ano</p>
                    <p className="text-[10px] text-muted-foreground">Ex.: {prefixo}{separador}{year}{separador}0001 — a sequência volta a começar em {inicio} na virada do ano.</p>
                  </div>
                  <Toggle checked={incluirAno} onChange={setIncluirAno} />
                </div>

                {/* preview */}
                <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Próximo número</span>
                  <span className="font-mono text-sm font-semibold text-primary">{preview || '—'}</span>
                </div>
              </div>
            )}

            {!isAuto && (
              <p className="text-[11px] text-muted-foreground">
                No modo manual, o campo <span className="font-medium text-foreground">Número</span> continua obrigatório e digitado em cada contrato.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {saved && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Salvo</span>}
              <button type="button" onClick={save}
                className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Salvar parâmetros
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
