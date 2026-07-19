import Link from 'next/link'
import { Tag, FileSearch, Coins, CreditCard, TrendingUp, UserCheck, Paperclip, FilePlus2, Wallet } from 'lucide-react'

const TABLES = [
  {
    href:        '/settings/contratos/tipos',
    icon:        Tag,
    label:       'Tipos de contrato',
    description: 'Classifique contratos por categoria: serviços, fornecimento, locação...',
    color:       'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  {
    href:        '/settings/contratos/objetos',
    icon:        FileSearch,
    label:       'Objetos do contrato',
    description: 'Lista de objetos padronizados para descrever o escopo do contrato.',
    color:       'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    href:        '/settings/contratos/moedas',
    icon:        Coins,
    label:       'Moedas',
    description: 'Moedas disponíveis para contratos: BRL, USD, EUR e outras.',
    color:       'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    href:        '/settings/contratos/condicoes',
    icon:        CreditCard,
    label:       'Condições de pagamento',
    description: 'Formas e periodicidades de pagamento: à vista, mensal, anual...',
    color:       'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  {
    href:        '/settings/contratos/indices',
    icon:        TrendingUp,
    label:       'Índices de reajuste',
    description: 'Índices econômicos para reajuste: IPCA, IGPM, CDI, SELIC...',
    color:       'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  {
    href:        '/settings/contratos/papeis',
    icon:        UserCheck,
    label:       'Papéis',
    description: 'Funções de entidades (partes) e de pessoas (responsáveis) — usadas em contratos, cadastros e workflows.',
    color:       'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  },
  {
    href:        '/settings/contratos/tipos-aditivo',
    icon:        FilePlus2,
    label:       'Tipos de aditivo',
    description: 'Categorias de termo aditivo: prorrogação, reajuste, escopo, cessão...',
    color:       'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  },
  {
    href:        '/settings/contratos/formas-pagamento',
    icon:        Wallet,
    label:       'Formas de pagamento',
    description: 'Meios dos lançamentos: PIX, boleto, transferência, cartão...',
    color:       'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  {
    href:        '/settings/contratos/anexos',
    icon:        Paperclip,
    label:       'Tipos de anexo',
    description: 'Categorias de documentos anexados: original, aditivo, proposta, ata...',
    color:       'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
]

export default function SettingsContratos() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Configurações de Contratos</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Gerencie as tabelas auxiliares utilizadas no cadastro de contratos.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TABLES.map(({ href, icon: Icon, label, description, color }) => (
          <Link
            key={href}
            href={href}
            className="group flex gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5"
          >
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold group-hover:text-primary transition-colors">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
