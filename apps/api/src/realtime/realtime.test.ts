import { describe, it, expect } from 'vitest'
import { firstValueFrom, take, toArray } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'
import { RealtimeService } from './realtime.service'
import { topicosDaRota } from './topicos'

const topicosDe = (evs: MessageEvent[]) => evs.map(e => (e.data as { topicos: string[] }).topicos)

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
    expect(topicosDaRota('POST', '/api/contracts/query')).toEqual([])   // lista usa POST para ler
    expect(topicosDaRota('POST', '/api/partners/query')).toEqual([])
    expect(topicosDaRota('POST', '/api/auth/login')).toEqual([])
    expect(topicosDaRota('POST', '/api/auth/refresh')).toEqual([])
    expect(topicosDaRota('POST', '/api/files')).toEqual([])             // anexo sobe antes do save
    expect(topicosDaRota('GET', '/api/cep/01001000')).toEqual([])
  })
})

describe('RealtimeService', () => {
  it('cada organização recebe só as próprias mudanças — e as globais', async () => {
    const rt = new RealtimeService()
    const recebidos = firstValueFrom(rt.fluxo('org_a', 60_000).pipe(take(2), toArray()))
    rt.emitir('org_b', ['contracts'])       // de outra organização: não pode chegar
    rt.emitir('org_a', ['contracts'])
    rt.emitirParaTodas(['instances'])       // varredura de prazos: vale para todas
    const evs = await recebidos
    expect(evs.every(e => e.type === 'mudanca')).toBe(true)
    expect(topicosDe(evs)).toEqual([['contracts'], ['instances']])
  })

  it('mudança sem tópico ou sem organização não é emitida', async () => {
    const rt = new RealtimeService()
    const primeiro = firstValueFrom(rt.fluxo('org_a', 15).pipe(take(1)))
    rt.emitir('org_a', [])
    rt.emitir('', ['contracts'])
    expect((await primeiro).type).toBe('pulso')   // o que chega primeiro é o pulso, não um aviso vazio
  })

  it('pulsa para a conexão não morrer por ociosidade', async () => {
    const rt = new RealtimeService()
    const evs = await firstValueFrom(rt.fluxo('org_a', 10).pipe(take(2), toArray()))
    expect(evs.map(e => e.type)).toEqual(['pulso', 'pulso'])
  })
})
