import { describe, it, expect } from 'vitest'
import { aoSairDoEditor, destinoInterno } from './sair-do-editor'

describe('aoSairDoEditor', () => {
  it('rascunho com alterações grava sozinho (como sempre foi)', () => {
    expect(aoSairDoEditor({ somenteLeitura: false, ativo: false, sujo: true })).toBe('gravar')
  })
  it('workflow ativo com alterações pergunta antes — nunca grava sozinho', () => {
    expect(aoSairDoEditor({ somenteLeitura: false, ativo: true, sujo: true })).toBe('perguntar')
  })
  it('sem alterações não faz nada, ativo ou não', () => {
    expect(aoSairDoEditor({ somenteLeitura: false, ativo: true, sujo: false })).toBe('nada')
    expect(aoSairDoEditor({ somenteLeitura: false, ativo: false, sujo: false })).toBe('nada')
  })
  it('somente leitura não grava nem pergunta', () => {
    expect(aoSairDoEditor({ somenteLeitura: true, ativo: true, sujo: true })).toBe('nada')
    expect(aoSairDoEditor({ somenteLeitura: true, ativo: false, sujo: true })).toBe('nada')
  })
})

describe('destinoInterno', () => {
  const origem = 'http://localhost:3000'
  const clique = (over: Partial<Parameters<typeof destinoInterno>[0]> = {}) => ({
    button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false,
    href: 'http://localhost:3000/dashboard', target: '', download: false, ...over,
  })

  it('clique simples num link da própria aplicação devolve o caminho', () => {
    expect(destinoInterno(clique(), origem)).toBe('/dashboard')
  })
  it('mantém busca e âncora do destino', () => {
    expect(destinoInterno(clique({ href: 'http://localhost:3000/modules/contratos?f=1#x' }), origem)).toBe('/modules/contratos?f=1#x')
  })
  it('ignora link para outro site', () => {
    expect(destinoInterno(clique({ href: 'https://exemplo.com/' }), origem)).toBeNull()
  })
  it('ignora clique que abre em outra aba (Ctrl, Cmd, Shift, botão do meio, target)', () => {
    expect(destinoInterno(clique({ ctrlKey: true }), origem)).toBeNull()
    expect(destinoInterno(clique({ metaKey: true }), origem)).toBeNull()
    expect(destinoInterno(clique({ shiftKey: true }), origem)).toBeNull()
    expect(destinoInterno(clique({ button: 1 }), origem)).toBeNull()
    expect(destinoInterno(clique({ target: '_blank' }), origem)).toBeNull()
  })
  it('ignora download e clique já tratado por outro', () => {
    expect(destinoInterno(clique({ download: true }), origem)).toBeNull()
    expect(destinoInterno(clique({ defaultPrevented: true }), origem)).toBeNull()
  })
  it('ignora âncora na mesma página', () => {
    expect(destinoInterno(clique({ href: 'http://localhost:3000/workflows/1/edit#raia' }), origem, '/workflows/1/edit')).toBeNull()
  })
})
