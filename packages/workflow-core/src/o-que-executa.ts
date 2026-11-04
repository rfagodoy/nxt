/* ─── O que o motor executa (comparação de gravações) ─────────────────────────
   Decisão do PO (30/10/2026): arrumar o desenho de um workflow ATIVO (posições, raias,
   layout, rótulos, nomes de Início/Fim) não o devolve a rascunho; mudar o que o motor
   executa, sim. A API (`mudaOFluxo`) decide por estas funções e o editor as usa para
   avisar ANTES de salvar — as duas pontas fazem a mesma conta. */

import { lerFluxoBlocos, SUFIXO_REENCONTRO, type FluxoBlocos } from './blocos'
import { desenhoParaBlocos, lerDesenhoV2 } from './desenho-livre'

/** Chaves do formSchema que são SÓ desenho (o motor não lê nenhuma delas). */
export const CHAVES_SO_VISUAIS = ['positions', 'positionsRaia', 'laneOrder'] as const

/** JSON com as chaves ordenadas e sem `undefined` — para comparar o que veio do editor
 *  com o que o banco devolveu, que não guarda a ordem das chaves. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    const pares = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${pares.map(([k, x]) => `${JSON.stringify(k)}:${canonico(x)}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** Os blocos que o motor executaria: do desenho v2 (convertido, como na ativação) ou dos
 *  blocos gravados. `null` = workflow antigo, sem blocos; 'invalido' = desenho v2 que não fecha. */
export function fluxoQueExecuta(fs: unknown): FluxoBlocos | 'invalido' | null {
  const bruto = (fs as { desenho?: unknown } | null)?.desenho
  const d = lerDesenhoV2(bruto)
  if (d) {
    const c = desenhoParaBlocos(d)
    return c.ok ? c.fluxo : 'invalido'
  }
  // diz ser v2 e não se lê (corrompido)
  if ((bruto as { versao?: unknown } | null | undefined)?.versao === 2) return 'invalido'
  return lerFluxoBlocos((fs as { blocos?: unknown } | null)?.blocos)
}

/** O que não muda a execução: o losango que junta com o id de sempre (`juntaId` igual ao
 *  padrão), o id do "senão" vazio e o modo padrão da escolha. */
export function normalizarFluxo(f: FluxoBlocos): unknown {
  return JSON.parse(JSON.stringify(f, (_k, v) => {
    if (v && typeof v === 'object' && (v.kind === 'escolha' || v.kind === 'paralelo')) {
      const { juntaId, ...resto } = v
      const out = juntaId && juntaId !== v.id + SUFIXO_REENCONTRO ? { ...resto, juntaId } : resto
      if (v.kind !== 'escolha') return out
      const cc = v.casoContrario
      const vazio = !cc?.itens?.length && (cc?.fim?.tipo ?? 'segue') === 'segue'
      return { ...out, modo: v.modo ?? 'primeiro', casoContrario: vazio ? null : cc }
    }
    return v
  }))
}

/** O formSchema reduzido ao que o motor executa: as chaves que não são desenho (etapas,
 *  quem inicia…) e os blocos normalizados. Duas gravações com a mesma assinatura executam
 *  igual. `null` = não há o que comparar (desenho que não fecha, ou workflow sem blocos):
 *  conta como mudança. */
export function assinaturaDoQueExecuta(fs: unknown): string | null {
  const fluxo = fluxoQueExecuta(fs)
  if (!fluxo || fluxo === 'invalido') return null
  const resto = { ...((fs ?? {}) as Record<string, unknown>) }
  for (const k of [...CHAVES_SO_VISUAIS, 'desenho', 'blocos', 'graph']) delete resto[k]
  return `${canonico(resto)}\n${canonico(normalizarFluxo(fluxo))}`
}
