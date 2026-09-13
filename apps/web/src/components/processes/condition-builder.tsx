'use client'

import { X } from 'lucide-react'
import type { EdgeConditionSpec, EdgeConditionRule } from '@nxt/types'
import { gerarExpressao, rotuloDaCondicao, OPS_POR_TIPO, type CampoDisponivel } from '@/lib/flow-conditions'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** O que o construtor lê e escreve de um caminho: a expressão do motor, o spec de
 *  autoria e o rótulo que acompanha a condição. */
export interface SaidaCondicional { condition?: string; conditionSpec?: EdgeConditionSpec; label?: string }

/* ── Construtor de condição de UM caminho: [Campo] [operador] [Valor], com E/OU.
     Gera a expressão do motor a partir do spec — ninguém digita expressão. ── */
export function CondBuilder({ edge, campos, onSet }: {
  edge: SaidaCondicional; campos: CampoDisponivel[]; onSet: (patch: Partial<SaidaCondicional>) => void
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

  return (
    <div className="space-y-1.5">
      {/* Expressão antiga (do modo avançado, removido a pedido do PO): mostrada como
          aviso; o primeiro filtro montado a substitui. */}
      {!spec && !!edge.condition?.trim() && (
        <p className="text-[10.5px] text-muted-foreground leading-snug rounded-md border border-dashed px-2.5 py-1.5">
          Expressão antiga: <span className="font-mono">{edge.condition}</span> — montar filtros abaixo a substitui.
        </p>
      )}
      {campos.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-snug rounded-md border border-dashed px-2.5 py-2">
          Nenhum campo disponível ainda: as condições testam o que as atividades <span className="font-medium">anteriores</span> capturam.
          Coloque antes desta escolha uma atividade com Tela de contrato (ou com formulário).
        </p>
      ) : rules.map((r, i) => {
        const c = campoDe(r.campo)
        const ops = OPS_POR_TIPO[c?.tipo ?? 'texto']
        return (
          <div key={i} className="flex items-center gap-1.5">
            <Select value={r.campo || undefined} onValueChange={(v) => { const t = campoDe(v)?.tipo ?? 'texto'; setRule(i, { campo: v, op: OPS_POR_TIPO[t][0].value, valor: '' }) }}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-[180px]"><SelectValue placeholder="Campo…" /></SelectTrigger>
              <SelectContent>
                {campos.map((cp) => (
                  <SelectItem key={cp.key} value={cp.key} className="text-xs">
                    {cp.label} <span className="text-muted-foreground">· {cp.origem}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={r.op} onValueChange={(v) => setRule(i, { ...r, op: v as EdgeConditionRule['op'] })}>
              <SelectTrigger className="h-8 text-xs w-[150px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {c?.tipo === 'selecao' && c.options?.length ? (
              <Select value={r.valor || undefined} onValueChange={(v) => setRule(i, { ...r, valor: v })}>
                <SelectTrigger className="h-8 text-xs w-[150px] shrink-0"><SelectValue placeholder="Valor…" /></SelectTrigger>
                <SelectContent>{c.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : c?.tipo === 'booleano' ? (
              <Select value={r.valor || undefined} onValueChange={(v) => setRule(i, { ...r, valor: v })}>
                <SelectTrigger className="h-8 text-xs w-[150px] shrink-0"><SelectValue placeholder="Valor…" /></SelectTrigger>
                <SelectContent><SelectItem value="true" className="text-xs">Sim</SelectItem><SelectItem value="false" className="text-xs">Não</SelectItem></SelectContent>
              </Select>
            ) : (
              <Input className="h-8 text-xs w-[150px] shrink-0" type={c?.tipo === 'data' ? 'date' : 'text'}
                inputMode={c?.tipo === 'numero' ? 'decimal' : undefined} placeholder="Valor"
                value={r.valor} onChange={(ev) => setRule(i, { ...r, valor: ev.target.value })} />
            )}
            {rules.length > 1 && (
              <button aria-label="Remover condição" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => dropRule(i)}><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
        )
      })}
      {campos.length > 0 && (
        <div className="flex items-center gap-2.5">
          <button className="text-[11px] text-primary hover:underline" onClick={() => aplicar({ logic, rules: [...rules, { campo: '', op: 'eq', valor: '' }] })}>+ condição</button>
          {rules.length > 1 && (
            <div className="flex rounded border overflow-hidden">
              {(['AND', 'OR'] as const).map((l) => (
                <button key={l} className={cn('px-2 py-0.5 text-[11px] font-semibold transition-colors', logic === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                  onClick={() => aplicar({ logic: l, rules })}>{l === 'AND' ? 'E' : 'OU'}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
