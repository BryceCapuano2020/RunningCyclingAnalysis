/**
 * A chart label is 0.75 rem, and a glyph averages about 0.6 em, so a label's width grows with the root
 * font size. Without a window or styles, as in a worker or a test, the browser's default of 16 px stands.
 */
const LABEL_REM = 0.75
const GLYPH_EM = 0.6
const DEFAULT_ROOT_PX = 16

/** The root font size in px, read from the page. */
export function rootFontPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return DEFAULT_ROOT_PX
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px : DEFAULT_ROOT_PX
}

/** A label's estimated width in px, from its length, at the given root font size. */
export function labelWidthPx(text: string, rootPx: number): number {
  return text.length * GLYPH_EM * LABEL_REM * rootPx
}
