/* ─── Exportação do desenho do workflow (Storyboard) ───────────────────────────
   Gera um DOCUMENTO com a identidade Nxt (símbolo + wordmark, título, tipo, data)
   e o desenho do fluxo, coerente com o TEMA (claro/escuro) do usuário.

   Plano B (à prova de extensão): o desenho é RASTERIZADO DIRETO num <canvas> 2D a
   partir do MODELO do grafo (nós + arestas já posicionados pelo layout) — SEM
   html-to-image. Isso elimina a dependência que travava intermitentemente no Chrome
   (extensão cently interferindo no carregamento interno de imagem da lib).
   Saída: JPG (toDataURL) ou PDF (jspdf, import dinâmico). CSP já cobre data:/blob:. */

import { titleLineCount } from './flow-layout'

export type FlowExportFormat = 'jpg' | 'pdf'

export type ExportNodeType = 'start' | 'end' | 'userTask' | 'serviceTask' | 'exclusiveGateway' | 'parallelGateway'
export interface ExportNode {
  id: string; type: ExportNodeType; x: number; y: number; w: number; h: number
  name: string; typeLabel?: string; meta?: string[]; isFork?: boolean
}
/** Âncoras + NORMAIS de saída/entrada (mesma geometria da tela: `edgeGeometry`), para o
 *  export desenhar a MESMA curva. `backward` = laço de retorno (arco por baixo). */
export interface ExportEdge {
  ax: number; ay: number; bx: number; by: number
  adx: number; ady: number; bdx: number; bdy: number
  backward?: boolean
  variant: 'exclusive' | 'parallel' | 'normal'; label?: string
}
export interface ExportModel { width: number; height: number; nodes: ExportNode[]; edges: ExportEdge[] }

const KIND_LABEL: Record<string, string> = { CONTRATO: 'Contrato', ADITIVO: 'Aditivo', PARCEIRO: 'Parceiro' }
const BRAND = { tile: '#0C1410', bar: '#18C07A', chevron: '#C6F24E' }
// Cores fixas (Tailwind) — independem do tema, iguais às do editor.
const SKY = { bar: '#0ea5e9', chip: 'rgba(14,165,233,0.16)', text: '#0ea5e9' }
const AMBER = { bar: '#f59e0b', chip: 'rgba(245,158,11,0.16)', text: '#f59e0b' }
const EMERALD = { fill: 'rgba(16,185,129,0.12)', stroke: 'rgba(16,185,129,0.35)', text: '#10b981' }
const VIOLET = { fill: 'rgba(124,58,237,0.12)', stroke: 'rgba(124,58,237,0.45)', text: '#8b5cf6', edge: '#7c3aed' }
const ROSE = { fill: 'rgba(225,29,104,0.12)', stroke: 'rgba(225,29,104,0.45)', text: '#f43f5e', edge: '#e11d68' }

const PAD = 44, SCALE = 2

/* ─── util ─────────────────────────────────────────────────────────────────── */

function fileSlug(name: string): string {
  const s = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return s || 'workflow'
}
function token(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw ? `hsl(${raw})` : fallback
}
/** Aplica opacidade a um token (`hsl(H S% L%)`) ou ao hex de fallback. */
function withAlpha(color: string, a: number): string {
  const hsl = color.match(/^hsl\(([^)]+)\)$/)
  if (hsl) return `hsl(${hsl[1]} / ${a})`
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
  }
  return color
}
function fontFamilies(): { sans: string; mono: string } {
  const sans = getComputedStyle(document.body).fontFamily || 'Manrope, sans-serif'
  const probe = document.createElement('span')
  probe.style.fontFamily = 'var(--font-mono)'
  document.body.appendChild(probe)
  const mono = getComputedStyle(probe).fontFamily || 'monospace'
  probe.remove()
  return { sans, mono }
}
function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
/** Quebra `text` em até `maxLines` linhas dentro de `maxW`; devolve nº de linhas usadas. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number): number {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break }
    else cur = test
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines) lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1] + (cur && !lines.includes(cur) ? '…' : ''), maxW)
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH))
  return lines.length
}

/* ─── símbolo da marca ─────────────────────────────────────────────────────── */

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 120
  ctx.save(); ctx.translate(x, y)
  ctx.fillStyle = BRAND.tile; roundRect(ctx, 0, 0, size, size, 28 * k); ctx.fill()
  ctx.fillStyle = BRAND.bar; ctx.fillRect(37 * k, 36 * k, 10 * k, 48 * k)
  ctx.strokeStyle = BRAND.chevron; ctx.lineWidth = 10 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(58 * k, 38 * k); ctx.lineTo(84 * k, 60 * k); ctx.lineTo(58 * k, 82 * k); ctx.stroke()
  ctx.restore()
}

