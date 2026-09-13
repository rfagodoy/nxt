import { describe, it, expect } from 'vitest'
import { firstValueFrom, take, toArray } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'
import { RealtimeService } from './realtime.service'
import { topicosDaRota } from './topicos'

const topicosDe = (evs: MessageEvent[]) => evs.map(e => (e.data as { topicos: string[] }).topicos)

/* Tabela realtime_events falsa: id sequencial, filtro por data, apagar por data. */
function bancoFalso() {
  let seq = BigInt(0)
  const linhas: { id: bigint; organizationId: string; topicos: string; em: Date }[] = []
  const realtimeEvent = {
    async create({ data }: { data: { organizationId: string; topicos: string; em: Date } }) {
      seq += BigInt(1)
      const l = { id: seq, ...data }
      linhas.push(l)
      return l
    },
    async findMany({ where }: { where: { em: { gte: Date } } }) {
      return linhas.filter(l => l.em >= where.em.gte).sort((a, b) => (a.id < b.id ? -1 : 1))
    },
    async deleteMany({ where }: { where: { em: { lt: Date } } }) {
      const antes = linhas.length
      for (let i = linhas.length - 1; i >= 0; i--) if (linhas[i].em < where.em.lt) linhas.splice(i, 1)
      return { count: antes - linhas.length }
    },
  }
  return { realtimeEvent, linhas }
}

/** Uma "instância" da API: o serviço sobre o banco compartilhado, já com a 1ª leitura feita. */
async function instancia(banco: ReturnType<typeof bancoFalso>) {
  const s = new RealtimeService(banco as never)
  await s.ler()
  return s
}

/** Coleta o que chega num fluxo (sem pulso no meio do teste). */
function coletar(s: RealtimeService, org: string) {
  const recebidos: MessageEvent[] = []
  const sub = s.fluxo(org, 60_000).subscribe(e => recebidos.push(e))
  return { recebidos, parar: () => sub.unsubscribe() }
}

describe('topicosDaRota — quais requisições avisam as telas', () => {
  it('leitura nunca avisa', () => {
    expect(topicosDaRota('GET', '/api/contracts')).toEqual([])
    expect(topicosDaRota('HEAD', '/api/dashboard/summary')).toEqual([])
  })

  it('gravação avisa o recurso da rota, ignorando query string', () => {
    expect(topicosDaRota('POST', '/api/contracts')).toEqual(['contracts'])
    expect(topicosDaRota('PATCH', '/api/contracts/abc?x=1')).toEqual(['contracts'])
    expect(topicosDaRota('DELETE', '/api/org-units/u1')).toEqual(['org-units'])
    expect(topicosDaRota('post', '/api/instances/t1/complete')).toEqual(['instances'])
  })

  it('escrita que não muda dado de ninguém não avisa', () => {
    expect(topicosDaRota('POST', '/api/contracts/query')).toEqual([])
    expect(topicosDaRota('POST', '/api/partners/query')).toEqual([])
    expect(topicosDaRota('POST', '/api/auth/login')).toEqual([])
    expect(topicosDaRota('POST', '/api/auth/refresh')).toEqual([])
    expect(topicosDaRota('POST', '/api/files')).toEqual([])
    expect(topicosDaRota('GET', '/api/cep/01001000')).toEqual([])
  })
})

describe('RealtimeService — avisos entre instâncias, pelo banco', () => {
  it('gravação numa instância chega aos navegadores conectados na OUTRA', async () => {
    const banco = bancoFalso()
    const a = await instancia(banco), b = await instancia(banco)
    const naB = coletar(b, 'org_a')
    await a.emitir('org_a', ['contracts'])
    await b.ler()
    expect(topicosDe(naB.recebidos)).toEqual([['contracts']])
    naB.parar()
  })

  it('quem grava recebe o próprio aviso pelo mesmo caminho (leitura), uma vez só', async () => {
    const banco = bancoFalso()
    const a = await instancia(banco)
    const naA = coletar(a, 'org_a')
    await a.emitir('org_a', ['partners'])
    expect(naA.recebidos).toHaveLength(0)       // não entrega "por fora" ao gravar
    await a.ler()
    await a.ler()                               // a janela relê o mesmo evento
    expect(topicosDe(naA.recebidos)).toEqual([['partners']])
    naA.parar()
  })

  it('instância que acabou de subir não reentrega o que aconteceu antes', async () => {
    const banco = bancoFalso()
    const a = await instancia(banco)
    await a.emitir('org_a', ['contracts'])      // antes de B existir
    const b = new RealtimeService(banco as never)
    const naB = coletar(b, 'org_a')
    await b.ler()                               // primeira leitura: só marca
    expect(naB.recebidos).toHaveLength(0)
    naB.parar()
  })

  it('evento confirmado fora de ordem (id menor depois) não se perde', async () => {
    const banco = bancoFalso()
    const b = await instancia(banco)
    const naB = coletar(b, 'org_a')
    await banco.realtimeEvent.create({ data: { organizationId: 'org_a', topicos: 'contracts', em: new Date() } })  // id 1
    const tardio = banco.linhas.pop()!                                                                            // "ainda não confirmado"
    await banco.realtimeEvent.create({ data: { organizationId: 'org_a', topicos: 'partners', em: new Date() } })  // id 2
    await b.ler()                               // lê só o id 2
    banco.linhas.unshift(tardio)                // id 1 confirma agora
    await b.ler()
    expect(topicosDe(naB.recebidos).sort()).toEqual([['contracts'], ['partners']])
    naB.parar()
  })

  it('cada organização recebe só as próprias mudanças — e as globais', async () => {
    const banco = bancoFalso()
    const a = await instancia(banco), b = await instancia(banco)
    const naB = coletar(b, 'org_a')
    await a.emitir('org_b', ['contracts'])
    await a.emitir('org_a', ['contracts'])
    await a.emitirParaTodas(['instances'])
    await b.ler()
    expect(topicosDe(naB.recebidos)).toEqual([['contracts'], ['instances']])
    naB.parar()
  })

  it('mudança sem tópico ou sem organização não é gravada', async () => {
    const banco = bancoFalso()
    const a = await instancia(banco)
    await a.emitir('org_a', [])
    await a.emitir('', ['contracts'])
    expect(banco.linhas).toHaveLength(0)
  })

  it('falha ao gravar o aviso não derruba quem gravou o dado', async () => {
    const s = new RealtimeService({ realtimeEvent: { create: async () => { throw new Error('sem conexão') } } } as never)
    await expect(s.emitir('org_a', ['contracts'])).resolves.toBeUndefined()
  })

  it('limpeza apaga só os avisos antigos', async () => {
    const banco = bancoFalso()
    const a = await instancia(banco)
    await banco.realtimeEvent.create({ data: { organizationId: 'org_a', topicos: 'velho', em: new Date(Date.now() - 60 * 60_000) } })
    await a.emitir('org_a', ['novo'])
    await a.limpar()
    expect(banco.linhas.map(l => l.topicos)).toEqual(['novo'])
  })

  it('pulsa para a conexão não morrer por ociosidade', async () => {
    const s = new RealtimeService(bancoFalso() as never)
    const evs = await firstValueFrom(s.fluxo('org_a', 10).pipe(take(2), toArray()))
    expect(evs.map(e => e.type)).toEqual(['pulso', 'pulso'])
  })
})
