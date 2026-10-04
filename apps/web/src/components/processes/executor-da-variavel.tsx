'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, MessageSquareText } from 'lucide-react'
import type { StepFormSchema } from '@nxt/types'
import { EXECUTOR_CONTRATO_DO_PROCESSO } from '@nxt/types'
import { stakeholderCombina } from '@nxt/workflow-core'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiFetch, apiJson, motivoDoErro } from '@/lib/http'
import { ORIGEM, REFERENCIA, referenciaDoPapelEntry } from '@/lib/contract-roles'
import type { LookupEntry } from '@/hooks/use-lookup-table'
import { cn } from '@/lib/utils'

type Executor = NonNullable<StepFormSchema['executor']>

/**
 * "Da variável" do executor (pedido do PO, 04/10/2026): em vez de uma variável técnica
 * (`contratoId · criado em…`), a pessoa escolhe um PAPEL DE STAKEHOLDER do contrato do
 * processo — "Unidade contratante", "Contratante"… —, e a tarefa vai para quem ocupa o
 * papel de pessoa naquela entidade. Os stakeholders que não combinam com o papel aparecem
 * apagados COM TEXTO (cor nunca sozinha). A variável técnica antiga segue aceita, marcada.
 */
export function ExecutorDaVariavel({ executor, papelLabel, papeis, variaveisTecnicas, onChange }: {
  executor: Executor
  papelLabel: string
  papeis: LookupEntry[]
  /** variáveis técnicas das etapas anteriores — só para papéis de Parceiro (sem stakeholder) */
  variaveisTecnicas: Array<{ name: string; label: string }>
  onChange: (patch: Partial<Executor>) => void
}) {
  const tipo = executor.entityType
  const catalogo = useMemo(() => papeis.map((p) => ({ id: p.id, label: p.label, origem: p.origem, referencia: referenciaDoPapelEntry(p) })), [papeis])
  const stakeholders = papeis.filter((p) => p.active && referenciaDoPapelEntry(p) === REFERENCIA.ENTIDADE)
  const grupos = tipo === 'UNIDADE' || tipo === 'EMPRESA'
    ? [
        { titulo: 'Unidades da estrutura', itens: stakeholders.filter((p) => p.origem === ORIGEM.UNIDADE) },
        { titulo: 'Empresas do grupo', itens: stakeholders.filter((p) => (p.origem ?? ORIGEM.EMPRESA_PARCEIRO) === ORIGEM.EMPRESA_PARCEIRO) },
      ]
    : []
  const valor = executor.stakeholder ? `st:${executor.stakeholder}` : executor.entityVar ? `var:${executor.entityVar}` : 'none'
  const escolher = (v: string) => {
    if (v.startsWith('st:')) onChange({ stakeholder: v.slice(3), entityVar: undefined, entityId: undefined })
    else if (v.startsWith('var:')) onChange({ entityVar: v.slice(4), stakeholder: undefined, entityId: undefined })
    else onChange({ stakeholder: undefined, entityVar: undefined })
  }
  const nomeStake = executor.stakeholder === EXECUTOR_CONTRATO_DO_PROCESSO
    ? null
    : papeis.find((p) => p.id === executor.stakeholder)?.label
  const legado = !!executor.entityVar && tipo !== 'PARCEIRO'

  return (
    <div className="space-y-2">
      <Select value={valor} onValueChange={escolher}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="A que estiver no contrato como…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— escolha —</SelectItem>
          {tipo === 'CONTRATO' && (
            <SelectItem value={`st:${EXECUTOR_CONTRATO_DO_PROCESSO}`} className="text-xs">O contrato do processo</SelectItem>
          )}
          {grupos.map((g) => g.itens.length > 0 && (
            <SelectGroup key={g.titulo}>
              <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.titulo}</SelectLabel>
              {g.itens.map((p) => {
                const ok = stakeholderCombina(tipo, p.id, catalogo)
                return (
                  <SelectItem key={p.id} value={`st:${p.id}`} disabled={!ok} className="text-xs">
                    {p.label}{ok ? '' : ' — não combina com o papel'}
                  </SelectItem>
                )
              })}
            </SelectGroup>
          ))}
          {tipo === 'PARCEIRO' && variaveisTecnicas.map((v) => (
            <SelectItem key={v.name} value={`var:${v.name}`} className="text-xs">{v.label}</SelectItem>
          ))}
          {legado && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Variável técnica (antigo)</SelectLabel>
              <SelectItem value={`var:${executor.entityVar}`} className="text-xs">{executor.entityVar}</SelectItem>
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {legado && (
        <p className="text-[11px] text-muted-foreground">
          Variável técnica (antigo): continua funcionando como antes. Prefira escolher acima a parte do contrato — fica legível e muda sozinha com o contrato.
        </p>
      )}

      {executor.stakeholder && (
        <>
          <div className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-xs leading-relaxed">
            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              A tarefa vai para quem é <b>{papelLabel}</b>{' '}
              {nomeStake ? <>na entidade que está como <b>“{nomeStake}”</b> no contrato deste processo — a que estiver valendo, depois dos aditivos.</> : <>no <b>contrato deste processo</b>.</>}
              {' '}Se ninguém for encontrado, ela vai para os administradores, com aviso.
            </span>
          </div>
          <TestarComContrato executor={executor} />
        </>
      )}
    </div>
  )
}

