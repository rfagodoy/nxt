/**
 * Formata o valor BRUTO de um campo personalizado (ScreenFieldValue.value) para
 * exibição em COLUNA de listagem e em EXPORTAÇÃO. Espelha a leitura do
 * ScreenCustomInput (checkbox '1'→Sim; multiselect JSON de values→rótulos;
 * select→rótulo da opção), acrescentando moeda e data no formato pt-BR.
 * Fonte única para não divergir entre tela e planilha.
 */
import type { ScreenField } from './screen-types'

function safeArr(v: string): string[] {
  try {
    const a = JSON.parse(v)
    return Array.isArray(a) ? a.map(String) : (v ? [v] : [])
  } catch {
    return v ? [v] : []
  }
}

export function formatScreenCellValue(field: ScreenField, raw: string | undefined | null): string {
  const value = raw ?? ''
  if (value === '') return ''
  switch (field.type) {
    case 'checkbox':
      return value === '1' ? 'Sim' : 'Não'
    case 'multiselect':
      return safeArr(value).map(v => field.options?.find(o => o.value === v)?.label ?? v).join(', ')
    case 'select':
      return field.options?.find(o => o.value === value)?.label ?? value
    case 'currency': {
      const n = Number(value)
      return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : value
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value
    default:
      return value
  }
}
