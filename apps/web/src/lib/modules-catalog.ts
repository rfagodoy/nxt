import { FileText, Handshake, Building2 } from 'lucide-react'
import type { ElementType } from 'react'

/**
 * Catálogo de módulos do Nxt — fonte única de verdade.
 *
 * - SYSTEM (nativos): Parceiros e Contratos. Têm telas/serviços/tabelas dedicadas
 *   e estão sempre disponíveis. São declarados aqui (o comportamento deles é código).
 * - GENERATED: gerados ao ativar um processo BPMN (model `Module` no backend),
 *   buscados em runtime via `GET /api/modules`.
 *
 * Alimenta tanto o sidebar quanto a vitrine `/modules`.
 */
export interface SystemModule {
  slug: string
  name: string
  description: string
  href: string
  icon: ElementType
  kind: 'system'
}

export const SYSTEM_MODULES: SystemModule[] = [
  {
    slug: 'contratos',
    name: 'Contratos',
    description: 'Vigências, valores, partes e reajustes',
    href: '/modules/contratos',
    icon: FileText,
    kind: 'system',
  },
  {
    slug: 'parceiros',
    name: 'Parceiros',
    description: 'Cadastro de parceiros PJ/PF, nacionais e estrangeiros',
    href: '/modules/parceiros',
    icon: Handshake,
    kind: 'system',
  },
  {
    slug: 'estrutura',
    name: 'Estrutura organizacional',
    description: 'Empresas do grupo e organograma (centros de custo/lucro)',
    href: '/modules/estrutura',
    icon: Building2,
    kind: 'system',
  },
]