interface Previa { pessoas: string[]; nota: string | null; semExecutor: boolean; entidades?: Array<{ nome: string }> }

/** "Testar com um contrato": para quem a atividade iria HOJE — nada é gravado. */
function TestarComContrato({ executor }: { executor: Executor }) {
  const [contratos, setContratos] = useState<Array<{ id: string; numero: string; titulo: string }> | null>(null)
  const [contratoId, setContratoId] = useState('')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let vivo = true
    void apiJson<{ rows?: Array<{ id: string; numero: string; titulo: string }> }>('/api/contracts')
      .then((r) => { if (vivo) setContratos(r?.rows ?? []) })
    return () => { vivo = false }
  }, [])

  /* trocou o executor ou o contrato: o resultado anterior deixou de valer */
  const chave = `${executor.papelId}|${executor.entityType}|${executor.stakeholder}|${contratoId}`
  useEffect(() => { setPrevia(null); setErro(null) }, [chave])

  const testar = async () => {
    if (!contratoId) return
    setCarregando(true); setErro(null)
    try {
      const res = await apiFetch('/api/instances/executor-preview', { method: 'POST', body: JSON.stringify({ executor, contratoId }) })
      if (!res.ok) { setErro(await motivoDoErro(res, 'Não foi possível testar')); return }
      setPrevia(await res.json() as Previa)
    } catch {
      setErro('Não foi possível conectar ao servidor.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border px-2.5 py-2">
      <p className="text-xs font-semibold">Testar com um contrato <span className="font-normal text-muted-foreground">— para quem iria hoje; nada é gravado</span></p>
      <div className="flex gap-2">
        <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} aria-label="Contrato para o teste"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">{contratos === null ? 'Carregando contratos…' : contratos.length ? 'Escolha um contrato…' : 'Nenhum contrato cadastrado'}</option>
          {(contratos ?? []).map((c) => <option key={c.id} value={c.id}>{c.numero} · {c.titulo}</option>)}
        </select>
        <button type="button" onClick={() => void testar()} disabled={!contratoId || carregando}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
          {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Testar
        </button>
      </div>
      {erro && <p className="text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
      {previa && (
        <div className={cn('flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-relaxed',
          previa.semExecutor ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                             : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200')}>
          {previa.semExecutor ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <div>
            <p className="font-semibold">
              {previa.semExecutor ? 'Ninguém encontrado — iria para os administradores' : `Vai para ${previa.pessoas.length === 1 ? '1 pessoa' : `${previa.pessoas.length} pessoas`}: ${previa.pessoas.join(', ')}`}
            </p>
            {previa.nota && <p>{previa.nota}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
