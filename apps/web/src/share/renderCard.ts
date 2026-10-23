import type { ShareCardModel } from './cardModel'

/** Open Graph size, so the image previews well wherever it is shared. */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
/** Space kept clear around the content on each side. */
export const MARGIN_X = 80
export const MARGIN_Y = 48

const ACCENT_BAR_WIDTH = 12
const CONTENT_WIDTH = CARD_WIDTH - 2 * MARGIN_X
const CONTENT_HEIGHT = CARD_HEIGHT - 2 * MARGIN_Y
/** The least space between two blocks. Spare height is shared out above this. */
const MIN_GAP = 8
const TILE_PADDING = 18
const TILE_GAP = 24
const FALLBACK_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
const FONT = `"Barlow", ${FALLBACK_FONTS}`
const FONT_DISPLAY = `"Barlow Condensed", ${FALLBACK_FONTS}`

/**
 * The app's light tokens from docs/DESIGN.md. Every text colour meets 4.5:1 on the background or
 * tile colour.
 */
const COLORS = {
  background: '#ffffff',
  surface: '#eceff3',
  text: '#0e1116',
  secondary: '#474f5c',
  muted: '#5f6774',
  accent: '#0e1116',
}

/** The 2D context of either canvas kind; the card uses only the members they share. */
export type CardContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Structurally, an HTMLCanvasElement or an OffscreenCanvas. */
export interface CardCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): CardContext | null
}

interface TextStyle {
  size: number
  weight: number
  lineHeight: number
  /** Defaults to the body face. */
  family?: string
}

const BRAND: TextStyle = { size: 24, weight: 600, lineHeight: 30 }
const BADGE: TextStyle = { size: 16, weight: 600, lineHeight: 24 }
const HEADLINE_LARGE: TextStyle = { size: 40, weight: 600, lineHeight: 46 }
const HEADLINE_SMALL: TextStyle = { size: 32, weight: 600, lineHeight: 38 }
const SUMMARY: TextStyle = { size: 22, weight: 400, lineHeight: 30 }
const RANGE: TextStyle = { size: 20, weight: 400, lineHeight: 28 }
const NOTE: TextStyle = { size: 18, weight: 400, lineHeight: 26 }
const TILE_LABEL: TextStyle = { size: 18, weight: 400, lineHeight: 22 }
const TILE_VALUE: TextStyle = { size: 46, weight: 800, lineHeight: 54, family: FONT_DISPLAY }
const PERIOD: TextStyle = { size: 20, weight: 600, lineHeight: 28 }
/** Every style the card draws, so that loadCardFonts waits for each face it uses. */
const STYLES = [
  BRAND,
  BADGE,
  HEADLINE_LARGE,
  HEADLINE_SMALL,
  SUMMARY,
  RANGE,
  NOTE,
  TILE_LABEL,
  TILE_VALUE,
  PERIOD,
]

/** A tile is a label, a gap and a value, inside padding on every side. */
const TILE_HEIGHT = TILE_PADDING * 2 + TILE_LABEL.lineHeight + 4 + TILE_VALUE.lineHeight

/**
 * Splits text into lines no wider than maxWidth, breaking at spaces. A word wider than the maximum
 * keeps a line of its own. With maxLines, the last line is cut and ends in an ellipsis.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
  maxLines = Infinity,
): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (current !== '' && measure(candidate) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current !== '') lines.push(current)
  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines)
  const lastIndex = kept.length - 1
  let last = kept[lastIndex] ?? ''
  while (last !== '' && measure(`${last}…`) > maxWidth) last = last.slice(0, -1)
  kept[lastIndex] = `${last.trimEnd()}…`
  return kept
}

/** The CSS font shorthand for a style, as both the canvas and document.fonts.load read it. */
function fontOf(style: TextStyle): string {
  return `${style.weight} ${style.size}px ${style.family ?? FONT}`
}

function setFont(ctx: CardContext, style: TextStyle): void {
  ctx.font = fontOf(style)
}

