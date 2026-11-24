/* ─── Estado do campo na tela (opção A do PO, 23/11/2026) ───────────────────────
   As três marcas de antes (Aparece, Pode editar, Obrigatório) dependiam uma da outra.
   Agora cada campo tem UM estado, que é o que o executor vê:
     Oculto → não aparece · Só leitura → aparece travado · Editável → pode preencher ·
     Obrigatório → precisa preencher.
   Por baixo continuam os mesmos dados (visible/hiddenCategories, locked,
   required/requiredCategories): este arquivo só lê e grava neles. */
import type { PartnerCategory, ScreenField } from '@/lib/screen-types'

export type EstadoDoCampo = 'OCULTO' | 'LEITURA' | 'EDITAVEL' | 'OBRIGATORIO'

export const ESTADOS: readonly EstadoDoCampo[] = ['OCULTO', 'LEITURA', 'EDITAVEL', 'OBRIGATORIO']
export const ROTULO_DO_ESTADO: Record<EstadoDoCampo, string> = {
  OCULTO: 'Oculto', LEITURA: 'Só leitura', EDITAVEL: 'Editável', OBRIGATORIO: 'Obrigatório',
}

/** O estado a partir das três leituras de sempre. Obrigatório travado (ninguém preenche)
 *  aparece como Só leitura: é o que o executor vive; a pendência acusa o resto. */
export function estadoDoCampo(visivel: boolean, travado: boolean, obrigatorio: boolean): EstadoDoCampo {
  if (!visivel) return 'OCULTO'
  if (travado) return 'LEITURA'
  return obrigatorio ? 'OBRIGATORIO' : 'EDITAVEL'
}

const TODAS = (todas: readonly PartnerCategory[], f: ScreenField) => new Set(f.requiredCategories ?? (f.required ? todas : []))

/**
 * Grava o estado no campo. `parceiro` = a categoria em edição numa tela de Parceiro
 * (visível e obrigatório são POR categoria; a trava é do campo inteiro). Campo que não
 * aceita a marca de obrigatório (o sistema decide) não tem o `required` mexido.
 * Ocultar não mexe em trava nem obrigatório: mostrar de novo devolve o que era.
 */
export function aplicarEstado(
  f: ScreenField,
  estado: EstadoDoCampo,
  ctx: { aceitaObrigatorio: boolean; parceiro?: { cat: PartnerCategory; todas: readonly PartnerCategory[] } },
): ScreenField {
  const { parceiro } = ctx
  let g: ScreenField
  if (parceiro) {
    const ocultas = new Set(f.hiddenCategories ?? [])
    if (estado === 'OCULTO') ocultas.add(parceiro.cat); else ocultas.delete(parceiro.cat)
    g = { ...f, visible: true, hiddenCategories: [...ocultas] }
  } else {
    g = { ...f, visible: estado !== 'OCULTO' }
  }
  if (estado === 'OCULTO') return g
  g = { ...g, locked: estado === 'LEITURA' }
  if (!ctx.aceitaObrigatorio) return g
  const quer = estado === 'OBRIGATORIO'
  if (!parceiro) return { ...g, required: quer }
  const req = TODAS(parceiro.todas, f)
  if (quer) req.add(parceiro.cat); else req.delete(parceiro.cat)
  return { ...g, required: req.size > 0, requiredCategories: [...req] }
}
