import { FileSignature, FilePlus2, FileX2, Handshake, Workflow, type LucideIcon } from 'lucide-react'

/* ─── Ícone por TIPO de workflow ──────────────────────────────────────────────
   Uma decisão só, num lugar só. Antes cada tela escolhia um glifo por conta e o
   resultado era o mesmo símbolo de documento servindo para contrato e aditivo, e
   o ícone de versionamento de código (uma ramificação) representando "processo"
   para quem nunca programou.

   Cada glifo diz o que a coisa É:
   - CONTRATO  documento com pena — o contrato é o papel ASSINADO.
   - ADITIVO   documento com mais — acrescenta-se ao que já existe.
               (mesmo glifo que a linha do tempo do contrato já usa para ADITIVO.)
   - DISTRATO  documento cancelado — o contrato foi interrompido. Espelha o
               `RESCINDIDO` do histórico, que também é um X. Escolha do PO.
   - PARCEIRO  aperto de mãos — o acordo entre duas partes. LEGADO: o workflow de
               parceiro foi descontinuado, mas registros antigos ainda têm o tipo e
               precisam de um ícone que não seja o genérico.
   - sem tipo  duas etapas ligadas — algo que anda de etapa em etapa. */

const POR_TIPO: Record<string, LucideIcon> = {
  CONTRATO: FileSignature,
  ADITIVO: FilePlus2,
  DISTRATO: FileX2,
  PARCEIRO: Handshake,
}

/** Componente de ícone do tipo de workflow. Sem tipo (ou tipo desconhecido, vindo
 *  de um registro antigo) cai no glifo de processo genérico — nunca em nada. */
export function workflowKindIcon(kind?: string | null): LucideIcon {
  return (kind && POR_TIPO[kind]) || Workflow
}

export function WorkflowKindIcon({ kind, className }: { kind?: string | null; className?: string }) {
  const Icon = workflowKindIcon(kind)
  return <Icon className={className} />
}
