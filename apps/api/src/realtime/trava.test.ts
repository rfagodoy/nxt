import { describe, it, expect } from 'vitest'
import { TravaService } from './trava.service'

/* Armazenamento falso com a MESMA semântica das duas instruções que o serviço usa:
   UPDATE condicional (updateMany) e INSERT com chave única (create → P2002). */
function bancoFalso() {
  const linhas = new Map<string, { name: string; holder: string; lockedUntil: Date }>()
  const schedulerLock = {
    async updateMany({ where, data }: { where: { name: string; holder?: string; lockedUntil?: { lt: Date } }; data: { holder?: string; lockedUntil: Date } }) {
      const l = linhas.get(where.name)
      if (!l) return { count: 0 }
      if (where.holder !== undefined && l.holder !== where.holder) return { count: 0 }
      if (where.lockedUntil && !(l.lockedUntil < where.lockedUntil.lt)) return { count: 0 }
      Object.assign(l, data)
      return { count: 1 }
    },
    async create({ data }: { data: { name: string; holder: string; lockedUntil: Date } }) {
      if (linhas.has(data.name)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      linhas.set(data.name, { ...data })
      return data
    },
  }
  return { schedulerLock, linhas }
}

/** Duas "instâncias" da API no mesmo processo, olhando para o mesmo banco. */
function instancia(banco: ReturnType<typeof bancoFalso>, dono: string) {
  const s = new TravaService(banco as never)
  s.dono = dono
  return s
}

describe('TravaService — rotina automática roda numa instância só', () => {
  it('trava livre: a primeira instância pega, a segunda não', async () => {
    const banco = bancoFalso()
    const a = instancia(banco, 'A'), b = instancia(banco, 'B')
    expect(await a.adquirir('motor-datas', 60_000)).toBe(true)
    expect(await b.adquirir('motor-datas', 60_000)).toBe(false)
    expect(banco.linhas.get('motor-datas')?.holder).toBe('A')
  })

  it('não é reentrante: nem a própria dona pega de novo antes de expirar', async () => {
    const banco = bancoFalso()
    const a = instancia(banco, 'A')
    expect(await a.adquirir('resumo-email:org:2026-09-13', 60_000)).toBe(true)
    expect(await a.adquirir('resumo-email:org:2026-09-13', 60_000)).toBe(false)   // "uma vez por dia" de verdade
  })

  it('trava vencida (instância caiu no meio) pode ser tomada por outra', async () => {
    const banco = bancoFalso()
    const a = instancia(banco, 'A'), b = instancia(banco, 'B')
    expect(await a.adquirir('motor-datas', -1_000)).toBe(true)   // já nasce vencida
    expect(await b.adquirir('motor-datas', 60_000)).toBe(true)
    expect(banco.linhas.get('motor-datas')?.holder).toBe('B')
  })

  it('liberar solta para as outras — mas só quem é dono consegue soltar', async () => {
    const banco = bancoFalso()
    const a = instancia(banco, 'A'), b = instancia(banco, 'B')
    await a.adquirir('motor-datas', 60_000)
    await b.liberar('motor-datas')                              // B não é dona: nada acontece
    expect(await b.adquirir('motor-datas', 60_000)).toBe(false)
    await a.liberar('motor-datas')
    expect(await b.adquirir('motor-datas', 60_000)).toBe(true)
  })

  it('executar: só a dona roda; com liberarAoFim=false a janela continua fechada', async () => {
    const banco = bancoFalso()
    const a = instancia(banco, 'A'), b = instancia(banco, 'B')
    const rodou: string[] = []
    const ra = await a.executar('varredura-prazos', 60_000, async () => { rodou.push('A'); return 3 }, false)
    const rb = await b.executar('varredura-prazos', 60_000, async () => { rodou.push('B'); return 3 }, false)
    expect(rodou).toEqual(['A'])
    expect(ra).toEqual({ executou: true, resultado: 3 })
    expect(rb).toEqual({ executou: false })
  })

  it('executar: erro na rotina solta a trava e repassa o erro', async () => {
    const banco = bancoFalso()
    const a = instancia(banco, 'A'), b = instancia(banco, 'B')
    await expect(a.executar('resumo-email:org:dia', 60_000, async () => { throw new Error('SMTP fora') }, false)).rejects.toThrow('SMTP fora')
    // a falha não pode prender a rotina até o fim do prazo: a próxima tentativa roda
    expect(await b.adquirir('resumo-email:org:dia', 60_000)).toBe(true)
  })

  it('banco indisponível: não executa e não explode quem chamou', async () => {
    const s = new TravaService({ schedulerLock: { updateMany: async () => { throw new Error('sem conexão') } } } as never)
    let rodou = false
    expect(await s.executar('motor-datas', 60_000, async () => { rodou = true })).toEqual({ executou: false })
    expect(rodou).toBe(false)
  })
})
