'use client'

import {
  MousePointerClick, CircleDot, UserSquare, Zap, GitBranch, GitMerge, Square, LayoutTemplate,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { StepFormSchema } from '@nxt/types'
import { CONNECTORS } from '@nxt/types'
import { BpmnElement } from './bpmn-editor'
import { cn } from '@/lib/utils'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { useScreens } from '@/hooks/use-screens'
import type { ScreenSubject } from '@/lib/screen-types'
import { PAPEIS_KEY, INIT_PAPEIS, REFERENCIA, ORIGEM, referenciaDoPapelEntry } from '@/lib/contract-roles'
import { EntitySelect, type EntityKind } from '@/components/ui/entity-select'

/** Rótulo amigável do tipo de entidade-anfitriã do papel (para textos da UI). */
const ENTITY_KIND_LABEL: Record<string, string> = {
  EMPRESA: 'empresa do grupo', PARCEIRO: 'parceiro', UNIDADE: 'unidade', CONTRATO: 'contrato',
}
const entityKindLabel = (k?: string) => ENTITY_KIND_LABEL[k ?? ''] ?? 'entidade'

/** Entidade que a atividade cria/edita, derivada do assunto da Tela. */
const SUBJECT_ENTITY: Record<string, string> = { CONTRATO: 'contrato', FORNECEDOR: 'parceiro' }
const SUBJECT_LABEL: Record<string, string> = { CONTRATO: 'Contrato', FORNECEDOR: 'Parceiro' }

/** Tipos BPMN que o motor executa como serviceTask (ação automática). */
const SERVICE_TASK_TYPES = ['bpmn:ServiceTask', 'bpmn:ScriptTask', 'bpmn:SendTask', 'bpmn:BusinessRuleTask']

const ELEMENT_TYPE_LABEL: Record<string, string> = {
  'bpmn:Task': 'Tarefa',
  'bpmn:UserTask': 'Tarefa do usuário',
  'bpmn:ServiceTask': 'Tarefa de serviço',
  'bpmn:StartEvent': 'Início',
  'bpmn:ManualTask': 'Tarefa manual',
  'bpmn:ScriptTask': 'Script',
  'bpmn:SendTask': 'Enviar',
  'bpmn:ReceiveTask': 'Receber',
}

interface FormBuilderProps {
  selectedElement: BpmnElement | null
  stepForms: Record<string, StepFormSchema>
  onStepFormsChange: (forms: Record<string, StepFormSchema>) => void
}

export function FormBuilder({ selectedElement, stepForms, onStepFormsChange }: FormBuilderProps) {
  // Hooks no topo (antes de qualquer early return) — regra dos hooks.
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)
  const { screens } = useScreens()

  if (!selectedElement) {
    const legend: Array<{ icon: typeof CircleDot; label: string; hint: string; color: string }> = [
      { icon: CircleDot, label: 'Início / Fim', hint: 'onde o processo começa e termina', color: 'text-emerald-600 dark:text-emerald-400' },
      { icon: UserSquare, label: 'Tarefa do usuário', hint: 'uma pessoa preenche uma tela (cria/edita contrato ou parceiro)', color: 'text-sky-600 dark:text-sky-400' },
      { icon: Zap, label: 'Ação automática', hint: 'o sistema executa sozinho (criar contrato, aditivo…)', color: 'text-amber-600 dark:text-amber-400' },
      { icon: GitBranch, label: 'Decisão (ou/ou)', hint: 'segue por um caminho conforme a condição', color: 'text-violet-600 dark:text-violet-400' },
      { icon: GitMerge, label: 'Paralelo (e/e)', hint: 'divide e junta caminhos simultâneos', color: 'text-rose-600 dark:text-rose-400' },
    ]
    return (
      <div className="flex flex-col h-full px-4 py-6">
        <div className="flex flex-col items-center text-center px-2 mb-5">
          <div className="p-3 rounded-full bg-accent mb-3">
            <MousePointerClick className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold">Selecione uma etapa</p>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Clique numa atividade do diagrama para configurar a tela e as ações dela.
          </p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Blocos do desenho</p>
          <ul className="space-y-2.5">
            {legend.map((l) => (
              <li key={l.label} className="flex items-start gap-2.5">
                <l.icon className={`h-4 w-4 mt-0.5 shrink-0 ${l.color}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{l.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{l.hint}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-3 pt-2.5 border-t leading-snug">
            Arraste os blocos da paleta à esquerda ou use o <Square className="inline h-3 w-3 -mt-0.5" /> ao lado de uma etapa para adicionar a próxima.
          </p>
        </div>
      </div>
    )
  }

  const currentForm: StepFormSchema = stepForms[selectedElement.id] || {
    stepId: selectedElement.id,
    stepName: selectedElement.name || selectedElement.id,
    fields: [],
  }

  const updateForm = (updated: StepFormSchema) => {
    onStepFormsChange({ ...stepForms, [selectedElement.id]: updated })
  }

  // Painel de executor/prazo/tela só faz sentido para atividades (tarefas).
  const isActivity = selectedElement.type.includes('Task')
  const isServiceTask = SERVICE_TASK_TYPES.includes(selectedElement.type)
  const isUserTask = isActivity && !isServiceTask
  const slaHours = currentForm.slaMinutes ? Math.round((currentForm.slaMinutes / 60) * 10) / 10 : ''

  // Manifesto do conector selecionado (entradas a mapear + saídas que produz).
  const manifest = CONNECTORS.find((c) => c.value === currentForm.connector)

  // Variáveis disponíveis: campos de OUTRAS atividades + saídas de conectores +
  // ids de entidade (contratoId/partnerId) que atividades-tela CRIAM.
  const availableVars: Array<{ name: string; label: string }> = []
  {
    const seen = new Set<string>()
    const add = (name: string, label: string) => { if (name && !seen.has(name)) { seen.add(name); availableVars.push({ name, label }) } }
    for (const [sid, sf] of Object.entries(stepForms)) {
      if (sid === selectedElement.id) continue
      for (const f of sf.fields ?? []) add(f.name, `${f.label || f.name} · ${sf.stepName}`)
      const m = CONNECTORS.find((c) => c.value === sf.connector)
      if (m) for (const o of m.outputs) add(o, `${o} · saída de ${m.label}`)
      // atividade-tela em modo CRIAR expõe o id da entidade criada
      if (sf.screenRef && sf.entityMode === 'CREATE' && sf.screenSubject) {
        const idVar = sf.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId'
        add(idVar, `${idVar} · criado em ${sf.stepName}`)
      }
    }
  }

  const setInputMap = (key: string, variable: string | undefined) => {
    const next = { ...(currentForm.connectorInputs ?? {}) }
    if (variable) next[key] = variable
    else delete next[key]
    updateForm({ ...currentForm, connectorInputs: Object.keys(next).length ? next : undefined })
  }

  // ── Tela do formulário da atividade (cria/edita a entidade real) ──
  const entityScreens = screens.filter((s) => s.subjectType === 'CONTRATO' || s.subjectType === 'FORNECEDOR')
  const selectedScreen = currentForm.screenRef ? entityScreens.find((s) => s.id === currentForm.screenRef) : undefined
  const entityWord = SUBJECT_ENTITY[currentForm.screenSubject ?? ''] ?? 'entidade'

  const pickScreen = (id: string) => {
    if (!id || id === 'none') {
      updateForm({ ...currentForm, screenRef: undefined, screenSubject: undefined, entityMode: undefined, entityVar: undefined })
      return
    }
    const sc = entityScreens.find((s) => s.id === id)
    updateForm({
      ...currentForm,
      screenRef: id,
      screenSubject: sc?.subjectType as ScreenSubject as 'CONTRATO' | 'FORNECEDOR' | undefined,
      entityMode: currentForm.entityMode ?? 'CREATE',
      entityVar: currentForm.entityMode === 'EDIT' ? currentForm.entityVar : undefined,
    })
  }
  const setMode = (mode: 'CREATE' | 'EDIT') =>
    updateForm({ ...currentForm, entityMode: mode, entityVar: mode === 'EDIT' ? currentForm.entityVar : undefined })

  // ── Executor por papel de PESSOA + entidade (roteia a tarefa para o responsável) ──
  const papeisPessoa = papeis.active.filter((p) => referenciaDoPapelEntry(p) === REFERENCIA.PESSOA)
  const executor = currentForm.executor
  const papelSel = executor?.papelId ? papeis.entries.find((p) => p.id === executor!.papelId) : undefined
  const execOrigem = papelSel?.origem // = entityType do executor (EMPRESA/PARCEIRO/UNIDADE/CONTRATO/ORG)

  const pickPapel = (papelId: string) => {
    if (!papelId) { updateForm({ ...currentForm, executor: undefined }); return }
    const p = papeis.entries.find((pp) => pp.id === papelId)
    const entityType = p?.origem ?? 'CONTRATO'
    updateForm({ ...currentForm, role: undefined, executor: { papelId, entityType, mode: 'FIXA', entityId: undefined, entityVar: undefined } })
  }
  const setExec = (patch: Partial<NonNullable<StepFormSchema['executor']>>) =>
    executor && updateForm({ ...currentForm, executor: { ...executor, ...patch } })

  const subtitle = isUserTask
    ? (selectedScreen ? `Tela: ${selectedScreen.name}` : 'Sem tela definida')
    : isServiceTask
      ? (manifest ? manifest.label : 'Sem ação automática')
      : ELEMENT_TYPE_LABEL[selectedElement.type] || selectedElement.type

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="secondary" className="text-xs">
            {ELEMENT_TYPE_LABEL[selectedElement.type] || selectedElement.type}
          </Badge>
        </div>
        <p className="font-semibold text-sm truncate">
          {selectedElement.name || <span className="text-muted-foreground italic">Sem nome</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {isServiceTask && (
        <div className="px-4 py-3 border-b shrink-0 bg-muted/20 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ação automática (conector)</label>
            <Select
              value={currentForm.connector || 'none'}
              onValueChange={(v) =>
                updateForm({ ...currentForm, connector: v && v !== 'none' ? v : undefined, connectorInputs: undefined })
              }
            >
              <SelectTrigger className="h-7 text-sm">
                <SelectValue placeholder="Nenhuma (só passa)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (só passa)</SelectItem>
                {CONNECTORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {manifest && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-muted-foreground leading-snug">
                Liga cada entrada da ação a uma variável coletada nas atividades anteriores. Sem ligar, o motor tenta pela convenção de nome.
              </p>
              {manifest.inputs.map((input) => (
                <div key={input.key}>
                  <label className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <span className={input.required ? 'font-medium text-foreground' : ''}>{input.label}</span>
                    {input.required && <span className="text-destructive">*</span>}
                  </label>
                  <Select
                    value={currentForm.connectorInputs?.[input.key] || 'none'}
                    onValueChange={(v) => setInputMap(input.key, v && v !== 'none' ? v : undefined)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="— pela convenção —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— pela convenção —</SelectItem>
                      {availableVars.map((v) => (
                        <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {manifest.outputs.length > 0 && (
                <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">
                  Produz: <span className="font-mono">{manifest.outputs.join(', ')}</span> — disponível nas próximas atividades.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isUserTask && (
        <div className="px-4 py-3 border-b shrink-0 space-y-2 bg-muted/20">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Executor (papel)</label>
            <Select value={executor?.papelId || 'none'} onValueChange={(v) => pickPapel(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Sem papel definido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem papel definido</SelectItem>
                {papeisPessoa.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {papeisPessoa.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                Nenhum papel de pessoa cadastrado. Crie em Configurações → Papéis (referência “Pessoa”).
              </p>
            )}
          </div>

          {executor && execOrigem && execOrigem !== ORIGEM.ORG && (
            <div className="rounded-md border bg-background/60 p-2 space-y-1.5">
              <label className="text-[11px] text-muted-foreground block">Responsável de qual {entityKindLabel(execOrigem)}?</label>
              <div className="flex gap-1 text-[11px]">
                {(['FIXA', 'VARIAVEL'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setExec({ mode: m })}
                    className={cn('rounded px-2 py-0.5 border transition-colors', executor.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
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
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Variável com o id da entidade…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— escolha a variável —</SelectItem>
                    {availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground leading-snug">
                {executor.mode === 'FIXA'
                  ? 'Sempre a mesma entidade, escolhida agora.'
                  : `Em execução, pega o id da ${entityKindLabel(execOrigem)} desta variável (ex.: o contrato deste processo).`}
              </p>
            </div>
          )}
          {executor && execOrigem === ORIGEM.ORG && (
            <p className="text-[11px] text-muted-foreground leading-snug">Papel global (organização) — roteia para o responsável definido no nível da organização.</p>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Prazo (SLA) em horas</label>
            <Input
              className="h-7 text-sm"
              type="number"
              min={0}
              placeholder="Ex.: 24"
              value={slaHours}
              onChange={(e) => {
                const h = parseFloat(e.target.value)
                updateForm({ ...currentForm, slaMinutes: !isNaN(h) && h > 0 ? Math.round(h * 60) : undefined })
              }}
            />
          </div>
        </div>
      )}

      {/* Corpo: tela do formulário (tarefa do usuário) */}
      <div className="flex-1 overflow-y-auto p-4">
        {isUserTask ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 flex items-center gap-1.5">
                <LayoutTemplate className="h-3.5 w-3.5 text-primary" /> Tela do formulário
              </label>
              <Select value={currentForm.screenRef || 'none'} onValueChange={pickScreen}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione uma tela…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem tela</SelectItem>
                  {entityScreens.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {SUBJECT_LABEL[s.subjectType] ?? s.subjectType} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                A atividade mostra o cadastro completo dessa tela; ao concluir, {currentForm.screenRef ? <>cria/edita o <span className="font-medium">{entityWord}</span> de verdade.</> : 'cria/edita a entidade de verdade.'}
              </p>
              {entityScreens.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">Nenhuma tela de Contrato/Parceiro. Crie em Configurações → Telas.</p>
              )}
            </div>

            {currentForm.screenRef && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ação da atividade</label>
                  <div className="flex gap-1 text-xs">
                    {([['CREATE', `Criar ${entityWord}`], ['EDIT', `Editar ${entityWord}`]] as const).map(([m, lbl]) => (
                      <button key={m} type="button" onClick={() => setMode(m)}
                        className={cn('rounded px-2.5 py-1 border transition-colors', (currentForm.entityMode ?? 'CREATE') === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {currentForm.entityMode === 'EDIT' && (
                  <div className="rounded-md border bg-background/60 p-2 space-y-1.5">
                    <label className="text-[11px] text-muted-foreground block">Qual {entityWord} editar? (variável com o id)</label>
                    <Select value={currentForm.entityVar || 'none'} onValueChange={(v) => updateForm({ ...currentForm, entityVar: v === 'none' ? undefined : v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Variável com o id…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— escolha a variável —</SelectItem>
                        {availableVars.map((v) => <SelectItem key={v.name} value={v.name} className="text-xs">{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Em execução, carrega o {entityWord} desse id (ex.: o {entityWord} criado numa atividade anterior).
                    </p>
                  </div>
                )}

                {currentForm.entityMode === 'CREATE' && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Cria um {entityWord} novo e disponibiliza <span className="font-mono">{currentForm.screenSubject === 'CONTRATO' ? 'contratoId' : 'partnerId'}</span> para as próximas atividades.
                  </p>
                )}
              </>
            )}
          </div>
        ) : isServiceTask ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Ação automática — configure o conector acima.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">
            Esta etapa não tem formulário. Decisões usam condições nas setas.
          </p>
        )}
      </div>
    </div>
  )
}
