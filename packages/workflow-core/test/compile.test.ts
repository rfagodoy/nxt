import { describe, it, expect } from 'vitest'
import { compileBpmn, CompileError } from '../src/compile'
import { startProcess, completeToken, makeCounterRuntime } from '../src/interpreter'

// XML idêntico ao default do designer (bpmn-editor EMPTY_BPMN)
const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
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
</bpmn:definitions>`

describe('compileBpmn — diagrama padrão do designer', () => {
  it('compila start → task → end', () => {
    const g = compileBpmn(EMPTY_BPMN)
    expect(g.startId).toBe('StartEvent_1')
    expect(g.nodes['StartEvent_1'].type).toBe('start')
    expect(g.nodes['Task_1'].type).toBe('userTask')
    expect(g.nodes['Task_1'].name).toBe('Nova Tarefa')
    expect(g.nodes['EndEvent_1'].type).toBe('end')
    expect(g.edges).toHaveLength(2)
  })

  it('o grafo compilado EXECUTA no interpretador (ponta a ponta)', () => {
    const g = compileBpmn(EMPTY_BPMN)
    const rt = makeCounterRuntime()
    const r0 = startProcess(g, {}, rt)
    expect(r0.state.tokens[0].nodeId).toBe('Task_1')
    const tok = r0.state.tokens[0].id
    const r1 = completeToken(g, r0.state, tok, { ok: true }, rt)
    expect(r1.state.status).toBe('completed')
  })
})

describe('compileBpmn — gateway exclusivo com condição', () => {
  // start → preencher(userTask) → G(exclusivo) → [valor>100000 → diretor] / default → end
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="D1">
  <bpmn:process id="P1">
    <bpmn:startEvent id="S1" name="Início"/>
    <bpmn:userTask id="U1" name="Preencher"/>
    <bpmn:exclusiveGateway id="G1" name="Valor alto?" default="F_def"/>
    <bpmn:userTask id="U2" name="Aprovar (diretor)"/>
    <bpmn:endEvent id="E1"/>
    <bpmn:sequenceFlow id="F0" sourceRef="S1" targetRef="U1"/>
    <bpmn:sequenceFlow id="F1" sourceRef="U1" targetRef="G1"/>
    <bpmn:sequenceFlow id="F_cond" sourceRef="G1" targetRef="U2">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">valor &gt; 100000</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F_def" sourceRef="G1" targetRef="E1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="U2" targetRef="E1"/>
  </bpmn:process>
</bpmn:definitions>`

  it('decodifica a condição (&gt; → >) e marca o default', () => {
    const g = compileBpmn(XML)
    const cond = g.edges.find((e) => e.id === 'F_cond')!
    expect(cond.condition).toBe('valor > 100000')
    const def = g.edges.find((e) => e.id === 'F_def')!
    expect(def.isDefault).toBe(true)
    expect(g.nodes['G1'].type).toBe('exclusiveGateway')
  })

  it('executa o ramo certo conforme o valor', () => {
    const g = compileBpmn(XML)
    const rt = makeCounterRuntime()

    // valor alto → cai na aprovação do diretor
    const a0 = startProcess(g, {}, rt)
    const a1 = completeToken(g, a0.state, a0.state.tokens[0].id, { valor: 250000 }, rt)
    expect(a1.state.tokens[0].nodeId).toBe('U2')

    // valor baixo → default direto ao fim
    const b0 = startProcess(g, {}, rt)
    const b1 = completeToken(g, b0.state, b0.state.tokens[0].id, { valor: 5000 }, rt)
    expect(b1.state.status).toBe('completed')
  })
})