/**
 * Resolves once the faces the card draws have loaded, so that the canvas measures and paints them
 * rather than the fallbacks. A face that fails to load is skipped. Without document.fonts (tests,
 * workers) it resolves at once.
 */
export async function loadCardFonts(): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (fonts === undefined) return
  await Promise.all(STYLES.map((style) => fonts.load(fontOf(style)).catch(() => [])))
}

/** Wraps text in the given style, measured with the font the style sets. */
function wrapIn(
  ctx: CardContext,
  text: string,
  style: TextStyle,
  maxWidth: number,
  maxLines?: number,
): string[] {
  setFont(ctx, style)
  return wrapText(text, maxWidth, (line) => ctx.measureText(line).width, maxLines)
}

/** Draws each line below the last. */
function drawLines(
  ctx: CardContext,
  lines: string[],
  x: number,
  y: number,
  style: TextStyle,
  color: string,
): void {
  setFont(ctx, style)
  ctx.fillStyle = color
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * style.lineHeight))
}

/** The large headline when it fits in two lines, otherwise the smaller one in up to three. */
function fitHeadline(ctx: CardContext, text: string): { style: TextStyle; lines: string[] } {
  const large = wrapIn(ctx, text, HEADLINE_LARGE, CONTENT_WIDTH)
  if (large.length <= 2) return { style: HEADLINE_LARGE, lines: large }
  return { style: HEADLINE_SMALL, lines: wrapIn(ctx, text, HEADLINE_SMALL, CONTENT_WIDTH, 3) }
}

/** A block of the card: its height, what it draws at a top y, and whether it may be dropped. */
interface Block {
  /** Blocks with a rank are dropped, lowest rank first, when the card is too tall. */
  dropRank?: number
  height: number
  draw: (y: number) => void
}

/** A block of text lines, or nothing when there is no text to show. */
function textBlock(
  ctx: CardContext,
  lines: string[],
  x: number,
  style: TextStyle,
  color: string,
  dropRank?: number,
): Block[] {
  if (lines.length === 0) return []
  return [
    {
      dropRank,
      height: lines.length * style.lineHeight,
      draw: (y) => drawLines(ctx, lines, x, y, style, color),
    },
  ]
}

/** The sample badge sits after the title on the title's line. */
function drawBadge(ctx: CardContext, title: string, badge: string, y: number): void {
  setFont(ctx, BRAND)
  const x = MARGIN_X + ctx.measureText(title).width + 16
  setFont(ctx, BADGE)
  const width = ctx.measureText(badge).width + 24
  ctx.fillStyle = COLORS.surface
  ctx.fillRect(x, y, width, BRAND.lineHeight)
  drawLines(
    ctx,
    [badge],
    x + 12,
    y + (BRAND.lineHeight - BADGE.lineHeight) / 2,
    BADGE,
    COLORS.secondary,
  )
}

/** The figure tiles in one row, each as tall as its label and value need. */
function figureBlock(ctx: CardContext, model: ShareCardModel): Block[] {
  const count = model.figures.length
  if (count === 0) return []
  const tileWidth = (CONTENT_WIDTH - TILE_GAP * (count - 1)) / count
  const labelWidth = tileWidth - 2 * TILE_PADDING
  return [
    {
      height: TILE_HEIGHT,
      draw: (y) => {
        model.figures.forEach((figure, index) => {
          const x = MARGIN_X + index * (tileWidth + TILE_GAP)
          ctx.fillStyle = COLORS.surface
          ctx.fillRect(x, y, tileWidth, TILE_HEIGHT)
          const textX = x + TILE_PADDING
          const label = wrapIn(ctx, figure.label, TILE_LABEL, labelWidth, 1)
          drawLines(ctx, label, textX, y + TILE_PADDING, TILE_LABEL, COLORS.secondary)
          const value = wrapIn(ctx, figure.value, TILE_VALUE, labelWidth, 1)
          drawLines(
            ctx,
            value,
            textX,
            y + TILE_PADDING + TILE_LABEL.lineHeight + 4,
            TILE_VALUE,
            COLORS.text,
          )
        })
      },
    },
  ]
}

