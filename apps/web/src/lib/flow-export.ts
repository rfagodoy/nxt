/* ─── Exportação do desenho do workflow (Storyboard) ───────────────────────────
   Gera um DOCUMENTO com a identidade Nxt (símbolo + wordmark, título, tipo, data)
   em torno do desenho do fluxo, coerente com o TEMA (claro/escuro) do usuário.

   Arquitetura (robusta a tema):
   1) O desenho é capturado com html-to-image (`toPng`, fundo transparente) — esse
      caminho respeita o tema (usa getComputedStyle dos nós reais).
   2) A MOLDURA é composta num <canvas> 2D com cores CONCRETAS lidas do tema atual
      (`--background`, `--foreground`, `--primary`…). Compor no 2D evita a perda de
      contexto de tema que o html-to-image tem ao rasterizar um wrapper com var().
   3) O resultado vira JPG (toDataURL) ou PDF (jspdf, import dinâmico).

   MARCA: símbolo com a geometria OFICIAL (tile Forest Ink + barra Esmeralda + chevron
   Lima) — igual a components/layout/logo.tsx. CSP já cobre data:/blob:. */

export type FlowExportFormat = 'jpg' | 'pdf'

const KIND_LABEL: Record<string, string> = { CONTRATO: 'Contrato', ADITIVO: 'Aditivo', PARCEIRO: 'Parceiro' }

// Cores fixas da marca (símbolo) — nunca mudam com o tema.
const BRAND = { tile: '#0C1410', bar: '#18C07A', chevron: '#C6F24E' }

/** slug de arquivo a partir do nome do processo (sem acento/espaço). */
function fileSlug(name: string): string {
  const s = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return s || 'workflow'
}

/** Lê um token HSL do tema atual e devolve string CSS `hsl(...)`. */
function token(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw ? `hsl(${raw})` : fallback
}

