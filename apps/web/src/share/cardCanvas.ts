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
  /** Extra space after each character in px, for upper-case metadata; none when unset. */
  tracking?: number
}

/**
 * The page's --font-serif and --font-mono from tokens.css, so the card falls back as the page does: the serif
 * sets the answer and prose, the mono every figure and all metadata, each at the two weights the page loads.
 */
const SERIF = "'Newsreader', Georgia, serif"
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

export const SERIF_400: Face = { family: SERIF, weight: 400 }
export const SERIF_500: Face = { family: SERIF, weight: 500 }
export const MONO_400: Face = { family: MONO, weight: 400 }
export const MONO_500: Face = { family: MONO, weight: 500 }

/** Every face the card draws in. loadCardFonts waits for each one. */
export const FACES: Face[] = [SERIF_400, SERIF_500, MONO_400, MONO_500]

/** Metadata as the page sets it: mono, upper case by the caller, tracked at 0.12em. */
export function metaStyle(size: number, lineHeight: number): TextStyle {
  return { ...MONO_400, size, lineHeight, tracking: Math.round(size * 0.12 * 10) / 10 }
}

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
  ctx.letterSpacing = `${style.tracking ?? 0}px`
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
  kept[lastIndex] = cutWithEllipsis(kept[lastIndex] ?? '', maxWidth, measure)
  return kept
}

/**
 * The text cut, with an ellipsis, until the cut and the ellipsis fit maxWidth. It is cut by code point,
 * so an emoji is never left as half of one.
 */
export function cutWithEllipsis(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string {
  const kept = [...text]
  while (kept.length > 0 && measure(`${kept.join('')}…`) > maxWidth) kept.pop()
  return `${kept.join('').trimEnd()}…`
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