/* ─── desenho do fluxo (nós + arestas) ─────────────────────────────────────── */

/** Curva cúbica idêntica à da tela (`edgeBezier`): sai e entra perpendicular ao lado. */
function edgePath(ctx: CanvasRenderingContext2D, e: ExportEdge, offX: number, offY: number) {
  const ax = offX + e.ax, ay = offY + e.ay, bx = offX + e.bx, by = offY + e.by
  const k = Math.max(28, Math.hypot(e.bx - e.ax, e.by - e.ay) * 0.4)
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.bezierCurveTo(ax + e.adx * k, ay + e.ady * k, bx + e.bdx * k, by + e.bdy * k, bx, by)
}
/** Seta na ponta, ORIENTADA pela direção de chegada (−bDir) — senão aponta sempre p/ a
 *  direita e fica torta nas âncoras por cima/baixo (laço de retorno, junções). */
function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx))
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(-8, -4.5); ctx.lineTo(-8, 4.5)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

interface Theme { bg: string; fg: string; muted: string; primary: string; border: string; card: string; sans: string; mono: string }

function drawDiagram(ctx: CanvasRenderingContext2D, model: ExportModel, C: Theme, offX: number, offY: number) {
  // arestas (atrás dos nós)
  for (const e of model.edges) {
    // ⚠️ a aresta NORMAL não pode usar `--border`: some no fundo claro (mesmo motivo pelo
    // qual a tela já usa `--muted-foreground/0.5`). Sem isto, Início→atividade e
    // atividade→Fim saem INVISÍVEIS no arquivo exportado.
    const color = e.variant === 'exclusive' ? VIOLET.edge : e.variant === 'parallel' ? ROSE.edge : withAlpha(C.muted, 0.5)
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    edgePath(ctx, e, offX, offY)
    ctx.stroke()
    arrowHead(ctx, offX + e.bx, offY + e.by, -e.bdx, -e.bdy, color)
    if (e.label) {
      const k = Math.max(28, Math.hypot(e.bx - e.ax, e.by - e.ay) * 0.4)
      const mx = offX + (e.ax + e.bx) / 2
      const my = offY + (e.backward ? (e.ay + e.by) / 2 + 0.75 * k : (e.ay + e.by) / 2 - 16)
      ctx.font = `600 10px ${C.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const tw = ctx.measureText(e.label).width
      ctx.fillStyle = C.card; roundRect(ctx, mx - tw / 2 - 6, my - 9, tw + 12, 18, 9); ctx.fill()
      ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = C.muted; ctx.fillText(e.label, mx, my)
    }
  }
  // nós
  for (const n of model.nodes) {
    const x = offX + n.x, y = offY + n.y, w = n.w, h = n.h
    if (n.type === 'start' || n.type === 'end') drawEvent(ctx, n, x, y, w, h, C)
    else if (n.type === 'exclusiveGateway' || n.type === 'parallelGateway') drawGateway(ctx, n, x, y, w, h, C)
    else drawCard(ctx, n, x, y, w, h, C)
  }
}

function drawEvent(ctx: CanvasRenderingContext2D, n: ExportNode, x: number, y: number, w: number, h: number, C: Theme) {
  roundRect(ctx, x, y, w, h, 16); ctx.fillStyle = EMERALD.fill; ctx.fill()
  ctx.strokeStyle = EMERALD.stroke; ctx.lineWidth = 1; ctx.stroke()
  const cx = x + w / 2, iy = y + h * 0.36
  ctx.strokeStyle = EMERALD.text; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (n.type === 'start') {
    ctx.beginPath(); ctx.arc(cx, iy, 6, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = EMERALD.text; ctx.beginPath(); ctx.arc(cx, iy, 2, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.beginPath(); ctx.arc(cx, iy, 7, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - 3.2, iy); ctx.lineTo(cx - 0.8, iy + 2.6); ctx.lineTo(cx + 3.4, iy - 2.6); ctx.stroke()
  }
  ctx.fillStyle = EMERALD.text; ctx.font = `600 10px ${C.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(ellipsize(ctx, n.name, w - 8), cx, y + h * 0.72)
}

function drawGateway(ctx: CanvasRenderingContext2D, n: ExportNode, x: number, y: number, w: number, h: number, C: Theme) {
  const pal = n.type === 'exclusiveGateway' ? VIOLET : ROSE
  if (!n.isFork) { // junção = losango pequeno
    const cx = x + w / 2, cy = y + h / 2
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x + w, cy); ctx.lineTo(cx, y + h); ctx.lineTo(x, cy); ctx.closePath()
    ctx.fillStyle = pal.fill; ctx.fill(); ctx.strokeStyle = pal.stroke; ctx.lineWidth = 1; ctx.stroke()
    return
  }
  roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = pal.fill; ctx.fill()
  ctx.strokeStyle = pal.stroke; ctx.lineWidth = 1; ctx.stroke()
  const cy = y + h / 2
  ctx.fillStyle = pal.text; ctx.beginPath(); ctx.arc(x + 15, cy, 3.2, 0, Math.PI * 2); ctx.fill()
  ctx.font = `600 12px ${C.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(ellipsize(ctx, n.name, w - 34), x + 26, cy)
}

function drawCard(ctx: CanvasRenderingContext2D, n: ExportNode, x: number, y: number, w: number, h: number, C: Theme) {
  const pal = n.type === 'serviceTask' ? AMBER : SKY
  // sombra + fundo
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.14)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 2
  roundRect(ctx, x, y, w, h, 12); ctx.fillStyle = C.card; ctx.fill()
  ctx.restore()
  ctx.strokeStyle = C.border; ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, 12); ctx.stroke()
  // faixa de acento no topo (recortada ao cantos)
  ctx.save(); roundRect(ctx, x, y, w, h, 12); ctx.clip(); ctx.fillStyle = pal.bar; ctx.fillRect(x, y, w, 4); ctx.restore()
  const px = x + 12, top = y + 4 + 11
  // chip do ícone + rótulo do tipo
  ctx.fillStyle = pal.chip; roundRect(ctx, px, top, 18, 18, 5); ctx.fill()
  ctx.fillStyle = pal.bar; roundRect(ctx, px + 5, top + 5, 8, 8, 2.5); ctx.fill()
  ctx.fillStyle = C.muted; ctx.font = `600 9px ${C.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText((n.typeLabel ?? '').toUpperCase(), px + 24, top + 9)
  // título (nº de linhas dinâmico, casa com a altura do card)
  ctx.fillStyle = C.fg; ctx.font = `700 13px ${C.sans}`; ctx.textBaseline = 'top'
  wrapText(ctx, n.name, px, top + 24, w - 24, 16, titleLineCount(n.name))
  // meta (rodapé do card)
  const meta = n.meta ?? []
  if (meta.length) {
    ctx.font = `11px ${C.sans}`; ctx.fillStyle = C.muted; ctx.textBaseline = 'alphabetic'
    let my = y + h - 10 - (meta.length - 1) * 14
    for (const line of meta) { ctx.fillText(ellipsize(ctx, line, w - 24), px, my); my += 14 }
  }
}

/* ─── export ───────────────────────────────────────────────────────────────── */

export async function exportFlow(
  model: ExportModel,
  { format, name, kind }: { format: FlowExportFormat; name: string; kind?: string | null },
): Promise<void> {
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* segue */ } }

  const C: Theme = {
    bg: token('--background', '#ffffff'),
    fg: token('--foreground', '#0c1410'),
    muted: token('--muted-foreground', '#64748b'),
    primary: token('--primary', '#18c07a'),
    border: token('--border', '#e2e8f0'),
    card: token('--card', '#ffffff'),
    ...fontFamilies(),
  }
  const { sans, mono } = C

  // layout do documento (CSS px)
  const contentW = Math.max(model.width, 600)
  const docW = contentW + PAD * 2
  const yTitle = PAD + 64, ySub = PAD + 84, yDivider = PAD + 100, yDiagram = PAD + 126
  const yFootLine = yDiagram + model.height + 24, yFootText = yFootLine + 18
  const docH = yFootText + 8 + PAD

  const cv = document.createElement('canvas')
  cv.width = Math.round(docW * SCALE); cv.height = Math.round(docH * SCALE)
  const ctx = cv.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  // fundo do tema
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, docW, docH)

  // cabeçalho
  drawMark(ctx, PAD, PAD, 34)
  const wmBaseline = PAD + 24
  let wx = PAD + 44; ctx.font = `800 19px ${sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.fg; ctx.fillText('N', wx, wmBaseline); wx += ctx.measureText('N').width
  ctx.fillStyle = C.primary; ctx.fillText('x', wx, wmBaseline); wx += ctx.measureText('x').width
  ctx.fillStyle = C.fg; ctx.fillText('t', wx, wmBaseline)

  ctx.textAlign = 'right'; ctx.fillStyle = C.muted; ctx.font = `10px ${mono}`
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.2px'
  ctx.fillText('EXPORTADO EM', docW - PAD, PAD + 12)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
  ctx.fillStyle = C.fg; ctx.font = `13px ${mono}`
  ctx.fillText(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }), docW - PAD, PAD + 30)

  ctx.textAlign = 'left'; ctx.fillStyle = C.fg; ctx.font = `800 25px ${sans}`
  ctx.fillText(ellipsize(ctx, (name || '').trim() || 'Workflow sem nome', docW - PAD * 2 - 140), PAD, yTitle)
  ctx.fillStyle = C.muted; ctx.font = `600 12.5px ${sans}`
  const kindLabel = kind && KIND_LABEL[kind] ? KIND_LABEL[kind] : null
  ctx.fillText(kindLabel ? `${kindLabel} · Fluxo de trabalho` : 'Fluxo de trabalho', PAD, ySub)

  ctx.strokeStyle = C.primary; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD, yDivider); ctx.lineTo(docW - PAD, yDivider); ctx.stroke()

  // desenho do fluxo (centralizado)
  drawDiagram(ctx, model, C, PAD + (contentW - model.width) / 2, yDiagram)

  // rodapé
  ctx.strokeStyle = C.border; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, yFootLine); ctx.lineTo(docW - PAD, yFootLine); ctx.stroke()
  ctx.fillStyle = C.muted; ctx.font = `10.5px ${mono}`; ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'; ctx.fillText('Nxt · Soluções inteligentes que evoluem com você', PAD, yFootText)
  ctx.textAlign = 'right'; ctx.fillText('Documento gerado automaticamente', docW - PAD, yFootText)

  // saída
  const slug = fileSlug(name)
  const jpg = cv.toDataURL('image/jpeg', 0.95)
  if (format === 'jpg') { triggerDownload(jpg, `${slug}.jpg`); return }
  const { jsPDF } = await import('jspdf')
  const orientation = docW >= docH ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [docW, docH], hotfixes: ['px_scaling'] })
  pdf.addImage(jpg, 'JPEG', 0, 0, docW, docH, undefined, 'FAST')
  pdf.save(`${slug}.pdf`)
}
