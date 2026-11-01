import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./http', () => ({ apiFetch: vi.fn() }))
import { apiFetch } from './http'
import { lerSetting, pullSetting } from './settings-store'
import { depoisDoBackend } from '@/hooks/use-lookup-table'

const resposta = (status: number, corpo: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as Response
const api = vi.mocked(apiFetch)

describe('lerSetting: vazio no backend é diferente de falha', () => {
  beforeEach(() => { api.mockReset() })

  it('backend respondeu com valor: ok e o valor', async () => {
    api.mockResolvedValue(resposta(200, { value: [{ id: 'p1' }] }))
    expect(await lerSetting('k')).toEqual({ ok: true, valor: [{ id: 'p1' }] })
  })

  it('backend respondeu vazio: ok, valor null', async () => {
    api.mockResolvedValue(resposta(200, { value: null }))
    expect(await lerSetting('k')).toEqual({ ok: true, valor: null })
  })

  it('resposta de erro (401 / 500): falhou', async () => {
    api.mockResolvedValue(resposta(500, {}))
    expect(await lerSetting('k')).toEqual({ ok: false })
    api.mockResolvedValue(resposta(401, {}))
    expect(await lerSetting('k')).toEqual({ ok: false })
  })

  it('sem rede: falhou', async () => {
    api.mockImplementation(async () => { throw new TypeError('Failed to fetch') })
    expect(await lerSetting('k')).toEqual({ ok: false })
  })

  it('pullSetting segue devolvendo null no vazio e na falha', async () => {
    api.mockResolvedValue(resposta(200, { value: null }))
    expect(await pullSetting('k')).toBeNull()
    api.mockImplementation(async () => { throw new TypeError('Failed to fetch') })
    expect(await pullSetting('k')).toBeNull()
  })
})

describe('useLookupTable: o que fazer com a resposta do backend', () => {
  it('com valor: aplica e conta como carregada', () => {
    expect(depoisDoBackend({ ok: true, valor: [] })).toEqual({ aplicar: true, semear: false, carregado: true })
  })
  it('vazio de verdade: semeia o padrão e conta como carregada', () => {
    expect(depoisDoBackend({ ok: true, valor: null })).toEqual({ aplicar: false, semear: true, carregado: true })
  })
  it('falha (sem rede, 401, 500): fica no cache, não semeia e NÃO conta como carregada', () => {
    expect(depoisDoBackend({ ok: false })).toEqual({ aplicar: false, semear: false, carregado: false })
  })
})
