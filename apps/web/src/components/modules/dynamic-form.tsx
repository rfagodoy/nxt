'use client'

import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { StepFormSchema, FormField } from '@nxt/types'

function FieldInput({ field, register, setValue, watch }: {
  field: FormField
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any
}) {
  const value = watch(field.name)
  const base  = 'flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          rows={3}
          placeholder={field.placeholder}
          className={`${base} h-auto py-2 resize-none`}
          {...register(field.name, { required: field.required ? 'Campo obrigatório' : false })}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          placeholder={field.placeholder}
          className={base}
          {...register(field.name, { required: field.required ? 'Campo obrigatório' : false, valueAsNumber: true })}
        />
      )
    case 'currency':
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
          <input
            type="number"
            step="0.01"
            placeholder="0,00"
            className={`${base} pl-9`}
            {...register(field.name, { required: field.required ? 'Campo obrigatório' : false, valueAsNumber: true })}
          />
        </div>
      )
    case 'date':
      return (
        <input
          type="date"
          className={base}
          {...register(field.name, { required: field.required ? 'Campo obrigatório' : false })}
        />
      )
    case 'email':
      return (
        <input
          type="email"
          placeholder={field.placeholder || 'email@exemplo.com'}
          className={base}
          {...register(field.name, {
            required: field.required ? 'Campo obrigatório' : false,
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'E-mail inválido' },
          })}
        />
      )
    case 'phone':
      return (
        <input
          type="tel"
          placeholder={field.placeholder || '(00) 00000-0000'}
          className={base}
          {...register(field.name, { required: field.required ? 'Campo obrigatório' : false })}
        />
      )
    case 'checkbox':
      return (
        <div className="flex items-center gap-2 h-8">
          <input
            type="checkbox"
            id={field.id}
            className="h-3.5 w-3.5 rounded border-gray-300"
            {...register(field.name)}
          />
          <label htmlFor={field.id} className="text-xs text-muted-foreground">
            {field.placeholder || 'Marcar'}
          </label>
        </div>
      )
    case 'select':
      return (
        <Select value={value} onValueChange={(v) => setValue(field.name, v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={field.placeholder || 'Selecione...'} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'file':
      return (
        <input
          type="file"
          className={base}
          {...register(field.name, { required: field.required ? 'Campo obrigatório' : false })}
        />
      )
    default:
      return (
        <input
          placeholder={field.placeholder}
          className={base}
          {...register(field.name, { required: field.required ? 'Campo obrigatório' : false })}
        />
      )
  }
}

interface DynamicFormProps {
  step: StepFormSchema
  stepIndex: number
  totalSteps: number
  onSubmit: (data: Record<string, unknown>) => void
  onCancel?: () => void
  submitting?: boolean
}

export function DynamicForm({ step, stepIndex, totalSteps, onSubmit, onCancel, submitting }: DynamicFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Record<string, unknown>>()
  const isLast = stepIndex === totalSteps - 1

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {step.fields.map((field) => (
        <div key={field.id} className="space-y-1">
          <label htmlFor={field.id} className="text-xs font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <FieldInput field={field} register={register} setValue={setValue} watch={watch} />
          {errors[field.name] && (
            <p className="text-[11px] text-red-500">{String(errors[field.name]?.message)}</p>
          )}
        </div>
      ))}

      {step.fields.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">
          Esta etapa não possui campos de coleta configurados.
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="ml-auto inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isLast ? 'Concluir' : 'Próximo →'}
        </button>
      </div>
    </form>
  )
}
