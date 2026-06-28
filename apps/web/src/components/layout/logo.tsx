/**
 * Logo do Nxt (identidade "Signal × Monolith").
 * Símbolo vetorial: barra (Esmeralda) + chevron (Lime Spark) sobre tile Forest Ink
 * — "avanço firme". Legível e nítido em qualquer escala, em cor ou mono.
 *
 * - `mark`: só o símbolo (tile quadrado) — sidebar recolhida, favicon, ícone.
 * - `full`: símbolo + wordmark "Nxt" (acento esmeralda no "x").
 */
export function Logo({ variant = 'full', className }: { variant?: 'mark' | 'full'; className?: string }) {
  // Geometria oficial da board (Nxt-icone-app-primario.svg).
  const mark = (
    <svg viewBox="0 0 120 120" className={className ?? 'h-8 w-8'} role="img" aria-label="Nxt">
      <rect width="120" height="120" rx="28" fill="#0C1410" />
      <rect x="37" y="36" width="10" height="48" rx="2" fill="#18C07A" />
      <polyline
        points="58,38 84,60 58,82"
        fill="none"
        stroke="#C6F24E"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  if (variant === 'mark') return mark

  return (
    <span className="inline-flex items-center gap-2">
      {mark}
      <span className="text-lg font-bold tracking-tight leading-none">
        N<span className="text-primary">x</span>t
      </span>
    </span>
  )
}
