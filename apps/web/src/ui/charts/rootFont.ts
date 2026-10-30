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

/**
 * What the page's root sets for text, read in one call: the font size in px, and the reader's letter and word
 * spacing in em of that size (WCAG 1.4.12 asks a page to survive 0.12 em between letters and 0.16 em between
 * words). A spacing is computed in px at the root, so dividing by the root's size gives the em it was set in,
 * which is the same em for text that sets its spacing in em. Without a window or styles, or with the spacing at
 * its normal, the default size stands and nothing is added.
 */
export interface RootText {
  px: number
  letterEm: number
  wordEm: number
}

const DEFAULT_ROOT: RootText = { px: DEFAULT_ROOT_PX, letterEm: 0, wordEm: 0 }

export function readRoot(): RootText {
  if (typeof window === 'undefined' || typeof document === 'undefined') return DEFAULT_ROOT
  const style = getComputedStyle(document.documentElement)
  const px = Number.parseFloat(style.fontSize)
  if (!(Number.isFinite(px) && px > 0)) return DEFAULT_ROOT
  const em = (value: string) => {
    const length = Number.parseFloat(value)
    return Number.isFinite(length) ? length / px : 0
  }
  return { px, letterEm: em(style.letterSpacing), wordEm: em(style.wordSpacing) }
}

/** The root font size in px, read from the page. */
export function rootFontPx(): number {
  return readRoot().px
}

/** A text's width in em of its own size: the average glyph for each character, plus the reader's spacing. */
export function textEm(text: string, root: RootText = readRoot()): number {
  const gaps = text.split(' ').length - 1
  return text.length * (GLYPH_EM + root.letterEm) + gaps * root.wordEm
}

/** A chart label's font size in px, at the given root font size. */
export function labelSizePx(rootPx: number): number {
  return LABEL_REM * rootPx
}

/**
 * The extra width a label's estimate keeps, in em. Glyphs such as "%" and capitals run wider than the
 * average, so the estimate takes this much more, and the clearances the layouts keep hold on real text.
 */
export const LABEL_PAD_EM = 0.3

/** A label's estimated width in px, from its length, at the given root font size, with its padding. */
export function labelWidthPx(text: string, rootPx: number): number {
  return (textEm(text) + LABEL_PAD_EM) * labelSizePx(rootPx)
}
