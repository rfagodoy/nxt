'use client'

import { useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Save, Zap, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormBuilder } from '@/components/bpmn/form-builder'
import { apiFetch } from '@/lib/http'
import { Badge } from '@/components/ui/badge'
import type { BpmnElement, BpmnEditorRef } from '@/components/bpmn/bpmn-editor'
import type { StepFormSchema, ProcessFormSchema } from '@nxt/types'

// bpmn-js só roda no browser
const BpmnEditor = dynamic(
  () => import('@/components/bpmn/bpmn-editor').then((m) => m.BpmnEditor),
  { ssr: false, loading: () => <BpmnLoading /> },
)

function BpmnLoading() {
  return (
    <div className="flex items-center justify-center w-full h-full bg-muted">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando editor BPMN...
      </div>
    </div>
  )
}

export function ProcessDesigner() {
  const router = useRouter()
  const editorRef = useRef<BpmnEditorRef>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [bpmnXml, setBpmnXml] = useState('')
  const [stepForms, setStepForms] = useState<Record<string, StepFormSchema>>({})
  const [selectedElement, setSelectedElement] = useState<BpmnElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [showMeta, setShowMeta] = useState(true)

  const handleSaveDraft = useCallback(async () => {
    if (!name.trim()) {
      alert('Dê um nome ao processo antes de salvar.')
      return
    }
    setSaving(true)
    try {
      const xml = await editorRef.current?.getXml() || bpmnXml
      const formSchema: ProcessFormSchema = { steps: Object.values(stepForms) }

      const res = await apiFetch(`/api/processes`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          bpmnXml: xml,
          formSchema,
        }),
      })

      if (!res.ok) throw new Error('Erro ao salvar')
      const data = await res.json()
      router.push(`/processes/${data.id}`)
    } catch (err) {
      alert('Não foi possível salvar o processo.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [name, description, bpmnXml, stepForms, router])

  const handleActivate = useCallback(async () => {
    if (!name.trim()) {
      alert('Dê um nome ao processo antes de ativar.')
      return
    }
    setActivating(true)
    try {
      const xml = await editorRef.current?.getXml() || bpmnXml
      const formSchema: ProcessFormSchema = { steps: Object.values(stepForms) }

      // Cria rascunho e já ativa — o backend COMPILA o BPMN aqui (o motor executa
      // o diagrama de verdade). Se o desenho for inválido, mostramos a causa.
      const createRes = await apiFetch(`/api/processes`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          bpmnXml: xml,
          formSchema,
        }),
      })

      if (!createRes.ok) throw new Error('Erro ao criar processo')
      const created = await createRes.json()

      const activateRes = await apiFetch(`/api/processes/${created.id}/activate`, { method: 'PATCH' })

      if (!activateRes.ok) {
        const e = await activateRes.json().catch(() => null)
        // O processo foi criado como rascunho; leva ao detalhe para corrigir/reativar.
        alert(e?.message || 'Não foi possível ativar o processo.')
        router.push(`/processes/${created.id}`)
        return
      }
      router.push(`/processes/${created.id}`)
    } catch (err) {
      alert('Não foi possível ativar o processo.')
      console.error(err)
    } finally {
      setActivating(false)
    }
  }, [name, description, bpmnXml, stepForms, router])

  const configuredStepsCount = Object.values(stepForms).filter((s) => s.fields.length > 0).length
  const totalFields = Object.values(stepForms).reduce((acc, s) => acc + s.fields.length, 0)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/processes')}
          className="h-8 w-8"
        >
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
          {totalFields > 0 && (
            <Badge variant="secondary" className="text-xs">
              {configuredStepsCount} etapa{configuredStepsCount !== 1 ? 's' : ''} · {totalFields} campo{totalFields !== 1 ? 's' : ''}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={saving || activating}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar rascunho
          </Button>
          <Button
            size="sm"
            onClick={handleActivate}
            disabled={saving || activating}
          >
            {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Ativar processo
          </Button>
        </div>
      </div>

      {/* Meta (description) — colapsável */}
      {showMeta && (
        <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground shrink-0">Descrição</Label>
            <Input
              className="h-7 text-xs"
              placeholder="Descreva o objetivo deste processo..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button
              onClick={() => setShowMeta(false)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              ocultar
            </button>
          </div>
        </div>
      )}

      {/* Canvas + Painel */}
      <div className="flex flex-1 overflow-hidden">
        {/* BPMN Canvas */}
        <div className="flex-1 overflow-hidden">
          <BpmnEditor
            ref={editorRef}
            initialXml={undefined}
            onElementSelect={setSelectedElement}
            onXmlChange={setBpmnXml}
          />
        </div>

        {/* Painel lateral */}
        <div className="w-80 border-l bg-card flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-2.5 border-b bg-muted/30 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Configuração da etapa
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <FormBuilder
              selectedElement={selectedElement}
              stepForms={stepForms}
              onStepFormsChange={setStepForms}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
