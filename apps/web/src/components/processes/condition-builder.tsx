'use client'

import { Plus, X } from 'lucide-react'
import type { EdgeConditionSpec, EdgeConditionRule } from '@nxt/types'
import { gerarExpressao, rotuloDaCondicao, OPS_POR_TIPO, type CampoDisponivel } from '@/lib/flow-conditions'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CampoPicker } from './campo-picker'

/** O que o construtor lê e escreve de um caminho: a expressão do motor, o spec de
 *  autoria e o rótulo que acompanha a condição. */
export interface SaidaCondicional { condition?: string; conditionSpec?: EdgeConditionSpec; label?: string }

/* ── Construtor de condição de UM caminho: [Campo] [operador] [Valor], com E/OU.
     Gera a expressão do motor a partir do spec — ninguém digita expressão. ── */
export function CondBuilder({ edge, campos, onSet, semCampos }: {
  edge: SaidaCondicional; campos: CampoDisponivel[]; onSet: (patch: Partial<SaidaCondicional>) => void
  /** O que dizer quando não há campo para filtrar (quem chama sabe o PORQUÊ e o conserto). */
  semCampos?: React.ReactNode
}) {
  const spec = edge.conditionSpec ?? null

  const campoDe = (k: string) => campos.find((c) => c.key === k)
  const tipoDe = (k: string): CampoDisponivel['tipo'] => campoDe(k)?.tipo ?? 'texto'
  const labelDe = (k: string) => campoDe(k)?.label ?? k
  const valorLabelDe = (r: EdgeConditionRule) => {
    const c = campoDe(r.campo)
    if (c?.tipo === 'booleano') return r.valor === 'true' ? 'Sim' : 'Não'
    return c?.options?.find((o) => o.value === r.valor)?.label ?? r.valor
  }

  /* Auto-rótulo: acompanha a condição enquanto o usuário não escrever um rótulo PRÓPRIO
     (detectado por diferir do auto-rótulo do spec anterior). */
  const aplicar = (novo: EdgeConditionSpec) => {
    const autoAnterior = spec ? rotuloDaCondicao(spec, labelDe, valorLabelDe) : ''
    const auto = rotuloDaCondicao(novo, labelDe, valorLabelDe)
    const patch: Partial<SaidaCondicional> = { conditionSpec: novo, condition: gerarExpressao(novo, tipoDe) }
    if (!edge.label?.trim() || edge.label === autoAnterior) patch.label = auto
    onSet(patch)
  }

  const rules: EdgeConditionRule[] = spec?.rules.length ? spec.rules : [{ campo: '', op: 'eq', valor: '' }]
  const logic = spec?.logic ?? 'AND'
  const setRule = (i: number, r: EdgeConditionRule) => aplicar({ logic, rules: rules.map((x, j) => (j === i ? r : x)) })
  const dropRule = (i: number) => aplicar({ logic, rules: rules.filter((_, j) => j !== i) })

  const conector = (i: number) => (i === 0 ? 'Se' : logic === 'AND' ? 'e' : 'ou')

  return (
    <div className="space-y-3">
      {/* Expressão antiga (do modo avançado, removido a pedido do PO): mostrada como
          aviso; o primeiro filtro montado a substitui. */}
      {!spec && !!edge.condition?.trim() && (
        <p className="text-[11px] text-muted-foreground leading-snug rounded-md border border-dashed px-2.5 py-1.5">
          Expressão antiga: <span className="font-mono">{edge.condition}</span> — montar filtros abaixo a substitui.
        </p>
      )}
      {campos.length === 0 ? (semCampos ??
        <p className="text-[11px] text-muted-foreground leading-snug rounded-md border border-dashed px-2.5 py-2">
          Nenhum campo disponível ainda: as condições testam o que as atividades <span className="font-medium">anteriores</span> capturam.
          Coloque antes desta escolha uma atividade com Tela de contrato (ou com formulário).
        </p>
      ) : (
        <>
          {/* E/OU dito por extenso, ANTES das regras: decide como elas se somam */}
          {rules.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Este caminho serve quando</span>
              <div role="radiogroup" aria-label="Como as regras se somam" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                {(['AND', 'OR'] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={logic === l} onClick={() => aplicar({ logic: l, rules })}
                    className={cn('rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                      logic === l ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground')}>
                    {l === 'AND' ? 'todas as regras valem' : 'qualquer uma vale'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ol className="space-y-2">
            {rules.map((r, i) => {
              const c = campoDe(r.campo)
              const ops = OPS_POR_TIPO[c?.tipo ?? 'texto']
              return (
                <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_132px_150px_28px] items-center gap-2">
                  <span className="text-right text-xs font-bold text-violet-700 dark:text-violet-300">{conector(i)}</span>
                  <CampoPicker campos={campos} value={r.campo} ariaLabel={`Campo da ${i + 1}ª regra`}
                    onChange={(v) => { const t = campoDe(v)?.tipo ?? 'texto'; setRule(i, { campo: v, op: OPS_POR_TIPO[t][0].value, valor: '' }) }} />
                  <Select value={r.op} onValueChange={(v) => setRule(i, { ...r, op: v as EdgeConditionRule['op'] })}>
                    <SelectTrigger className="h-9 text-xs" aria-label={`Comparação da ${i + 1}ª regra`}><SelectValue /></SelectTrigger>
                    <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {c?.tipo === 'selecao' && c.options?.length ? (
                    <Select value={r.valor || undefined} onValueChange={(v) => setRule(i, { ...r, valor: v })}>
                      <SelectTrigger className="h-9 min-w-0 text-xs" aria-label={`Valor da ${i + 1}ª regra`}><SelectValue placeholder="Valor…" /></SelectTrigger>
                      <SelectContent>{c.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : c?.tipo === 'booleano' ? (
                    <Select value={r.valor || undefined} onValueChange={(v) => setRule(i, { ...r, valor: v })}>
                      <SelectTrigger className="h-9 text-xs" aria-label={`Valor da ${i + 1}ª regra`}><SelectValue placeholder="Valor…" /></SelectTrigger>
                      <SelectContent><SelectItem value="true" className="text-xs">Sim</SelectItem><SelectItem value="false" className="text-xs">Não</SelectItem></SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-9 text-xs" type={c?.tipo === 'data' ? 'date' : 'text'} aria-label={`Valor da ${i + 1}ª regra`}
                      inputMode={c?.tipo === 'numero' ? 'decimal' : undefined} placeholder="Valor"
                      value={r.valor} onChange={(ev) => setRule(i, { ...r, valor: ev.target.value })} />
                  )}
                  {rules.length > 1 ? (
                    <button type="button" aria-label={`Remover a ${i + 1}ª regra`} title="Remover esta regra" onClick={() => dropRule(i)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  ) : <span />}
                </li>
              )
            })}
          </ol>
          <button type="button" onClick={() => aplicar({ logic, rules: [...rules, { campo: '', op: 'eq', valor: '' }] })}
            className="ml-9 inline-flex items-center gap-1 rounded-md border border-dashed border-violet-500/50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-500/5 dark:text-violet-300">
            <Plus className="h-3 w-3" />outra regra
          </button>
        </>
      )}
    </div>
  )
}
