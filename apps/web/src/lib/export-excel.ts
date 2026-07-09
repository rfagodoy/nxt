/* Exportação para planilha — implementação ÚNICA do sistema.
   Antes deste módulo havia três cópias (Contratos, Parceiros, Tabelas auxiliares), cada uma
   com sua paleta: azul #1E3A8A numa, índigo #4F46E5 noutra. Nenhuma era a marca. Toda
   planilha que saía do Nxt saía com a cara de outro produto.

   Regra: onde houver tabela de dados, há botão Exportar — e ele chama esta função. */

/** Cor da marca (ver identidade visual): Forest Ink, Esmeralda, Mist. */
const FOREST = 'FF0C1410'
const ESMERALDA = 'FF18C07A'
const ESMERALDA_TINT = 'FFE7F7EF'
const MIST = 'FFF1F5F3'
const ZEBRA = 'FFF8FAF9'
const CINZA = 'FF5B6B63'

export interface ExcelColumn {
  header: string
  /** largura em caracteres; ausente = derivada do rótulo */
  width?: number
  align?: 'left' | 'right' | 'center'
}

export interface ExportExcelOptions {
  /** nome do arquivo, SEM extensão e sem data (a data é acrescentada aqui) */
  fileName: string
  /** nome da aba (Excel limita a 31 caracteres) */
  sheet: string
  /** faixa superior, em destaque */
  title: string
  /** segunda faixa; ausente = "Gerado em <data> • N registros" */
  subtitle?: string
  columns: ExcelColumn[]
  rows: Array<Array<string | number>>
  /** linha de totais, fixada ao final com borda superior */
  footer?: Array<string | number>
}

/** Gera o .xlsx e dispara o download. `exceljs` entra por import dinâmico: são ~900 kB que
 *  não têm por que pesar no bundle de quem nunca clica em Exportar. */
export async function exportExcel(opts: ExportExcelOptions): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const { columns, rows } = opts
  const n = columns.length

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Nxt'
  wb.created = new Date()
  const ws = wb.addWorksheet(opts.sheet.slice(0, 31))

  /* faixa 1 — título */
  ws.addRow([opts.title]); ws.mergeCells(1, 1, 1, n)
  const t = ws.getCell('A1')
  t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOREST } }
  t.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(1).height = 28

  /* faixa 2 — procedência: uma planilha solta na pasta de alguém precisa dizer de onde veio */
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const sub = opts.subtitle ?? `Gerado em ${data}  •  ${rows.length} registro${rows.length !== 1 ? 's' : ''}`
  ws.addRow([sub]); ws.mergeCells(2, 1, 2, n)
  const s = ws.getCell('A2')
  s.font = { size: 9, italic: true, color: { argb: CINZA } }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MIST } }
  s.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(2).height = 18

  /* cabeçalho */
  const hr = ws.addRow(columns.map(c => c.header))
  hr.eachCell(c => {
    c.font = { bold: true, size: 10, color: { argb: FOREST } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ESMERALDA_TINT } }
    c.border = { bottom: { style: 'thin', color: { argb: ESMERALDA } } }
  })
  ws.getRow(3).height = 20

  /* corpo */
  rows.forEach((r, i) => {
    const row = ws.addRow(r)
    row.eachCell((c, col) => {
      c.font = { size: 10 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : ZEBRA } }
      const al = columns[col - 1]?.align
      if (al) c.alignment = { horizontal: al }
    })
    row.height = 18
  })

  if (opts.footer) {
    const fr = ws.addRow(opts.footer)
    fr.eachCell((c, col) => {
      c.font = { bold: true, size: 10, color: { argb: FOREST } }
      c.border = { top: { style: 'thin', color: { argb: ESMERALDA } } }
      const al = columns[col - 1]?.align
      if (al) c.alignment = { horizontal: al }
    })
    fr.height = 20
  }

  /* congela o cabeçalho: a planilha herda o comportamento que a tela tem */
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  /* largura pelo CONTEÚDO (não só pelo rótulo): uma coluna "Título" com 60 caracteres de
     texto não pode sair com 13 de largura. Teto de 60 para não estourar a página. */
  ws.columns.forEach((col, i) => {
    if (columns[i]?.width) { col.width = columns[i].width; return }
    let max = columns[i]?.header.length ?? 10
    for (const r of rows) {
      const len = String(r[i] ?? '').length
      if (len > max) max = len
    }
    col.width = Math.min(max + 4, 60)
  })

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url) // as três cópias antigas vazavam este objeto
}
