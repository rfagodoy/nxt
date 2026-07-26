/* Smoke do DESFAZER CANCELAMENTO: o processo volta de onde parou, as tarefas
   retornam com o prazo original e o histórico conta as duas coisas. */
const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'

let pass = 0, fail = 0
const check = (ok, label, extra = '') => { if (ok) { pass++; console.log(`  OK   ${label}`) } else { fail++; console.log(`  FALHA ${label} ${extra}`) } }
const avisos = (res) => (Array.isArray(res?.body) ? res.body : res?.body?.items) ?? []

const run = async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nxt.local', password: PASS }),
  })
  const token = (await r.json()).accessToken
  const A = async (path, init = {}) => {
    const res = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    const t = await res.text()
    return { ok: res.ok, status: res.status, body: t ? JSON.parse(t) : null }
  }

  const defs = await A('/processes')
  const def = (defs.body ?? []).find((d) => d.name === 'ZZ Notificacoes (SMOKE)')
  if (!def) throw new Error('rode tools/smoke/seed-notificacoes.mjs antes')

  const started = await A('/instances', { method: 'POST', body: JSON.stringify({ processDefinitionId: def.id }) })
  const instanceId = started.body.instance.id
  const taskId = started.body.tasks[0].id
  const prazoOriginal = started.body.tasks[0].dueAt

  // reabrir sem ter cancelado é recusado
  const cedo = await A(`/instances/${instanceId}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'x' }) })
  check(cedo.status === 400, 'reabrir processo que não está cancelado é recusado (400)', String(cedo.status))

  const cancel = await A(`/instances/${instanceId}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'Cancelado por engano' }) })
  check(cancel.ok, 'cancela o processo', String(cancel.status))

  const semMotivo = await A(`/instances/${instanceId}/uncancel`, { method: 'PATCH', body: JSON.stringify({}) })
  check(semMotivo.status === 400, 'reabrir SEM motivo é recusado (400)', String(semMotivo.status))

  const reabrir = await A(`/instances/${instanceId}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'Cancelamento indevido' }) })
  check(reabrir.ok, 'reabre o processo', JSON.stringify(reabrir.body).slice(0, 160))
  check(reabrir.body?.reabertas === 1, 'a tarefa pendente volta', JSON.stringify(reabrir.body))

  const ctx = await A(`/instances/${instanceId}`)
  check(ctx.body?.instance?.status === 'RUNNING', 'instância volta a Em andamento', ctx.body?.instance?.status)
  const tarefa = (ctx.body?.instance?.tasks ?? []).find((t) => t.id === taskId)
  check(tarefa?.status === 'PENDING', 'tarefa volta a Pendente', tarefa?.status)
  check(tarefa?.dueAt === prazoOriginal, 'o prazo é o ORIGINAL (o relógio do negócio não parou)', `${tarefa?.dueAt} vs ${prazoOriginal}`)

  const state = ctx.body?.state
  check(Array.isArray(state?.tokens) && state.tokens.length > 0, 'o motor recupera os tokens (cancelar zera; a foto restaura)', JSON.stringify(state?.tokens ?? []))

  const eventos = ctx.body?.events ?? []
  check(eventos.some((e) => e.event === 'CANCELADO'), 'cancelamento fica no histórico')
  check(eventos.some((e) => e.event === 'REATIVADO' && e.reason === 'Cancelamento indevido'), 'reabertura fica no histórico com motivo')

  const lista = await A('/instances')
  const linha = (lista.body ?? []).find((i) => i.id === instanceId)
  check(linha?.status === 'RUNNING' && !linha?.cancelReason, 'a lista não mostra mais o motivo de cancelamento', `${linha?.status} / ${linha?.cancelReason}`)

  const box = await A('/instances/tasks')
  check((box.body ?? []).some((t) => t.id === taskId), 'a tarefa volta para a caixa de tarefas')

  const notifs = avisos(await A('/notifications'))
  check(notifs.some((n) => n.taskId === taskId && /reaberto/i.test(n.titulo)), 'responsável é avisado da reabertura',
    notifs.filter((n) => n.taskId === taskId).map((n) => n.titulo).join(' | '))
  check(!notifs.some((n) => n.tipo === 'PROCESSO_CANCELADO' && n.instanceId === instanceId), 'aviso de cancelamento some')

  // segunda rodada: cancelar e reabrir de novo tem de continuar funcionando
  await A(`/instances/${instanceId}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'de novo' }) })
  const outra = await A(`/instances/${instanceId}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'e reabre de novo' }) })
  check(outra.ok && outra.body?.reabertas === 1, 'cancelar e reabrir mais de uma vez funciona', JSON.stringify(outra.body))

  console.log(`\n${pass}/${pass + fail} verificações passaram`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
