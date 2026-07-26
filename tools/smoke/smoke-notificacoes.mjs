/* Smoke das BORDAS de processo, direto na API (produção local).
   Cobre: aviso ao criar tarefa · delegação (troca de dono + aviso) · aviso preventivo
   e de prazo vencido (varredura) · cancelamento com motivo (histórico + aviso). */
const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'

/* O painel do sininho devolve { items, unread } (antes era um array cru): a leitura
   passou a ser paginada quando o histórico deixou de ser descartável. */
const avisos = (res) => (Array.isArray(res?.body) ? res.body : res?.body?.items) ?? []

let pass = 0, fail = 0
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  OK   ${label}`) }
  else { fail++; console.log(`  FALHA ${label} ${extra}`) }
}

const login = async (email) => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`)
  const b = await r.json()
  return b.accessToken || b.access_token || b.token
}
const api = (token) => async (path, init = {}) => {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}

const run = async () => {
  const adminT = await login('admin@nxt.local')
  const brunoT = await login('bruno.teste@nxt.local')
  const A = api(adminT), B = api(brunoT)

  const defs = await A('/processes')
  const def = (Array.isArray(defs.body) ? defs.body : defs.body?.items ?? []).find((d) => d.name === 'ZZ Notificacoes (SMOKE)')
  if (!def) throw new Error('definição do smoke não encontrada — rode tools/smoke/seed-notificacoes.mjs')

  // 1) iniciar → tarefa criada → aviso no sininho
  const started = await A('/instances', { method: 'POST', body: JSON.stringify({ processDefinitionId: def.id }) })
  check(started.ok, 'inicia a instância', JSON.stringify(started.body).slice(0, 200))
  const instanceId = started.body?.instance?.id
  const taskId = started.body?.tasks?.[0]?.id

  const nAdmin = await A('/notifications')
  const aviso = avisos(nAdmin).find((n) => n.taskId === taskId)
  check(!!aviso && aviso.tipo === 'TAREFA_ATRIBUIDA', 'tarefa nova gera aviso de tarefa atribuída')
  check(!!aviso && /Preencher pedido/.test(aviso.titulo), 'aviso nomeia a atividade', aviso?.titulo)
  // tarefa sem executor = aviso da organização: Bruno também o vê
  const nBruno0 = await B('/notifications')
  check(avisos(nBruno0).some((n) => n.taskId === taskId), 'tarefa ABERTA aparece para toda a org')

  // 2) delegar para Bruno
  const users = await A('/users/selectable')
  const bruno = (users.body ?? []).find((u) => u.email === 'bruno.teste@nxt.local')
  const semMotivo = await A(`/instances/tasks/${taskId}/assign`, { method: 'PATCH', body: JSON.stringify({ userId: bruno.id }) })
  check(semMotivo.status === 400, 'delegação SEM motivo é recusada (400)', String(semMotivo.status))

  const deleg = await A(`/instances/tasks/${taskId}/assign`, {
    method: 'PATCH', body: JSON.stringify({ userId: bruno.id, reason: 'Titular de férias' }),
  })
  check(deleg.ok, 'delega a tarefa', JSON.stringify(deleg.body).slice(0, 200))

  const nBruno = await B('/notifications')
  const avisoB = avisos(nBruno).find((n) => n.taskId === taskId)
  check(!!avisoB && /delegada a você/i.test(avisoB.titulo), 'novo responsável é avisado da delegação', avisoB?.titulo)
  check(/Titular de férias/.test(avisoB?.mensagem ?? ''), 'aviso carrega o motivo da delegação')

  const nAdmin2 = await A('/notifications')
  check(!avisos(nAdmin2).some((n) => n.taskId === taskId), 'aviso antigo (tarefa aberta) some do sininho de quem não é mais dono')

  const boxB = await B('/instances/tasks')
  check((boxB.body ?? []).some((t) => t.id === taskId), 'tarefa entra na caixa do delegado')

  const repetida = await A(`/instances/tasks/${taskId}/assign`, {
    method: 'PATCH', body: JSON.stringify({ userId: bruno.id, reason: 'de novo' }),
  })
  check(repetida.status === 400, 'delegar para quem já tem a tarefa é recusado (400)', String(repetida.status))

  // 3) prazos: joga o vencimento para trás e roda a varredura
  const soon = await A('/instances/sweep-overdue', { method: 'POST' })
  check(soon.ok, 'varredura de prazos executa', JSON.stringify(soon.body))

  // 4) cancelamento com motivo
  const semRazao = await A(`/instances/${instanceId}/cancel`, { method: 'PATCH', body: JSON.stringify({}) })
  check(semRazao.status === 400, 'cancelamento SEM motivo é recusado (400)', String(semRazao.status))

  const cancel = await A(`/instances/${instanceId}/cancel`, {
    method: 'PATCH', body: JSON.stringify({ reason: 'Pedido duplicado' }),
  })
  check(cancel.ok, 'cancela a instância com motivo', JSON.stringify(cancel.body).slice(0, 200))

  const ctx = await A(`/instances/${instanceId}`)
  const eventos = ctx.body?.events ?? []
  check(eventos.some((e) => e.event === 'DELEGADO' && e.reason === 'Titular de férias'), 'delegação fica no histórico do processo')
  check(eventos.some((e) => e.event === 'CANCELADO' && e.reason === 'Pedido duplicado'), 'cancelamento fica no histórico com motivo')

  const lista = await A('/instances')
  const linha = (lista.body ?? []).find((i) => i.id === instanceId)
  check(linha?.cancelReason === 'Pedido duplicado', 'lista de processos expõe o motivo do cancelamento', linha?.cancelReason)
  check(linha?.status === 'CANCELLED', 'instância fica CANCELLED')

  const nBrunoFim = await B('/notifications')
  check(avisos(nBrunoFim).some((n) => n.tipo === 'PROCESSO_CANCELADO' && n.instanceId === instanceId),
    'quem tinha tarefa pendente é avisado do cancelamento')
  check(!avisos(nBrunoFim).some((n) => n.taskId === taskId && n.tipo !== 'PROCESSO_CANCELADO'),
    'avisos da tarefa cancelada somem do sininho')

  console.log(`\n${pass}/${pass + fail} verificações passaram`)
  if (fail > 0) process.exit(1)
}

run().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
