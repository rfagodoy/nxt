import { describe, it, expect } from 'vitest'
import { formatarJson, formatarTexto, nivelPorStatus, rotaGenerica, sanear, type EventoLog } from './log-format'

/* O formato do log é o que ninguém confere — até o dia em que é preciso achar uma
   linha específica às duas da manhã. E é também o lugar mais fácil de vazar dado
   sensível sem perceber: o arquivo vai para disco, é copiado em chamado de suporte e
   aparece em captura de tela. */

const base: EventoLog = {
  nivel: 'log',
  contexto: 'Teste',
  mensagem: 'algo aconteceu',
  timestamp: '2026-07-27T12:00:00.000Z',
}

describe('formatarJson', () => {
  it('produz UMA linha por evento (coletor lê por linha)', () => {
    expect(formatarJson(base).includes('\n')).toBe(false)
  })

  it('inclui o id de correlação quando existe, e omite quando não existe', () => {
    expect(JSON.parse(formatarJson({ ...base, requestId: 'abc123' })).req).toBe('abc123')
    expect(JSON.parse(formatarJson(base)).req).toBeUndefined()
  })

  it('não deixa campo indefinido sujar a linha', () => {
    const obj = JSON.parse(formatarJson({ ...base, contexto: undefined }))
    expect('ctx' in obj).toBe(false)
  })
})

describe('sanear', () => {
  it('oculta o que nunca pode ir para o log', () => {
    const s = sanear({ password: 'x', token: 'y', documento: '123', usuarioId: 'u1' })
    expect(s?.password).toBe('[oculto]')
    expect(s?.token).toBe('[oculto]')
    expect(s?.documento).toBe('[oculto]')
    expect(s?.usuarioId).toBe('u1')
  })

  it('não se engana com a caixa da chave', () => {
    expect(sanear({ Password: 'x', REFRESHTOKEN: 'y' })).toEqual({ Password: '[oculto]', REFRESHTOKEN: '[oculto]' })
  })

  it('a ocultação também vale no formato de texto', () => {
    expect(formatarTexto({ ...base, extra: { senha: 'segredo' } })).not.toContain('segredo')
  })
})

describe('nivelPorStatus', () => {
  it('separa erro do servidor de erro do cliente', () => {
    expect(nivelPorStatus(500)).toBe('error')
    expect(nivelPorStatus(404)).toBe('warn')
    expect(nivelPorStatus(200)).toBe('log')
    expect(nivelPorStatus(302)).toBe('log')
  })
})

describe('rotaGenerica', () => {
  it('troca o id por :id para dar para agrupar', () => {
    expect(rotaGenerica('/api/contracts/ckz9abcdefghijklmnopqrst/aditivos')).toBe('/api/contracts/:id/aditivos')
  })

  it('reconhece uuid', () => {
    expect(rotaGenerica('/api/x/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('/api/x/:id')
  })

  it('troca número por :n', () => {
    expect(rotaGenerica('/api/pagina/42')).toBe('/api/pagina/:n')
  })

  it('descarta a query (pode ter dado pessoal)', () => {
    expect(rotaGenerica('/api/parceiros?documento=12345678900')).toBe('/api/parceiros')
  })

  it('não estraga rota sem identificador', () => {
    expect(rotaGenerica('/api/auth/login')).toBe('/api/auth/login')
  })
})