/** Famílias de fonte reais (next/font gera nomes tipo "__Manrope_xxx"). */
function fontFamilies(): { sans: string; mono: string } {
  const sans = getComputedStyle(document.body).fontFamily || 'Manrope, sans-serif'
  const probe = document.createElement('span')
  probe.style.fontFamily = 'var(--font-mono)'
  document.body.appendChild(probe)
  const mono = getComputedStyle(probe).fontFamily || 'monospace'
  probe.remove()
  return { sans, mono }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Desenha o símbolo oficial (viewBox 120) escalado para `size` px em (x,y). */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 120
  ctx.save()
  ctx.translate(x, y)
  // tile
  ctx.fillStyle = BRAND.tile
  const r = 28 * k
  roundRect(ctx, 0, 0, size, size, r)
  ctx.fill()
  // barra
  ctx.fillStyle = BRAND.bar
  ctx.fillRect(37 * k, 36 * k, 10 * k, 48 * k)
  // chevron
  ctx.strokeStyle = BRAND.chevron
  ctx.lineWidth = 10 * k
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(58 * k, 38 * k)
  ctx.lineTo(84 * k, 60 * k)
  ctx.lineTo(58 * k, 82 * k)
  ctx.stroke()
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Trunca texto com … para caber em maxW (px), no font atual do ctx. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const PAD = 44, SCALE = 2

/**
 * Exporta o desenho como JPG ou PDF, numa moldura com a marca Nxt e coerente com
 * o tema atual (claro/escuro).
 * @param canvas o canvas interno do editor — contém todo o grafo.
 * @param width/height dimensões do conteúdo (layout.width/height).
 */
export async function exportFlow(
  canvas: HTMLElement,
  { width, height, format, name, kind }: { width: number; height: number; format: FlowExportFormat; name: string; kind?: string | null },
): Promise<void> {
  const { toPng } = await import('html-to-image')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* segue */ } }

  // cores concretas do tema + fontes reais (lidas ANTES da captura)
  const C = {
    bg: token('--background', '#ffffff'),
    fg: token('--foreground', '#0c1410'),
    muted: token('--muted-foreground', '#64748b'),
    primary: token('--primary', '#18c07a'),
    border: token('--border', '#e2e8f0'),
  }
  const { sans, mono } = fontFamilies()

  // 1) captura o desenho com o FUNDO do tema (compõe sem emenda sobre a moldura).
  // Timeout de segurança: html-to-image pode travar se uma extensão do navegador
  // interceptar o carregamento interno da imagem — o timeout evita spinner infinito.
  const diagramUrl = await withTimeout(
    toPng(canvas, {
      width, height, pixelRatio: SCALE, backgroundColor: C.bg, cacheBust: true,
      style: { transform: 'none', transformOrigin: 'top left' },
    }),
    20000,
    'Tempo esgotado ao renderizar o desenho',
  )
  const diagram = await loadImage(diagramUrl)

  // 3) layout do documento (CSS px)
  const contentW = Math.max(width, 600)
  const docW = contentW + PAD * 2
  const yMarkTop = PAD
  const yTitle = PAD + 64
  const ySub = PAD + 84
  const yDivider = PAD + 100
  const yDiagram = PAD + 126
  const yFootLine = yDiagram + height + 24
  const yFootText = yFootLine + 18
  const docH = yFootText + 8 + PAD

  const cv = document.createElement('canvas')
  cv.width = Math.round(docW * SCALE)
  cv.height = Math.round(docH * SCALE)
  const ctx = cv.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  // fundo do tema
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, docW, docH)

  // ── cabeçalho ──
  drawMark(ctx, PAD, yMarkTop, 34)
  // wordmark "Nxt" (x em esmeralda), alinhado ao centro do símbolo
  const wmBaseline = yMarkTop + 24
  let wx = PAD + 34 + 10
  ctx.font = `800 19px ${sans}`
  ctx.textAlign = 'left'
  ctx.fillStyle = C.fg; ctx.fillText('N', wx, wmBaseline); wx += ctx.measureText('N').width
  ctx.fillStyle = C.primary; ctx.fillText('x', wx, wmBaseline); wx += ctx.measureText('x').width
  ctx.fillStyle = C.fg; ctx.fillText('t', wx, wmBaseline)

  // data (topo direita, mono)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.muted
  ctx.font = `10px ${mono}`
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.2px'
  ctx.fillText('EXPORTADO EM', docW - PAD, PAD + 12)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
  ctx.fillStyle = C.fg
  ctx.font = `13px ${mono}`
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  ctx.fillText(dateStr, docW - PAD, PAD + 30)

  // título + subtítulo (esquerda), truncados p/ não colidir com a data
  const titleMaxW = docW - PAD * 2 - 140
  ctx.textAlign = 'left'
  ctx.fillStyle = C.fg
  ctx.font = `800 25px ${sans}`
  ctx.fillText(ellipsize(ctx, (name || '').trim() || 'Workflow sem nome', titleMaxW), PAD, yTitle)
  ctx.fillStyle = C.muted
  ctx.font = `600 12.5px ${sans}`
  const kindLabel = kind && KIND_LABEL[kind] ? KIND_LABEL[kind] : null
  ctx.fillText(kindLabel ? `${kindLabel} · Fluxo de trabalho` : 'Fluxo de trabalho', PAD, ySub)

  // divisor esmeralda
  ctx.strokeStyle = C.primary
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD, yDivider); ctx.lineTo(docW - PAD, yDivider); ctx.stroke()

  // ── desenho (centralizado) ──
  const dx = PAD + (contentW - width) / 2
  ctx.drawImage(diagram, dx, yDiagram, width, height)

  // ── rodapé ──
  ctx.strokeStyle = C.border
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, yFootLine); ctx.lineTo(docW - PAD, yFootLine); ctx.stroke()
  ctx.fillStyle = C.muted
  ctx.font = `10.5px ${mono}`
  ctx.textAlign = 'left'
  ctx.fillText('Nxt · Soluções inteligentes que evoluem com você', PAD, yFootText)
  ctx.textAlign = 'right'
  ctx.fillText('Documento gerado automaticamente', docW - PAD, yFootText)

  // 4) saída
  const slug = fileSlug(name)
  const jpg = cv.toDataURL('image/jpeg', 0.95)
  if (format === 'jpg') {
    triggerDownload(jpg, `${slug}.jpg`)
    return
  }
  const { jsPDF } = await import('jspdf')
  const orientation = docW >= docH ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [docW, docH], hotfixes: ['px_scaling'] })
  pdf.addImage(jpg, 'JPEG', 0, 0, docW, docH, undefined, 'FAST')
  pdf.save(`${slug}.pdf`)
}
