import Image from 'next/image'

/**
 * Logo do Nxt.
 * - `mark`: só o ícone (quadrado) — usado com a sidebar recolhida e no header.
 * - `full`: lockup completo (ícone + "Nxt") — usado com a sidebar expandida.
 *
 * Os arquivos ficam em apps/web/public/ (ver nxt-icon.png / nxt-logo.png).
 */
export function Logo({ variant = 'full', className }: { variant?: 'mark' | 'full'; className?: string }) {
  if (variant === 'mark') {
    return (
      <Image
        src="/nxt-icon.png"
        alt="Nxt"
        width={32}
        height={32}
        priority
        className={className ?? 'h-8 w-8 object-contain'}
      />
    )
  }

  return (
    <Image
      src="/nxt-logo.png"
      alt="Nxt"
      width={120}
      height={32}
      priority
      className={className ?? 'h-8 w-auto object-contain'}
    />
  )
}
