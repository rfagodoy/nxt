'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, DoorOpen, Plus, ShieldCheck, X } from 'lucide-react'
import { nasceDeContrato, type QuemInicia, type RegraDeInicio } from '@nxt/types'
import { stakeholderCombina } from '@nxt/workflow-core'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, useEntityLabels, type EntityKind } from '@/components/ui/entity-select'
import { ORIGEM, REFERENCIA, referenciaDoPapelEntry } from '@/lib/contract-roles'
import type { LookupEntry } from '@/hooks/use-lookup-table'
import { cn } from '@/lib/utils'

const CONTRATO_DO_PROCESSO = '@contrato'
const TIPO: Record<string, string> = { UNIDADE: 'unidade', EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', CONTRATO: 'contrato' }
const COM_CONTRATO = ['CONTRATO', 'ADITIVO', 'DISTRATO']

/**
 * "Quem inicia" — pastilha no cabeçalho do documento, ao lado do tipo (alternativa C do PO,
 * 04/10/2026). Diz quem pode clicar em "+ Novo processo" para este workflow: qualquer usuário,
 * ou quem ocupa um dos papéis (em qualquer entidade do tipo, numa entidade fixa ou na parte do
 * contrato). A API confere na partida; administrador sempre pode.
 */
export function QuemIniciaPill({ value, onChange, papeis, kind }: {
  value: QuemInicia | undefined
  onChange: (v: QuemInicia | undefined) => void
  papeis: LookupEntry[]
  kind: string
}) {
  const botao = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const cfg: QuemInicia = value ?? { modo: 'TODOS', regras: [] }
  const restrito = cfg.modo === 'PAPEIS'
  const nomeEntidade = useEntityLabels(['UNIDADE', 'EMPRESA', 'PARCEIRO', 'CONTRATO'])
  const rotulo = (id: string) => papeis.find((p) => p.id === id)?.label

  const frase = (r: RegraDeInicio) => {
    const papel = rotulo(r.papelId) ?? 'papel removido'
    if (r.entityType === ORIGEM.ORG) return papel
    if (r.entityId) return `${papel} · ${nomeEntidade(r.entityType, r.entityId) ?? TIPO[r.entityType] ?? 'entidade'}`
    if (r.stakeholder === CONTRATO_DO_PROCESSO) return `${papel} · do contrato escolhido`
    if (r.stakeholder) return `${papel} · da ${rotulo(r.stakeholder) ?? 'parte'} do contrato`
    return `${papel} · qualquer ${TIPO[r.entityType] ?? 'entidade'}`
  }

  const vazio = restrito && cfg.regras.length === 0
  const texto = !restrito
    ? 'qualquer usuário'
    : vazio ? 'escolha um papel' : `${frase(cfg.regras[0])}${cfg.regras.length > 1 ? ` +${cfg.regras.length - 1}` : ''}`

  const mudar = (v: QuemInicia) => onChange(v.modo === 'TODOS' && !v.regras.length ? undefined : v)

  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="dialog" aria-expanded={aberto}
        title="Quem pode iniciar este workflow em “Novo processo”"
        className={cn(
          'inline-flex max-w-[360px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
          /* forma diz o estado (o PO é daltônico): tracejada = falta escolher; sólida = regra */
          vazio
            ? 'border-dashed border-amber-400/70 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : restrito
              ? 'border-primary/40 bg-card text-foreground hover:bg-muted/60'
              : 'border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}>
        <DoorOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate"><span className="font-medium opacity-80">Quem inicia:</span> {texto}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      {aberto && (
        <FloatingMenu anchor={botao} onClose={() => setAberto(false)} role="dialog" aria-label="Quem pode iniciar este workflow"
          className="w-[420px] max-w-[calc(100vw-32px)] rounded-xl border bg-card p-3 text-card-foreground shadow-xl">
          <p className="text-[13px] font-bold tracking-tight">Quem pode iniciar este workflow</p>
          <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-1">
            {([['TODOS', 'Qualquer usuário'], ['PAPEIS', 'Quem ocupa um destes papéis']] as const).map(([m, t]) => (
              <button key={m} type="button" role="radio" aria-checked={cfg.modo === m}
                onClick={() => mudar({ ...cfg, modo: m })}
                className={cn('rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                  cfg.modo === m ? 'border-primary bg-primary/10 font-bold text-foreground' : 'text-muted-foreground hover:bg-muted')}>
                <span aria-hidden className="mr-1">{cfg.modo === m ? '●' : '○'}</span>{t}
              </button>
            ))}
          </div>

          {restrito && (
            <div className="mt-3 space-y-2">
              {cfg.regras.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {cfg.regras.map((r, i) => (
                    <li key={`${r.papelId}-${r.entityId ?? r.stakeholder ?? '*'}-${i}`}
                      className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                      <span className="min-w-0 flex-1 truncate">{frase(r)}</span>
                      <button type="button" aria-label={`Remover ${frase(r)}`} title="Remover"
                        onClick={() => mudar({ ...cfg, regras: cfg.regras.filter((_, j) => j !== i) })}
                        className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <NovaRegra papeis={papeis} kind={kind} onAdd={(r) => mudar({ ...cfg, regras: [...cfg.regras, r] })} />
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Administradores sempre podem iniciar.
              {restrito && kind === 'CONTRATO' && cfg.regras.some((r) => r.stakeholder) &&
                ' No contrato novo, a parte da regra fica restrita às entidades em que quem iniciou ocupa o papel.'}
              {restrito && nasceDeContrato(kind) && cfg.regras.some((r) => r.stakeholder) &&
                ' Em “Qual contrato?”, a pessoa só vê os contratos em que ocupa o papel.'}
            </span>
          </p>
        </FloatingMenu>
      )}
    </>
  )
}

/** Montar uma regra: papel de pessoa + onde (qualquer / fixa / parte do contrato). */
function NovaRegra({ papeis, kind, onAdd }: { papeis: LookupEntry[]; kind: string; onAdd: (r: RegraDeInicio) => void }) {
  const [papelId, setPapelId] = useState('')
  const [escopo, setEscopo] = useState('qualquer')
  const [entityId, setEntityId] = useState<string | undefined>()

  const pessoas = papeis.filter((p) => p.active && referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
  const papel = pessoas.find((p) => p.id === papelId)
  const tipo = papel?.origem ?? ORIGEM.ORG
  const catalogo = useMemo(() => papeis.map((p) => ({ id: p.id, label: p.label, origem: p.origem, referencia: referenciaDoPapelEntry(p) })), [papeis])
  const partes = COM_CONTRATO.includes(kind)
    ? papeis.filter((p) => p.active && referenciaDoPapelEntry(p) === REFERENCIA.ENTIDADE && stakeholderCombina(tipo, p.id, catalogo))
    : []
  const doContrato = tipo === ORIGEM.CONTRATO && nasceDeContrato(kind)

  const opcoes: Array<[string, string]> = tipo === ORIGEM.ORG ? [] : [
    ['qualquer', `Em qualquer ${TIPO[tipo] ?? 'entidade'}`],
    ['fixa', `Numa ${TIPO[tipo] ?? 'entidade'} específica`],
    ...(doContrato ? [[`st:${CONTRATO_DO_PROCESSO}`, 'No contrato escolhido'] as [string, string]] : []),
    ...partes.map((p) => [`st:${p.id}`, `Na ${p.label} do contrato`] as [string, string]),
  ]
  const pronto = !!papel && (escopo !== 'fixa' || !!entityId)

  const adicionar = () => {
    if (!papel) return
    const r: RegraDeInicio = { papelId: papel.id, entityType: tipo }
    if (escopo === 'fixa' && entityId) r.entityId = entityId
    if (escopo.startsWith('st:')) r.stakeholder = escopo.slice(3)
    onAdd(r)
    setPapelId(''); setEscopo('qualquer'); setEntityId(undefined)
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Select value={papelId} onValueChange={(v) => { setPapelId(v); setEscopo('qualquer'); setEntityId(undefined) }}>
          <SelectTrigger aria-label="Papel" className="h-8 text-xs">
            <SelectValue placeholder="Papel…">{papel?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pessoas.length === 0
              ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum papel de pessoa cadastrado.</div>
              : pessoas.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {opcoes.length > 0 ? (
          <Select value={escopo} onValueChange={(v) => { setEscopo(v); setEntityId(undefined) }}>
            <SelectTrigger aria-label="Onde" className="h-8 text-xs">
              <SelectValue>{opcoes.find(([v]) => v === escopo)?.[1]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {opcoes.map(([v, t]) => <SelectItem key={v} value={v} className="text-xs">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="self-center text-[11px] text-muted-foreground">{papel ? 'Papel global da organização' : ''}</span>
        )}
      </div>
      {escopo === 'fixa' && tipo !== ORIGEM.ORG && (
        <EntitySelect entityType={tipo as EntityKind} value={entityId} onChange={setEntityId} placeholder={`Selecionar ${TIPO[tipo] ?? 'entidade'}…`} />
      )}
      <button type="button" onClick={adicionar} disabled={!pronto}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent">
        <Plus className="h-3.5 w-3.5" />Adicionar papel
      </button>
    </div>
  )
}
