import 'reflect-metadata'
import { describe, it, expect } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CreateProcessDto } from './create-process.dto'
import { UpdateProcessDto } from './update-process.dto'

/* Todo workflow tem tipo (PO, 07/11/2026): o "sem tipo" saiu e o legado PARCEIRO não é
   mais aceito ao gravar. */

const base = { name: 'Fluxo', bpmnXml: '<x/>', formSchema: {} }
const errosDe = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body) as object).map((e) => e.property)

describe('tipo do workflow — criar', () => {
  it('aceita Contrato, Aditivo e Encerramento', () => {
    for (const kind of ['CONTRATO', 'ADITIVO', 'DISTRATO']) expect(errosDe(CreateProcessDto, { ...base, kind })).toEqual([])
  })
  it('recusa sem tipo', () => {
    expect(errosDe(CreateProcessDto, base)).toContain('kind')
    expect(errosDe(CreateProcessDto, { ...base, kind: '' })).toContain('kind')
  })
  it('recusa o legado PARCEIRO', () => {
    expect(errosDe(CreateProcessDto, { ...base, kind: 'PARCEIRO' })).toContain('kind')
  })
})

describe('tipo do workflow — salvar', () => {
  it('sem mexer no tipo, continua aceito', () => {
    expect(errosDe(UpdateProcessDto, { name: 'Outro nome' })).toEqual([])
  })
  it('não deixa apagar o tipo nem voltar a PARCEIRO', () => {
    expect(errosDe(UpdateProcessDto, { kind: '' })).toContain('kind')
    expect(errosDe(UpdateProcessDto, { kind: null })).toContain('kind')
    expect(errosDe(UpdateProcessDto, { kind: 'PARCEIRO' })).toContain('kind')
  })
  it('aceita trocar entre os três tipos', () => {
    expect(errosDe(UpdateProcessDto, { kind: 'DISTRATO' })).toEqual([])
  })
})
