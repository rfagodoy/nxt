'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
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
          onChange={(e) => onChange({ ...field, label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
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
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="p-3 rounded-full bg-muted mb-3">
          <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-6-6m0 0l6-6m-6 6h12" />
          </svg>
        </div>
        <p className="text-sm font-medium">Selecione uma etapa</p>
        <p className="text-xs text-muted-foreground mt-1">
          Clique em uma tarefa no diagrama para configurar os campos de coleta de dados
        </p>
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
