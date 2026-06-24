'use client'

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

export const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn"
  id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Início">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Nova Tarefa">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Fim">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="145" y="125" width="51" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="250" y="60" width="120" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="432" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="438" y="125" width="24" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100"/>
        <di:waypoint x="250" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="370" y="100"/>
        <di:waypoint x="432" y="100"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

export interface BpmnElement {
  id: string
  name: string
  type: string
}

export interface BpmnEditorRef {
  getXml: () => Promise<string>
  fitView: () => void
}

interface BpmnEditorProps {
  initialXml?: string
  onElementSelect: (element: BpmnElement | null) => void
  onXmlChange: (xml: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any

const TASK_TYPES = new Set([
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ServiceTask',
  'bpmn:ScriptTask',
  'bpmn:ManualTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask',
  'bpmn:StartEvent',
])

export const BpmnEditor = forwardRef<BpmnEditorRef, BpmnEditorProps>(
  ({ initialXml, onElementSelect, onXmlChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const modelerRef = useRef<AnyModeler>(null)

    useImperativeHandle(ref, () => ({
      getXml: async () => {
        if (!modelerRef.current) return ''
        const { xml } = await modelerRef.current.saveXML({ format: true })
        return xml
      },
      fitView: () => {
        if (!modelerRef.current) return
        const canvas = modelerRef.current.get('canvas')
        canvas.zoom('fit-viewport', 'auto')
      },
    }))

    useEffect(() => {
      if (!containerRef.current) return

      let modeler: AnyModeler = null
      let mounted = true

      const init = async () => {
        const [{ default: BpmnModeler }] = await Promise.all([
          import('bpmn-js/lib/Modeler'),
          import('bpmn-js/dist/assets/diagram-js.css' as never),
          import('bpmn-js/dist/assets/bpmn-js.css' as never),
          import('bpmn-js/dist/assets/bpmn-font/css/bpmn.css' as never),
        ])

        if (!mounted || !containerRef.current) return

        modeler = new BpmnModeler({
          container: containerRef.current,
          keyboard: { bindTo: containerRef.current },
        })
        modelerRef.current = modeler

        await modeler.importXML(initialXml || EMPTY_BPMN)

        const canvas = modeler.get('canvas')
        canvas.zoom('fit-viewport', 'auto')

        const eventBus = modeler.get('eventBus')

        eventBus.on('selection.changed', ({ newSelection }: { newSelection: AnyModeler[] }) => {
          if (!newSelection || newSelection.length === 0) {
            onElementSelect(null)
            return
          }
          const el = newSelection[0]
          if (!TASK_TYPES.has(el.type)) {
            onElementSelect(null)
            return
          }
          onElementSelect({
            id: el.id,
            name: el.businessObject?.name || '',
            type: el.type,
          })
        })

        eventBus.on('commandStack.changed', async () => {
          const { xml } = await modeler.saveXML({ format: true })
          onXmlChange(xml)
        })
      }

      init()

      return () => {
        mounted = false
        modelerRef.current?.destroy()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div className="relative w-full h-full bg-[#f8f9fb]">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    )
  },
)

BpmnEditor.displayName = 'BpmnEditor'
