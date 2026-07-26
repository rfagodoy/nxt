import { describe, it, expect } from 'vitest'
import { compararMigrations } from './migrations-guard'

/* A comparação decide se a API sobe ou não. Um falso "está em dia" devolve o modo de
   falha que queremos matar: API no ar quebrando na primeira consulta que toca a
   coluna nova. */

const aplicada = (nome: string) => ({ migration_name: nome, finished_at: new Date() })
const pelaMetade = (nome: string) => ({ migration_name: nome, finished_at: null })

describe('compararMigrations', () => {
  it('tudo aplicado: nada pendente', () => {
    const r = compararMigrations(['0_init', '1_email'], [aplicada('0_init'), aplicada('1_email')])
    expect(r.pendentes).toEqual([])
    expect(r.desconhecidas).toEqual([])
  })

  it('migração do código ausente no banco é PENDENTE', () => {
    const r = compararMigrations(['0_init', '1_email'], [aplicada('0_init')])
    expect(r.pendentes).toEqual(['1_email'])
  })

  it('migração aplicada PELA METADE conta como pendente', () => {
    // finished_at nulo = rodou e não terminou; o banco está num meio-termo
    const r = compararMigrations(['0_init'], [pelaMetade('0_init')])
    expect(r.pendentes).toEqual(['0_init'])
  })

  it('banco à frente do código é DESCONHECIDA, não pendente', () => {
    // app antigo contra banco novo: avisa, mas não impede de subir
    const r = compararMigrations(['0_init'], [aplicada('0_init'), aplicada('2_futuro')])
    expect(r.pendentes).toEqual([])
    expect(r.desconhecidas).toEqual(['2_futuro'])
  })

  it('banco vazio: todas as migrações do código estão pendentes', () => {
    const r = compararMigrations(['0_init', '1_email'], [])
    expect(r.pendentes).toEqual(['0_init', '1_email'])
  })
})