describe('compileBpmn — extensões nxt: (papel/tela/conector/sla)', () => {
  const XML = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1">
  <bpmn:process id="P1">
    <bpmn:startEvent id="S1"/>
    <bpmn:userTask id="U1" name="Aprovar" nxt:role="gestor" nxt:form="tela_contrato" nxt:sla="1440"/>
    <bpmn:serviceTask id="SV1" nxt:connector="contracts.create"/>
    <bpmn:endEvent id="E1"/>
    <bpmn:sequenceFlow id="F0" sourceRef="S1" targetRef="U1"/>
    <bpmn:sequenceFlow id="F1" sourceRef="U1" targetRef="SV1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="SV1" targetRef="E1"/>
  </bpmn:process>
</bpmn:definitions>`

  it('lê os atributos de extensão', () => {
    const g = compileBpmn(XML)
    expect(g.nodes['U1'].role).toBe('gestor')
    expect(g.nodes['U1'].formRef).toBe('tela_contrato')
    expect(g.nodes['U1'].slaMinutes).toBe(1440)
    expect(g.nodes['SV1'].type).toBe('serviceTask')
    expect(g.nodes['SV1'].connector).toBe('contracts.create')
  })
})

describe('compileBpmn — raias (lanes) → papel do executor', () => {
  const XML = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1">
  <bpmn:process id="P1">
    <bpmn:laneSet id="LS">
      <bpmn:lane id="L1" name="Gestor">
        <bpmn:flowNodeRef>U1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="L2" name="Diretor">
        <bpmn:flowNodeRef>U2</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="S1"/>
    <bpmn:userTask id="U1" name="Preencher"/>
    <bpmn:userTask id="U2" name="Aprovar" nxt:role="Comitê"/>
    <bpmn:endEvent id="E1"/>
    <bpmn:sequenceFlow id="F0" sourceRef="S1" targetRef="U1"/>
    <bpmn:sequenceFlow id="F1" sourceRef="U1" targetRef="U2"/>
    <bpmn:sequenceFlow id="F2" sourceRef="U2" targetRef="E1"/>
  </bpmn:process>
</bpmn:definitions>`

  it('a raia define o papel do nó', () => {
    const g = compileBpmn(XML)
    expect(g.nodes['U1'].role).toBe('Gestor')
  })

  it('nxt:role tem precedência sobre a raia', () => {
    const g = compileBpmn(XML)
    // U2 está na raia "Diretor" mas tem nxt:role="Comitê" → vence a extensão
    expect(g.nodes['U2'].role).toBe('Comitê')
  })
})

describe('compileBpmn — `>` literal em atributo (XML válido)', () => {
  it('não quebra com > dentro do name do gateway', () => {
    const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="P">
    <bpmn:startEvent id="S"/>
    <bpmn:exclusiveGateway id="G" name="Valor > 100 mil?" default="Fd"/>
    <bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="G"/>
    <bpmn:sequenceFlow id="Fd" sourceRef="G" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`
    const g = compileBpmn(xml)
    expect(g.nodes['G'].name).toBe('Valor > 100 mil?')
    expect(g.edges.find((e) => e.id === 'Fd')?.isDefault).toBe(true)
  })
})

describe('compileBpmn — erros claros', () => {
  it('BPMN vazio', () => {
    expect(() => compileBpmn('')).toThrow(CompileError)
  })

  it('sem start', () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://x"><bpmn:process id="P"><bpmn:endEvent id="E"/></bpmn:process></bpmn:definitions>`
    expect(() => compileBpmn(xml)).toThrow(/sem evento de início/)
  })

  it('seta órfã (targetRef inexistente)', () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://x"><bpmn:process id="P">
      <bpmn:startEvent id="S"/>
      <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="NAOEXISTE"/>
    </bpmn:process></bpmn:definitions>`
    expect(() => compileBpmn(xml)).toThrow(/inexistente/)
  })

  it('construção não suportada (subProcess) falha explicitamente', () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://x"><bpmn:process id="P">
      <bpmn:startEvent id="S"/>
      <bpmn:subProcess id="SUB"/>
      <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="SUB"/>
    </bpmn:process></bpmn:definitions>`
    expect(() => compileBpmn(xml)).toThrow(/não suportada/)
  })

  it('condição com sintaxe inválida falha na compilação', () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://x"><bpmn:process id="P">
      <bpmn:startEvent id="S"/>
      <bpmn:exclusiveGateway id="G" default="F2"/>
      <bpmn:endEvent id="E"/>
      <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="G"/>
      <bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="E"><bpmn:conditionExpression>valor ></bpmn:conditionExpression></bpmn:sequenceFlow>
      <bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="E"/>
    </bpmn:process></bpmn:definitions>`
    expect(() => compileBpmn(xml)).toThrow(/Condição inválida/)
  })
})