/** The blocks in reading order, with the least important ones ranked for dropping first. */
function cardBlocks(ctx: CardContext, model: ShareCardModel): Block[] {
  const headline = fitHeadline(ctx, model.headline)
  const brand: Block = {
    height: BRAND.lineHeight,
    draw: (y) => {
      drawLines(ctx, [model.title], MARGIN_X, y, BRAND, COLORS.accent)
      if (model.badge !== null) drawBadge(ctx, model.title, model.badge, y)
    },
  }
  return [
    brand,
    ...textBlock(ctx, headline.lines, MARGIN_X, headline.style, COLORS.text),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.summary, SUMMARY, CONTENT_WIDTH, 2),
      MARGIN_X,
      SUMMARY,
      COLORS.secondary,
    ),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.range, RANGE, CONTENT_WIDTH, 1),
      MARGIN_X,
      RANGE,
      COLORS.muted,
    ),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.basis, NOTE, CONTENT_WIDTH, 1),
      MARGIN_X,
      NOTE,
      COLORS.secondary,
    ),
    ...textBlock(
      ctx,
      model.caveat === null ? [] : wrapIn(ctx, model.caveat, NOTE, CONTENT_WIDTH, 1),
      MARGIN_X,
      NOTE,
      COLORS.secondary,
      2,
    ),
    ...figureBlock(ctx, model),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.period, PERIOD, CONTENT_WIDTH, 1),
      MARGIN_X,
      PERIOD,
      COLORS.secondary,
    ),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.footer, NOTE, CONTENT_WIDTH, 2),
      MARGIN_X,
      NOTE,
      COLORS.muted,
    ),
    ...textBlock(
      ctx,
      model.origin === '' ? [] : wrapIn(ctx, model.origin, NOTE, CONTENT_WIDTH, 1),
      MARGIN_X,
      NOTE,
      COLORS.muted,
      1,
    ),
  ]
}

/** The height the blocks take with the least gap between them. */
function minimumHeight(blocks: Block[]): number {
  const heights = blocks.reduce((sum, block) => sum + block.height, 0)
  return heights + Math.max(blocks.length - 1, 0) * MIN_GAP
}

/**
 * Drops the lowest-ranked droppable block until the rest fit the content height. Blocks without a
 * rank are never dropped, so the headline, range, basis, figures and footer always stay.
 */
function fitBlocks(blocks: Block[]): Block[] {
  const kept = [...blocks]
  while (minimumHeight(kept) > CONTENT_HEIGHT) {
    let victim = -1
    let victimRank = Infinity
    kept.forEach((block, index) => {
      if (block.dropRank !== undefined && block.dropRank < victimRank) {
        victim = index
        victimRank = block.dropRank
      }
    })
    if (victim < 0) break
    kept.splice(victim, 1)
  }
  return kept
}

/**
 * Draws the card on the canvas, 1200 by 630, with Canvas 2D only. The content is spread from the top
 * margin to the bottom margin, and the origin and then the effort caveat are dropped when it would
 * not fit. Returns false when the canvas gives no 2D context.
 */
export function renderShareCard(model: ShareCardModel, canvas: CardCanvas): boolean {
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (ctx === null) return false

  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.fillStyle = COLORS.accent
  ctx.fillRect(0, 0, ACCENT_BAR_WIDTH, CARD_HEIGHT)

  const blocks = fitBlocks(cardBlocks(ctx, model))
  const gap = MIN_GAP + (CONTENT_HEIGHT - minimumHeight(blocks)) / Math.max(blocks.length - 1, 1)
  let y = MARGIN_Y
  blocks.forEach((block, index) => {
    block.draw(y)
    y += block.height + (index < blocks.length - 1 ? gap : 0)
  })
  return true
}
