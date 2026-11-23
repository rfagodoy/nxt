/**
 * Política PURA das telas do sistema (sem I/O — testável isoladamente).
 * - Tela base do sistema (`isSystem`): SEMPRE ativa e SEMPRE padrão (imutável).
 * - Tela não-sistema: só pode ser padrão se ainda NÃO existe uma tela do sistema
 *   para o tipo (a padrão de um tipo com base do sistema é a própria base).
 */
export function screenBaseFlags(opts: {
  isSystem: boolean
  systemExistsForType: boolean
  reqStatus: string
  reqDefault: boolean
}): { status: string; isDefault: boolean } {
  if (opts.isSystem) return { status: 'ACTIVE', isDefault: true }
  return { status: opts.reqStatus, isDefault: opts.reqDefault && !opts.systemExistsForType }
}

/**
 * Nome da tela duplicada. "Cópia de X"; repetindo, "Cópia de X (2)", "(3)"…
 * Duplicar uma cópia não empilha prefixo ("Cópia de Cópia de X") nem número.
 */
export function nomeDaCopia(base: string, existentes: readonly string[]): string {
  /* O sufixo " (n)" só é NOSSO quando o prefixo também era: "Contrato (2)" é um nome
     legítimo do usuário, e cortá-lo virava "Cópia de Contrato" — que não diz mais de qual
     original a cópia veio. */
  const PREFIXO = 'Cópia de '
  const limpo = base.startsWith(PREFIXO)
    ? (base.slice(PREFIXO.length).replace(/ \(\d+\)$/, '').trim() || base)
    : base
  const usados = new Set(existentes)
  const primeiro = `Cópia de ${limpo}`
  if (!usados.has(primeiro)) return primeiro
  for (let i = 2; i <= 99; i++) {
    const n = `Cópia de ${limpo} (${i})`
    if (!usados.has(n)) return n
  }
  return `Cópia de ${limpo} (${Date.now()})`
}

/* ─── Código da tela (PO, 23/11/2026) ──────────────────────────────────────────
   Gerado pelo sistema, somente leitura, com o tipo no prefixo: TELA_CTR_001 (Contrato),
   TELA_PAR_001 (Parceiro), TELA_GEN_001 (Genérica). Cada tipo conta do 1; 3 dígitos no
   mínimo (TELA_CTR_1000 depois do 999). A referência dos workflows continua sendo o id. */
const PREFIXO_DO_TIPO: Record<string, string> = { CONTRATO: 'CTR', FORNECEDOR: 'PAR' }

export function prefixoDoCodigo(subjectType: string): string {
  return `TELA_${PREFIXO_DO_TIPO[subjectType] ?? 'GEN'}_`
}

export function formatarCodigo(subjectType: string, n: number): string {
  return prefixoDoCodigo(subjectType) + String(n).padStart(3, '0')
}

/** Próximo código do tipo: o maior número já usado com o prefixo, mais 1 (buracos não são reaproveitados). */
export function proximoCodigo(subjectType: string, existentes: readonly string[]): string {
  const prefixo = prefixoDoCodigo(subjectType)
  let maior = 0
  for (const c of existentes) {
    if (!c.startsWith(prefixo)) continue
    const n = Number(c.slice(prefixo.length))
    if (Number.isInteger(n) && n > maior) maior = n
  }
  return formatarCodigo(subjectType, maior + 1)
}

/* ─── Nome único por organização e tipo (PO, 23/11/2026) ─────────────────────── */
const normalizarNome = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')

/** O nome já é de outra tela do mesmo tipo? Compara sem diferença de maiúsculas e espaços. */
export function nomeJaUsado(nome: string, outros: readonly string[]): boolean {
  const alvo = normalizarNome(nome)
  return !!alvo && outros.some((o) => normalizarNome(o) === alvo)
}

/* ─── "Usada em" (PO, 23/11/2026) ──────────────────────────────────────────────
   Onde cada tela aparece: os workflows e as atividades que a abrem (principal ou
   adicional), lidos do formSchema de cada definição. */
export interface UsoDaTela { workflowId: string; workflow: string; status: string; atividades: string[] }

export function usoDasTelas(
  /* `formSchema` chega como objeto pelo PrismaService (que desserializa o JSON) e como texto
     direto do banco: vale os dois. */
  definicoes: ReadonlyArray<{ id: string; name: string; status: string; formSchema: unknown }>,
): Record<string, UsoDaTela[]> {
  const uso: Record<string, UsoDaTela[]> = {}
  for (const d of definicoes) {
    let steps: unknown
    try {
      const fs = typeof d.formSchema === 'string' ? JSON.parse(d.formSchema) : d.formSchema
      steps = (fs as { steps?: unknown } | null)?.steps
    } catch { continue }
    if (!Array.isArray(steps)) continue
    const porTela = new Map<string, string[]>()
    for (const s of steps as Array<{ stepName?: string; screenRef?: string; extraScreens?: Array<{ screenRef?: string }> }>) {
      const refs = new Set([s?.screenRef, ...(s?.extraScreens ?? []).map((e) => e?.screenRef)].filter((r): r is string => !!r))
      for (const r of refs) {
        const lista = porTela.get(r) ?? []
        lista.push(s.stepName?.trim() || 'Atividade sem nome')
        porTela.set(r, lista)
      }
    }
    for (const [tela, atividades] of porTela) {
      (uso[tela] ??= []).push({ workflowId: d.id, workflow: d.name, status: d.status, atividades })
    }
  }
  for (const lista of Object.values(uso)) lista.sort((a, b) => a.workflow.localeCompare(b.workflow, 'pt-BR'))
  return uso
}
