/**
 * A chart label is 0.75 rem, and a glyph averages about 0.6 em, so a label's width grows with the root
 * font size. The same size is the --text-xs token in styles/tokens.css, which a test keeps equal to this.
 * Without a window or styles, as in a worker or a test, the browser's default of 16 px stands.
 */
export const LABEL_REM = 0.75
/** A glyph's average width, in em, for estimating a label's width from its length. */
export const GLYPH_EM = 0.6
/** The browser's default root font size, which the chart layouts are measured at. */
export const DEFAULT_ROOT_PX = 16

/** The root font size in px, read from the page. */
export function rootFontPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return DEFAULT_ROOT_PX
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px : DEFAULT_ROOT_PX
}

/** A chart label's font size in px, at the given root font size. */
export function labelSizePx(rootPx: number): number {
  return LABEL_REM * rootPx
}

/** A label's estimated width in px, from its length, at the given root font size. */
export function labelWidthPx(text: string, rootPx: number): number {
  return text.length * GLYPH_EM * labelSizePx(rootPx)
}
