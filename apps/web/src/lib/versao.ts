/* Codinomes por MAJOR (docs/versionamento.md): a tag traz em minúsculas, o menu mostra assim. */
const CODINOMES = [
  'Ada', 'Boole', 'Codd', 'Dijkstra', 'Engelbart', 'Hopper', 'Jacquard', 'Kilby', 'Leibniz',
  'McCarthy', 'Neumann', 'Pascal', 'Ritchie', 'Shannon', 'Turing', 'Wirth', 'Zuse',
]

const TAG = /^v(\d+\.\d+\.\d+)-([a-z]+)(?:-(\d+)-g([0-9a-f]+))?$/

/** Saída do `git describe --tags` (ou NXT_VERSAO) para o menu: `v1.0.0-ada-3-gabc1234` → `1.0.0 — Ada (+3, abc1234)`.
 *  O que não é tag SemVer com codinome (tags antigas por data, hash solto) passa como veio. */
export function formatarVersao(bruta: string): string {
  const m = TAG.exec(bruta)
  if (!m) return bruta
  const [, numero, codinome, depois, hash] = m
  const nome = CODINOMES.find((c) => c.toLowerCase() === codinome) ?? codinome[0].toUpperCase() + codinome.slice(1)
  return `${numero} — ${nome}` + (depois ? ` (+${depois}, ${hash})` : '')
}
