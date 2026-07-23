'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Zap, Plus, Trash2, ChevronLeft, ChevronRight,
  UserSquare, Clock, User, LayoutTemplate, CircleDot, CheckCircle2, Loader2,
} from 'lucide-react'
import { generateBpmn, type WfGraph, type WfNode, type WfEdge } from '@nxt/workflow-core'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'
import { CONNECTORS } from '@nxt/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntitySelect, type EntityKind } from '@/components/ui/entity-select'
import { useScreens } from '@/hooks/use-screens'
import { useLookupTable } from '@/hooks/use-lookup-table'
import type { ScreenSubject } from '@/lib/screen-types'
import { PAPEIS_KEY, INIT_PAPEIS, REFERENCIA, ORIGEM, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { apiFetch } from '@/lib/http'
import { cn } from '@/lib/utils'

/** Tipos de workflow — determinam onde ele aparece em "Novo processo". */
export const WORKFLOW_KINDS = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ADITIVO', label: 'Aditivo' },
  { value: 'PARCEIRO', label: 'Parceiro' },
] as const

type StepType = 'userTask' | 'serviceTask'

/** Dados iniciais para editar um processo existente. Ausente = criação. */
export interface StoryboardInitial {
  id: string
  name: string
  description?: string | null
  kind?: string | null
  /** Etapas EM ORDEM de fluxo (o storyboard v1 é linear). */
  steps: StepFormSchema[]
}

const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }
const ENTITY_KIND_LABEL: Record<string, string> = {
  EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato',
}
const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

/** Constrói o grafo LINEAR (start → etapas → end) a partir das etapas ordenadas.
 *  O gerador transforma em BPMN mínimo; o backend compila igual a hoje. */
function buildGraph(steps: StepFormSchema[]): WfGraph {
  const startId = 'Start_1'
  const endId = 'End_1'
  const nodes: Record<string, WfNode> = {
    [startId]: { id: startId, type: 'start', name: 'Início' },
    [endId]: { id: endId, type: 'end', name: 'Fim' },
  }
  for (const s of steps) {
    nodes[s.stepId] = { id: s.stepId, type: s.stepType ?? 'userTask', name: s.stepName || 'Etapa' }
  }
  const order = [startId, ...steps.map((s) => s.stepId), endId]
  const edges: WfEdge[] = []
  for (let i = 0; i < order.length - 1; i++) {
    edges.push({ id: `Flow_${i + 1}`, from: order[i], to: order[i + 1] })
  }
  return { nodes, edges, startId }
}

