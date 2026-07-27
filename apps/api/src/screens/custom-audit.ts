/* Diferença entre os valores ANTIGOS e NOVOS dos campos personalizados. Puro e testável.
 *
 * Por que isto existe: a auditoria de Parceiros registra tudo o que muda nos campos
 * nativos, mas os campos PERSONALIZADOS — que o cliente cria e que costumam guardar
 * justamente o que o negócio dele tem de particular — mudavam em silêncio. Um histórico
 * que mostra "razão social alterada" e esconde "classificação de risco alterada" é pior
 * do que não ter histórico: dá confiança de que está tudo registrado.
 *
 * Regra que orienta o arquivo: o histórico registra o que a PESSOA vê. O valor cru de
 * um select é o código da opção (`adm`), e é ele que vai no banco; no histórico precisa
 * aparecer o rótulo (`Administrativo`), senão a linha não é legível por quem não conhece
 * o cadastro por dentro.
 */

export interface OpcaoCampo {
  value: string
  label: string
}

export interface CampoCustom {
  id: string
  label: string
  type: string
  options?: OpcaoCampo[]
}

export interface MudancaCustom {
  /** Prefixo `custom.` distingue do campo nativo na hora de ler o histórico. */
  field: string
  label: string
  before: string
  after: string
}

/** Rótulo legível de um valor cru — mesma regra de exibição usada na listagem. */
export function valorExibivel(valor: string | null | undefined, campo?: CampoCustom): string {
  const v = (valor ?? '').trim()
  if (!v) return ''
  const opcoes = campo?.options ?? []

  if (campo?.type === 'select') {
    return opcoes.find((o) => o.value === v)?.label ?? v
  }
  if (campo?.type === 'multiselect') {
    try {
      const arr = JSON.parse(v)
      if (!Array.isArray(arr)) return v
      return arr.map((x) => opcoes.find((o) => o.value === String(x))?.label ?? String(x)).join(', ')
    } catch {
      return v
    }
  }
  if (campo?.type === 'checkbox' || campo?.type === 'boolean') {
    return v === 'true' || v === '1' ? 'Sim' : 'Não'
  }
  return v
}

/** Compara os valores antigos e novos e devolve só o que MUDOU.
 *
 *  `antes` e `depois` são mapas fieldId → valor cru. Campo ausente em `depois` significa
 *  "não veio nesta gravação" — e isso NÃO é o mesmo que "foi apagado": a tela pode estar
 *  salvando um subconjunto dos campos. Só tratamos como remoção o que veio explicitamente
 *  vazio, senão uma tela parcial registraria apagamentos que nunca aconteceram. */
export function diffCustom(
  antes: Map<string, string>,
  depois: Map<string, string>,
  campos: Map<string, CampoCustom>,
): MudancaCustom[] {
  const mudancas: MudancaCustom[] = []

  for (const [fieldId, novoBruto] of depois) {
    const campo = campos.get(fieldId)
    const antigoBruto = antes.get(fieldId) ?? ''
    const novo = (novoBruto ?? '').trim()
    const antigo = (antigoBruto ?? '').trim()
    if (novo === antigo) continue

    mudancas.push({
      field: `custom.${fieldId}`,
      label: campo?.label ?? 'Campo personalizado',
      before: valorExibivel(antigo, campo) || '—',
      after: valorExibivel(novo, campo) || '—',
    })
  }

  return mudancas
}
