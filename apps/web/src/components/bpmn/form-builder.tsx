'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, MousePointerClick, CircleDot, UserSquare, Zap, GitBranch, GitMerge, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { FormField, FieldType, StepFormSchema } from '@nxt/types'
import { CONNECTORS } from '@nxt/types'
import { BpmnElement } from './bpmn-editor'

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Valor monetário' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Seleção múltipla' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'checkbox', label: 'Caixa de seleção' },
  { value: 'file', label: 'Arquivo' },
]

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

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** Nome da variável derivado do rótulo (chave usada nos dados e nas condições
 *  dos gateways). Ex.: "Valor do contrato" → "valor_do_contrato". */
function deriveName(label: string) {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

interface FieldRowProps {
  field: FormField
  onChange: (updated: FormField) => void
  onRemove: () => void
}

function FieldRow({ field, onChange, onRemove }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-md bg-background">
      <div className="flex items-center gap-2 p-2">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />

        <Input
          className="h-7 text-sm flex-1"
          placeholder="Nome do campo"
          value={field.label}
          onChange={(e) => {
            // Só re-deriva o nome se ele ainda era automático (não foi customizado).
            const wasAuto = field.name === deriveName(field.label)
            onChange({ ...field, label: e.target.value, name: wasAuto ? deriveName(e.target.value) : field.name })
          }}
        />

        <Select
          value={field.type}
          onValueChange={(val) => onChange({ ...field, type: val as FieldType })}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Expandir opções"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Remover campo"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`req-${field.id}`}
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor={`req-${field.id}`} className="text-xs text-muted-foreground">
              Campo obrigatório
            </label>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Variável <span className="text-muted-foreground/60">(usada nas condições dos gateways)</span>
            </label>
            <Input
              className="h-7 text-xs font-mono"
              placeholder="ex.: valor"
              value={field.name}
              onChange={(e) => onChange({ ...field, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Placeholder</label>
            <Input
              className="h-7 text-xs"
              placeholder="Texto de exemplo..."
              value={field.placeholder || ''}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
            />
          </div>

          {(field.type === 'select' || field.type === 'multiselect') && (
            <OptionsEditor
              options={field.options || []}
              onChange={(options) => onChange({ ...field, options })}
            />
          )}
        </div>
      )}
    </div>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: Array<{ label: string; value: string }>
  onChange: (opts: Array<{ label: string; value: string }>) => void
}) {
  const addOption = () =>
    onChange([...options, { label: '', value: `opt_${Date.now()}` }])

  const updateOption = (idx: number, label: string) => {
    const updated = [...options]
    updated[idx] = { label, value: label.toLowerCase().replace(/\s+/g, '_') }
    onChange(updated)
  }

  const removeOption = (idx: number) => onChange(options.filter((_, i) => i !== idx))

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-2 block">Opções</label>
      <div className="space-y-1">
        {options.map((opt, idx) => (
          <div key={idx} className="flex gap-1">
            <Input
              className="h-7 text-xs"
              placeholder={`Opção ${idx + 1}`}
              value={opt.label}
              onChange={(e) => updateOption(idx, e.target.value)}
            />
            <button
              onClick={() => removeOption(idx)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs" onClick={addOption}>
        <Plus className="h-3 w-3" /> Adicionar opção
      </Button>
    </div>
  )
}

interface FormBuilderProps {
  selectedElement: BpmnElement | null
  stepForms: Record<string, StepFormSchema>
  onStepFormsChange: (forms: Record<string, StepFormSchema>) => void
}

export function FormBuilder({ selectedElement, stepForms, onStepFormsChange }: FormBuilderProps) {
  if (!selectedElement) {
    const legend: Array<{ icon: typeof CircleDot; label: string; hint: string; color: string }> = [
      { icon: CircleDot, label: 'Início / Fim', hint: 'onde o processo começa e termina', color: 'text-emerald-600 dark:text-emerald-400' },
      { icon: UserSquare, label: 'Tarefa do usuário', hint: 'uma pessoa preenche um formulário', color: 'text-sky-600 dark:text-sky-400' },
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
            Clique numa atividade do diagrama para configurar os campos e ações dela.
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

  const addField = () => {
    const newField: FormField = {
      id: generateId(),
      name: '',
      label: '',
      type: 'text',
      required: false,
    }
    updateForm({ ...currentForm, fields: [...currentForm.fields, newField] })
  }

  const updateField = (idx: number, updated: FormField) => {
    const fields = [...currentForm.fields]
    fields[idx] = updated
    updateForm({ ...currentForm, fields })
  }

  const removeField = (idx: number) => {
    updateForm({ ...currentForm, fields: currentForm.fields.filter((_, i) => i !== idx) })
  }

  // Painel de executor/prazo só faz sentido para atividades (tarefas).
  const isActivity = selectedElement.type.includes('Task')
  const isServiceTask = SERVICE_TASK_TYPES.includes(selectedElement.type)
  const slaHours = currentForm.slaMinutes ? Math.round((currentForm.slaMinutes / 60) * 10) / 10 : ''

  // Manifesto do conector selecionado (entradas a mapear + saídas que produz).
  const manifest = CONNECTORS.find((c) => c.value === currentForm.connector)

  // Variáveis disponíveis para alimentar as entradas do conector: os campos
  // coletados nas OUTRAS atividades (name → rótulo) + as saídas de conectores de
  // outras atividades de serviço. A própria serviceTask não coleta campos.
  const availableVars: Array<{ name: string; label: string }> = []
  {
    const seen = new Set<string>()
    for (const [sid, sf] of Object.entries(stepForms)) {
      if (sid === selectedElement.id) continue
      for (const f of sf.fields ?? []) {
        if (f.name && !seen.has(f.name)) { seen.add(f.name); availableVars.push({ name: f.name, label: `${f.label || f.name} · ${sf.stepName}` }) }
      }
      const m = CONNECTORS.find((c) => c.value === sf.connector)
      if (m) for (const o of m.outputs) if (!seen.has(o)) { seen.add(o); availableVars.push({ name: o, label: `${o} · saída de ${m.label}` }) }
    }
  }

  const setInputMap = (key: string, variable: string | undefined) => {
    const next = { ...(currentForm.connectorInputs ?? {}) }
    if (variable) next[key] = variable
    else delete next[key]
    updateForm({ ...currentForm, connectorInputs: Object.keys(next).length ? next : undefined })
  }

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
        <p className="text-xs text-muted-foreground mt-0.5">
          {currentForm.fields.length} campo{currentForm.fields.length !== 1 ? 's' : ''} configurado{currentForm.fields.length !== 1 ? 's' : ''}
        </p>
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
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
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
                        <SelectItem key={v.name} value={v.name} className="text-xs">
                          {v.label}
                        </SelectItem>
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

      {isActivity && !isServiceTask && (
        <div className="px-4 py-3 border-b shrink-0 space-y-2 bg-muted/20">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Executor (papel)</label>
            <Input
              className="h-7 text-sm"
              placeholder="Ex.: Gestor, Diretor…"
              value={currentForm.role || ''}
              onChange={(e) => updateForm({ ...currentForm, role: e.target.value || undefined })}
            />
          </div>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {currentForm.fields.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p>Nenhum campo configurado.</p>
            <p>Adicione campos para coletar dados nesta etapa.</p>
          </div>
        ) : (
          currentForm.fields.map((field, idx) => (
            <FieldRow
              key={field.id}
              field={field}
              onChange={(updated) => updateField(idx, updated)}
              onRemove={() => removeField(idx)}
            />
          ))
        )}
      </div>

      <div className="p-4 border-t shrink-0">
        <Button variant="outline" size="sm" className="w-full" onClick={addField}>
          <Plus className="h-4 w-4" />
          Adicionar campo
        </Button>
      </div>
    </div>
  )
}
