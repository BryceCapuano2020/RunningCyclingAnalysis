import type { PathStep } from '../ui/components/iconPaths'

/** The 2D context of either canvas kind; the card uses only the members they share. */
export type CardContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Structurally, an HTMLCanvasElement or an OffscreenCanvas. */
export interface CardCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): CardContext | null
}

/** A typeface, by family and weight. The size is set for each draw. */
export interface Face {
  family: string
  weight: number
}

/** A face at one size, with the height each of its lines takes. */
export interface TextStyle extends Face {
  size: number
  lineHeight: number
}

/** The page's --font-sans and --font-display from tokens.css, so the card falls back as the page does. */
const BARLOW = "'Barlow', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const CONDENSED = "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"

export const SANS_400: Face = { family: BARLOW, weight: 400 }
export const SANS_500: Face = { family: BARLOW, weight: 500 }
export const SANS_600: Face = { family: BARLOW, weight: 600 }
export const CONDENSED_700: Face = { family: CONDENSED, weight: 700 }
export const CONDENSED_800: Face = { family: CONDENSED, weight: 800 }

/** Every face the card draws in. loadCardFonts waits for each one. */
export const FACES: Face[] = [SANS_400, SANS_500, SANS_600, CONDENSED_700, CONDENSED_800]

/** The CSS font shorthand for a face at a size, as both the canvas and document.fonts.load read it. */
export function fontOf(face: Face, size: number): string {
  return `${face.weight} ${size}px ${face.family}`
}

/** A face at a size, stacked at a line height that is a fixed share of the size. */
export function scaled(face: Face, size: number, lineRatio: number): TextStyle {
  return { ...face, size, lineHeight: Math.round(size * lineRatio) }
}

export function setFont(ctx: CardContext, style: TextStyle): void {
  ctx.font = fontOf(style, style.size)
}

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

/** Wraps text in the style, measured with the font the style sets. */
export function wrapIn(
  ctx: CardContext,
  text: string,
  style: TextStyle,
  maxWidth: number,
  maxLines?: number,
): string[] {
  setFont(ctx, style)
  return wrapText(text, maxWidth, (line) => ctx.measureText(line).width, maxLines)
}

/**
 * The first size, from the list, at which the text wraps to maxLines or fewer lines, and its lines.
 * When no size fits, the smallest size is used and its last line is cut.
 */
export function fitText(
  ctx: CardContext,
  text: string,
  face: Face,
  sizes: readonly number[],
  lineRatio: number,
  maxWidth: number,
  maxLines: number,
): { style: TextStyle; lines: string[] } {
  const style =
    sizes
      .map((size) => scaled(face, size, lineRatio))
      .find((candidate) => wrapIn(ctx, text, candidate, maxWidth).length <= maxLines) ??
    scaled(face, Math.min(...sizes), lineRatio)
  return { style, lines: wrapIn(ctx, text, style, maxWidth, maxLines) }
}

/** Draws each line below the last, from the top at x and y. */
export function drawLines(
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

/** Traces a bar with round ends, at least as wide as it is tall, for a fill or a stroke. */
export function tracePill(
  ctx: CardContext,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const radius = height / 2
  ctx.arc(x + radius, y + radius, radius, Math.PI / 2, (3 * Math.PI) / 2)
  ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2)
  ctx.closePath()
}

/** A filled bar with round ends, at least as wide as it is tall. */
export function drawPill(
  ctx: CardContext,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  tracePill(ctx, x, y, width, height)
  ctx.fill()
}

/** Strokes the path that the trace draws, with round caps and joins. */
export function strokeWith(
  ctx: CardContext,
  color: string,
  width: number,
  trace: () => void,
): void {
  ctx.beginPath()
  trace()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

/** Maps points drawn on an icon's own grid to the canvas, at a top-left corner and a scale. */
export function placer(
  x: number,
  y: number,
  scale: number,
): (px: number, py: number) => [number, number] {
  return (px, py) => [x + px * scale, y + py * scale]
}

/** Traces path steps on the canvas, placing each point with `at`. */
export function traceSteps(
  ctx: CardContext,
  steps: readonly PathStep[],
  at: (px: number, py: number) => [number, number],
): void {
  for (const step of steps) {
    switch (step.op) {
      case 'M':
        ctx.moveTo(...at(step.x, step.y))
        break
      case 'L':
        ctx.lineTo(...at(step.x, step.y))
        break
      case 'C':
        ctx.bezierCurveTo(...at(step.x1, step.y1), ...at(step.x2, step.y2), ...at(step.x, step.y))
        break
      case 'Z':
        ctx.closePath()
        break
    }
  }
}

/** How long the card waits for its fonts before it gives up, so a stalled load cannot hang the download. */
const FONT_LOAD_TIMEOUT_MS = 10_000

/**
 * Resolves once the faces the card draws have loaded, so that the canvas measures and paints them
 * rather than the fallbacks. A face that fails to load is skipped. Rejects when the faces have not
 * loaded after FONT_LOAD_TIMEOUT_MS. Without document.fonts (tests, workers) it resolves at once.
 */
export async function loadCardFonts(): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (fonts === undefined) return
  // The loads start first: if one throws at once, no timer is armed to reject unhandled later.
  const loaded = Promise.all(FACES.map((face) => fonts.load(fontOf(face, 16)).catch(() => [])))
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('The card fonts did not load in time')),
      FONT_LOAD_TIMEOUT_MS,
    )
  })
  try {
    await Promise.race([loaded, stalled])
  } finally {
    clearTimeout(timer)
  }
}
