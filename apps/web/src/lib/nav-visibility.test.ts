import { describe, it, expect } from 'vitest'
import { filtrarSecoesPorPapel } from './nav-visibility'

const menu = [
  { label: '', items: [{ href: '/dashboard' }] },
  {
    label: 'Gestão',
    items: [
      { href: '/tarefas' },
      { href: '/modules/estrutura', adminOnly: true },
      { href: '/modules/relatorios' },
    ],
  },
  { label: 'Configurações', adminOnly: true, items: [{ href: '/settings/usuarios' }] },
  { label: 'Instalação', adminOnly: true, items: [{ href: '/settings/diagnostico' }] },
]

describe('filtrarSecoesPorPapel', () => {
  it('admin vê tudo, na mesma referência (sem recriar arrays à toa)', () => {
    expect(filtrarSecoesPorPapel(menu, 'admin')).toBe(menu)
  })

  it('usuário comum não vê seções adminOnly nem o item Estrutura', () => {
    const v = filtrarSecoesPorPapel(menu, 'user')
    expect(v.map((s) => s.label)).toEqual(['', 'Gestão'])
    expect(v[1].items.map((i) => i.href)).toEqual(['/tarefas', '/modules/relatorios'])
  })

  it('sessão ainda carregando (role indefinido) cai na visão de usuário comum', () => {
    const v = filtrarSecoesPorPapel(menu, undefined)
    expect(v.map((s) => s.label)).toEqual(['', 'Gestão'])
  })

  it('seção que ficar sem itens some inteira', () => {
    const soAdmin = [{ label: 'X', items: [{ href: '/a', adminOnly: true }] }]
    expect(filtrarSecoesPorPapel(soAdmin, 'user')).toEqual([])
  })
})