export function ProcessStoryboard({ initial }: { initial?: StoryboardInitial } = {}) {
  const router = useRouter()
  const editing = !!initial?.id

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [kind, setKind] = useState(initial?.kind ?? '')
  const [steps, setSteps] = useState<StepFormSchema[]>(initial?.steps ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(initial?.steps?.[0]?.stepId ?? null)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)

  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { screens } = useScreens()
  const resolvePapel = useCallback((id: string) => papeis.entries.find((p) => p.id === id)?.label, [papeis.entries])

  const selectedIndex = steps.findIndex((s) => s.stepId === selectedId)
  const selected = selectedIndex >= 0 ? steps[selectedIndex] : null

  const patchStep = useCallback((id: string, patch: Partial<StepFormSchema>) => {
    setSteps((prev) => prev.map((s) => (s.stepId === id ? { ...s, ...patch } : s)))
  }, [])

  const addStep = useCallback((type: StepType) => {
    const step: StepFormSchema = { stepId: newId('Node'), stepName: '', fields: [], stepType: type }
    setSteps((prev) => [...prev, step])
    setSelectedId(step.stepId)
  }, [])

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => {
      const next = prev.filter((s) => s.stepId !== id)
      setSelectedId((cur) => (cur === id ? next[0]?.stepId ?? null : cur))
      return next
    })
  }, [])

  const moveStep = useCallback((id: string, dir: -1 | 1) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.stepId === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])

  // POST (criação) ou PATCH (edição). Gera o BPMN a partir das etapas.
  const persist = useCallback(async (): Promise<string> => {
    const bpmnXml = generateBpmn(buildGraph(steps))
    const formSchema: ProcessFormSchema = { steps }
    const body = JSON.stringify({
      name: name.trim(),
      description: description.trim() || undefined,
      bpmnXml,
      formSchema,
      kind: kind || undefined,
    })
    if (editing) {
      const res = await apiFetch(`/api/processes/${initial!.id}`, { method: 'PATCH', body })
      if (!res.ok) throw new Error('Erro ao salvar')
      return initial!.id
    }
    const res = await apiFetch(`/api/processes`, { method: 'POST', body })
    if (!res.ok) throw new Error('Erro ao salvar')
    const data = await res.json()
    return data.id as string
  }, [editing, initial, name, description, kind, steps])

  const handleSaveDraft = useCallback(async () => {
    if (!name.trim()) { alert('Dê um nome ao processo antes de salvar.'); return }
    setSaving(true)
    try {
      const id = await persist()
      router.push(`/processes/${id}`)
    } catch (err) {
      alert('Não foi possível salvar o processo.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [name, persist, router])

  const handleActivate = useCallback(async () => {
    if (!name.trim()) { alert('Dê um nome ao processo antes de ativar.'); return }
    if (steps.length === 0) { alert('Adicione ao menos uma atividade antes de ativar.'); return }
    setActivating(true)
    try {
      const id = await persist()
      const res = await apiFetch(`/api/processes/${id}/activate`, { method: 'PATCH' })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        alert(e?.message || 'Não foi possível ativar o processo.')
        router.push(`/processes/${id}`)
        return
      }
      router.push(`/processes/${id}`)
    } catch (err) {
      alert('Não foi possível ativar o processo.')
      console.error(err)
    } finally {
      setActivating(false)
    }
  }, [name, steps, persist, router])

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push('/processes')} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <Input
            className="h-8 text-sm font-semibold border-0 shadow-none px-0 focus-visible:ring-0 bg-transparent"
            placeholder="Nome do processo..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {steps.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {steps.length} etapa{steps.length !== 1 ? 's' : ''}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving || activating}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar rascunho
          </Button>
          <Button size="sm" onClick={handleActivate} disabled={saving || activating}>
            {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Ativar processo
          </Button>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
        <Label className="text-xs text-muted-foreground shrink-0">Descrição</Label>
        <Input
          className="h-7 text-xs"
          placeholder="Descreva o objetivo deste processo..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Label className="text-xs text-muted-foreground shrink-0">Tipo</Label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          title="Onde este workflow aparece em Novo processo"
          className="h-7 rounded-md border border-input bg-background px-2 text-xs shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">— não especificado</option>
          {WORKFLOW_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>

      {/* Storyboard + Inspetor */}
      <div className="flex flex-1 overflow-hidden">
        <StoryboardCanvas
          steps={steps}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addStep}
          resolvePapel={resolvePapel}
        />
        <div className="w-80 border-l bg-card flex flex-col overflow-hidden shrink-0">
          {selected ? (
            <StepInspector
              key={selected.stepId}
              step={selected}
              index={selectedIndex}
              total={steps.length}
              screens={screens}
              papeis={papeis}
              stepsBefore={steps.slice(0, selectedIndex)}
              onPatch={(patch) => patchStep(selected.stepId, patch)}
              onMove={(dir) => moveStep(selected.stepId, dir)}
              onRemove={() => removeStep(selected.stepId)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="p-3 rounded-full bg-accent mb-3">
                <LayoutTemplate className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold">Monte o roteiro</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                Adicione quadros ao trilho e clique num deles para configurar a atividade.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Canvas: filmstrip horizontal ─────────────────────────────────────────── */

function StoryboardCanvas({
  steps, selectedId, onSelect, onAdd, resolvePapel,
}: {
  steps: StepFormSchema[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (type: StepType) => void
  resolvePapel: (id: string) => string | undefined
}) {
  return (
    <div className="flex-1 overflow-auto bg-muted/20 [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px]">
      <div className="flex items-center gap-0 w-max min-w-full px-8 py-10">
        <EventPill icon={<CircleDot className="h-4 w-4" />} label="Início" />
        <Conn />
        {steps.map((s) => (
          <div key={s.stepId} className="flex items-center">
            <FrameCard step={s} selected={s.stepId === selectedId} onClick={() => onSelect(s.stepId)} resolvePapel={resolvePapel} />
            <Conn />
          </div>
        ))}
        <EventPill icon={<CheckCircle2 className="h-4 w-4" />} label="Fim" />
        <div className="ml-3">
          <AddMenu onAdd={onAdd} />
        </div>
      </div>
    </div>
  )
}

function Conn() {
  return <div className="w-8 h-px bg-border shrink-0" />
}

function EventPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="shrink-0 inline-flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
      {icon}
      {label}
    </div>
  )
}

const STEP_META: Record<StepType, { label: string; icon: typeof UserSquare; tone: string }> = {
  userTask: { label: 'Tarefa', icon: UserSquare, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
  serviceTask: { label: 'Ação automática', icon: Zap, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
}

function FrameCard({ step, selected, onClick, resolvePapel }: {
  step: StepFormSchema; selected: boolean; onClick: () => void; resolvePapel: (id: string) => string | undefined
}) {
  const type = step.stepType ?? 'userTask'
  const meta = STEP_META[type]
  const Icon = meta.icon
  const dueLabel = dueText(step)
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 w-52 text-left rounded-xl border bg-card shadow-sm overflow-hidden transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
      )}
    >
      {/* thumbnail estilizado (prévia da tela) */}
      <div className="h-14 px-3 py-2.5 border-b bg-muted/30 relative">
        {type === 'serviceTask' ? (
          <div className="flex items-center justify-center h-full">
            <Zap className="h-6 w-6 text-amber-500/70" />
          </div>
        ) : (
          <div className="space-y-1.5 pt-0.5">
            <div className="h-1.5 w-1/2 rounded bg-muted-foreground/15" />
            <div className="h-3 w-full rounded bg-muted-foreground/10" />
            <div className="h-1.5 w-2/3 rounded bg-muted-foreground/15" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.tone)}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
        <p className="text-sm font-semibold mt-1.5 leading-tight truncate">
          {step.stepName || <span className="text-muted-foreground italic font-normal">Sem nome</span>}
        </p>
        <div className="mt-2 space-y-1">
          {type === 'userTask' ? (
            <MetaRow icon={<User className="h-3 w-3" />} text={roleLabel(step, resolvePapel) ?? 'Sem executor'} />
          ) : (
            <MetaRow icon={<Zap className="h-3 w-3" />} text={connectorLabel(step) ?? 'Sem ação'} />
          )}
          {dueLabel && <MetaRow icon={<Clock className="h-3 w-3" />} text={dueLabel} />}
        </div>
      </div>
    </button>
  )
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  )
}

function AddMenu({ onAdd }: { onAdd: (type: StepType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-10 w-10 rounded-full border-2 border-dashed border-border bg-card text-muted-foreground hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
        title="Adicionar atividade"
      >
        <Plus className="h-5 w-5" />
      </button>
      {open && (
        <div className="glass absolute left-0 top-12 z-10 w-44 rounded-xl p-1">
          <button
            onMouseDown={(e) => { e.preventDefault(); onAdd('userTask'); setOpen(false) }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent"
          >
            <UserSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Tarefa
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); onAdd('serviceTask'); setOpen(false) }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent"
          >
            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Ação automática
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Inspetor: os 5 campos ────────────────────────────────────────────────── */

type Papeis = ReturnType<typeof useLookupTable>
type Screens = ReturnType<typeof useScreens>['screens']

function StepInspector({
  step, index, total, screens, papeis, stepsBefore, onPatch, onMove, onRemove,
}: {
  step: StepFormSchema
  index: number
  total: number
  screens: Screens
  papeis: Papeis
  stepsBefore: StepFormSchema[]
  onPatch: (patch: Partial<StepFormSchema>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const type = step.stepType ?? 'userTask'
  const meta = STEP_META[type]
  const Icon = meta.icon
  const entityWord = SUBJECT_ENTITY[step.screenSubject ?? ''] ?? 'entidade'

  // Variáveis disponíveis das etapas ANTERIORES (ids de entidade criada + saídas de conectores).
  const availableVars = useMemo(() => {
    const out: Array<{ name: string; label: string }> = []
    const seen = new Set<string>()
    const add = (n: string, l: string) => { if (n && !seen.has(n)) { seen.add(n); out.push({ name: n, label: l }) } }
    for (const s of stepsBefore) {
      const m = CONNECTORS.find((c) => c.value === s.connector)
      if (m) for (const o of m.outputs) add(o, `${o} · saída de ${m.label}`)
      if (s.screenRef && s.entityMode === 'CREATE' && s.screenSubject) {
        const idVar = s.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId'
        add(idVar, `${idVar} · criado em ${s.stepName || 'etapa'}`)
      }
    }
    return out
  }, [stepsBefore])

  const entityScreens = screens.filter((s) => s.subjectType === 'CONTRATO' || s.subjectType === 'FORNECEDOR')
  const papeisPessoa = papeis.active.filter((p) => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
  const executor = step.executor
  const papelSel = executor?.papelId ? papeis.entries.find((p) => p.id === executor.papelId) : undefined
  const execOrigem = papelSel?.origem

  const pickPapel = (papelId: string) => {
    if (!papelId || papelId === 'none') { onPatch({ executor: undefined }); return }
    const p = papeis.entries.find((pp) => pp.id === papelId)
    onPatch({ executor: { papelId, entityType: p?.origem ?? 'CONTRATO', mode: 'FIXA', entityId: undefined, entityVar: undefined } })
  }
  const setExec = (patch: Partial<NonNullable<StepFormSchema['executor']>>) =>
    executor && onPatch({ executor: { ...executor, ...patch } })

  const pickScreen = (id: string) => {
    if (!id || id === 'none') {
      onPatch({ screenRef: undefined, screenSubject: undefined, entityMode: undefined, entityVar: undefined })
      return
    }
    const sc = entityScreens.find((s) => s.id === id)
    onPatch({
      screenRef: id,
      screenSubject: sc?.subjectType as ScreenSubject as 'CONTRATO' | 'FORNECEDOR' | undefined,
      entityMode: step.entityMode ?? 'CREATE',
      entityVar: step.entityMode === 'EDIT' ? step.entityVar : undefined,
    })
  }

  const days = step.slaBusinessDays ?? ''
  const hours = step.slaBusinessHours ?? ''

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', meta.tone)}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => onMove(-1)} disabled={index === 0} title="Mover para trás"
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} title="Mover para frente"
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={onRemove} title="Remover atividade"
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Etapa {index + 1} de {total}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* seletor de tipo */}
        <div className="flex gap-1 text-xs">
          {(['userTask', 'serviceTask'] as const).map((t) => (
            <button key={t} type="button" onClick={() => onPatch({ stepType: t })}
              className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors',
                type === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
              {STEP_META[t].label}
            </button>
          ))}
        </div>

        {/* (a) nome */}
        <Field label={type === 'serviceTask' ? 'Nome da ação' : 'Tarefa do usuário'} required>
          <Input
            className="h-8 text-sm"
            placeholder={type === 'serviceTask' ? 'Ex.: Cadastrar contrato' : 'Ex.: Preencher dados'}
            value={step.stepName}
            onChange={(e) => onPatch({ stepName: e.target.value })}
          />
        </Field>

        {/* (b) instruções */}
        <Field label="Instruções para execução" hint="Aparece para o executor ao abrir a tarefa.">
          <Textarea
            className="text-sm min-h-[64px]"
            placeholder="Oriente quem vai executar esta atividade…"
            value={step.instructions ?? ''}
            onChange={(e) => onPatch({ instructions: e.target.value })}
          />
        </Field>

        {type === 'userTask' ? (
          <>
            {/* (d) executor (papel) */}
            <Field label="Executor (papel)">
              <Select value={executor?.papelId || 'none'} onValueChange={pickPapel}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem papel definido" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem papel definido</SelectItem>
                  {papeisPessoa.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {papeisPessoa.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).
                </p>
              )}
            </Field>

            {executor && execOrigem && execOrigem !== ORIGEM.ORG && (
              <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                <label className="text-[11px] text-muted-foreground block">Responsável de qual {entityKindLabel(execOrigem)}?</label>
                <div className="flex gap-1 text-[11px]">
                  {(['FIXA', 'VARIAVEL'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setExec({ mode: m })}
                      className={cn('rounded px-2 py-0.5 border transition-colors',
                        executor.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                      {m === 'FIXA' ? 'Entidade fixa' : 'Da variável'}
                    </button>
                  ))}
                </div>
                {executor.mode === 'FIXA' ? (
                  <EntitySelect entityType={execOrigem as EntityKind} value={executor.entityId}
                    onChange={(id) => setExec({ entityId: id, entityVar: undefined })}
                    placeholder={`Selecionar ${entityKindLabel(execOrigem)}…`} />
                ) : (
                  <Select value={executor.entityVar || 'none'} onValueChange={(v) => setExec({ entityVar: v === 'none' ? undefined : v, entityId: undefined })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Variável com o id…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— escolha a variável —</SelectItem>
                      {availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* (e) ação: tela do formulário */}
            <Field label="Tela do formulário" hint={step.screenRef
              ? `A atividade mostra o cadastro dessa tela e ${step.entityMode === 'EDIT' ? 'edita' : 'cria'} o ${entityWord}.`
              : 'Opcional — a atividade pode ser só uma etapa de aprovação.'}>
              <Select value={step.screenRef || 'none'} onValueChange={pickScreen}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem tela" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem tela</SelectItem>
                  {entityScreens.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {SUBJECT_LABEL[s.subjectType] ?? s.subjectType} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {step.screenRef && (
              <div className="flex gap-1 text-xs">
                {([['CREATE', `Criar ${entityWord}`], ['EDIT', `Editar ${entityWord}`]] as const).map(([m, lbl]) => (
                  <button key={m} type="button"
                    onClick={() => onPatch({ entityMode: m, entityVar: m === 'EDIT' ? step.entityVar : undefined })}
                    className={cn('flex-1 rounded-md px-2 py-1.5 border transition-colors',
                      (step.entityMode ?? 'CREATE') === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
            {step.screenRef && step.entityMode === 'EDIT' && (
              <Field label={`Qual ${entityWord} editar? (variável)`}>
                <Select value={step.entityVar || 'none'} onValueChange={(v) => onPatch({ entityVar: v === 'none' ? undefined : v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Variável com o id…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— escolha a variável —</SelectItem>
                    {availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </>
        ) : (
          /* (e) ação automática: conector */
          <Field label="Ação automática (conector)" hint="O motor executa esta ação sozinho — grava a entidade de verdade.">
            <Select value={step.connector || 'none'} onValueChange={(v) => onPatch({ connector: v && v !== 'none' ? v : undefined })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhuma (só passa)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (só passa)</SelectItem>
                {CONNECTORS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* (c) prazo em dias/horas úteis — só faz sentido em tarefa humana */}
        {type === 'userTask' && (
          <Field label="Prazo (SLA)" hint="Conta no expediente comercial e pula fins de semana e feriados.">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input className="h-8 text-sm pr-16" type="number" min={0} placeholder="0" value={days}
                  onChange={(e) => onPatch({ slaBusinessDays: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">dias úteis</span>
              </div>
              <div className="relative flex-1">
                <Input className="h-8 text-sm pr-12" type="number" min={0} max={23} placeholder="0" value={hours}
                  onChange={(e) => onPatch({ slaBusinessHours: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">h úteis</span>
              </div>
            </div>
          </Field>
        )}
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 flex items-center gap-1">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

/* ─── Helpers de rótulo ────────────────────────────────────────────────────── */

function dueText(step: StepFormSchema): string | null {
  const d = step.slaBusinessDays ?? 0
  const h = step.slaBusinessHours ?? 0
  const parts: string[] = []
  if (d) parts.push(`${d} ${d > 1 ? 'dias úteis' : 'dia útil'}`)
  if (h) parts.push(`${h} h úteis`)
  return parts.length ? parts.join(' · ') : null
}

function roleLabel(step: StepFormSchema, resolvePapel: (id: string) => string | undefined): string | null {
  if (!step.executor?.papelId) return null
  return resolvePapel(step.executor.papelId) ?? 'Responsável por papel'
}

function connectorLabel(step: StepFormSchema): string | null {
  return CONNECTORS.find((c) => c.value === step.connector)?.label ?? null
}
