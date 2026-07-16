/**
 * Validação de CPF e CNPJ por dígito verificador (módulo 11) — defesa no servidor.
 * CNPJ compatível com o formato ALFANUMÉRICO (Reforma 2026): base vale `charCodeAt-48`,
 * DV numérico. Espelho de apps/web/src/lib/doc-validation.ts — manter em sincronia.
 */

function cpfDv(cpf: string, len: number): number {
  let sum = 0
  for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
  const mod = sum % 11
  return mod < 2 ? 0 : 11 - mod
}

export function isValidCPF(value: string): boolean {
  const cpf = (value ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false
  return cpfDv(cpf, 9) === Number(cpf[9]) && cpfDv(cpf, 10) === Number(cpf[10])
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

function cnpjDv(base: string, weights: number[]): number {
  let sum = 0
  for (let i = 0; i < weights.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i]
  const mod = sum % 11
  return mod < 2 ? 0 : 11 - mod
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = (value ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (cnpj.length !== 14) return false
  if (!/^\d{2}$/.test(cnpj.slice(12))) return false
  if (/^(.)\1{11}$/.test(cnpj.slice(0, 12))) return false
  return cnpjDv(cnpj.slice(0, 12), CNPJ_W1) === Number(cnpj[12])
      && cnpjDv(cnpj.slice(0, 13), CNPJ_W2) === Number(cnpj[13])
}

/** Documento válido para a categoria. Vazio → true (obrigatoriedade é à parte); estrangeiro não tem DV. */
export function isDocumentoValido(category: string, documento: string): boolean {
  const d = (documento ?? '').trim()
  if (!d) return true
  if (category === 'PJ_BR') return isValidCNPJ(d)
  if (category === 'PF_BR') return isValidCPF(d)
  return true
}
