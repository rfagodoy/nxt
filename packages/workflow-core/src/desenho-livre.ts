/* ─── Desenho livre (v2) ───────────────────────────────────────────────────────
   Spec: docs/superpowers/specs/2026-10-30-desenho-livre-design.md. O desenho (formas +
   setas) é a fonte da verdade do editor; os blocos são derivados dele (`desenhoParaBlocos`)
   e voltam para ele (`blocosParaDesenho`) quando o Roteiro muda a estrutura. */

import type { DesenhoV2, FormaDesenho, SetaDesenho, TipoForma } from '@nxt/types'
import { lerDesenho } from './desenho'

const TIPOS: readonly TipoForma[] = ['start', 'end', 'userTask', 'serviceTask', 'exclusiveGateway', 'parallelGateway']

/** Confere o JSON gravado. Seta para forma inexistente é descartada (sobra de exclusão);
 *  forma repetida ou estrutura errada invalidam o desenho. */
export function lerDesenhoV2(bruto: unknown): DesenhoV2 | null {
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  if (!obj(bruto) || bruto.versao !== 2 || !Array.isArray(bruto.formas) || !Array.isArray(bruto.setas)) return null
  // posições e raias têm as mesmas regras do v1
  if (!lerDesenho({ versao: 1, posicoes: bruto.posicoes, raias: bruto.raias })) return null
  const ids = new Set<string>()
  const formas: FormaDesenho[] = []
  for (const f of bruto.formas) {
    if (!obj(f) || typeof f.id !== 'string' || !TIPOS.includes(f.tipo as TipoForma) || ids.has(f.id)) return null
    ids.add(f.id)
    formas.push(f as unknown as FormaDesenho)
  }
  const setas: SetaDesenho[] = []
  for (const s of bruto.setas) {
    if (!obj(s) || typeof s.id !== 'string' || typeof s.de !== 'string' || typeof s.para !== 'string') return null
    if (ids.has(s.de) && ids.has(s.para)) setas.push(s as unknown as SetaDesenho)
  }
  return { versao: 2, formas, setas, posicoes: bruto.posicoes as DesenhoV2['posicoes'], raias: bruto.raias as DesenhoV2['raias'] }
}
