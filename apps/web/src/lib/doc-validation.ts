/**
 * Validação de CPF e CNPJ por dígito verificador (módulo 11).
 *
 * O CNPJ já cobre o formato ALFANUMÉRICO (Reforma Tributária 2026): cada caractere
 * da base vale `charCodeAt(0) - 48` ('0'→0 … '9'→9, 'A'→17 … 'Z'→42), e os 2 dígitos
 * verificadores continuam NUMÉRICOS. O CNPJ numérico atual é caso particular do mesmo
 * cálculo. Espelhado no backend (apps/api/src/partners/doc-validation.ts) — manter em sincronia.
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
  if (/^(\d)\1{10}$/.test(cpf)) return false // sequências repetidas (000…, 111…) passam no DV mas são inválidas
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
  if (!/^\d{2}$/.test(cnpj.slice(12))) return false      // DV é sempre numérico
  if (/^(.)\1{11}$/.test(cnpj.slice(0, 12))) return false // base toda igual (000…, AAA…) → inválida
  return cnpjDv(cnpj.slice(0, 12), CNPJ_W1) === Number(cnpj[12])
      && cnpjDv(cnpj.slice(0, 13), CNPJ_W2) === Number(cnpj[13])
}

/**
 * Documento válido para a categoria. Vazio → true (a obrigatoriedade é tratada à
 * parte, no fluxo de salvar). Estrangeiro (PJ_EST/PF_EST) não tem dígito verificador.
 */
export function isDocumentoValido(category: string, documento: string): boolean {
  const d = (documento ?? '').trim()
  if (!d) return true
  if (category === 'PJ_BR') return isValidCNPJ(d)
  if (category === 'PF_BR') return isValidCPF(d)
  return true
}
