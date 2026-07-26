/* Smoke do item 2: ativar workflow exige TIPO (contrato/aditivo/parceiro). */
const API = 'http://localhost:3001/api'
let pass = 0, fail = 0
const check = (ok, label, extra = '') => { if (ok) { pass++; console.log(`  OK   ${label}`) } else { fail++; console.log(`  FALHA ${label} ${extra}`) } }

const graph = {
  startId: 'start',
  nodes: {
    start: { id: 'start', type: 'start', name: 'Início' },
    a1:    { id: 'a1', type: 'userTask', name: 'Conferir', slaBusinessDays: 1 },
    end:   { id: 'end', type: 'end', name: 'Fim' },
  },
  edges: [{ id: 'e1', from: 'start', to: 'a1' }, { id: 'e2', from: 'a1', to: 'end' }],
}
const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d1" targetNamespace="http://nxt">
  <bpmn:process id="P1" isExecutable="true">
    <bpmn:startEvent id="start" name="Início"><bpmn:outgoing>e1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="a1" name="Conferir"><bpmn:incoming>e1</bpmn:incoming><bpmn:outgoing>e2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="end" name="Fim"><bpmn:incoming>e2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="e1" sourceRef="start" targetRef="a1" />
    <bpmn:sequenceFlow id="e2" sourceRef="a1" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`

const run = async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nxt.local', password: process.env.SMOKE_PASS || 'Nxt@2026' }),
  })
  const token = (await r.json()).accessToken
  const A = async (path, init = {}) => {
    const res = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    const t = await res.text()
    return { ok: res.ok, status: res.status, body: t ? JSON.parse(t) : null }
  }

  // papel de executor: reusa o primeiro existente (a obrigatoriedade de executor já existia)
  const papeis = await A('/workflow-roles')
  const papelId = (papeis.body ?? [])[0]?.id
  const formSchema = { steps: [{ stepId: 'a1', stepName: 'Conferir', stepType: 'userTask', slaBusinessDays: 1, fields: [], executor: papelId ? { papelId, entityType: 'ORG' } : undefined }] }

  const created = await A('/processes', {
    method: 'POST',
    body: JSON.stringify({ name: 'ZZ Tipo obrigatorio (SMOKE)', bpmnXml: bpmn, formSchema }),
  })
  check(created.ok, 'cria workflow SEM tipo (rascunho é permitido)', JSON.stringify(created.body).slice(0, 160))
  const id = created.body?.id

  const semTipo = await A(`/processes/${id}/activate`, { method: 'PATCH' })
  check(semTipo.status === 400, 'ativar SEM tipo é recusado (400)', `${semTipo.status} ${JSON.stringify(semTipo.body)}`)
  check(/tipo do workflow/i.test(semTipo.body?.message ?? ''), 'mensagem explica que falta o tipo', semTipo.body?.message)

  const depois = await A(`/processes/${id}`)
  check(depois.body?.status === 'DRAFT', 'workflow continua em rascunho após a recusa', depois.body?.status)

  await A(`/processes/${id}`, { method: 'PATCH', body: JSON.stringify({ kind: 'CONTRATO' }) })
  const comTipo = await A(`/processes/${id}/activate`, { method: 'PATCH' })
  // com o tipo preenchido a barreira cai: ou ativa, ou o erro passa a ser OUTRO
  // (executor/prazo — validação que já existia). O que não pode é seguir barrando por tipo.
  check(comTipo.ok || !/tipo do workflow/i.test(comTipo.body?.message ?? ''),
    'com tipo informado, a barreira do tipo deixa de valer', `${comTipo.status} ${comTipo.body?.message ?? ''}`)

  await A(`/processes/${id}`, { method: 'DELETE' })
  console.log(`\n${pass}/${pass + fail} verificações passaram`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
